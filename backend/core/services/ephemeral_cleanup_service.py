import os
import time
import logging
from typing import Dict, Any
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class EphemeralExportCleanupService:
    """
    Manages the lifecycle and automated cleanup of generated export artifacts
    (PDF, XLSX, DOCX, ZIP files, and temp files).

    Ensures that temporary exports are retained for a bounded duration (default 20 mins)
    so users can download them, and then automatically purged to conserve disk space
    and database storage.
    """

    DEFAULT_TTL_MINUTES = 20
    CLEANUP_EXTENSIONS = ('.pdf', '.xlsx', '.docx', '.zip', '.tmp', '.csv', '.tsv')

    @classmethod
    def get_export_directories(cls) -> list[str]:
        """Return all directories where exports and temp files may reside."""
        dirs = []
        media_root = os.path.abspath(settings.MEDIA_ROOT)
        
        # 1. Main exports directory
        main_exports = os.path.join(media_root, 'exports')
        if os.path.exists(main_exports):
            dirs.append(main_exports)

        # 2. Main temp directory
        main_temp = os.path.join(media_root, 'temp')
        if os.path.exists(main_temp):
            dirs.append(main_temp)

        # 3. Tenant-isolated exports and temp directories (media/tenants/<slug>/exports/)
        tenants_root = os.path.join(media_root, 'tenants')
        if os.path.exists(tenants_root):
            try:
                for tenant_name in os.listdir(tenants_root):
                    t_dir = os.path.join(tenants_root, tenant_name)
                    if os.path.isdir(t_dir):
                        t_exports = os.path.join(t_dir, 'exports')
                        t_temp = os.path.join(t_dir, 'temp')
                        if os.path.exists(t_exports):
                            dirs.append(t_exports)
                        if os.path.exists(t_temp):
                            dirs.append(t_temp)
            except OSError as exc:
                logger.warning('Failed reading tenants directory for cleanup: %s', exc)

        return dirs

    @classmethod
    def cleanup_expired_export_files(cls, ttl_minutes: int = DEFAULT_TTL_MINUTES) -> Dict[str, Any]:
        """
        Delete all export files older than ttl_minutes across all export directories.
        Also marks associated BackgroundTask records as expired.
        """
        ttl_seconds = max(1, ttl_minutes) * 60
        now_ts = time.time()
        deleted_count = 0
        reclaimed_bytes = 0

        target_dirs = cls.get_export_directories()

        for directory in target_dirs:
            if not os.path.exists(directory):
                continue
            for root, _, files in os.walk(directory):
                for fname in files:
                    lower_name = fname.lower()
                    if not lower_name.endswith(cls.CLEANUP_EXTENSIONS):
                        continue

                    fpath = os.path.join(root, fname)
                    if os.path.islink(fpath):
                        continue

                    try:
                        stat = os.stat(fpath)
                        age = now_ts - stat.st_mtime
                        if age > ttl_seconds:
                            file_size = stat.st_size
                            os.remove(fpath)
                            deleted_count += 1
                            reclaimed_bytes += file_size
                            logger.info(
                                'Ephemeral cleanup: removed expired export %s (age=%.1f mins, size=%d bytes)',
                                fpath, age / 60.0, file_size
                            )
                    except (OSError, FileNotFoundError) as exc:
                        logger.debug('Could not delete export file %s: %s', fpath, exc)

        # Update BackgroundTask database records whose output files have expired
        try:
            from core.models import BackgroundTask
            from django.db.models import Q
            cutoff = timezone.now() - timezone.timedelta(minutes=ttl_minutes)
            expired_tasks = BackgroundTask.objects.filter(
                Q(completed_at__lt=cutoff) | (Q(completed_at__isnull=True) & Q(created_at__lt=cutoff)),
                task_type__startswith='export_',
                result_path__isnull=False
            ).exclude(result_path='')

            task_count = 0
            for task in expired_tasks:
                meta = dict(task.metadata or {})
                meta['file_expired'] = True
                meta['expired_at'] = timezone.now().isoformat()
                task.metadata = meta
                task.status = 'expired'
                task.result_path = None
                task.save(update_fields=['metadata', 'status', 'result_path'])
                task_count += 1

            logger.info('Ephemeral cleanup: marked %d background export tasks as expired', task_count)
        except Exception as exc:
            logger.warning('Failed to update BackgroundTask records during cleanup: %s', exc)

        reclaimed_mb = round(reclaimed_bytes / (1024 * 1024), 2)
        return {
            'success': True,
            'files_deleted': deleted_count,
            'deleted_count': deleted_count,
            'reclaimed_bytes': reclaimed_bytes,
            'reclaimed_mb': reclaimed_mb,
            'ttl_minutes': ttl_minutes,
        }

    @classmethod
    def run_cleanup(cls, ttl_minutes: int = DEFAULT_TTL_MINUTES) -> Dict[str, Any]:
        """Convenience alias for cleanup_expired_export_files."""
        return cls.cleanup_expired_export_files(ttl_minutes=ttl_minutes)
