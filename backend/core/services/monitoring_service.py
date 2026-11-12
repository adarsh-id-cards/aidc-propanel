"""
CardFlow Performance Monitoring & Telemetry Engine
==================================================
Continuous, lightweight telemetry collection, rolling latency percentiles,
interactive health scoring, and hysteresis-based health state tracking.
"""

import os
import time
import socket
import logging
import threading
from collections import deque
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Dict, Any, List, Optional, Tuple

from django.conf import settings
from django.core.cache import cache as django_cache
from django.db import connection
from django.utils import timezone

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

logger = logging.getLogger('cardflow.monitoring')


class MonitoringService:
    """
    Singleton service managing real-time telemetry, rolling request windows,
    interactive health score calculations, and historical metric snapshots.
    """
    _instance = None
    _lock = threading.Lock()

    # Ring buffer limits
    _WINDOW_MAX_SAMPLES = 2000
    _SNAPSHOT_PERSIST_INTERVAL_SEC = 300  # 5 minutes

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, '_initialized', False):
            return

        self._request_buffer: deque = deque(maxlen=self._WINDOW_MAX_SAMPLES)
        self._interactive_buffer: deque = deque(maxlen=self._WINDOW_MAX_SAMPLES)
        self._buffer_lock = threading.Lock()
        self._last_snapshot_time = time.time()
        self._current_health_state = 'GREEN'
        self._health_state_counter = 0
        self._initialized = True

    # -----------------------------------------------------------------------
    # TELEMETRY CAPTURE
    # -----------------------------------------------------------------------

    def record_request(
        self,
        path: str,
        method: str,
        latency_ms: float,
        status_code: int,
        is_interactive: bool = True,
    ) -> None:
        """Record an incoming request sample with microsecond timestamp."""
        now = time.time()
        sample = (now, latency_ms, status_code, path, is_interactive)

        with self._buffer_lock:
            self._request_buffer.append(sample)
            if is_interactive:
                self._interactive_buffer.append(sample)

        # Trigger periodic snapshot persist if threshold elapsed
        if now - self._last_snapshot_time > self._SNAPSHOT_PERSIST_INTERVAL_SEC:
            with self._lock:
                if now - self._last_snapshot_time > self._SNAPSHOT_PERSIST_INTERVAL_SEC:
                    self._last_snapshot_time = now
                    try:
                        self.persist_snapshot()
                    except Exception as exc:
                        logger.debug("Failed to persist system metric snapshot: %s", exc)

    # -----------------------------------------------------------------------
    # METRICS CALCULATION
    # -----------------------------------------------------------------------

    def get_latency_stats(self, buffer_type: str = 'all', window_seconds: int = 300) -> Dict[str, float]:
        """Compute p50, p90, p95, p99, and average latency over a sliding window."""
        now = time.time()
        cutoff = now - window_seconds

        with self._buffer_lock:
            target_buffer = self._interactive_buffer if buffer_type == 'interactive' else self._request_buffer
            samples = [s[1] for s in target_buffer if s[0] >= cutoff]

        if not samples:
            return {
                'count': 0,
                'p50': 0.0,
                'p90': 0.0,
                'p95': 0.0,
                'p99': 0.0,
                'avg': 0.0,
                'rps': 0.0,
            }

        samples.sort()
        n = len(samples)
        p50 = samples[int(n * 0.50)]
        p90 = samples[min(n - 1, int(n * 0.90))]
        p95 = samples[min(n - 1, int(n * 0.95))]
        p99 = samples[min(n - 1, int(n * 0.99))]
        avg = sum(samples) / n
        rps = n / float(window_seconds)

        return {
            'count': n,
            'p50': round(p50, 1),
            'p90': round(p90, 1),
            'p95': round(p95, 1),
            'p99': round(p99, 1),
            'avg': round(avg, 1),
            'rps': round(rps, 2),
        }

    def compute_interactive_health(self) -> Tuple[float, str]:
        """
        Compute normalized interactive health score (0-100) and discrete health state
        with hysteresis to prevent flappy state toggling.
        """
        interactive_stats = self.get_latency_stats('interactive', window_seconds=300)
        cpu_pct = self.get_cpu_percent()
        ram_pct = self.get_ram_percent()

        p50 = interactive_stats['p50']
        p95 = interactive_stats['p95']
        req_count = interactive_stats['count']

        # Base score 100
        score = 100.0

        # Penalize for interactive latency degradation
        if p50 > 300:
            score -= min(30.0, (p50 - 300) / 20.0)
        if p95 > 800:
            score -= min(40.0, (p95 - 800) / 40.0)

        # Penalize for CPU/RAM saturation
        if cpu_pct > 75:
            score -= min(25.0, (cpu_pct - 75) * 1.0)
        if ram_pct > 80:
            score -= min(20.0, (ram_pct - 80) * 1.0)

        score = max(0.0, min(100.0, round(score, 1)))

        # Determine target state
        if score >= 80.0 and cpu_pct < 75.0 and (p95 < 900.0 or req_count == 0):
            target_state = 'GREEN'
        elif score >= 60.0 and cpu_pct < 85.0 and p95 < 1800.0:
            target_state = 'YELLOW'
        elif score >= 35.0 and cpu_pct < 92.0 and p95 < 3500.0:
            target_state = 'ORANGE'
        else:
            target_state = 'RED'

        # Hysteresis smoothing:
        # Require 2 consecutive checks to escalate, 4 consecutive checks to de-escalate
        if target_state != self._current_health_state:
            self._health_state_counter += 1
            threshold = 2 if self._state_severity(target_state) > self._state_severity(self._current_health_state) else 4
            if self._health_state_counter >= threshold:
                self._current_health_state = target_state
                self._health_state_counter = 0
        else:
            self._health_state_counter = 0

        return score, self._current_health_state

    @staticmethod
    def _state_severity(state: str) -> int:
        return {'GREEN': 0, 'YELLOW': 1, 'ORANGE': 2, 'RED': 3}.get(state, 0)

    # -----------------------------------------------------------------------
    # HARDWARE & SUBSYSTEM METRICS
    # -----------------------------------------------------------------------

    def get_cpu_percent(self) -> float:
        if HAS_PSUTIL:
            try:
                return float(psutil.cpu_percent(interval=None))
            except Exception:
                pass
        return 0.0

    def get_ram_percent(self) -> float:
        if HAS_PSUTIL:
            try:
                return float(psutil.virtual_memory().percent)
            except Exception:
                pass
        return 0.0

    def get_ram_rss_mb(self) -> float:
        if HAS_PSUTIL:
            try:
                return float(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024))
            except Exception:
                pass
        return 0.0

    def get_disk_percent(self) -> float:
        if HAS_PSUTIL:
            try:
                return float(psutil.disk_usage('.').percent)
            except Exception:
                pass
        return 0.0

    def get_db_stats(self) -> Dict[str, Any]:
        """Fetch database connection and active query latency stats."""
        stats = {
            'vendor': connection.vendor,
            'active_connections': 1,
            'is_healthy': True,
        }
        try:
            with connection.cursor() as cursor:
                t0 = time.perf_counter()
                cursor.execute("SELECT 1;")
                cursor.fetchone()
                latency_ms = (time.perf_counter() - t0) * 1000.0
                stats['ping_ms'] = round(latency_ms, 2)
        except Exception as exc:
            stats['is_healthy'] = False
            stats['error'] = str(exc)
        return stats

    def get_redis_stats(self) -> Dict[str, Any]:
        """Check Redis connectivity and memory consumption."""
        stats = {'connected': False, 'used_memory_mb': 0.0, 'ping_ms': 0.0}
        try:
            t0 = time.perf_counter()
            test_val = django_cache.get('monitoring:health_check')
            if test_val is None:
                django_cache.set('monitoring:health_check', 1, timeout=60)
            latency_ms = (time.perf_counter() - t0) * 1000.0
            stats['connected'] = True
            stats['ping_ms'] = round(latency_ms, 2)
        except Exception as exc:
            stats['error'] = str(exc)
        return stats

    def get_background_task_stats(self) -> Dict[str, Any]:
        """Fetch queue depth and task lifecycle counts."""
        from core.models import BackgroundTask
        now = timezone.now()
        since_24h = now - timedelta(hours=24)

        try:
            from django.db.models import Count, Q
            agg = BackgroundTask.objects.aggregate(
                queued=Count('id', filter=Q(status='pending')),
                running=Count('id', filter=Q(status='processing')),
                completed_24h=Count('id', filter=Q(status='completed', completed_at__gte=since_24h)),
                failed_24h=Count('id', filter=Q(status='failed', completed_at__gte=since_24h)),
            )
            # Find oldest waiting task
            oldest = BackgroundTask.objects.filter(status='pending').order_by('created_at').first()
            oldest_age_sec = (now - oldest.created_at).total_seconds() if oldest else 0.0

            return {
                'queued': agg['queued'] or 0,
                'running': agg['running'] or 0,
                'completed_24h': agg['completed_24h'] or 0,
                'failed_24h': agg['failed_24h'] or 0,
                'oldest_waiting_age_sec': round(oldest_age_sec, 1),
            }
        except Exception:
            return {'queued': 0, 'running': 0, 'completed_24h': 0, 'failed_24h': 0, 'oldest_waiting_age_sec': 0.0}

    # -----------------------------------------------------------------------
    # AGGREGATE SYSTEM TELEMETRY
    # -----------------------------------------------------------------------

    def get_complete_telemetry(self) -> Dict[str, Any]:
        """Return full telemetry dictionary for monitoring dashboard and capacity advisor."""
        from organisation.models import Organisation
        from assistants.models import Assistant
        from core.services.capacity_advisor import CapacityAdvisor

        all_stats = self.get_latency_stats('all', window_seconds=300)
        interactive_stats = self.get_latency_stats('interactive', window_seconds=300)
        health_score, health_state = self.compute_interactive_health()

        active_orgs = Organisation.objects.filter(status='active').count()
        active_assistants = Assistant.objects.filter(user__is_active=True).count()

        advisor = CapacityAdvisor()
        capacity_report = advisor.evaluate_capacity()

        return {
            'timestamp': timezone.now().isoformat(),
            'server': {
                'cpu_percent': self.get_cpu_percent(),
                'ram_percent': self.get_ram_percent(),
                'ram_rss_mb': self.get_ram_rss_mb(),
                'disk_percent': self.get_disk_percent(),
                'hostname': socket.gethostname(),
            },
            'application': {
                'health_state': health_state,
                'interactive_health_score': health_score,
                'all_requests': all_stats,
                'interactive_requests': interactive_stats,
                'active_organisations': active_orgs,
                'active_assistants': active_assistants,
            },
            'database': self.get_db_stats(),
            'cache': self.get_redis_stats(),
            'background_tasks': self.get_background_task_stats(),
            'capacity_advisor': capacity_report,
        }

    # -----------------------------------------------------------------------
    # PERSISTENCE
    # -----------------------------------------------------------------------

    def persist_snapshot(self) -> Optional[Any]:
        """Save a snapshot to SystemMetricSnapshot table for historical graphing."""
        from core.models import SystemMetricSnapshot
        from core.services.capacity_advisor import CapacityAdvisor

        telemetry = self.get_complete_telemetry()
        app_data = telemetry['application']
        srv_data = telemetry['server']
        cap_data = telemetry['capacity_advisor']

        snapshot = SystemMetricSnapshot.objects.create(
            timestamp=timezone.now(),
            cpu_percent=srv_data['cpu_percent'],
            memory_percent=srv_data['ram_percent'],
            memory_rss_mb=srv_data['ram_rss_mb'],
            disk_percent=srv_data['disk_percent'],
            active_requests=app_data['all_requests']['count'],
            rps=app_data['all_requests']['rps'],
            latency_p50=app_data['all_requests']['p50'],
            latency_p95=app_data['all_requests']['p95'],
            latency_p99=app_data['all_requests']['p99'],
            interactive_health_score=app_data['interactive_health_score'],
            health_state=app_data['health_state'],
            active_orgs_count=app_data['active_organisations'],
            active_users_count=app_data['active_assistants'],
            queued_tasks_count=telemetry['background_tasks']['queued'],
            running_tasks_count=telemetry['background_tasks']['running'],
            redis_connected=telemetry['cache']['connected'],
            season_mode=cap_data.get('season_info', {}).get('mode', 'NORMAL'),
            scaling_recommendation=cap_data.get('recommendation', {}).get('action', 'HEALTHY'),
            raw_telemetry=telemetry,
        )
        return snapshot


    # Alias for get_complete_telemetry
    get_current_metrics = get_complete_telemetry


# Module singleton
monitoring_service = MonitoringService()
