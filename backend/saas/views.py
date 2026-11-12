import json
import logging
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from core.services.permission_service import PermissionService
from accounts.services_impersonate import ImpersonateService
from .models import (
    SaaSSubscription,
    SaaSPayment,
    SaaSLead,
    SaaSTierFeature,
    SaaSCardTopupRequest,
    SaaSAddonRequest,
    SaaSPlatformLog,
)
from .services import (
    SaaSStorageService,
    SaaSFeatureService,
    SaaSTelemetryService,
    SaaSQuotaService,
    SaaSAddonService,
    SaaSBillingService,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _json_error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({'success': False, 'error': message}, status=status)


def _json_success(data: dict = None, status: int = 200) -> JsonResponse:
    payload = {'success': True}
    if data:
        payload.update(data)
    return JsonResponse(payload, status=status)


def _check_prime_access(request, allowed_subroles=None, required_permission=None):
    """
    Ensure request is from Prime Admin or authorized Prime Operator.
    If allowed_subroles is given, check that prime_operator has that sub-role OR has required_permission.
    """
    if not request.user or not request.user.is_authenticated:
        return False, _json_error('Authentication required.', status=401)
    
    if PermissionService.is_prime_admin(request.user):
        return True, None
    
    if PermissionService.is_prime_operator(request.user):
        effective_fn = getattr(request.user, 'get_effective_operator_permissions', None)
        perms_dict = effective_fn() if callable(effective_fn) else {}

        if required_permission:
            if perms_dict.get(required_permission) is True:
                return True, None
            if perms_dict.get(required_permission) is False:
                return False, _json_error(f"Permission denied: Requires '{required_permission}' permission.", status=403)

        if allowed_subroles:
            sub = getattr(request.user, 'prime_operator_role', None)
            if sub not in allowed_subroles:
                return False, _json_error(f"Permission denied: Requires {', '.join(allowed_subroles)} operator role.", status=403)
        return True, None
    
    return False, _json_error('Permission denied: SaaS Prime Master access required.', status=403)


def _resolve_request_subscription(request, body=None):
    """
    Resolve subscription from authenticated user, query param, or payload.
    """
    if not request.user or not request.user.is_authenticated:
        return None
    # If Prime Admin or Prime Operator, allow inspecting any tenant via query param or payload
    if PermissionService.is_prime_admin(request.user) or PermissionService.is_prime_operator(request.user):
        sub_id = request.GET.get('subscription_id')
        if not sub_id and body and isinstance(body, dict):
            sub_id = body.get('subscription_id')
        if sub_id:
            sub = SaaSSubscription.objects.filter(pk=sub_id).first()
            if sub:
                return sub
    # Otherwise return the user's bound subscription
    if getattr(request.user, 'subscription', None):
        return request.user.subscription
    return SaaSSubscription.objects.first()



# =============================================================================
# 1. SAAS OVERVIEW & TELEMETRY
# =============================================================================

@require_http_methods(['GET'])
def api_saas_overview(request):
    """Platform-wide SaaS overview metrics for Prime Admin Control Center."""
    ok, err_resp = _check_prime_access(request)
    if not ok:
        return err_resp

    overview = SaaSTelemetryService.get_platform_overview()
    return _json_success({'overview': overview})


# =============================================================================
# 2. SUBSCRIPTIONS & TENANTS
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_subscriptions(request):
    """
    GET: List all tenant subscriptions with telemetry.
    POST: Create a new tenant subscription.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev', 'helper'])
    if not ok:
        return err_resp

    if request.method == 'GET':
        tier_filter = request.GET.get('tier')
        status_filter = request.GET.get('status')
        query = request.GET.get('q', '').strip()

        subs = SaaSSubscription.objects.all()
        if tier_filter:
            subs = subs.filter(tier=tier_filter)
        if status_filter:
            subs = subs.filter(status=status_filter)
        if query:
            subs = subs.filter(name__icontains=query)

        data = []
        for s in subs:
            telemetry = SaaSTelemetryService.get_tenant_telemetry(s)
            super_admins = list(
                User.objects.filter(role='super_admin', subscription=s).values(
                    'id', 'username', 'email', 'phone', 'is_active', 'created_at'
                )
            )
            data.append({
                'id': s.id,
                'name': s.name,
                'slug': s.slug,
                'tier': s.tier,
                'tier_display': s.get_tier_display(),
                'status': s.status,
                'status_display': s.get_status_display(),
                'license_key': s.license_key or s.generate_license_key(),
                'license_status': s.license_status,
                'license_issued_at': s.license_issued_at.isoformat() if s.license_issued_at else None,
                'is_license_valid': s.is_license_valid,
                'storage_folder': s.storage_folder,
                'max_super_admins': s.max_super_admins,
                'max_organisations': s.max_organisations,
                'max_cards': s.max_cards,
                'effective_card_limit': s.effective_card_limit,
                'custom_domain': s.custom_domain,
                'custom_subdomain': s.custom_subdomain,
                'brand_name': s.brand_name,
                'brand_logo_url': s.brand_logo_url,
                'panel_color_theme': s.panel_color_theme,
                'panel_accent_theme': s.panel_accent_theme,
                'website_template': s.website_template,
                'auto_print_active': s.auto_print_active,
                'auto_print_credits': s.auto_print_credits,
                'auto_type_active': s.auto_type_active,
                'auto_type_credits': s.auto_type_credits,
                'auto_edit_active': s.auto_edit_active,
                'auto_edit_credits': s.auto_edit_credits,
                'billing_plan': s.billing_plan,
                'installments_paid': s.installments_paid,
                'installments_total': s.installments_total,
                'landing_config': s.landing_config,
                'mobile_app_config': s.mobile_app_config,
                'renews_at': s.renews_at.isoformat() if s.renews_at else None,
                'notes': s.notes,
                'created_at': s.created_at.isoformat(),
                'super_admins': super_admins,
                'telemetry': telemetry,
            })

        return _json_success({'subscriptions': data})

    elif request.method == 'POST':
        # Create subscription (Sales Operator or Prime Admin)
        ok_sales, err_sales = _check_prime_access(request, allowed_subroles=['sales'], required_permission='can_manage_subscriptions')
        if not ok_sales:
            return err_sales

        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        name = str(body.get('name', '')).strip()
        if not name:
            return _json_error('Subscription name is required.')

        tier_alias_map = {'starter': 'lite', 'professional': 'pro', 'enterprise': 'max', 'lite': 'lite', 'pro': 'pro', 'max': 'max'}
        tier = tier_alias_map.get(str(body.get('tier', 'pro')).lower(), 'pro')

        sub = SaaSSubscription(
            name=name,
            tier=tier,
            status=body.get('status', 'active'),
            max_super_admins=3,
            max_organisations=int(body.get('max_organisations') or (100 if tier == 'lite' else (500 if tier == 'pro' else 2000))),
            max_cards=int(body.get('max_cards') or 10000),
            custom_domain=body.get('custom_domain') or None,
            custom_subdomain=body.get('custom_subdomain') or None,
            renews_at=body.get('renews_at') or None,
            notes=body.get('notes', ''),
        )
        if body.get('slug'):
            sub.slug = str(body.get('slug')).strip().lower()

        sub.save()
        SaaSStorageService.ensure_tenant_directories(sub)

        # Auto-create initial Super Admin for this client
        initial_admin = body.get('initial_super_admin') or {}
        admin_data = None
        u_name = str(initial_admin.get('username', '')).strip() if isinstance(initial_admin, dict) else ''
        if not u_name:
            base_uname = f"{sub.slug}.admin"
            u_name = base_uname
            suffix = 1
            while User.objects.filter(username=u_name).exists():
                u_name = f"{base_uname}{suffix}"
                suffix += 1

        u_email = str(initial_admin.get('email', '')).strip() if isinstance(initial_admin, dict) else ''
        if not u_email:
            u_email = f"{u_name}@{sub.slug}.cardflow.io"
            suffix = 1
            while User.objects.filter(email=u_email).exists():
                u_email = f"{u_name}{suffix}@{sub.slug}.cardflow.io"
                suffix += 1

        u_pass = str(initial_admin.get('password', '')).strip() if isinstance(initial_admin, dict) else ''
        if not u_pass:
            u_pass = f"{sub.slug.capitalize()}@2026!"
        u_phone = str(initial_admin.get('phone', '')).strip() if isinstance(initial_admin, dict) else ''

        if not User.objects.filter(username=u_name).exists():
            user = User.objects.create_user(
                username=u_name,
                email=u_email,
                password=u_pass,
                role='super_admin',
                subscription=sub,
                phone=u_phone,
            )
            admin_data = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'password': u_pass,
            }
        else:
            user = User.objects.filter(username=u_name).first()
            if user:
                user.subscription = sub
                user.role = 'super_admin'
                user.save(update_fields=['subscription', 'role'])
                admin_data = {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'password': u_pass,
                }

        # If initial payment record provided, save SaaSPayment
        if body.get('initial_payment') and isinstance(body['initial_payment'], dict):
            pay_body = body['initial_payment']
            amount = float(pay_body.get('amount') or 0)
            if amount > 0:
                SaaSPayment.objects.create(
                    subscription=sub,
                    amount=amount,
                    method=pay_body.get('method', 'bank_transfer'),
                    reference_number=pay_body.get('reference_number', f"ONB-{int(timezone.now().timestamp())}"),
                    notes=pay_body.get('notes', 'Initial Subscription Onboarding Payment'),
                    verified_by=request.user,
                    is_verified=bool(pay_body.get('is_verified', True)),
                    verified_at=timezone.now() if pay_body.get('is_verified', True) else None,
                )

        return _json_success({
            'message': f"Subscription '{sub.name}' created with Super Admin '{u_name}'.",
            'subscription_id': sub.id,
            'slug': sub.slug,
            'initial_admin': admin_data,
        }, status=201)


@csrf_exempt
@require_http_methods(['GET', 'PUT', 'PATCH', 'DELETE'])
def api_saas_subscription_detail(request, sub_id):
    """Retrieve, update, or remove a tenant subscription."""
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev', 'helper'])
    if not ok:
        return err_resp

    try:
        sub = SaaSSubscription.objects.get(pk=sub_id)
    except SaaSSubscription.DoesNotExist:
        return _json_error('Subscription not found.', status=404)

    if request.method == 'GET':
        telemetry = SaaSTelemetryService.get_tenant_telemetry(sub)
        super_admins = list(
            User.objects.filter(role='super_admin', subscription=sub).values(
                'id', 'username', 'email', 'phone', 'is_active', 'created_at'
            )
        )
        organisations = list(
            sub.organisations.all().values('id', 'name', 'code', 'status', 'created_at')
        )
        staff = list(
            User.objects.filter(role__in=['operator', 'photographer'], subscription=sub).values(
                'id', 'username', 'email', 'role', 'is_active', 'created_at'
            )
        )
        return _json_success({
            'subscription': {
                'id': sub.id,
                'name': sub.name,
                'slug': sub.slug,
                'tier': sub.tier,
                'tier_display': sub.get_tier_display(),
                'status': sub.status,
                'license_key': sub.license_key or sub.generate_license_key(),
                'license_status': sub.license_status,
                'license_issued_at': sub.license_issued_at.isoformat() if sub.license_issued_at else None,
                'is_license_valid': sub.is_license_valid,
                'storage_folder': sub.storage_folder,
                'max_super_admins': sub.max_super_admins,
                'max_organisations': sub.max_organisations,
                'max_cards': sub.max_cards,
                'effective_card_limit': sub.effective_card_limit,
                'custom_domain': sub.custom_domain,
                'custom_subdomain': sub.custom_subdomain,
                'brand_name': sub.brand_name,
                'brand_logo_url': sub.brand_logo_url,
                'panel_color_theme': sub.panel_color_theme,
                'panel_accent_theme': sub.panel_accent_theme,
                'website_template': sub.website_template,
                'auto_print_active': sub.auto_print_active,
                'auto_print_credits': sub.auto_print_credits,
                'auto_type_active': sub.auto_type_active,
                'auto_type_credits': sub.auto_type_credits,
                'auto_edit_active': sub.auto_edit_active,
                'auto_edit_credits': sub.auto_edit_credits,
                'billing_plan': sub.billing_plan,
                'installments_paid': sub.installments_paid,
                'installments_total': sub.installments_total,
                'landing_config': sub.landing_config,
                'mobile_app_config': sub.mobile_app_config,
                'renews_at': sub.renews_at.isoformat() if sub.renews_at else None,
                'notes': sub.notes,
                'created_at': sub.created_at.isoformat(),
                'super_admins': super_admins,
                'organisations': organisations,
                'staff': staff,
                'telemetry': telemetry,
            }
        })

    elif request.method in ('PUT', 'PATCH'):
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        if 'name' in body and body['name']:
            sub.name = str(body['name']).strip()
        if 'tier' in body and body['tier'] in ('lite', 'pro', 'max'):
            sub.tier = body['tier']
        if 'status' in body and body['status'] in ('active', 'trial', 'past_due', 'cancelled'):
            sub.status = body['status']
        if 'custom_domain' in body:
            sub.custom_domain = body['custom_domain'] or None
        if 'custom_subdomain' in body:
            sub.custom_subdomain = body['custom_subdomain'] or None
        if 'max_organisations' in body:
            sub.max_organisations = int(body['max_organisations'])
        if 'max_cards' in body:
            sub.max_cards = int(body['max_cards'])
        if 'renews_at' in body:
            sub.renews_at = body['renews_at'] or None
        if 'notes' in body:
            sub.notes = body['notes']

        # Branding & Theme fields
        if 'brand_name' in body and body['brand_name']:
            sub.brand_name = str(body['brand_name']).strip()
        if 'brand_logo_url' in body:
            sub.brand_logo_url = str(body['brand_logo_url']).strip()
        if 'panel_color_theme' in body:
            sub.panel_color_theme = str(body['panel_color_theme']).strip()
        if 'panel_accent_theme' in body:
            sub.panel_accent_theme = str(body['panel_accent_theme']).strip()
        if 'website_template' in body:
            sub.website_template = str(body['website_template']).strip()

        # Add-on Feature Toggles & Credits
        if 'auto_print_active' in body:
            sub.auto_print_active = bool(body['auto_print_active'])
        if 'auto_print_credits' in body:
            sub.auto_print_credits = int(body['auto_print_credits'])
        if 'auto_type_active' in body:
            sub.auto_type_active = bool(body['auto_type_active'])
        if 'auto_type_credits' in body:
            sub.auto_type_credits = int(body['auto_type_credits'])
        if 'auto_edit_active' in body:
            sub.auto_edit_active = bool(body['auto_edit_active'])
        if 'auto_edit_credits' in body:
            sub.auto_edit_credits = int(body['auto_edit_credits'])

        # Billing Plan & Installments
        if 'billing_plan' in body and body['billing_plan'] in ('split', 'one_time'):
            sub.billing_plan = body['billing_plan']
        if 'installments_paid' in body:
            sub.installments_paid = int(body['installments_paid'])
        if 'installments_total' in body:
            sub.installments_total = int(body['installments_total'])

        if 'landing_config' in body and isinstance(body['landing_config'], dict):
            cfg = dict(sub.landing_config or {})
            cfg.update(body['landing_config'])
            sub.landing_config = cfg
        if 'mobile_app_config' in body and isinstance(body['mobile_app_config'], dict):
            cfg = dict(sub.mobile_app_config or {})
            cfg.update(body['mobile_app_config'])
            sub.mobile_app_config = cfg

        sub.save()

        # Optional: Record payment directly if requested during tier change or manual payment settlement
        if 'record_payment' in body and isinstance(body['record_payment'], dict):
            pay_body = body['record_payment']
            amount = float(pay_body.get('amount') or 0)
            if amount > 0:
                SaaSPayment.objects.create(
                    subscription=sub,
                    amount=amount,
                    method=pay_body.get('method', 'bank_transfer'),
                    reference_number=pay_body.get('reference_number', f"SET-{int(timezone.now().timestamp())}"),
                    notes=pay_body.get('notes', f"Payment recorded for {sub.name} (Tier: {sub.get_tier_display()})"),
                    verified_by=request.user,
                    is_verified=bool(pay_body.get('is_verified', True)),
                    verified_at=timezone.now() if pay_body.get('is_verified', True) else None,
                )

        return _json_success({'message': f"Subscription '{sub.name}' updated successfully."})

    elif request.method == 'DELETE':
        # Only Prime Admin can delete a subscription
        if not PermissionService.is_prime_admin(request.user):
            return _json_error('Only Prime Admin can permanently delete subscriptions.', status=403)
        sub_name = sub.name
        sub.delete()
        return _json_success({'message': f"Subscription '{sub_name}' has been deleted."})


# =============================================================================
# 3. TENANT SUPER ADMINS (MAX 3 QUOTA PER SUBSCRIPTION)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_subscription_super_admins(request, sub_id):
    """
    GET: List Super Admins for this tenant (max 3).
    POST: Create a Super Admin account for this tenant. Enforces max 3 limit.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev', 'helper'])
    if not ok:
        return err_resp

    try:
        sub = SaaSSubscription.objects.get(pk=sub_id)
    except SaaSSubscription.DoesNotExist:
        return _json_error('Subscription not found.', status=404)

    if request.method == 'GET':
        admins = User.objects.filter(role='super_admin', subscription=sub).values(
            'id', 'username', 'email', 'phone', 'is_active', 'created_at'
        )
        return _json_success({
            'subscription_id': sub.id,
            'super_admins': list(admins),
            'count': len(admins),
            'max_allowed': sub.max_super_admins,
        })

    elif request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        username = str(body.get('username', '')).strip()
        email = str(body.get('email', '')).strip()
        password = str(body.get('password', '')).strip()
        phone = str(body.get('phone', '')).strip()

        if not username or not password:
            return _json_error('Username and password are required.')
        if not email:
            email = f"{username}@{sub.slug}.cardflow.io"

        if User.objects.filter(username=username).exists():
            return _json_error(f"Username '{username}' already exists.")
        if User.objects.filter(email=email).exists():
            return _json_error(f"Email '{email}' is already registered.")

        # Check max 3 super admins quota
        current_count = User.objects.filter(role='super_admin', subscription=sub).count()
        if current_count >= sub.max_super_admins:
            return _json_error(f"Maximum {sub.max_super_admins} Super Admin accounts reached for this subscription.")

        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                role='super_admin',
                subscription=sub,
                phone=phone,
            )
        except ValidationError as e:
            return _json_error(str(e))

        return _json_success({
            'message': f"Super Admin '{user.username}' created successfully for {sub.name}.",
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'subscription_id': sub.id,
            }
        }, status=201)


