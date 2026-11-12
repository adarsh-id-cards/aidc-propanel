"""
CardFlow Capacity Advisor & Seasonal Scaling Engine
==================================================
Telemetry-driven capacity estimation, seasonal calendar intelligence,
upgrade/downgrade recommendations, and admin alert dispatching.
"""

import os
import time
import logging
from datetime import datetime, date, timedelta, timezone as dt_timezone
from typing import Dict, Any, List, Optional, Tuple

from django.conf import settings
from django.core.cache import cache as django_cache
from django.utils import timezone

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

logger = logging.getLogger('cardflow.capacity')


class CapacityAdvisor:
    """
    Capacity Advisor evaluating real-time server telemetry against seasonal
    calendar models and generating proactive hardware recommendations.
    """

    # Alert cooldown in seconds (6 hours)
    ALERT_COOLDOWN_SECONDS = 6 * 3600

    def __init__(self):
        self.cpu_cores = os.cpu_count() or 1
        self.total_ram_gb = self._get_total_ram_gb()

    def _get_total_ram_gb(self) -> float:
        if HAS_PSUTIL:
            try:
                return round(psutil.virtual_memory().total / (1024 ** 3), 1)
            except Exception:
                pass
        return 2.0  # Default 2GB profile

    # -----------------------------------------------------------------------
    # SEASONAL CALENDAR
    # -----------------------------------------------------------------------

    def get_seasonal_context(self, current_dt: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Evaluate date-based seasonal cycle:
          - April 15 - April 30: PRE_SEASON_RAMP
          - May 1 - August 31:   PEAK_SEASON
          - Sept 1 - Sept 15:    SEASON_DECLINE
          - Sept 16 - April 14:  NORMAL_OFF_SEASON
        """
        now = current_dt or timezone.now()
        month = now.month
        day = now.day

        if month == 4 and day >= 15:
            mode = 'PRE_SEASON_RAMP'
            description = 'Pre-season ramp period. School/college onboarding momentum increasing.'
            expected_load_multiplier = 1.8
        elif month in (5, 6, 7, 8):
            mode = 'PEAK_SEASON'
            description = 'Primary peak season. Maximum multi-tenant data entry, verification, and batch export activity.'
            expected_load_multiplier = 3.5
        elif month == 9 and day <= 15:
            mode = 'SEASON_DECLINE'
            description = 'Peak season winding down. Card distribution and reprinting phase.'
            expected_load_multiplier = 1.4
        else:
            mode = 'NORMAL_OFF_SEASON'
            description = 'Standard operational off-peak workload.'
            expected_load_multiplier = 1.0

        return {
            'mode': mode,
            'description': description,
            'expected_load_multiplier': expected_load_multiplier,
            'is_peak': mode == 'PEAK_SEASON',
            'is_ramp': mode == 'PRE_SEASON_RAMP',
            'current_date': now.strftime('%d-%b-%Y'),
        }

    # -----------------------------------------------------------------------
    # CAPACITY EVALUATION & SIZING
    # -----------------------------------------------------------------------

    def evaluate_capacity(self) -> Dict[str, Any]:
        """
        Evaluate full capacity profile combining measured telemetry,
        safe user estimates, and seasonal scaling recommendations.
        """
        from core.services.monitoring_service import monitoring_service

        season = self.get_seasonal_context()
        cpu_pct = monitoring_service.get_cpu_percent()
        ram_pct = monitoring_service.get_ram_percent()
        ram_rss = monitoring_service.get_ram_rss_mb()
        int_stats = monitoring_service.get_latency_stats('interactive', window_seconds=300)
        health_score, health_state = monitoring_service.compute_interactive_health()

        p50 = int_stats['p50']
        p95 = int_stats['p95']

        # Hardware Tier Identification
        if self.cpu_cores <= 1 and self.total_ram_gb <= 3.0:
            current_tier = '1 vCPU / 2GB RAM'
            baseline_capacity_rps = 4.0
        elif self.cpu_cores <= 2 and self.total_ram_gb <= 5.0:
            current_tier = '2 vCPU / 4GB RAM'
            baseline_capacity_rps = 10.0
        else:
            current_tier = f"{self.cpu_cores} vCPU / {self.total_ram_gb:.0f}GB RAM"
            baseline_capacity_rps = float(self.cpu_cores * 6.0)

        # Estimate safe concurrent active users (assuming normal 6-10 req/min/user typing speed)
        effective_rps = baseline_capacity_rps
        if p50 > 0:
            measured_single_thread_rps = 1000.0 / p50
            effective_rps = min(baseline_capacity_rps, (self.cpu_cores * 2) * measured_single_thread_rps * 0.4)
        estimated_safe_active_users = max(10, int(effective_rps / 0.08))

        # Determine Recommendation
        recommendation = self._generate_recommendation(
            current_tier=current_tier,
            cpu_pct=cpu_pct,
            ram_pct=ram_pct,
            p95=p95,
            health_state=health_state,
            season=season,
        )

        return {
            'measured': {
                'cpu_percent': round(cpu_pct, 1),
                'ram_percent': round(ram_pct, 1),
                'ram_rss_mb': round(ram_rss, 1),
                'interactive_p50_ms': round(p50, 1),
                'interactive_p95_ms': round(p95, 1),
                'interactive_health_score': health_score,
                'health_state': health_state,
            },
            'estimated': {
                'current_server_tier': current_tier,
                'max_safe_throughput_rps': round(effective_rps, 1),
                'estimated_safe_concurrent_users': estimated_safe_active_users,
                'capacity_headroom_percent': max(0.0, round(100.0 - cpu_pct, 1)),
            },
            'predicted': {
                'season_info': season,
                'peak_expected_active_users': int(estimated_safe_active_users * season['expected_load_multiplier']),
            },
            'recommendation': recommendation,
        }

    # -----------------------------------------------------------------------
    # RECOMMENDATION LOGIC
    # -----------------------------------------------------------------------

    def _generate_recommendation(
        self,
        current_tier: str,
        cpu_pct: float,
        ram_pct: float,
        p95: float,
        health_state: str,
        season: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate targeted upgrade, downgrade, or maintain recommendation."""
        # 1. Critical Escalation (Telemetry Overrides All)
        if health_state == 'RED' or cpu_pct >= 90.0 or p95 >= 3500.0:
            return {
                'action': 'UPGRADE_URGENT',
                'badge': 'danger',
                'target_tier': '2 vCPU / 4GB RAM' if '1 vCPU' in current_tier else '4 vCPU / 8GB RAM',
                'confidence': 'HIGH (Telemetry Driven)',
                'headline': 'Immediate Server Upgrade Recommended',
                'reason': f"Sustained CPU ({cpu_pct:.1f}%) and elevated p95 latency ({p95:.0f}ms) are causing interactive degradation.",
                'suggested_step': 'Resize VPS to next tier to ensure unhindered client operations.',
            }

        # 2. Elevated Load or Pre-Season Ramp Alert
        if health_state in ('ORANGE', 'YELLOW') or (season['is_ramp'] and cpu_pct >= 70.0):
            return {
                'action': 'PREPARE_UPGRADE',
                'badge': 'warning',
                'target_tier': '2 vCPU / 4GB RAM' if '1 vCPU' in current_tier else '4 vCPU / 8GB RAM',
                'confidence': 'MEDIUM (Pre-Season Growth)',
                'headline': 'Prepare Server Upgrade for Peak Demand',
                'reason': (
                    f"Traffic is surging ({season['mode']}) with CPU at {cpu_pct:.1f}%. "
                    f"Approaching peak capacity for current {current_tier} profile."
                ),
                'suggested_step': 'Schedule upgrade to 2 vCPU / 4GB RAM before full May peak season.',
            }

        # 3. Post-Season Downgrade Suggestion (Only on upgraded tiers when idle)
        if season['mode'] == 'NORMAL_OFF_SEASON' and '1 vCPU' not in current_tier and cpu_pct <= 25.0 and ram_pct <= 35.0:
            return {
                'action': 'CONSIDER_DOWNGRADE',
                'badge': 'info',
                'target_tier': '1 vCPU / 2GB RAM',
                'confidence': 'MEDIUM (Post-Peak Underutilization)',
                'headline': 'Post-Season Scale-Down Opportunity',
                'reason': f"Peak season concluded. Current CPU is {cpu_pct:.1f}% and RAM is {ram_pct:.1f}%. Server is significantly oversized.",
                'suggested_step': 'Optionally return to 1 vCPU / 2GB RAM to optimize infrastructure costs.',
            }

        # 4. Healthy Baseline
        return {
            'action': 'HEALTHY',
            'badge': 'success',
            'target_tier': current_tier,
            'confidence': 'HIGH',
            'headline': 'Server Sizing Optimal',
            'reason': f"Current workload ({cpu_pct:.1f}% CPU, {ram_pct:.1f}% RAM) is well within safe operating limits for {current_tier}.",
            'suggested_step': 'Maintain current configuration and monitor normal telemetry.',
        }

    # -----------------------------------------------------------------------
    # ADMIN NOTIFICATION DISPATCH (WITH COOLDOWNS)
    # -----------------------------------------------------------------------

    def check_and_dispatch_admin_alerts(self) -> Optional[Dict[str, Any]]:
        """
        Evaluate if a capacity alert should be sent to Super Admins.
        Enforces a 6-hour cooldown per alert type to avoid notification spam.
        """
        evaluation = self.evaluate_capacity()
        rec = evaluation['recommendation']
        action = rec['action']

        if action not in ('UPGRADE_URGENT', 'PREPARE_UPGRADE', 'CONSIDER_DOWNGRADE'):
            return None

        cooldown_key = f"capacity_alert_cooldown:{action}"
        if django_cache.get(cooldown_key):
            return None  # In cooldown

        # Record cooldown
        django_cache.set(cooldown_key, True, timeout=self.ALERT_COOLDOWN_SECONDS)

        # Log and send alert notification
        logger.warning(
            "CAPACITY ADVISOR ALERT [%s]: %s - %s",
            action,
            rec['headline'],
            rec['reason'],
        )

        try:
            from core.services.activity_service import ActivityService
            ActivityService.log(
                action='settings_update',
                description=f"Capacity Advisor: {rec['headline']} ({rec['target_tier']})",
                target_model='System',
            )
        except Exception:
            pass

        return evaluation


# Module singleton
capacity_advisor = CapacityAdvisor()
