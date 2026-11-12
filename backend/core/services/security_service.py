import logging
from typing import Optional, Tuple
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from accounts.rate_limit import _get_client_ip

logger = logging.getLogger(__name__)


class SecurityService:
    """
    Enterprise Security & Intrusion Detection Service.
    - Accurately tracks client IPs across proxy/edge layers.
    - Detects brute-force logins, cross-tenant isolation probes, and automated scrapers.
    - Dispatches instant high-priority Security Alarms to administrators.
    - Validates active subscription status for all tenant operations.
    """

    FAILED_LOGIN_THRESHOLD = 5
    FAILED_LOGIN_WINDOW_SECONDS = 300  # 5 minutes
    PROBE_THRESHOLD = 8
    PROBE_WINDOW_SECONDS = 300

    @classmethod
    def get_client_ip(cls, request) -> str:
        """Resolve client IP safely."""
        return _get_client_ip(request)

    @classmethod
    def record_failed_login(cls, request, username: Optional[str] = None) -> bool:
        """
        Record a failed authentication attempt.
        Returns True if an alarm was raised (threshold exceeded).
        """
        ip = cls.get_client_ip(request)
        cache_key = f"sec:failed_login:{ip}"
        attempts = cache.get(cache_key, 0) + 1
        cache.set(cache_key, attempts, timeout=cls.FAILED_LOGIN_WINDOW_SECONDS)

        logger.warning('Security: Failed login from IP=%s user=%s (attempt %d/%d)', ip, username, attempts, cls.FAILED_LOGIN_THRESHOLD)

        if attempts >= cls.FAILED_LOGIN_THRESHOLD:
            cls.raise_security_alarm(
                title='🚨 Security Alarm: Brute-Force Login Attempt',
                message=(
                    f"Suspicious activity detected: {attempts} consecutive failed logins "
                    f"from IP address {ip} targeting account '{username or 'unknown'}'. "
                    f"Rate limiting has been enforced on this IP."
                ),
                ip_address=ip,
                incident_type='brute_force_login',
                metadata={'ip': ip, 'username': username, 'attempts': attempts}
            )
            # Throttle IP for 15 minutes
            cache.set(f"sec:throttled_ip:{ip}", True, timeout=900)
            return True
        return False

    @classmethod
    def record_cross_tenant_probe(cls, request, user, attempted_tenant_id: str, reason: str = 'cross_tenant_attempt') -> None:
        """
        Record an unauthorized attempt to access another tenant's organisation or table data.
        """
        ip = cls.get_client_ip(request)
        cache_key = f"sec:probe:{ip}"
        probes = cache.get(cache_key, 0) + 1
        cache.set(cache_key, probes, timeout=cls.PROBE_WINDOW_SECONDS)

        user_info = getattr(user, 'username', 'anonymous') if user else 'anonymous'
        logger.error(
            'Security Breach Attempt: User %s from IP %s attempted unauthorized cross-tenant access to tenant=%s. Path=%s',
            user_info, ip, attempted_tenant_id, request.path
        )

        cls.raise_security_alarm(
            title='🚨 Security Alarm: Cross-Tenant Breach Attempt Blocked',
            message=(
                f"Unauthorized crossover attempt blocked: User '{user_info}' from IP {ip} "
                f"attempted to query resources outside their assigned subscription (target={attempted_tenant_id}). "
                f"Endpoint: {request.path}"
            ),
            ip_address=ip,
            incident_type='cross_tenant_probe',
            metadata={'ip': ip, 'user': user_info, 'target_tenant': attempted_tenant_id, 'path': request.path}
        )

    @classmethod
    def is_ip_blocked(cls, request) -> bool:
        """Check if client IP is currently blocked due to active security alarm."""
        ip = cls.get_client_ip(request)
        return bool(cache.get(f"sec:throttled_ip:{ip}"))

    @classmethod
    def raise_security_alarm(cls, *, title: str, message: str, ip_address: str, incident_type: str, metadata: dict = None) -> None:
        """
        Log an urgent Security Incident and create high-priority administrative notifications.
        """
        try:
            from core.models import ActivityLog
            ActivityLog.objects.create(
                action='security_alarm',
                description=message,
                ip_address=ip_address,
                target_model='SecurityIncident',
                target_name=incident_type,
            )
        except Exception as exc:
            logger.warning('Failed creating security ActivityLog: %s', exc)

        try:
            from core.services.notification_service import NotificationService
            NotificationService.create_notification(
                title=title,
                message=message,
                priority='urgent',
                category='alert',
                target='super_admin',
                visibility_hours=48,
            )
        except Exception as exc:
            logger.warning('Failed sending admin security alarm notification: %s', exc)

    @classmethod
    def validate_subscription_active(cls, user_or_subscription) -> Tuple[bool, Optional[str]]:
        """
        Ensure tenant's subscription is valid and not suspended or cancelled.
        """
        sub = None
        if hasattr(user_or_subscription, 'subscription'):
            sub = user_or_subscription.subscription
        elif hasattr(user_or_subscription, 'tier'):
            sub = user_or_subscription

        if not sub:
            # Standalone or Prime master operates without tenant subscription restriction
            return True, None

        if sub.status in ('cancelled', 'past_due'):
            return False, f"Subscription is {sub.get_status_display().lower()}. Access to SaaS features is suspended. Please contact platform billing."

        return True, None
