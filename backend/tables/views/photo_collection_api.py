"""
Photo Collection API — Headless REST endpoints for student self-upload portal.
Allows managers/operators to configure verification columns, media fields,
single-submission restrictions, and generate public tokenized upload links.
"""

import json
import logging
import secrets
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from tables.models import Table, IDCard, TablePhotoCollectionLink
from core.services.idcard_service import IDCardService

from core.services.permission_service import PermissionService
from core.services.activity_service import ActivityService

logger = logging.getLogger(__name__)


def _normalize_string(val):
    """Normalize string for robust case-insensitive matching."""
    if val is None:
        return ''
    return ' '.join(str(val).strip().lower().split())


def _get_default_fields(table):
    """Derive smart default verification & media fields from table schema."""
    table_fields = table.fields or []
    id_tokens = {'roll', 'admission', 'adm', 'id', 'reg', 'sr', 'enrollment', 'scholar', 'code'}
    name_tokens = {'name', 'student'}

    verif_fields = []
    # 1. Primary identifier
    for f in table_fields:
        fname = str(f.get('name', '')).strip()
        ftype = str(f.get('type', 'text')).strip().lower()
        if ftype in ('photo', 'rel_photo', 'signature'):
            continue
        fl_parts = set(_normalize_string(fname).replace('_', ' ').replace('-', ' ').split())
        if fl_parts & id_tokens:
            verif_fields.append(fname)
            break

    # 2. Name field
    for f in table_fields:
        fname = str(f.get('name', '')).strip()
        ftype = str(f.get('type', 'text')).strip().lower()
        if ftype in ('photo', 'rel_photo', 'signature'):
            continue
        if fname in verif_fields:
            continue
        fl_parts = set(_normalize_string(fname).replace('_', ' ').replace('-', ' ').split())
        if fl_parts & name_tokens:
            verif_fields.append(fname)
            break

    # Fallback if none found
    if not verif_fields:
        for f in table_fields:
            ftype = str(f.get('type', 'text')).strip().lower()
            if ftype not in ('photo', 'rel_photo', 'signature'):
                verif_fields.append(f.get('name', ''))
                break

    # Media fields
    media_fields = [
        f.get('name') for f in table_fields
        if str(f.get('type', '')).lower() in ('photo', 'rel_photo', 'signature')
    ]
    if not media_fields and any('photo' in str(f.get('name', '')).lower() for f in table_fields):
        media_fields = [f.get('name') for f in table_fields if 'photo' in str(f.get('name', '')).lower()]

    return verif_fields, media_fields


def _get_or_create_link(table):
    """Get or initialize TablePhotoCollectionLink with smart defaults."""
    link = TablePhotoCollectionLink.objects.filter(table=table).first()
    if not link:
        default_verif, default_media = _get_default_fields(table)
        link = TablePhotoCollectionLink.objects.create(
            table=table,
            token=secrets.token_urlsafe(32),
            is_active=True,
            verification_fields=default_verif,
            media_fields=default_media,
            single_submission_only=True,
            device_lockout_enabled=True,
            instructions='Please upload a clear formal passport-size photo with a plain background in school/college uniform.',
        )
    else:
        # Ensure non-empty defaults
        updated = False
        if not link.verification_fields or not link.media_fields:
            def_v, def_m = _get_default_fields(table)
            if not link.verification_fields:
                link.verification_fields = def_v
                updated = True
            if not link.media_fields:
                link.media_fields = def_m
                updated = True
            if updated:
                link.save(update_fields=['verification_fields', 'media_fields'])
    return link


# =============================================================================
# MANAGER / OPERATOR CONFIGURATION ENDPOINTS (Authenticated)
# =============================================================================

