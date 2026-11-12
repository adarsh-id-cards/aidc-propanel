"""
Prime Admin API endpoints for Super Admin management and Secondary Email configuration.
Enforces:
- Singleton Prime Admin (created via CLI)
- Strict ceiling of max 3 total Super Admins (Prime Admin + 2 Super Admins)
- Revocation of Super Admins (immediate session wipe, blocked from panel login)
- Secondary login email configuration for Prime Admin
"""
import json
import logging
from django.contrib.auth.decorators import login_required
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.contrib.sessions.models import Session

from core.models import User
from accounts.models import UserDeviceSession

logger = logging.getLogger(__name__)

MAX_SUPER_ADMIN_QUOTA = 3


def _require_super_admin(request):
    """Guard ensuring only Super Admins can access these controls."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)
    if not (getattr(user, 'is_superuser', False) or getattr(user, 'role', None) == 'super_admin'):
        return JsonResponse({'success': False, 'message': 'Super Admin access required.'}, status=403)
    return None


def _parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8')) if request.body else {}
    except (TypeError, ValueError, UnicodeDecodeError):
        return None


def _wipe_user_sessions(user_id):
    """Terminate all active device sessions and Django HTTP sessions for a user."""
    try:
        # Delete UserDeviceSession records
        UserDeviceSession.objects.filter(user_id=user_id).delete()
        
        # Invalidate active Django sessions for this user
        for session in Session.objects.filter(expire_date__gt=timezone.now()):
            data = session.get_decoded()
            if str(data.get('_auth_user_id')) == str(user_id):
                session.delete()
    except Exception as exc:
        logger.warning("Failed to fully wipe sessions for user_id=%s: %s", user_id, exc)


@login_required
@require_http_methods(['GET', 'POST'])
def api_prime_admin_super_admins(request):
    """
    GET: List Super Admins with quota metrics (X/3).
    POST: Create a new Super Admin (max 3 total).
    """
    guard = _require_super_admin(request)
    if guard:
        return guard

    if request.method == 'GET':
        super_admins_qs = User.objects.filter(role='super_admin').order_by('-created_at')

        total_admin_count = super_admins_qs.count()
        available_slots = max(0, MAX_SUPER_ADMIN_QUOTA - total_admin_count)

        super_admins_data = []
        for sa in super_admins_qs:
            super_admins_data.append({
                'id': sa.id,
                'username': sa.username,
                'email': sa.email,
                'first_name': sa.first_name,
                'last_name': sa.last_name,
                'role': 'super_admin',
                'role_display': 'Super Admin',
                'is_active': sa.is_active,
                'is_revoked': bool(getattr(sa, 'is_revoked', False)),
                'revoked_at': sa.revoked_at.strftime('%Y-%m-%d %H:%M') if getattr(sa, 'revoked_at', None) else None,
                'created_at': sa.created_at.strftime('%Y-%m-%d %H:%M') if sa.created_at else '',
                'last_login': sa.last_login.strftime('%Y-%m-%d %H:%M') if sa.last_login else 'Never',
            })

        return JsonResponse({
            'success': True,
            'quota': {
                'total_allowed': MAX_SUPER_ADMIN_QUOTA,
                'prime_admin_count': 0,
                'super_admin_count': total_admin_count,
                'used': total_admin_count,
                'available': available_slots,
                'counter_display': f"{total_admin_count}/{MAX_SUPER_ADMIN_QUOTA}",
                'can_create': available_slots > 0,
            },
            'prime_admin': None,
            'super_admins': super_admins_data,
        })

    # POST: Create Super Admin
    body = _parse_json(request)
    if body is None:
        return JsonResponse({'success': False, 'message': 'Invalid JSON data.'}, status=400)

    # Quota check
    current_count = User.objects.filter(role='super_admin').count()
    if current_count >= MAX_SUPER_ADMIN_QUOTA:
        return JsonResponse({
            'success': False,
            'message': f'Cannot create Super Admin: quota limit reached ({current_count}/{MAX_SUPER_ADMIN_QUOTA}).'
        }, status=400)

    username = str(body.get('username') or '').strip()
    email = str(body.get('email') or '').strip().lower()
    password = str(body.get('password') or '').strip()
    first_name = str(body.get('first_name') or '').strip()
    last_name = str(body.get('last_name') or '').strip()

    if not username:
        return JsonResponse({'success': False, 'message': 'Username is required.'}, status=400)
    if not email:
        return JsonResponse({'success': False, 'message': 'Email address is required.'}, status=400)
    if not password:
        return JsonResponse({'success': False, 'message': 'Password is required.'}, status=400)
    if len(password) < 8:
        return JsonResponse({'success': False, 'message': 'Password must be at least 8 characters long.'}, status=400)

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({'success': False, 'message': 'Enter a valid email address.'}, status=400)

    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({'success': False, 'message': f'Username "{username}" is already taken.'}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'success': False, 'message': f'Email "{email}" is already in use.'}, status=400)

    try:
        super_admin = User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role='super_admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            is_revoked=False,
        )
        super_admin.set_password(password)
        super_admin.save()

        return JsonResponse({
            'success': True,
            'message': f'Super Admin "{super_admin.username}" created successfully.',
            'super_admin': {
                'id': super_admin.id,
                'username': super_admin.username,
                'email': super_admin.email,
                'role': 'super_admin',
                'is_revoked': False,
            }
        }, status=201)
    except Exception as exc:
        logger.exception("Failed to create Super Admin: %s", exc)
        return JsonResponse({'success': False, 'message': str(exc)}, status=500)


@login_required
@require_http_methods(['POST'])
def api_prime_admin_revoke_super_admin(request, user_id):
    """
    Revoke or reinstate a Super Admin account.
    Revoked accounts cannot log in to the panel, and active sessions are immediately wiped.
    """
    guard = _require_super_admin(request)
    if guard:
        return guard

    super_admin = get_object_or_404(User, id=user_id)
    if super_admin.id == request.user.id:
        return JsonResponse({'success': False, 'message': 'You cannot revoke your own Super Admin account.'}, status=400)
    if super_admin.role != 'super_admin':
        return JsonResponse({'success': False, 'message': 'User is not a Super Admin.'}, status=400)

    body = _parse_json(request) or {}
    revoke_flag = body.get('revoke')
    if revoke_flag is None:
        # Toggle if not explicitly specified
        new_revoked_state = not getattr(super_admin, 'is_revoked', False)
    else:
        new_revoked_state = bool(revoke_flag)

    super_admin.is_revoked = new_revoked_state
    super_admin.revoked_at = timezone.now() if new_revoked_state else None
    super_admin.save(update_fields=['is_revoked', 'revoked_at', 'updated_at'])

    if new_revoked_state:
        # Wipe all active sessions immediately
        _wipe_user_sessions(super_admin.id)
        action_msg = f'Super Admin "{super_admin.username}" has been revoked and logged out.'
    else:
        action_msg = f'Super Admin "{super_admin.username}" access has been reinstated.'

    return JsonResponse({
        'success': True,
        'message': action_msg,
        'is_revoked': super_admin.is_revoked,
        'revoked_at': super_admin.revoked_at.strftime('%Y-%m-%d %H:%M') if super_admin.revoked_at else None,
    })


@login_required
@require_http_methods(['DELETE'])
def api_prime_admin_delete_super_admin(request, user_id):
    """
    Delete a Super Admin account permanently, freeing up a quota slot.
    """
    guard = _require_super_admin(request)
    if guard:
        return guard

    super_admin = get_object_or_404(User, id=user_id)
    if super_admin.id == request.user.id:
        return JsonResponse({'success': False, 'message': 'You cannot delete your own Super Admin account.'}, status=400)
    if super_admin.role != 'super_admin':
        return JsonResponse({'success': False, 'message': 'User is not a Super Admin.'}, status=400)
    if User.objects.filter(role='super_admin').count() <= 1:
        return JsonResponse({'success': False, 'message': 'Cannot delete the last remaining Super Admin.'}, status=400)

    username = super_admin.username
    _wipe_user_sessions(super_admin.id)
    super_admin.delete()

    return JsonResponse({
        'success': True,
        'message': f'Super Admin "{username}" has been permanently deleted.',
    })


@login_required
@require_http_methods(['GET', 'POST', 'PUT'])
def api_prime_admin_secondary_emails(request):
    """
    GET: Retrieve Super Admin's login identifiers.
    POST / PUT: Update secondary login emails for Super Admin.
    """
    guard = _require_super_admin(request)
    if guard:
        return guard

    prime_admin = request.user

    if request.method == 'GET':
        return JsonResponse({
            'success': True,
            'primary_email': prime_admin.email,
            'secondary_email_1': prime_admin.secondary_email_1 or '',
            'secondary_email_2': prime_admin.secondary_email_2 or '',
            'phone': prime_admin.phone or '',
            'username': prime_admin.username,
        })

    body = _parse_json(request)
    if body is None:
        return JsonResponse({'success': False, 'message': 'Invalid JSON data.'}, status=400)

    sec1 = str(body.get('secondary_email_1') or '').strip().lower()
    sec2 = str(body.get('secondary_email_2') or '').strip().lower()

    if sec1:
        try:
            validate_email(sec1)
        except ValidationError:
            return JsonResponse({'success': False, 'message': 'Secondary Email 1 is invalid.'}, status=400)
        if sec1 == prime_admin.email.lower():
            return JsonResponse({'success': False, 'message': 'Secondary Email 1 cannot match Primary Email.'}, status=400)
        # Check uniqueness against other users
        if User.objects.filter(email__iexact=sec1).exclude(pk=prime_admin.pk).exists():
            return JsonResponse({'success': False, 'message': f'Email "{sec1}" is already registered to another account.'}, status=400)

    if sec2:
        try:
            validate_email(sec2)
        except ValidationError:
            return JsonResponse({'success': False, 'message': 'Secondary Email 2 is invalid.'}, status=400)
        if sec2 == prime_admin.email.lower():
            return JsonResponse({'success': False, 'message': 'Secondary Email 2 cannot match Primary Email.'}, status=400)
        if sec1 and sec2 == sec1:
            return JsonResponse({'success': False, 'message': 'Secondary Email 2 cannot match Secondary Email 1.'}, status=400)
        # Check uniqueness against other users
        if User.objects.filter(email__iexact=sec2).exclude(pk=prime_admin.pk).exists():
            return JsonResponse({'success': False, 'message': f'Email "{sec2}" is already registered to another account.'}, status=400)

    prime_admin.secondary_email_1 = sec1 or None
    prime_admin.secondary_email_2 = sec2 or None
    prime_admin.save(update_fields=['secondary_email_1', 'secondary_email_2', 'updated_at'])

    return JsonResponse({
        'success': True,
        'message': 'Secondary login emails updated successfully.',
        'primary_email': prime_admin.email,
        'secondary_email_1': prime_admin.secondary_email_1 or '',
        'secondary_email_2': prime_admin.secondary_email_2 or '',
    })
