from django.core.management.base import BaseCommand
from core.services.ephemeral_cleanup_service import EphemeralExportCleanupService


class Command(BaseCommand):
    help = 'Purges temporary export artifacts (PDF, XLSX, DOCX, ZIP) older than TTL minutes.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--ttl',
            type=int,
            default=EphemeralExportCleanupService.DEFAULT_TTL_MINUTES,
            help=f'Retention window in minutes (default: {EphemeralExportCleanupService.DEFAULT_TTL_MINUTES} minutes).'
        )

    def handle(self, *args, **options):
        ttl = options['ttl']
        self.stdout.write(f'Running ephemeral export cleanup (TTL={ttl} minutes)...')
        result = EphemeralExportCleanupService.cleanup_expired_export_files(ttl_minutes=ttl)
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully deleted {result['deleted_count']} expired export files, "
                f"reclaiming {result['reclaimed_mb']} MB of disk space."
            )
        )
