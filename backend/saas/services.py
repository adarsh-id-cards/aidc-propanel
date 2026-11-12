import os
from decimal import Decimal
from typing import Dict, Any, Optional, Tuple
from django.conf import settings
from django.db.models import Sum, Count, Q
from django.utils import timezone
from .models import SaaSSubscription, SaaSPayment, SaaSLead, SaaSTierFeature


class SaaSStorageService:
    """
    Manages tenant-isolated media storage directories.
    Ensures that each client subscription's photos, cards, and exports
    are physically segregated in dedicated folders on disk.
    """

    @classmethod
    def get_tenant_folder(cls, subscription: SaaSSubscription) -> str:
        folder = subscription.storage_folder
        if not folder:
            folder = f"tenants/{subscription.slug}"
        return folder

    @classmethod
    def get_tenant_media_root(cls, subscription: SaaSSubscription) -> str:
        rel_folder = cls.get_tenant_folder(subscription)
        abs_path = os.path.join(settings.MEDIA_ROOT, rel_folder)
        os.makedirs(abs_path, exist_ok=True)
        return abs_path

    @classmethod
    def get_tenant_subpath(cls, subscription: SaaSSubscription, *parts: str) -> str:
        base = cls.get_tenant_media_root(subscription)
        path = os.path.join(base, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return path

    @classmethod
    def ensure_tenant_directories(cls, subscription: SaaSSubscription) -> None:
        """Create standard tenant storage directories."""
        cls.get_tenant_subpath(subscription, 'adarshimg')
        cls.get_tenant_subpath(subscription, 'exports')
        cls.get_tenant_subpath(subscription, 'temp')

    @classmethod
    def calculate_storage_used(cls, subscription: SaaSSubscription) -> int:
        """Calculate total disk usage in bytes for a tenant folder."""
        folder = cls.get_tenant_media_root(subscription)
        if not os.path.exists(folder):
            return 0
        total_size = 0
        for dirpath, _, filenames in os.walk(folder):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    try:
                        total_size += os.path.getsize(fp)
                    except OSError:
                        pass
        return total_size


class SaaSFeatureService:
    """
    Evaluates tier feature gating and subscription quotas.
    Features: bulk_docx_xlsx_embedded, custom_branding_export, reprint_suite,
    high_throughput_worker, custom_domain, dedicated_mobile_app, audit_logs_telemetry, etc.
    """

    @classmethod
    def get_matrix_for_tier(cls, tier: str) -> Dict[str, Any]:
        """Fetch tier feature matrix from database or use defaults."""
        tier_obj = SaaSTierFeature.objects.filter(tier=tier).first()
        defaults = SaaSTierFeature.get_default_matrix().get(tier, {})
        if not tier_obj:
            return defaults
        merged_features = dict(defaults.get('features', {}))
        merged_features.update(tier_obj.features or {})
        merged_limits = dict(defaults.get('limits', {}))
        merged_limits.update(tier_obj.limits or {})
        return {
            'display_name': tier_obj.display_name or defaults.get('display_name', tier.capitalize()),
            'price_monthly': float(tier_obj.price_monthly),
            'features': merged_features,
            'limits': merged_limits,
        }

    @classmethod
    def resolve_subscription(cls, user_or_subscription) -> Optional[SaaSSubscription]:
        if isinstance(user_or_subscription, SaaSSubscription):
            return user_or_subscription
        if hasattr(user_or_subscription, 'subscription') and user_or_subscription.subscription:
            return user_or_subscription.subscription
        return None

    @classmethod
    def has_feature(cls, user_or_subscription, feature_key: str) -> bool:
        """Check if feature is enabled for the tenant."""
        # Prime Admin has unrestricted access to all platform features
        if hasattr(user_or_subscription, 'role') and user_or_subscription.role == 'prime_admin':
            return True

        sub = cls.resolve_subscription(user_or_subscription)
        if not sub:
            # Standalone or unassigned defaults to Pro tier feature set
            matrix = cls.get_matrix_for_tier('pro')
            return bool(matrix.get('features', {}).get(feature_key, False))

        matrix = cls.get_matrix_for_tier(sub.tier)
        return bool(matrix.get('features', {}).get(feature_key, False))

    @classmethod
    def check_quota(cls, user_or_subscription, quota_key: str, current_count: int) -> Tuple[bool, int]:
        """
        Check if current count is within limit.
        Returns: (is_allowed, max_limit)
        """
        if quota_key == 'max_organisations':
            return (True, 999999)

        sub = cls.resolve_subscription(user_or_subscription)
        tier = sub.tier if sub else 'pro'
        matrix = cls.get_matrix_for_tier(tier)
        max_allowed = matrix.get('limits', {}).get(quota_key, 999999)
        return (current_count < max_allowed, max_allowed)


class SaaSTelemetryService:
    """
    Computes real-time telemetry metrics for individual tenants and SaaS-wide overview.
    """

    @classmethod
    def get_tenant_telemetry(cls, subscription: SaaSSubscription) -> Dict[str, Any]:
        from django.contrib.auth import get_user_model
        from tables.models import Table, IDCard

        User = get_user_model()
        super_admins_count = User.objects.filter(role='super_admin', subscription=subscription).count()
        orgs = subscription.organisations.all()
        org_ids = list(orgs.values_list('id', flat=True))

        tables_count = Table.objects.filter(organisation_id__in=org_ids).count()
        cards_qs = IDCard.objects.filter(table__organisation_id__in=org_ids)
        card_status_map = dict(
            cards_qs.order_by().values('status').annotate(ct=Count('id')).values_list('status', 'ct')
        )
        total_cards = sum(card_status_map.values())
        pending_cards = card_status_map.get('pending', 0)
        verified_cards = card_status_map.get('verified', 0)
        approved_cards = card_status_map.get('approved', 0)
        downloaded_cards = (
            card_status_map.get('downloaded', 0)
            + card_status_map.get('download', 0)
            + card_status_map.get('printed', 0)
        )

        storage_bytes = SaaSStorageService.calculate_storage_used(subscription)
        storage_mb = round(storage_bytes / (1024 * 1024), 2)

        from core.models import ActivityLog
        tenant_alarms = ActivityLog.objects.filter(
            action='security_alarm',
            user__subscription=subscription
        ).count()
        effective_limit = subscription.effective_card_limit
        usage_pct = round((total_cards / effective_limit * 100), 1) if effective_limit > 0 else 0.0

        return {
            'subscription_id': subscription.id,
            'subscription_name': subscription.name,
            'tier': subscription.tier,
            'status': subscription.status,
            'super_admins_count': super_admins_count,
            'max_super_admins': subscription.max_super_admins,
            'organisations_count': len(org_ids),
            'max_organisations': subscription.max_organisations,
            'tables_count': tables_count,
            'total_cards': total_cards,
            'max_cards': subscription.max_cards,
            'effective_card_limit': effective_limit,
            'usage_percent': usage_pct,
            'pending_cards': pending_cards,
            'verified_cards': verified_cards,
            'approved_cards': approved_cards,
            'downloaded_cards': downloaded_cards,
            'storage_bytes': storage_bytes,
            'storage_mb': storage_mb,
            'security_alarms_count': tenant_alarms,
            'custom_domain': subscription.custom_domain,
            'custom_subdomain': subscription.custom_subdomain,
            'renews_at': subscription.renews_at.isoformat() if subscription.renews_at else None,
        }

    @classmethod
    def get_platform_overview(cls) -> Dict[str, Any]:
        """Aggregate SaaS platform metrics for Prime Admin Control Center."""
        from django.contrib.auth import get_user_model
        from tables.models import IDCard, Table
        from organisation.models import Organisation

        User = get_user_model()
        all_subs = SaaSSubscription.objects.all()

        # Single aggregation for tier breakdown
        tier_counts = {'lite': 0, 'pro': 0, 'max': 0}
        for item in all_subs.order_by().values('tier').annotate(ct=Count('id')):
            if item['tier'] in tier_counts:
                tier_counts[item['tier']] = item['ct']

        # Single aggregation for status breakdown
        sub_status_map = dict(
            all_subs.order_by().values('status').annotate(ct=Count('id')).values_list('status', 'ct')
        )
        total_tenants = sum(sub_status_map.values())
        active_tenants = sub_status_map.get('active', 0)
        trial_tenants = sub_status_map.get('trial', 0)

        # Calculate estimated MRR from tier monthly prices (₹ INR)
        tier_prices = {
            'lite': Decimal('499.00'),
            'pro': Decimal('499.00'),
            'max': Decimal('499.00'),
        }
        for tf in SaaSTierFeature.objects.all():
            tier_prices[tf.tier] = tf.price_monthly

        active_subs = all_subs.filter(status='active')
        mrr = sum(tier_prices.get(s.tier, Decimal('0.00')) for s in active_subs)

        # Total payments in ledger
        total_revenue = SaaSPayment.objects.filter(status='completed').aggregate(
            tot=Sum('amount')
        )['tot'] or Decimal('0.00')

        # Single aggregation for leads pipeline stats
        leads_qs = SaaSLead.objects.all()
        pipeline_stats = {'new': 0, 'contacted': 0, 'demo': 0, 'won': 0}
        lead_pipe_map = {
            'new': 'new',
            'contacted': 'contacted',
            'demo_scheduled': 'demo',
            'closed_won': 'won',
        }
        for item in leads_qs.order_by().values('pipeline_status').annotate(ct=Count('id')):
            mapped_key = lead_pipe_map.get(item['pipeline_status'])
            if mapped_key:
                pipeline_stats[mapped_key] = item['ct']
        total_leads = sum(pipeline_stats.values())

        from core.models import ActivityLog, BackgroundTask
        active_alarms = ActivityLog.objects.filter(action='security_alarm').count()
        expired_tasks = BackgroundTask.objects.filter(status='expired').count()

        return {
            'total_tenants': total_tenants,
            'active_tenants': active_tenants,
            'trial_tenants': trial_tenants,
            'mrr': float(mrr),
            'total_revenue': float(total_revenue),
            'tier_breakdown': tier_counts,
            'total_super_admins': User.objects.filter(role='super_admin').count(),
            'total_prime_operators': User.objects.filter(role='prime_operator').count(),
            'total_organisations': Organisation.objects.count(),
            'total_tables': Table.objects.count(),
            'total_cards': IDCard.objects.count(),
            'leads_count': total_leads,
            'pipeline_breakdown': pipeline_stats,
            'active_security_alarms_count': active_alarms,
            'ephemeral_expired_tasks_count': expired_tasks,
        }


class SaaSQuotaService:
    """
    Tracks and checks card limits, usage meters, and generates low-balance warnings.
    """

    @classmethod
    def get_subscription_quota_details(cls, subscription: SaaSSubscription) -> Dict[str, Any]:
        from tables.models import IDCard
        org_ids = list(subscription.organisations.values_list('id', flat=True))
        used_cards = IDCard.objects.filter(table__organisation_id__in=org_ids).count()
        effective_limit = subscription.effective_card_limit
        remaining_cards = max(0, effective_limit - used_cards)
        usage_pct = round((used_cards / effective_limit * 100), 1) if effective_limit > 0 else 100.0

        is_warning = usage_pct >= 80.0
        is_critical = usage_pct >= 90.0
        is_exhausted = remaining_cards <= 0

        # Pending extra card pack requests
        pending_topups = list(
            subscription.card_topups.filter(status='pending').values('id', 'quantity', 'amount', 'created_at')
        )

        pricing_info = SaaSBillingService.get_pricing_for_tier(subscription.tier)
        recent_payments = list(
            subscription.payments.order_by('-created_at')[:8].values(
                'id', 'amount', 'currency', 'status', 'invoice_number',
                'payment_method', 'payment_plan_type', 'utr_number', 'screenshot_url',
                'payment_date', 'created_at', 'verified_at', 'rejection_reason'
            )
        )

        return {
            'subscription_id': subscription.id,
            'subscription_name': subscription.name,
            'tier': subscription.tier,
            'tier_display': subscription.get_tier_display(),
            'brand_name': subscription.brand_name,
            'brand_logo_url': subscription.brand_logo_url,
            'panel_color_theme': subscription.panel_color_theme,
            'panel_accent_theme': subscription.panel_accent_theme,
            'website_template': subscription.website_template,
            'custom_domain': subscription.custom_domain,
            'base_card_limit': subscription.max_cards,
            'extra_cards_purchased': subscription.extra_cards_purchased,
            'effective_card_limit': effective_limit,
            'used_cards': used_cards,
            'remaining_cards': remaining_cards,
            'usage_percentage': usage_pct,
            'is_warning': is_warning,
            'is_critical': is_critical,
            'is_exhausted': is_exhausted,
            'max_organisations': subscription.max_organisations,
            'used_organisations': len(org_ids),
            'pending_topups': pending_topups,
            'license': {
                'license_key': subscription.license_key or subscription.generate_license_key(),
                'license_status': subscription.license_status,
                'license_status_display': subscription.get_license_status_display(),
                'license_issued_at': subscription.license_issued_at.isoformat() if subscription.license_issued_at else None,
                'is_license_valid': subscription.is_license_valid,
                'registered_to': subscription.name,
                'tier_display': subscription.get_tier_display(),
                'custom_domain': subscription.custom_domain or f"{subscription.slug}.cardflow.io",
                'effective_card_limit': effective_limit,
                'renews_at': subscription.renews_at.isoformat() if subscription.renews_at else None,
            },
            'billing': {
                'billing_plan': subscription.billing_plan,
                'status': subscription.status,
                'renews_at': subscription.renews_at.isoformat() if subscription.renews_at else None,
                'installments_paid': subscription.installments_paid,
                'installments_total': subscription.installments_total,
                'next_installment_due': subscription.next_installment_due.isoformat() if subscription.next_installment_due else None,
                'pricing': pricing_info,
                'bank_details': SaaSBillingService.BANK_PAYMENT_DETAILS,
                'recent_payments': recent_payments,
            },
            'addons': {
                'auto_print': {
                    'name': 'Auto Print Engine',
                    'active': subscription.auto_print_active,
                    'expires_at': subscription.auto_print_expires_at.isoformat() if subscription.auto_print_expires_at else None,
                    'credits': subscription.auto_print_credits,
                    'access_fee': 999,
                    'usage_fee_per_10k': 499,
                    'description': 'Directly prints high-res ID cards from finalized CardFlow data with given design layout.',
                },
                'auto_type': {
                    'name': 'Auto Type & OCR',
                    'active': subscription.auto_type_active,
                    'expires_at': subscription.auto_type_expires_at.isoformat() if subscription.auto_type_expires_at else None,
                    'credits': subscription.auto_type_credits,
                    'access_fee': 999,
                    'usage_fee_per_10k': 2499,
                    'description': 'AI automated data extraction from scanned forms, physical registers, and PDF sheets.',
                },
                'auto_edit': {
                    'name': 'Auto Edit & Face Crop',
                    'active': subscription.auto_edit_active,
                    'expires_at': subscription.auto_edit_expires_at.isoformat() if subscription.auto_edit_expires_at else None,
                    'credits': subscription.auto_edit_credits,
                    'access_fee': 999,
                    'usage_fee_per_10k': 1499,
                    'description': 'Auto face detection, smart aspect cropping, background enhancement, and clean upload.',
                },
            }
        }

    @classmethod
    def can_create_cards(cls, subscription: Optional[SaaSSubscription], count: int = 1) -> Tuple[bool, Optional[str]]:
        if not subscription:
            return True, None
        from tables.models import IDCard
        org_ids = list(subscription.organisations.values_list('id', flat=True))
        used = IDCard.objects.filter(table__organisation_id__in=org_ids).count()
        limit = subscription.effective_card_limit
        if used + count > limit:
            return False, f"Card limit exceeded: Subscription limit is {limit} cards ({used} already used). Please request an extra card pack (1,000, 5,000, or 10,000 cards)."
        return True, None


class SaaSAddonService:
    """
    Manages usage deductions and access licenses for the 3 paid Add-on Features:
    Auto Print (₹999/yr + ₹499/10k), Auto Type (₹999/yr + ₹2,499/10k), Auto Edit (₹999/yr + ₹1,499/10k).
    """

    PRICING = {
        'auto_print': {'access_fee': 999.00, 'usage_pack_price': 499.00, 'pack_qty': 10000},
        'auto_type': {'access_fee': 999.00, 'usage_pack_price': 2499.00, 'pack_qty': 10000},
        'auto_edit': {'access_fee': 999.00, 'usage_pack_price': 1499.00, 'pack_qty': 10000},
    }

    CARD_TOPUP_PRICING = {
        5000: 49.00,
        10000: 79.00,
        25000: 149.00,
        50000: 249.00,
        1000: 29.00,
    }

    @classmethod
    def deduct_credits(cls, subscription: SaaSSubscription, addon_type: str, qty: int = 1) -> Tuple[bool, str]:
        """Deduct credits when an add-on operation executes."""
        if addon_type == 'auto_print':
            if not subscription.auto_print_active:
                return False, 'Auto Print add-on is not active. Please activate annual license.'
            if subscription.auto_print_credits < qty:
                return False, 'Insufficient Auto Print credits. Please purchase a 10,000 card processing pack.'
            subscription.auto_print_credits = max(0, subscription.auto_print_credits - qty)
            subscription.save(update_fields=['auto_print_credits'])
            return True, 'OK'

        elif addon_type == 'auto_type':
            if not subscription.auto_type_active:
                return False, 'Auto Type add-on is not active. Please activate annual license.'
            if subscription.auto_type_credits < qty:
                return False, 'Insufficient Auto Type credits. Please purchase a 10,000 form processing pack.'
            subscription.auto_type_credits = max(0, subscription.auto_type_credits - qty)
            subscription.save(update_fields=['auto_type_credits'])
            return True, 'OK'

        elif addon_type == 'auto_edit':
            if not subscription.auto_edit_active:
                return False, 'Auto Edit add-on is not active. Please activate annual license.'
            if subscription.auto_edit_credits < qty:
                return False, 'Insufficient Auto Edit credits. Please purchase a 10,000 image processing pack.'
            subscription.auto_edit_credits = max(0, subscription.auto_edit_credits - qty)
            subscription.save(update_fields=['auto_edit_credits'])
            return True, 'OK'

        return False, 'Unknown add-on type'


class SaaSBillingService:
    """
    Manages 2-step split plan vs one-go full-year subscription pricing,
    and manual payment verification workflows (Bank transfer & UPI).
    """

    TIER_PRICING = {
        'lite': {
            'tier': 'lite',
            'display_name': 'CardFlow Starter',
            'max_cards': 10000,
            'max_organisations': 100,
            'setup_fee': 4999.00,
            'monthly_price': 499.00,
            'quarterly_price': 1399.00,
            'half_yearly_price': 2599.00,
            'yearly_price': 4999.00,
            'free_months': 2,
            # Backward compat aliases
            'split_step1_annual': 4999.00,
            'split_monthly_installment': 499.00,
            'split_installments_count': 10,
            'split_total': 9989.00,
            'one_time_annual': 4999.00,
            'one_time_savings': 989.00,
            'description': 'Primary Cloud Domain, shared standard mobile app (Play Store listing add-on available)',
        },
        'pro': {
            'tier': 'pro',
            'display_name': 'CardFlow Professional',
            'max_cards': 10000,
            'max_organisations': 500,
            'setup_fee': 7499.00,
            'monthly_price': 499.00,
            'quarterly_price': 1399.00,
            'half_yearly_price': 2599.00,
            'yearly_price': 4999.00,
            'free_months': 2,
            # Backward compat aliases
            'split_step1_annual': 7499.00,
            'split_monthly_installment': 499.00,
            'split_installments_count': 10,
            'split_total': 12489.00,
            'one_time_annual': 4999.00,
            'one_time_savings': 989.00,
            'description': 'Customizable static website (5 templates, custom colors & sections, 10 update requests/yr), dedicated mobile app (Play Store listing name, icon, splash & header logo)',
        },
        'max': {
            'tier': 'max',
            'display_name': 'CardFlow Enterprise',
            'max_cards': 10000,
            'max_organisations': 2000,
            'setup_fee': 9999.00,
            'monthly_price': 499.00,
            'quarterly_price': 1399.00,
            'half_yearly_price': 2599.00,
            'yearly_price': 4999.00,
            'free_months': 2,
            # Backward compat aliases
            'split_step1_annual': 9999.00,
            'split_monthly_installment': 499.00,
            'split_installments_count': 10,
            'split_total': 14989.00,
            'one_time_annual': 4999.00,
            'one_time_savings': 989.00,
            'description': 'Bespoke dynamic custom website (unique build) + CMS website admin control dashboard (10 updates/yr), fully customized bespoke mobile app (animated splash screen, social links, feature colors, 10 app updates/yr)',
        },
    }

    BANK_PAYMENT_DETAILS = {
        'account_name': 'CardFlow Technologies Private Limited',
        'bank_name': 'HDFC Bank',
        'account_number': '50200012345678',
        'account_type': 'Current Account',
        'ifsc_code': 'HDFC0001234',
        'branch': 'Fort, Mumbai',
        'upi_id': 'cardflow@upi',
        'upi_name': 'CardFlow Technologies',
        'instructions': 'Pay via Net Banking (NEFT/IMPS/RTGS) or scan UPI ID/QR. After payment, enter your 12-digit UTR/transaction reference and attach screenshot proof. Our team manually verifies and activates access within minutes.',
    }

    @classmethod
    def get_pricing_for_tier(cls, tier: str) -> Dict[str, Any]:
        return cls.TIER_PRICING.get(tier, cls.TIER_PRICING['pro'])

    @classmethod
    def submit_manual_payment(
        cls,
        subscription: SaaSSubscription,
        amount: Decimal,
        payment_method: str = 'upi',
        payment_plan_type: str = 'one_time_annual',
        utr_number: str = '',
        screenshot_url: str = '',
        notes: str = '',
    ) -> SaaSPayment:
        """
        Record a manual payment awaiting Prime Admin review & verification.
        """
        from datetime import date
        payment = SaaSPayment.objects.create(
            subscription=subscription,
            amount=amount,
            currency='INR',
            payment_date=date.today(),
            status='pending_verification',
            payment_method=payment_method,
            payment_plan_type=payment_plan_type,
            utr_number=str(utr_number).strip(),
            screenshot_url=str(screenshot_url).strip(),
            notes=str(notes).strip(),
        )

        try:
            from core.services.notification_service import NotificationService
            NotificationService.create_notification(
                user_role='prime_admin',
                notification_type='payment_submitted',
                title='💳 New Payment Awaiting Verification',
                message=(
                    f"Tenant '{subscription.name}' submitted a manual payment of ₹{amount:,.2f} "
                    f"via {payment_method.upper()} (UTR: {utr_number or 'N/A'}, Plan: {payment_plan_type})."
                ),
                reference_id=payment.id,
            )
        except Exception:
            pass

        return payment

    @classmethod
    def verify_payment(
        cls,
        payment: SaaSPayment,
        verified_by,
        action: str = 'approve',
        rejection_reason: str = '',
    ) -> Tuple[bool, str]:
        """
        Approve or reject a manual payment.
        On approval: activates subscription, extends renewal date, and updates installment progress.
        """
        sub = payment.subscription
        today = timezone.now().date()
        from datetime import timedelta

        if action == 'reject':
            payment.status = 'rejected'
            payment.rejection_reason = str(rejection_reason).strip()
            payment.verified_by = verified_by
            payment.verified_at = timezone.now()
            payment.save(update_fields=['status', 'rejection_reason', 'verified_by', 'verified_at'])

            try:
                from core.services.notification_service import NotificationService
                NotificationService.create_notification(
                    user_role='super_admin',
                    notification_type='payment_rejected',
                    title='❌ Payment Verification Failed',
                    message=f"Your payment of ₹{payment.amount:,.2f} (UTR: {payment.utr_number}) could not be verified. Reason: {rejection_reason or 'Details mismatch'}. Please check your transaction details.",
                    reference_id=payment.id,
                )
            except Exception:
                pass

            return True, f"Payment #{payment.id} marked as rejected."

        # Approve
        payment.status = 'completed'
        payment.verified_by = verified_by
        payment.verified_at = timezone.now()
        payment.save(update_fields=['status', 'verified_by', 'verified_at'])

        # Update Subscription status and installment tracking
        sub.status = 'active'

        if payment.payment_plan_type == 'split_step1':
            sub.billing_plan = 'split'
            sub.installments_paid = 0
            sub.installments_total = 10
            # Step 1 covers first 2 months free! Next installment due after 60 days
            sub.next_installment_due = today + timedelta(days=60)
            sub.renews_at = today + timedelta(days=365)

        elif payment.payment_plan_type == 'split_installment':
            sub.installments_paid = min(sub.installments_total, sub.installments_paid + 1)
            if sub.installments_paid < sub.installments_total:
                sub.next_installment_due = today + timedelta(days=30)
            else:
                sub.next_installment_due = None
            if not sub.renews_at or sub.renews_at < today:
                sub.renews_at = today + timedelta(days=365)

        elif payment.payment_plan_type == 'one_time_annual':
            sub.billing_plan = 'one_time'
            sub.installments_paid = 10
            sub.next_installment_due = None
            sub.renews_at = today + timedelta(days=365)

        sub.save()

        try:
            from core.services.notification_service import NotificationService
            NotificationService.create_notification(
                user_role='super_admin',
                notification_type='payment_approved',
                title='✅ Subscription Payment Verified & Active',
                message=(
                    f"Your payment of ₹{payment.amount:,.2f} has been verified and credited. "
                    f"CardFlow {sub.get_tier_display()} is active! Renews on {sub.renews_at}."
                ),
                reference_id=payment.id,
            )
        except Exception:
            pass

        return True, f"Payment #{payment.id} verified and approved successfully. Subscription '{sub.name}' is now active."


