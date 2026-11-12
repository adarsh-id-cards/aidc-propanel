"""
Statistics Dashboard Views
==========================
Real data only — no random/mock fallbacks.
Provides live presence categorization (working vs idle), role breakdown,
historical time-series metrics, and server load monitoring.
"""

from datetime import datetime, timedelta
import logging

from django.http import JsonResponse
from django.utils import timezone
from django.contrib.auth import get_user_model

from core.services.permission_service import PermissionService, api_require_any_authenticated
from stats.models import StatsSnapshot, ServerLoadAlert
from stats.services import StatsService

logger = logging.getLogger(__name__)
User = get_user_model()


@api_require_any_authenticated
def api_statistics_data(request):
    """
    JSON API — complete real activity metrics over time and real-time live presence.
    Supports range: 'hourly' (last 24 h), 'daily' (last 30 d),
                    'weekly' (last 12 wk), 'monthly' (last 12 mo).
    """
    if not (PermissionService.can_use_pro_user_options(request.user) or PermissionService.is_prime_admin(request.user)):
        return JsonResponse({'success': False, 'message': 'Access denied.'}, status=403)

    range_type = str(request.GET.get('range', 'hourly')).strip().lower()
    if range_type not in ('hourly', 'daily', 'weekly', 'monthly'):
        range_type = 'hourly'

    try:
        payload = StatsService.get_complete_statistics_payload(range_type=range_type)
        return JsonResponse(payload)
    except Exception as e:
        logger.exception('api_statistics_data failed: %s', e)
        return JsonResponse({'success': False, 'error': 'Failed to generate statistics.'}, status=500)


@api_require_any_authenticated
def api_live_presence_breakdown(request):
    """
    JSON API — lightweight real-time live presence breakdown and active user roster.
    Useful for frequent polling or real-time presence indicators.
    """
    if not (PermissionService.can_use_pro_user_options(request.user) or PermissionService.is_prime_admin(request.user)):
        return JsonResponse({'success': False, 'message': 'Access denied.'}, status=403)

    try:
        live_data = StatsService.get_live_presence_analysis()
        return JsonResponse({
            'success': True,
            'live_presence': live_data,
            'summary': {
                'current_active_users': live_data['total_live_users'],
                'live_desktop_users': live_data['live_desktop_users'],
                'live_mobile_users': live_data['live_mobile_users'],
                'live_working_users': live_data['live_working_users'],
                'live_idle_users': live_data['live_idle_users'],
                'live_by_role': live_data['live_by_role'],
                'live_working_by_role': live_data['live_working_by_role'],
                'live_idle_by_role': live_data['live_idle_by_role'],
                'live_by_device': live_data['live_by_device'],
            },
            'live_users_roster': live_data['live_users_roster'],
        })
    except Exception as e:
        logger.exception('api_live_presence_breakdown failed: %s', e)
        return JsonResponse({'success': False, 'error': 'Failed to retrieve live presence.'}, status=500)


# ── Server load alert helpers ──────────────────────────────────────────────────

LOAD_THRESHOLDS = [
    (100, ServerLoadAlert.LEVEL_DANGER,
     '🚨 CRITICAL: Server Will Crash',
     '100 or more concurrent users are active right now. The server is at serious risk of crashing. Please scale immediately.'),
    (75, ServerLoadAlert.LEVEL_CRITICAL,
     '⚠️ WARNING: Server Is Struggling',
     '75 or more concurrent users are active right now. The server is struggling. Please investigate and scale if needed.'),
    (50, ServerLoadAlert.LEVEL_WARNING,
     '🟡 NOTICE: Server Is Slow',
     '50 or more concurrent users are active right now. Response times may be degrading. Monitor the situation.'),
]

ALERT_COOLDOWN_MINUTES = 30


def _get_admin_emails():
    """Return emails of all active super_admin / prime_admin accounts."""
    admins = User.objects.filter(
        is_active=True,
        role__in=('super_admin', 'prime_admin', 'pro_user'),
    ).values_list('email', flat=True)
    return [e for e in admins if e and '@' in e]