# =============================================================================
# 4. SUPPORT IMPERSONATION ("ENTER ACCOUNT")
# =============================================================================

@csrf_exempt
@require_http_methods(['POST'])
def api_saas_enter_account(request, sub_id):
    """
    Allows Prime Admin or Helper Operator to enter a client's Super Admin account
    to assist with configuration or support requests.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['helper'])
    if not ok:
        return err_resp

    try:
        sub = SaaSSubscription.objects.get(pk=sub_id)
    except SaaSSubscription.DoesNotExist:
        return _json_error('Subscription not found.', status=404)

    target_admin = User.objects.filter(subscription=sub, is_active=True).filter(
        Q(role='super_admin') | Q(role='pro_user') | Q(is_superuser=True)
    ).first()
    if not target_admin:
        return _json_error('No active Super Admin account found for this subscription to enter.', status=404)

    result = ImpersonateService.start(request, target_admin.id)
    if not result.get('success'):
        return _json_error(result.get('message', 'Failed to enter account.'))

    admin_display_name = target_admin.get_full_name() or target_admin.username
    return _json_success({
        'message': f"Impersonation Active: Entered {sub.name} as {admin_display_name}.",
        'redirect_url': result.get('redirect_url', '/'),
        'target_user': {
            'id': target_admin.id,
            'username': target_admin.username,
            'role': target_admin.role,
            'name': admin_display_name,
            'full_name': admin_display_name,
            'subscription_name': sub.name,
            'subscription_tier': sub.tier,
        }
    })


# =============================================================================
# 5. PAYMENTS & BILLING LEDGER (MANUAL VERIFICATION WORKFLOW)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_payments(request):
    """
    GET: List all payments in the billing ledger.
         Prime Admin/Sales sees all payments. Super Admins see only their subscription's payments.
    POST: Record a new payment manually (Prime Admin / Sales).
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    is_prime = PermissionService.is_prime_admin(request.user) or PermissionService.is_prime_operator(request.user)

    if request.method == 'GET':
        sub_id = request.GET.get('subscription_id')
        status_filter = request.GET.get('status')
        payments = SaaSPayment.objects.select_related('subscription', 'verified_by').all()

        if is_prime:
            if sub_id:
                payments = payments.filter(subscription_id=sub_id)
        else:
            sub = getattr(request.user, 'subscription', None)
            if not sub:
                return _json_error('No subscription associated with account.', status=403)
            payments = payments.filter(subscription=sub)

        if status_filter:
            payments = payments.filter(status=status_filter)

        data = []
        for p in payments:
            data.append({
                'id': p.id,
                'subscription_id': p.subscription_id,
                'subscription_name': p.subscription.name,
                'amount': float(p.amount),
                'currency': p.currency,
                'payment_date': p.payment_date.isoformat(),
                'status': p.status,
                'status_display': p.get_status_display(),
                'invoice_number': p.invoice_number,
                'payment_method': p.payment_method,
                'payment_method_display': p.get_payment_method_display(),
                'payment_plan_type': p.payment_plan_type,
                'payment_plan_type_display': p.get_payment_plan_type_display(),
                'utr_number': p.utr_number,
                'screenshot_url': p.screenshot_url,
                'verified_by': p.verified_by.username if p.verified_by else None,
                'verified_at': p.verified_at.isoformat() if p.verified_at else None,
                'rejection_reason': p.rejection_reason,
                'notes': p.notes,
                'created_at': p.created_at.isoformat(),
            })

        return _json_success({'payments': data})

    elif request.method == 'POST':
        ok, err_resp = _check_prime_access(request, allowed_subroles=['sales'])
        if not ok:
            return err_resp

        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        sub_id = body.get('subscription_id')
        amount = body.get('amount')
        if not sub_id or amount is None:
            return _json_error('subscription_id and amount are required.')

        try:
            sub = SaaSSubscription.objects.get(pk=sub_id)
        except SaaSSubscription.DoesNotExist:
            return _json_error('Subscription not found.', status=404)

        plan_type = body.get('payment_plan_type', 'one_time_annual')
        status = body.get('status', 'completed')

        payment = SaaSPayment(
            subscription=sub,
            amount=Decimal(str(amount)),
            currency=body.get('currency', 'INR'),
            payment_date=body.get('payment_date') or timezone.now().date(),
            status=status,
            invoice_number=body.get('invoice_number', ''),
            payment_method=body.get('payment_method', 'upi'),
            payment_plan_type=plan_type,
            utr_number=body.get('utr_number', ''),
            screenshot_url=body.get('screenshot_url', ''),
            notes=body.get('notes', ''),
        )
        if status == 'completed':
            payment.verified_by = request.user
            payment.verified_at = timezone.now()
        payment.save()

        if status == 'completed':
            SaaSBillingService.verify_payment(payment, verified_by=request.user, action='approve')

        return _json_success({
            'message': f"Payment of ₹{payment.amount} recorded for {sub.name}.",
            'payment_id': payment.id,
            'invoice_number': payment.invoice_number,
        }, status=201)


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_submit_payment(request):
    """
    POST /api/saas/payments/submit/
    Client Super Admin (or Prime Admin) submits a manual payment
    with UTR reference and screenshot proof.
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _json_error('Invalid JSON payload.')

    sub = _resolve_request_subscription(request, body)
    if not sub:
        return _json_error('No SaaS subscription found for this user.', status=404)

    amount = body.get('amount')
    if amount is None or float(amount) <= 0:
        return _json_error('Valid payment amount is required.')

    plan_type = body.get('payment_plan_type', 'one_time_annual')
    payment_method = body.get('payment_method', 'upi')
    utr_number = str(body.get('utr_number', '')).strip()
    screenshot_url = str(body.get('screenshot_url', '')).strip()
    notes = str(body.get('notes', '')).strip()

    if not utr_number:
        return _json_error('UTR number or bank transaction reference is required for verification.')

    payment = SaaSBillingService.submit_manual_payment(
        subscription=sub,
        amount=Decimal(str(amount)),
        payment_method=payment_method,
        payment_plan_type=plan_type,
        utr_number=utr_number,
        screenshot_url=screenshot_url,
        notes=notes,
    )

    return _json_success({
        'message': f"Payment of ₹{payment.amount:,.2f} submitted successfully! Awaiting verification.",
        'payment_id': payment.id,
        'invoice_number': payment.invoice_number,
        'status': payment.status,
    }, status=201)


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_verify_payment(request, payment_id):
    """
    POST /api/saas/payments/<payment_id>/verify/
    Prime Admin or Sales/Dev Operator verifies and approves or rejects a manual payment.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev'])
    if not ok:
        return err_resp

    try:
        payment = SaaSPayment.objects.get(pk=payment_id)
    except SaaSPayment.DoesNotExist:
        return _json_error('Payment record not found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = {}

    action = body.get('action', 'approve').lower()
    rejection_reason = body.get('rejection_reason', '')

    success, message = SaaSBillingService.verify_payment(
        payment=payment,
        verified_by=request.user,
        action=action,
        rejection_reason=rejection_reason,
    )

    if not success:
        return _json_error(message)

    # Log payment verification event to central SaaSPlatformLog
    try:
        SaaSPlatformLog.objects.create(
            subscription=payment.subscription,
            actor=request.user,
            actor_name_snapshot=request.user.username,
            actor_role_snapshot=request.user.role,
            category='billing',
            level='info' if action == 'approve' else 'warning',
            action=f"PAYMENT_{action.upper()}D",
            title=f"Payment #{payment.invoice_number} ({payment.currency} {payment.amount}) {action}d",
            description=f"Manual payment for {payment.subscription.name} {action}d by {request.user.username}. UTR: {payment.utr_number or 'N/A'}. Reason: {rejection_reason or 'Approved direct ledger update'}",
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={
                'payment_id': payment.id,
                'invoice_number': payment.invoice_number,
                'amount': float(payment.amount),
                'action': action,
                'utr_number': payment.utr_number,
            }
        )
    except Exception as e:
        logger.warning(f"Failed to write SaaSPlatformLog for payment #{payment.id}: {e}")

    return _json_success({
        'message': message,
        'payment_id': payment.id,
        'status': payment.status,
        'subscription_status': payment.subscription.status,
    })


# =============================================================================
# 6. LEADS & CRM PIPELINE (FOR SALES OPERATOR & PRIME ADMIN)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_leads(request):
    """
    GET: List leads in CRM pipeline.
    POST: Create a new lead.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales'])
    if not ok:
        return err_resp

    if request.method == 'GET':
        pipeline_status = request.GET.get('status')
        tier = request.GET.get('tier')
        leads = SaaSLead.objects.all()
        if pipeline_status:
            leads = leads.filter(pipeline_status=pipeline_status)
        if tier:
            leads = leads.filter(tier_interested=tier)

        data = []
        for l in leads:
            data.append({
                'id': l.id,
                'name': l.name,
                'company_name': l.company_name,
                'email': l.email,
                'phone': l.phone,
                'tier_interested': l.tier_interested,
                'pipeline_status': l.pipeline_status,
                'pipeline_status_display': l.get_pipeline_status_display(),
                'estimated_value': float(l.estimated_value) if l.estimated_value else None,
                'notes': l.notes,
                'created_at': l.created_at.isoformat(),
            })

        return _json_success({'leads': data})

    elif request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        name = str(body.get('name', '')).strip()
        company = str(body.get('company_name', '')).strip()
        email = str(body.get('email', '')).strip()

        if not name or not company or not email:
            return _json_error('Name, company_name, and email are required.')

        lead = SaaSLead(
            name=name,
            company_name=company,
            email=email,
            phone=body.get('phone', ''),
            tier_interested=body.get('tier_interested', 'pro'),
            pipeline_status=body.get('pipeline_status', 'new'),
            estimated_value=Decimal(str(body['estimated_value'])) if body.get('estimated_value') else None,
            notes=body.get('notes', ''),
        )
        lead.save()

        return _json_success({
            'message': f"Lead for '{lead.name}' ({lead.company_name}) added to pipeline.",
            'lead_id': lead.id,
        }, status=201)


@csrf_exempt
@require_http_methods(['PUT', 'PATCH', 'DELETE'])
def api_saas_lead_detail(request, lead_id):
    """Update or delete a sales lead."""
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales'])
    if not ok:
        return err_resp

    try:
        lead = SaaSLead.objects.get(pk=lead_id)
    except SaaSLead.DoesNotExist:
        return _json_error('Lead not found.', status=404)

    if request.method in ('PUT', 'PATCH'):
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        if 'pipeline_status' in body:
            lead.pipeline_status = body['pipeline_status']
        if 'tier_interested' in body:
            lead.tier_interested = body['tier_interested']
        if 'estimated_value' in body:
            lead.estimated_value = Decimal(str(body['estimated_value'])) if body['estimated_value'] is not None else None
        if 'notes' in body:
            lead.notes = body['notes']
        if 'name' in body:
            lead.name = body['name']
        if 'company_name' in body:
            lead.company_name = body['company_name']
        if 'phone' in body:
            lead.phone = body['phone']

        lead.save()
        return _json_success({'message': 'Lead updated successfully.'})

    elif request.method == 'DELETE':
        lead.delete()
        return _json_success({'message': 'Lead deleted.'})


# =============================================================================
# 7. PRIME OPERATORS MANAGEMENT (SALES, DEV, HELPER)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_prime_operators(request):
    """
    GET: List Prime Operators with their sub-roles.
    POST: Create a new Prime Operator staff member.
    """
    # Only Prime Admin can manage Prime Operators
    if not PermissionService.is_prime_admin(request.user):
        return _json_error('Only Prime Admin can manage Prime Operators.', status=403)

    if request.method == 'GET':
        operators = User.objects.filter(role='prime_operator').order_by('-created_at')
        data = []
        for op in operators:
            eff_perms = op.get_effective_operator_permissions() if hasattr(op, 'get_effective_operator_permissions') else {}
            data.append({
                'id': op.id,
                'username': op.username,
                'email': op.email,
                'phone': op.phone,
                'prime_operator_role': op.prime_operator_role,
                'is_active': op.is_active,
                'operator_permissions': op.operator_permissions or {},
                'effective_permissions': eff_perms,
                'created_at': op.created_at.isoformat() if op.created_at else None,
            })
        return _json_success({'prime_operators': data})

    elif request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        username = str(body.get('username', '')).strip()
        email = str(body.get('email', '')).strip()
        password = str(body.get('password', '')).strip()
        sub_role = str(body.get('prime_operator_role', 'helper')).lower()

        if sub_role not in ('sales', 'dev', 'helper'):
            return _json_error("prime_operator_role must be 'sales', 'dev', or 'helper'.")

        if not username or not password:
            return _json_error('Username and password are required.')
        if not email:
            email = f"{username}@staff.cardflow.io"

        if User.objects.filter(username=username).exists():
            return _json_error(f"Username '{username}' already exists.")
        if User.objects.filter(email=email).exists():
            return _json_error(f"Email '{email}' is already registered.")

        custom_perms = body.get('operator_permissions') or {}
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role='prime_operator',
            prime_operator_role=sub_role,
            phone=body.get('phone', ''),
            operator_permissions=custom_perms if isinstance(custom_perms, dict) else {},
        )

        return _json_success({
            'message': f"Prime Operator '{user.username}' ({sub_role.upper()}) created successfully.",
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role,
                'prime_operator_role': user.prime_operator_role,
                'operator_permissions': user.operator_permissions,
                'effective_permissions': user.get_effective_operator_permissions(),
            }
        }, status=201)


@csrf_exempt
@require_http_methods(['PUT', 'PATCH', 'DELETE'])
def api_saas_prime_operator_detail(request, operator_id):
    """Update or remove a Prime Operator."""
    if not PermissionService.is_prime_admin(request.user):
        return _json_error('Only Prime Admin can modify Prime Operators.', status=403)

    try:
        operator = User.objects.get(pk=operator_id, role='prime_operator')
    except User.DoesNotExist:
        return _json_error('Prime Operator not found.', status=404)

    if request.method in ('PUT', 'PATCH'):
        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        if 'prime_operator_role' in body and body['prime_operator_role'] in ('sales', 'dev', 'helper'):
            operator.prime_operator_role = body['prime_operator_role']
        if 'phone' in body:
            operator.phone = body['phone']
        if 'is_active' in body:
            operator.is_active = bool(body['is_active'])
        if 'password' in body and body['password']:
            operator.set_password(body['password'])
        if 'operator_permissions' in body and isinstance(body['operator_permissions'], dict):
            perms = dict(operator.operator_permissions or {})
            perms.update(body['operator_permissions'])
            operator.operator_permissions = perms

        operator.save()
        eff_perms = operator.get_effective_operator_permissions() if hasattr(operator, 'get_effective_operator_permissions') else {}
        return _json_success({
            'message': f"Prime Operator '{operator.username}' updated.",
            'operator_permissions': operator.operator_permissions,
            'effective_permissions': eff_perms,
        })

    elif request.method == 'DELETE':
        op_name = operator.username
        operator.delete()
        return _json_success({'message': f"Prime Operator '{op_name}' removed."})


# =============================================================================
# 8. TIER FEATURE MATRIX (LITE, PRO, MAX)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_saas_tier_features(request):
    """
    GET: Retrieve the feature matrices and quotas for Lite, Pro, and Max.
    POST: Update feature toggles or limits for a tier.
    """
    if request.method == 'GET':
        matrix = {
            'lite': SaaSFeatureService.get_matrix_for_tier('lite'),
            'pro': SaaSFeatureService.get_matrix_for_tier('pro'),
            'max': SaaSFeatureService.get_matrix_for_tier('max'),
        }
        return _json_success({'matrix': matrix})

    elif request.method == 'POST':
        # Only Prime Admin can modify the tier feature matrix
        if not PermissionService.is_prime_admin(request.user):
            return _json_error('Only Prime Admin can modify Tier Feature Matrices.', status=403)

        try:
            body = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _json_error('Invalid JSON payload.')

        tier = str(body.get('tier', '')).lower()
        if tier not in ('lite', 'pro', 'max'):
            return _json_error("tier must be 'lite', 'pro', or 'max'.")

        tier_names = {'lite': 'CardFlow Starter', 'pro': 'CardFlow Professional', 'max': 'CardFlow Enterprise'}
        tier_obj, _ = SaaSTierFeature.objects.get_or_create(
            tier=tier,
            defaults={
                'display_name': tier_names.get(tier, f"CardFlow {tier.capitalize()}"),
                'price_monthly': Decimal('499.00'),
            }
        )

        if 'display_name' in body:
            tier_obj.display_name = str(body['display_name'])
        if 'price_monthly' in body:
            tier_obj.price_monthly = Decimal(str(body['price_monthly']))
        if 'features' in body and isinstance(body['features'], dict):
            curr_feats = dict(tier_obj.features or {})
            curr_feats.update(body['features'])
            tier_obj.features = curr_feats
        if 'limits' in body and isinstance(body['limits'], dict):
            curr_lims = dict(tier_obj.limits or {})
            curr_lims.update(body['limits'])
            tier_obj.limits = curr_lims

        tier_obj.save()
        return _json_success({'message': f"Feature Matrix for {tier.upper()} updated successfully."})


# =============================================================================
# 9. PUBLIC LANDING PAGE API FOR TENANT CLIENTS
# =============================================================================

@require_http_methods(['GET'])
def api_saas_public_landing(request, slug_or_domain):
    """
    Public API returning the branding & landing page config for a tenant client.
    Can be looked up by slug or custom domain.
    """
    sub = (
        SaaSSubscription.objects.filter(slug=slug_or_domain).first()
        or SaaSSubscription.objects.filter(custom_domain=slug_or_domain).first()
        or SaaSSubscription.objects.filter(custom_subdomain=slug_or_domain).first()
    )
    if not sub:
        return _json_error('Landing page not found.', status=404)

    return _json_success({
        'name': sub.name,
        'slug': sub.slug,
        'tier': sub.tier,
        'landing_config': sub.landing_config,
        'mobile_app_config': sub.mobile_app_config,
    })


# =============================================================================
# 10. SUBSCRIPTION QUOTA, EXTRA CARDS TOP-UP & ADD-ON APIS
# =============================================================================


@csrf_exempt
@require_http_methods(['GET'])
def api_saas_subscription_quota(request):
    """
    GET: Retrieve quota details, usage meters, low-balance warnings,
    and add-on statuses for the current user's subscription.
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    sub = _resolve_request_subscription(request)
    if not sub:
        return _json_error('No SaaS subscription found for this user.', status=404)

    quota = SaaSQuotaService.get_subscription_quota_details(sub)
    return _json_success({'quota': quota})


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_request_extra_cards(request):
    """
    POST: Super Admin request for extra card quota.
    Allowed quantities: 1000, 5000, 10000.
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    sub = _resolve_request_subscription(request)
    if not sub:
        return _json_error('No SaaS subscription found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _json_error('Invalid JSON payload.')

    qty = int(body.get('quantity', 0))
    if qty not in (5000, 10000, 25000, 50000, 1000):
        return _json_error('Invalid quantity. Allowed packs are 5,000, 10,000, 25,000, or 50,000 extra cards.')

    price = Decimal(str(SaaSAddonService.CARD_TOPUP_PRICING.get(qty, 49.00)))
    notes = str(body.get('notes', '')).strip()

    req = SaaSCardTopupRequest.objects.create(
        subscription=sub,
        requested_by=request.user,
        quantity=qty,
        amount=price,
        notes=notes,
        status='pending',
    )

    return _json_success({
        'message': f'Request for {qty:,} extra cards submitted successfully. Pending approval.',
        'request_id': req.id,
        'quantity': qty,
        'amount': float(price),
        'status': req.status,
    }, status=201)


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_request_addon(request):
    """
    POST: Super Admin request for paid Add-ons (Auto Print, Auto Type, Auto Edit).
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    sub = _resolve_request_subscription(request)
    if not sub:
        return _json_error('No SaaS subscription found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _json_error('Invalid JSON payload.')

    addon_type = str(body.get('addon_type', '')).lower()
    if addon_type not in ('auto_print', 'auto_type', 'auto_edit'):
        return _json_error("Invalid addon_type. Allowed: 'auto_print', 'auto_type', 'auto_edit'.")

    req_type = str(body.get('request_type', 'annual_access')).lower()
    if req_type not in ('annual_access', 'usage_pack', 'bundle'):
        req_type = 'annual_access'

    pricing_info = SaaSAddonService.PRICING.get(addon_type, {})
    if req_type == 'annual_access':
        price = Decimal(str(pricing_info.get('access_fee', 999.00)))
        credits_to_add = 0
    elif req_type == 'usage_pack':
        price = Decimal(str(pricing_info.get('usage_pack_price', 499.00)))
        credits_to_add = 10000
    else:  # bundle
        price = Decimal(str(pricing_info.get('access_fee', 999.00) + pricing_info.get('usage_pack_price', 499.00)))
        credits_to_add = 10000

    req = SaaSAddonRequest.objects.create(
        subscription=sub,
        requested_by=request.user,
        addon_type=addon_type,
        request_type=req_type,
        amount=price,
        credits_to_add=credits_to_add,
        status='pending',
    )

    return _json_success({
        'message': f"Request for {req.get_addon_type_display()} ({req.get_request_type_display()}) submitted successfully.",
        'request_id': req.id,
        'amount': float(price),
        'status': req.status,
    }, status=201)


@csrf_exempt
@require_http_methods(['GET'])
def api_saas_card_topups_list(request):
    """
    GET: List extra card top-up requests.
    Prime Admin sees all; Super Admin sees only their subscription's requests.
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    if PermissionService.is_prime_admin(request.user) or PermissionService.is_prime_operator(request.user):
        qs = SaaSCardTopupRequest.objects.all()
        sub_id = request.GET.get('subscription_id')
        if sub_id:
            qs = qs.filter(subscription_id=sub_id)
    else:
        sub = _resolve_request_subscription(request)
        if not sub:
            return _json_error('No subscription associated with user.', status=403)
        qs = SaaSCardTopupRequest.objects.filter(subscription=sub)

    status_filter = request.GET.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    data = [
        {
            'id': t.id,
            'subscription_id': t.subscription_id,
            'subscription_name': t.subscription.name,
            'requested_by': t.requested_by.username if t.requested_by else 'Admin',
            'quantity': t.quantity,
            'amount': float(t.amount),
            'status': t.status,
            'notes': t.notes,
            'created_at': t.created_at.isoformat(),
            'approved_at': t.approved_at.isoformat() if t.approved_at else None,
        }
        for t in qs
    ]
    return _json_success({'topups': data})


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_approve_topup(request, topup_id):
    """
    POST: Approve an extra card top-up request (Prime Admin / Sales / Dev).
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev'])
    if not ok:
        return err_resp

    try:
        topup = SaaSCardTopupRequest.objects.get(pk=topup_id)
    except SaaSCardTopupRequest.DoesNotExist:
        return _json_error('Top-up request not found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = {}

    action = body.get('action', 'approve')
    if action == 'reject':
        topup.status = 'rejected'
        topup.save(update_fields=['status'])
        return _json_success({'message': f"Top-up request #{topup.id} rejected."})

    topup.approve()
    return _json_success({
        'message': f"Approved {topup.quantity:,} extra cards for {topup.subscription.name}. Effective limit is now {topup.subscription.effective_card_limit:,} cards.",
        'new_effective_limit': topup.subscription.effective_card_limit,
    })


@csrf_exempt
@require_http_methods(['GET'])
def api_saas_addon_requests_list(request):
    """
    GET: List add-on activation and usage requests.
    """
    if not request.user or not request.user.is_authenticated:
        return _json_error('Authentication required.', status=401)

    if PermissionService.is_prime_admin(request.user) or PermissionService.is_prime_operator(request.user):
        qs = SaaSAddonRequest.objects.all()
        sub_id = request.GET.get('subscription_id')
        if sub_id:
            qs = qs.filter(subscription_id=sub_id)
    else:
        sub = _resolve_request_subscription(request)
        if not sub:
            return _json_error('No subscription associated with user.', status=403)
        qs = SaaSAddonRequest.objects.filter(subscription=sub)

    status_filter = request.GET.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    data = [
        {
            'id': a.id,
            'subscription_id': a.subscription_id,
            'subscription_name': a.subscription.name,
            'requested_by': a.requested_by.username if a.requested_by else 'Admin',
            'addon_type': a.addon_type,
            'addon_name': a.get_addon_type_display(),
            'request_type': a.request_type,
            'request_type_display': a.get_request_type_display(),
            'amount': float(a.amount),
            'credits_to_add': a.credits_to_add,
            'status': a.status,
            'created_at': a.created_at.isoformat(),
            'approved_at': a.approved_at.isoformat() if a.approved_at else None,
        }
        for a in qs
    ]
    return _json_success({'addon_requests': data})


@csrf_exempt
@require_http_methods(['POST'])
def api_saas_approve_addon(request, req_id):
    """
    POST: Approve an Add-on activation / usage pack request (Prime Admin / Sales / Dev).
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev'])
    if not ok:
        return err_resp

    try:
        addon_req = SaaSAddonRequest.objects.get(pk=req_id)
    except SaaSAddonRequest.DoesNotExist:
        return _json_error('Add-on request not found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = {}

    action = body.get('action', 'approve')
    if action == 'reject':
        addon_req.status = 'rejected'
        addon_req.save(update_fields=['status'])
        return _json_success({'message': f"Add-on request #{addon_req.id} rejected."})

    addon_req.approve()
    return _json_success({
        'message': f"Approved {addon_req.get_addon_type_display()} for {addon_req.subscription.name}.",
        'addon_type': addon_req.addon_type,
    })


@csrf_exempt
@require_http_methods(['POST', 'PATCH'])
def api_saas_update_tenant_branding(request, sub_id):
    """
    POST/PATCH: Configure white-label branding, domain, and colors for Pro and Max tiers.
    Allowed only by Prime Admin or Dev operator.
    Lite tier does not allow custom domain, custom app, or brand renaming.
    Brand name can only be changed once.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['dev'])
    if not ok:
        return err_resp

    try:
        sub = SaaSSubscription.objects.get(pk=sub_id)
    except SaaSSubscription.DoesNotExist:
        return _json_error('Subscription not found.', status=404)

    try:
        body = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _json_error('Invalid JSON payload.')

    # Lite Tier Restriction Check
    if sub.tier == 'lite':
        if body.get('brand_name') or body.get('custom_domain') or body.get('mobile_app_config'):
            return _json_error('White-label branding, custom domain, and custom mobile apps are not available in CardFlow Lite. Please upgrade to Pro or Max.')

    # System brand name renaming (can only be done once)
    new_brand_name = body.get('brand_name')
    if new_brand_name and new_brand_name != sub.brand_name:
        if sub.brand_name_customized:
            return _json_error('Brand name has already been customized for this subscription. It can only be changed once.')
        sub.brand_name = str(new_brand_name).strip()
        sub.brand_name_customized = True

    if 'brand_logo_url' in body:
        sub.brand_logo_url = str(body['brand_logo_url']).strip()
    if 'panel_color_theme' in body:
        sub.panel_color_theme = str(body['panel_color_theme']).strip()
    if 'panel_accent_theme' in body:
        sub.panel_accent_theme = str(body['panel_accent_theme']).strip()
    if 'website_template' in body and sub.tier in ('pro', 'max'):
        tpl = body['website_template']
        # Lite: none, Pro: modern_minimal only, Max: all templates
        if sub.tier == 'pro' and tpl != 'modern_minimal':
            return _json_error('CardFlow Pro includes 1 customizable template (Modern Minimal). Upgrade to Max for multiple templates.')
        sub.website_template = tpl

    if 'custom_domain' in body and sub.tier in ('pro', 'max'):
        domain = body['custom_domain']
        sub.custom_domain = str(domain).strip().lower() if domain else None

    sub.save()
    return _json_success({
        'message': f"Branding and customization for '{sub.name}' updated successfully.",
        'brand_name': sub.brand_name,
        'brand_logo_url': sub.brand_logo_url,
        'panel_color_theme': sub.panel_color_theme,
        'website_template': sub.website_template,
        'custom_domain': sub.custom_domain,
    })


# =============================================================================
# 11. ENTERPRISE LICENSE ENGINE & AUDIT TELEMETRY LOGS
# =============================================================================

@csrf_exempt
@require_http_methods(['POST'])
def api_saas_regenerate_license(request, sub_id):
    """
    POST: Reissues a new cryptographically generated license key for a subscription.
    Allowed for Prime Admin and Dev Operator.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['dev'])
    if not ok:
        return err_resp

    try:
        sub = SaaSSubscription.objects.get(pk=sub_id)
    except SaaSSubscription.DoesNotExist:
        return _json_error('Subscription not found.', status=404)

    old_key = sub.license_key
    new_key = sub.generate_license_key(force=True)
    sub.save(update_fields=['license_key', 'license_issued_at', 'license_status', 'updated_at'])

    # Audit log
    try:
        SaaSPlatformLog.objects.create(
            subscription=sub,
            actor=request.user,
            actor_name_snapshot=request.user.username,
            actor_role_snapshot=request.user.role,
            category='license',
            level='warning',
            action='LICENSE_REISSUED',
            title=f"License key reissued for {sub.name}",
            description=f"Previous key: {old_key or 'None'} -> New key: {new_key}",
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'old_key': old_key, 'new_key': new_key, 'tier': sub.tier}
        )
    except Exception as e:
        logger.warning(f"Failed to write SaaSPlatformLog for license reissue: {e}")

    return _json_success({
        'message': f"Enterprise license key for '{sub.name}' successfully reissued.",
        'license_key': new_key,
        'license_status': sub.license_status,
        'license_issued_at': sub.license_issued_at.isoformat(),
        'is_license_valid': sub.is_license_valid,
    })


@csrf_exempt
@require_http_methods(['GET'])
def api_saas_logs(request):
    """
    GET: Retrieve SaaS platform audit & telemetry logs for Prime Admin and Prime Operators.
    Supports filtering by category, level/severity, subscription_id, and free-text search.
    """
    ok, err_resp = _check_prime_access(request, allowed_subroles=['sales', 'dev', 'helper'])
    if not ok:
        return err_resp

    category = request.GET.get('category')
    level = request.GET.get('level')
    sub_id = request.GET.get('subscription_id')
    search = request.GET.get('search', '').strip()
    try:
        limit = min(int(request.GET.get('limit', 100)), 200)
    except Exception:
        limit = 100

    qs = SaaSPlatformLog.objects.select_related('subscription', 'actor').all()

    if category and category != 'all':
        qs = qs.filter(category=category)
    if level and level != 'all':
        qs = qs.filter(level=level)
    if sub_id:
        qs = qs.filter(subscription_id=sub_id)
    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(title__icontains=search) |
            Q(description__icontains=search) |
            Q(action__icontains=search) |
            Q(actor_name_snapshot__icontains=search)
        )

    # Real-time telemetry counts
    total_logs_count = SaaSPlatformLog.objects.count()
    critical_alerts = SaaSPlatformLog.objects.filter(level='critical').count()
    billing_events = SaaSPlatformLog.objects.filter(category='billing').count()
    license_events = SaaSPlatformLog.objects.filter(category='license').count()
    security_events = SaaSPlatformLog.objects.filter(category='security').count()

    logs_data = []
    for log in qs[:limit]:
        logs_data.append({
            'id': log.id,
            'subscription_id': log.subscription_id,
            'subscription_name': log.subscription.name if log.subscription else 'Platform Wide',
            'actor_id': log.actor_id,
            'actor_name': log.actor_name_snapshot or (log.actor.username if log.actor else 'System'),
            'actor_role': log.actor_role_snapshot or (log.actor.role if log.actor else 'system'),
            'category': log.category,
            'category_display': log.get_category_display(),
            'level': log.level,
            'level_display': log.get_level_display(),
            'action': log.action,
            'title': log.title,
            'description': log.description,
            'ip_address': log.ip_address,
            'metadata': log.metadata,
            'created_at': log.created_at.isoformat(),
        })

    # Enrich with recent core ActivityLog entries if platform log count is low
    if len(logs_data) < 15 and (not category or category in ('all', 'security', 'system')) and (not level or level == 'all'):
        from core.models import ActivityLog
        recent_activity = ActivityLog.objects.select_related('user').order_by('-created_at')[:25]
        for act in recent_activity:
            is_sec = 'security' in (act.action or '').lower() or 'alarm' in (act.action or '').lower()
            logs_data.append({
                'id': f"act_{act.id}",
                'subscription_id': None,
                'subscription_name': 'Core Platform',
                'actor_id': act.user_id,
                'actor_name': act.user.username if act.user else 'System',
                'actor_role': getattr(act.user, 'role', 'user') if act.user else 'system',
                'category': 'security' if is_sec else 'system',
                'category_display': 'Security Anomaly & Access' if is_sec else 'System & Engine Telemetry',
                'level': 'critical' if 'alarm' in (act.action or '').lower() else 'info',
                'level_display': 'Critical Security Alert' if 'alarm' in (act.action or '').lower() else 'Info',
                'action': (act.action or 'ACTIVITY').upper(),
                'title': act.description or act.action or 'System Activity',
                'description': f"Target: {act.target_model} #{act.target_id} ({act.target_name})",
                'ip_address': act.ip_address,
                'metadata': {'target_model': act.target_model, 'target_id': act.target_id},
                'created_at': act.created_at.isoformat(),
            })

    return _json_success({
        'logs': logs_data,
        'total_count': total_logs_count,
        'stats': {
            'critical_alerts': critical_alerts,
            'billing_events': billing_events,
            'license_events': license_events,
            'security_events': security_events,
            'total_platform_events': total_logs_count + len(logs_data),
        }
    })