@require_http_methods(['GET', 'POST'])
def api_table_photo_collection_config(request, table_id):
    """
    GET: Retrieve the photo collection configuration and link for this table.
    POST: Update configuration (verification columns, media fields, lockouts, etc.).
    """
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)

    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    # Permission check: super admin, prime admin, or user with table/client access and perm_idcard_photo_collection
    client_id = table.organisation_id or table.client_id
    if not (PermissionService.is_super_admin(request.user) or
            PermissionService.is_prime_admin(request.user)):
        if not PermissionService.can_access_client(request.user, client_id):
            return JsonResponse({'success': False, 'message': 'Access forbidden.'}, status=403)
        if not PermissionService.has(request.user, 'perm_idcard_photo_collection', client=client_id, table=table):
            return JsonResponse({'success': False, 'message': 'Permission denied: Photo collection feature is not enabled for your account or organisation.'}, status=403)

    link = _get_or_create_link(table)

    if request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8')) if request.body else {}
        except Exception:
            body = {}

        if 'is_active' in body:
            link.is_active = bool(body['is_active'])

        if 'verification_fields' in body and isinstance(body['verification_fields'], list):
            # Only allow fields that exist in the table
            valid_names = {f.get('name') for f in (table.fields or []) if f.get('name')}
            filtered_v = [f for f in body['verification_fields'] if f in valid_names]
            link.verification_fields = filtered_v or link.verification_fields

        if 'media_fields' in body and isinstance(body['media_fields'], list):
            valid_names = {f.get('name') for f in (table.fields or []) if f.get('name')}
            filtered_m = [f for f in body['media_fields'] if f in valid_names]
            link.media_fields = filtered_m or link.media_fields

        if 'single_submission_only' in body:
            link.single_submission_only = bool(body['single_submission_only'])

        if 'device_lockout_enabled' in body:
            link.device_lockout_enabled = bool(body['device_lockout_enabled'])

        if 'instructions' in body:
            link.instructions = str(body['instructions']).strip()

        if body.get('regenerate_token'):
            link.token = secrets.token_urlsafe(32)

        link.save()

    # Calculate statistics
    total_cards = table.id_cards.count()
    uploaded_cards = 0
    primary_media = link.media_fields[0] if link.media_fields else 'PHOTO'

    for card in table.id_cards.iterator(chunk_size=300):
        fdata = card.field_data or {}
        if fdata.get('_photo_portal_submitted') or bool(str(fdata.get(primary_media, '')).strip()):
            uploaded_cards += 1

    pending_cards = max(0, total_cards - uploaded_cards)

    all_table_fields = [
        {
            'name': f.get('name'),
            'label': f.get('name'),
            'type': f.get('type', 'text'),
            'is_media': str(f.get('type', '')).lower() in ('photo', 'rel_photo', 'signature'),
        }
        for f in (table.fields or [])
        if f.get('name')
    ]

    media_fields = [
        f for f in all_table_fields
        if f['is_media'] or 'photo' in str(f['name']).lower()
    ]

    return JsonResponse({
        'success': True,
        'config': {
            'id': link.id,
            'token': link.token,
            'is_active': link.is_active,
            'verification_fields': link.verification_fields,
            'media_fields': link.media_fields,
            'single_submission_only': link.single_submission_only,
            'device_lockout_enabled': link.device_lockout_enabled,
            'instructions': link.instructions,
            'expires_at': link.expires_at.isoformat() if link.expires_at else None,
            'portal_path': f"/portal/upload/{link.token}",
        },
        'available_fields': all_table_fields,
        'available_media_fields': media_fields,
        'stats': {
            'total_cards': total_cards,
            'uploaded_cards': uploaded_cards,
            'pending_cards': pending_cards,
        },
    })