def check_and_send_load_alerts(concurrent_users: int):
    """Sends a single email per alert level per cooldown window."""
    from django.conf import settings
    from core.utils.threaded_email import send_html_email_async

    admin_emails = _get_admin_emails()
    if not admin_emails:
        logger.warning('check_and_send_load_alerts: no admin emails found, skipping.')
        return

    now = timezone.now()

    for (threshold, level, subject, intro) in LOAD_THRESHOLDS:
        if concurrent_users < threshold:
            continue

        alert, _ = ServerLoadAlert.objects.get_or_create(level=level)
        cooldown_ok = (
            alert.last_sent is None or
            (now - alert.last_sent) >= timedelta(minutes=ALERT_COOLDOWN_MINUTES)
        )
        if not cooldown_ok:
            break

        subject_full = f'[CardsFlow Panel] {subject} — {concurrent_users} users online'
        panel_url = getattr(settings, 'PANEL_URL', '') or 'https://panel.adarshbhopal.in'

        plain = (
            f'{intro}\n\n'
            f'Concurrent users right now: {concurrent_users}\n'
            f'Threshold triggered: {threshold}+\n'
            f'Time: {now.strftime("%Y-%m-%d %H:%M:%S %Z")}\n\n'
            f'Please log in to the panel and check server health:\n{panel_url}/panel/statistics/\n\n'
            f'— CardsFlow Auto-Alert System'
        )

        level_color = {'warning': '#f59e0b', 'critical': '#ef4444', 'danger': '#7f1d1d'}.get(level, '#333')
        html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <div style="background:{level_color};color:#fff;border-radius:8px 8px 0 0;padding:20px 24px;">
            <h2 style="margin:0;font-size:20px;">{subject}</h2>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
            <p style="font-size:15px;color:#111;">{intro}</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;color:#6b7280;font-size:13px;width:50%;">Concurrent users</td>
                  <td style="padding:8px;font-weight:700;font-size:15px;">{concurrent_users}</td></tr>
              <tr style="background:#f3f4f6;"><td style="padding:8px;color:#6b7280;font-size:13px;">Threshold</td>
                  <td style="padding:8px;font-weight:700;font-size:15px;">{threshold}+</td></tr>
              <tr><td style="padding:8px;color:#6b7280;font-size:13px;">Time (UTC)</td>
                  <td style="padding:8px;font-size:13px;">{now.strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
            </table>
            <a href="{panel_url}/panel/statistics/"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;
                      border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
              Open Statistics Dashboard →
            </a>
            <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
              This is an automated alert from the CardsFlow panel.<br>
              Alerts repeat at most once every {ALERT_COOLDOWN_MINUTES} minutes per severity level.
            </p>
          </div>
        </div>
        """

        try:
            send_html_email_async(
                subject=subject_full,
                plain_content=plain,
                html_content=html,
                from_email=None,
                recipient_list=admin_emails,
                skip_logging=True,
                email_type='alert',
            )
            alert.last_sent = now
            alert.last_count = concurrent_users
            alert.save(update_fields=['last_sent', 'last_count'])
            logger.info('Server load alert [%s] sent to %s (%d users online)',
                        level, admin_emails, concurrent_users)
        except Exception:
            logger.exception('Failed to send server load alert [%s]', level)

        break


@api_require_any_authenticated
def api_check_server_load(request):
    """Lightweight endpoint polled by the statistics page JS."""
    if not (PermissionService.can_use_pro_user_options(request.user) or PermissionService.is_prime_admin(request.user)):
        return JsonResponse({'success': False}, status=403)

    live_analysis = StatsService.get_live_presence_analysis()
    concurrent = live_analysis['total_live_users']

    alert_level = None
    if concurrent >= 100:
        alert_level = 'danger'
    elif concurrent >= 75:
        alert_level = 'critical'
    elif concurrent >= 50:
        alert_level = 'warning'

    if alert_level:
        try:
            check_and_send_load_alerts(concurrent)
        except Exception:
            logger.exception('api_check_server_load: alert dispatch failed')

    return JsonResponse({
        'success': True,
        'concurrent': concurrent,
        'alert_level': alert_level,
    })