# =============================================================================
# PUBLIC STUDENT SELF-UPLOAD PORTAL ENDPOINTS (Unauthenticated, CSRF Exempt)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET'])
def api_public_photo_collection_meta(request, token):
    """Return public metadata and instructions for student upload portal."""
    link = TablePhotoCollectionLink.objects.select_related('table__organisation').filter(token=token).first()
    if not link:
        return JsonResponse({'success': False, 'valid': False, 'message': 'Invalid or expired upload link.'}, status=404)

    if not link.is_active:
        return JsonResponse({'success': False, 'valid': False, 'message': 'This photo submission portal has been closed by the administration.'}, status=403)

    if link.expires_at and link.expires_at < timezone.now():
        return JsonResponse({'success': False, 'valid': False, 'message': 'This submission link has expired.'}, status=410)

    table = link.table
    table_fields_map = {f.get('name'): f for f in (table.fields or []) if f.get('name')}

    verification_fields = []
    for fname in link.verification_fields:
        f_info = table_fields_map.get(fname, {})
        verification_fields.append({
            'name': fname,
            'label': fname,
            'type': f_info.get('type', 'text'),
        })

    media_fields = []
    for fname in link.media_fields:
        f_info = table_fields_map.get(fname, {})
        media_fields.append({
            'name': fname,
            'label': fname,
            'type': f_info.get('type', 'photo'),
        })

    org_name = table.organisation.name if table.organisation else ''

    return JsonResponse({
        'success': True,
        'valid': True,
        'table_name': table.name,
        'organisation_name': org_name,
        'verification_fields': verification_fields,
        'media_fields': media_fields,
        'instructions': link.instructions,
        'single_submission_only': link.single_submission_only,
        'device_lockout_enabled': link.device_lockout_enabled,
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_public_photo_collection_verify(request, token):
    """
    Verify student identity by matching entered values against table columns.
    Enforces single submission lock and device lockout.
    """
    link = TablePhotoCollectionLink.objects.select_related('table__organisation').filter(token=token).first()
    if not link or not link.is_active:
        return JsonResponse({'success': False, 'message': 'Link is invalid or inactive.'}, status=403)

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        return JsonResponse({'success': False, 'message': 'Invalid request body.'}, status=400)

    submitted_fields = body.get('fields') or {}
    device_id = str(body.get('device_id', '')).strip()

    # 1. Device Lockout Check
    if link.device_lockout_enabled and device_id:
        for c in link.table.id_cards.iterator(chunk_size=300):
            cf = c.field_data or {}
            if cf.get('_photo_portal_device') == device_id:
                return JsonResponse({
                    'success': False,
                    'status': 'device_locked',
                    'message': 'A photo submission has already been recorded from this device. Multiple submissions are restricted.',
                }, status=403)

    # 2. Check for missing required verification inputs
    for vf in link.verification_fields:
        val = str(submitted_fields.get(vf, '')).strip()
        if not val:
            return JsonResponse({
                'success': False,
                'status': 'missing_fields',
                'message': f'Please provide your {vf}.',
            }, status=400)

    # 3. Match against table records
    matched_card = None
    for card in link.table.id_cards.iterator(chunk_size=300):
        fdata = card.field_data or {}
        all_match = True
        for vf in link.verification_fields:
            expected = _normalize_string(fdata.get(vf, ''))
            given = _normalize_string(submitted_fields.get(vf, ''))
            if not expected or expected != given:
                all_match = False
                break
        if all_match:
            matched_card = card
            break

    if not matched_card:
        verif_names = ', '.join(link.verification_fields)
        return JsonResponse({
            'success': False,
            'status': 'not_found',
            'message': f'No student record found matching the entered {verif_names}. Please check your details and try again.',
        }, status=404)

    # 4. Single Submission Restriction Check
    cf = matched_card.field_data or {}
    if link.single_submission_only:
        already_submitted = bool(cf.get('_photo_portal_submitted'))
        if not already_submitted and link.media_fields:
            # Also check if all configured media fields already have photos
            already_submitted = all(bool(str(cf.get(mf, '')).strip()) for mf in link.media_fields)

        if already_submitted:
            return JsonResponse({
                'success': False,
                'status': 'already_submitted',
                'message': 'Photo has already been submitted and locked for this record. Further submissions are closed.',
            }, status=403)

    # 5. Build summary for student confirmation display
    summary = []
    # Include student name if present
    for k in ('NAME', 'STUDENT_NAME', 'STUDENT NAME', 'FULL_NAME', 'NAME OF STUDENT'):
        for actual_k in cf.keys():
            if _normalize_string(actual_k) == _normalize_string(k) and cf[actual_k]:
                summary.append({'label': actual_k, 'value': str(cf[actual_k])})
                break
        if summary:
            break

    # Include verification fields
    for vf in link.verification_fields:
        if not any(s['label'] == vf for s in summary):
            summary.append({'label': vf, 'value': str(cf.get(vf, ''))})

    # Include class / section if present
    for k in ('CLASS', 'GRADE', 'STANDARD', 'COURSE', 'BRANCH', 'SECTION'):
        for actual_k in cf.keys():
            if _normalize_string(actual_k) == _normalize_string(k) and cf[actual_k]:
                if not any(s['label'] == actual_k for s in summary):
                    summary.append({'label': actual_k, 'value': str(cf[actual_k])})
                break

    display_name = summary[0]['value'] if summary else f"Student #{matched_card.id}"

    return JsonResponse({
        'success': True,
        'status': 'verified',
        'student': {
            'card_id': matched_card.id,
            'display_name': display_name,
            'summary': summary,
        },
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_public_photo_collection_upload(request, token):
    """
    Handle student photo upload with built-in crop from camera/gallery.
    Saves image, sets submission flag, records device fingerprint, and locks re-submission.
    """
    link = TablePhotoCollectionLink.objects.select_related('table__organisation').filter(token=token).first()
    if not link or not link.is_active:
        return JsonResponse({'success': False, 'message': 'Link is invalid or inactive.'}, status=403)

    card_id = request.POST.get('card_id')
    device_id = str(request.POST.get('device_id', '')).strip()

    try:
        raw_fields = request.POST.get('fields', '{}')
        submitted_fields = json.loads(raw_fields) if raw_fields else {}
    except Exception:
        submitted_fields = {}

    if not card_id:
        return JsonResponse({'success': False, 'message': 'Missing student card ID.'}, status=400)

    card = IDCard.objects.filter(id=card_id, table=link.table).first()
    if not card:
        return JsonResponse({'success': False, 'message': 'Student record not found in this table.'}, status=404)

    # Re-verify that card matches verification fields for safety
    cf = card.field_data or {}
    for vf in link.verification_fields:
        expected = _normalize_string(cf.get(vf, ''))
        given = _normalize_string(submitted_fields.get(vf, ''))
        if not expected or expected != given:
            return JsonResponse({'success': False, 'message': 'Identity verification mismatch.'}, status=403)

    # Enforce single submission lock
    if link.single_submission_only and cf.get('_photo_portal_submitted'):
        return JsonResponse({
            'success': False,
            'status': 'already_submitted',
            'message': 'Photo has already been submitted for this record. Re-upload is blocked.',
        }, status=403)

    # Build image_files dictionary for IDCardService.update_card
    image_files = {}
    for mf in link.media_fields:
        # Check files for key 'image_<field_name>' or '<field_name>'
        f = request.FILES.get(f"image_{mf}") or request.FILES.get(mf)
        if f:
            image_files[f"image_{mf}"] = f

    # Fallback: if only one file was sent with generic key 'photo' or 'image'
    if not image_files and request.FILES:
        primary_mf = link.media_fields[0] if link.media_fields else 'PHOTO'
        for k in request.FILES.keys():
            image_files[f"image_{primary_mf}"] = request.FILES[k]
            break

    if not image_files:
        return JsonResponse({'success': False, 'message': 'No photo was uploaded. Please capture or select a photo.'}, status=400)

    # Call IDCardService.update_card to process images with MediaNameService
    result = IDCardService.update_card(
        card_id=card.id,
        image_files=image_files,
        field_data=card.field_data,
        modified_by='student_self_portal',
    )

    if not result.success:
        logger.error("Failed to update card %s photo via portal: %s", card.id, result.message)
        return JsonResponse({'success': False, 'message': result.message or 'Failed to save photo.'}, status=500)

    # Mark submission flag and record device id to prevent double upload
    card.refresh_from_db()
    updated_fdata = dict(card.field_data or {})
    updated_fdata['_photo_portal_submitted'] = True
    updated_fdata['_photo_portal_submitted_at'] = timezone.now().isoformat()
    if device_id:
        updated_fdata['_photo_portal_device'] = device_id
    card.field_data = updated_fdata
    card.save(update_fields=['field_data', 'updated_at'])

    # Rich activity logging
    try:
        ActivityService.log(
            'student_photo_upload',
            f"Student uploaded photo via self-collection portal for Card #{card.id}",
            request=request,
            details={
                'table_id': link.table.id,
                'card_id': card.id,
                'token': link.token[:8],
                'device_id': device_id[:12] if device_id else None,
            },
        )
    except Exception as exc:
        logger.warning("Activity log failed: %s", exc)

    return JsonResponse({
        'success': True,
        'message': 'Photo uploaded and verified successfully!',
        'card_id': card.id,
    })
