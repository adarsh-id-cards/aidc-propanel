"""
Data Collection API — Production-Grade Headless REST Endpoints.

Provides:
- Dual-workflow architecture:
    * Workflow A: Pre-table standalone collection campaigns (NEW_TABLE).
    * Workflow B: Existing-table collection campaigns (EXISTING_TABLE).
- Authenticated campaign management endpoints:
    * List & create campaigns per organization.
    * Campaign records with real-time stats across COLLECTION, CHECKED, and CANCELED.
    * Auto-check deduplication.
    * Controlled Table Creation Wizard from collection data (Workflow A).
    * Existing table synchronization with conflict detection (Workflow B).
    * Schema compatibility & field mapping preview.
    * Targeted field correction requests.
    * Full immutable audit event logs.
- Public student self-submission portal endpoints with cryptographic token verification,
  deadline enforcement, rate limiting, and zero-PII information cloaking.
- Public targeted correction endpoints for self-service in-place updates.
"""

import json
import logging
import secrets
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
from django.core.cache import cache

from organisation.models import Organisation
from tables.models import (
    Table,
    IDCard,
    CollectionCampaign,
    DataCollectionRecord,
    DataCollectionEvent,
    TablePhotoCollectionLink,
)
from tables.services.data_collection_service import DataCollectionService
from tables.services.field_mapping_service import FieldMappingService
from core.services.permission_service import PermissionService

logger = logging.getLogger(__name__)

# ── In-Memory IP Rate Limiter for Public Endpoints ───────────────────────────
_IP_RATE_WINDOW = 60  # seconds
_IP_RATE_MAX_REQUESTS = 30  # max requests per minute


def _check_rate_limit(ip):
    """Simple rate limit check per IP: returns True if allowed, False if exceeded."""
    if not ip:
        return True
    cache_key = f"rate_limit_col_{ip}"
    try:
        current_count = cache.get(cache_key, 0)
        if current_count >= _IP_RATE_MAX_REQUESTS:
            return False
        cache.set(cache_key, current_count + 1, timeout=_IP_RATE_WINDOW)
    except Exception:
        pass
    return True


def _verify_org_access(request, org_id):
    if not request.user.is_authenticated:
        return False, JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)
    if PermissionService.is_super_admin(request.user) or PermissionService.is_prime_admin(request.user):
        return True, None
    if not PermissionService.can_access_client(request.user, org_id):
        return False, JsonResponse({'success': False, 'message': 'Access forbidden.'}, status=403)
    return True, None


def _verify_table_access(request, table):
    if not request.user.is_authenticated:
        return False, JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)
    client_id = table.organisation_id or table.client_id
    if not (PermissionService.is_super_admin(request.user) or PermissionService.is_prime_admin(request.user)):
        if not PermissionService.can_access_client(request.user, client_id):
            return False, JsonResponse({'success': False, 'message': 'Access forbidden.'}, status=403)
    return True, None


def _verify_campaign_access(request, campaign):
    if not request.user.is_authenticated:
        return False, JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)
    if PermissionService.is_super_admin(request.user) or PermissionService.is_prime_admin(request.user):
        return True, None
    if not PermissionService.can_access_client(request.user, campaign.organisation_id):
        return False, JsonResponse({'success': False, 'message': 'Access forbidden.'}, status=403)
    return True, None


def _resolve_campaign_or_link(token):
    camp = CollectionCampaign.objects.select_related('organisation', 'table').filter(token=token).first()
    if camp:
        return camp
    link = TablePhotoCollectionLink.objects.select_related('table__organisation').filter(token=token).first()
    if link:
        camp = link.campaign
        if not camp:
            camp = CollectionCampaign.objects.filter(table=link.table).first()
        if not camp:
            camp = DataCollectionService.get_or_create_campaign_for_table(link.table)
            link.campaign = camp
            link.save(update_fields=['campaign'])
        if link.campaign_name:
            camp.campaign_name = link.campaign_name
        if link.expires_at:
            camp.expires_at = link.expires_at
        return camp
    return None


# =============================================================================
# ORGANISATION CAMPAIGN MANAGEMENT ENDPOINTS (DUAL WORKFLOW)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_organisation_collection_campaigns(request, org_id):
    """
    GET: List all collection campaigns for this organization (both standalone and table-bound).
    POST: Create a new collection campaign:
          - Workflow A: destination_type='NEW_TABLE' (no table required!)
          - Workflow B: destination_type='EXISTING_TABLE' (bound to existing table)
    """
    ok, err_resp = _verify_org_access(request, org_id)
    if not ok:
        return err_resp

    org = Organisation.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({'success': False, 'message': 'Organisation not found.'}, status=404)

    if request.method == 'GET':
        campaigns = CollectionCampaign.objects.filter(organisation=org).select_related('table').order_by('-created_at')
        data = []
        for c in campaigns:
            counts = {
                'collection': c.records.filter(status='collection').count(),
                'checked': c.records.filter(status='checked').count(),
                'canceled': c.records.filter(status='canceled').count(),
                'promoted': c.records.filter(promoted_card__isnull=False).count(),
            }
            counts['total'] = counts['collection'] + counts['checked'] + counts['canceled']

            data.append({
                'id': c.id,
                'campaign_name': c.campaign_name,
                'destination_type': c.destination_type,
                'table_id': c.table_id,
                'table_name': c.table.name if c.table else None,
                'token': c.token,
                'campaign_state': c.campaign_state,
                'form_version': c.form_version,
                'allowed_classes': c.allowed_classes or [],
                'allow_parent_submission': c.allow_parent_submission,
                'sync_policy': c.sync_policy,
                'instructions': c.instructions,
                'counts': counts,
                'created_at': c.created_at.isoformat(),
            })
        return JsonResponse({'success': True, 'campaigns': data})

    # POST: Create Campaign
    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    destination_type = body.get('destination_type', 'NEW_TABLE').upper()
    campaign_name = body.get('campaign_name', '').strip()
    table_id = body.get('table_id')

    if destination_type == 'EXISTING_TABLE' and table_id:
        table = Table.objects.filter(id=table_id, organisation=org).first()
        if not table:
            return JsonResponse({'success': False, 'message': 'Target table not found in this organization.'}, status=404)
        campaign = DataCollectionService.get_or_create_campaign_for_table(table, actor=request.user.username)
        if campaign_name:
            campaign.campaign_name = campaign_name
            campaign.save(update_fields=['campaign_name'])
    else:
        # Workflow A: Standalone pre-table collection campaign
        if not campaign_name:
            campaign_name = f"{org.name} - Student Collection"
        form_schema = body.get('form_schema')
        allowed_classes = body.get('allowed_classes', [])
        instructions = body.get('instructions', '')

        campaign = DataCollectionService.create_standalone_campaign(
            organisation=org,
            campaign_name=campaign_name,
            form_schema=form_schema,
            allowed_classes=allowed_classes,
            instructions=instructions,
        )

    return JsonResponse({
        'success': True,
        'campaign': {
            'id': campaign.id,
            'campaign_name': campaign.campaign_name,
            'destination_type': campaign.destination_type,
            'table_id': campaign.table_id,
            'token': campaign.token,
            'campaign_state': campaign.campaign_state,
        }
    })


# =============================================================================
# CAMPAIGN DETAIL & WORKSPACE ENDPOINTS
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_campaign_detail_and_config(request, campaign_id):
    """
    GET: Return full campaign configuration, token, portal URL, state, schema.
    POST: Update campaign configurations (name, state, instructions, classes, sync policy).
    """
    campaign = CollectionCampaign.objects.select_related('organisation', 'table').filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    if request.method == 'GET':
        return JsonResponse({
            'success': True,
            'config': {
                'id': campaign.id,
                'campaign_name': campaign.campaign_name,
                'destination_type': campaign.destination_type,
                'table_id': campaign.table_id,
                'table_name': campaign.table.name if campaign.table else None,
                'token': campaign.token,
                'is_active': campaign.campaign_state == 'ACTIVE',
                'campaign_state': campaign.campaign_state,
                'form_version': campaign.form_version,
                'form_schema': campaign.form_schema or [],
                'allowed_classes': campaign.allowed_classes or [],
                'allow_parent_submission': campaign.allow_parent_submission,
                'sync_policy': campaign.sync_policy,
                'instructions': campaign.instructions or '',
                'expires_at': campaign.expires_at.isoformat() if campaign.expires_at else None,
            }
        })

    # POST: Update config
    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    if 'campaign_name' in body:
        campaign.campaign_name = str(body['campaign_name']).strip()
    if 'campaign_state' in body:
        state = str(body['campaign_state']).upper()
        if state in ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED'):
            campaign.campaign_state = state
    if 'instructions' in body:
        campaign.instructions = str(body['instructions']).strip()
    if 'allowed_classes' in body:
        campaign.allowed_classes = list(body['allowed_classes'])
    if 'allow_parent_submission' in body:
        campaign.allow_parent_submission = bool(body['allow_parent_submission'])
    if 'sync_policy' in body:
        campaign.sync_policy = str(body['sync_policy'])
    if 'form_schema' in body and isinstance(body['form_schema'], list):
        campaign.form_schema = body['form_schema']
        campaign.form_version += 1

    campaign.save()

    DataCollectionService.log_event(
        campaign=campaign,
        event_type='STATUS_CHANGED',
        actor=request.user.username,
        notes=f"Campaign settings updated (state: {campaign.campaign_state}, version: {campaign.form_version}).",
    )

    return JsonResponse({'success': True, 'message': 'Campaign settings updated successfully.'})


@require_http_methods(['GET'])
def api_campaign_records(request, campaign_id):
    """
    GET: Return paginated records for a campaign across COLLECTION, CHECKED, CANCELED.
    Works for both Workflow A (standalone) and Workflow B (existing table).
    """
    campaign = CollectionCampaign.objects.select_related('organisation', 'table').filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    status_filter = request.GET.get('status', 'collection').strip().lower()
    search = request.GET.get('search', '').strip().lower()
    page_num = int(request.GET.get('page', 1))
    page_size = min(100, max(10, int(request.GET.get('page_size', 25))))

    counts = {
        'collection': campaign.records.filter(status='collection').count(),
        'checked': campaign.records.filter(status='checked').count(),
        'canceled': campaign.records.filter(status='canceled').count(),
        'promoted': campaign.records.filter(promoted_card__isnull=False).count(),
    }
    counts['total'] = counts['collection'] + counts['checked'] + counts['canceled']

    qs = campaign.records.filter(status=status_filter).select_related('promoted_card')

    if search:
        matching_ids = []
        for r in qs.iterator(chunk_size=300):
            fdata_str = ' '.join(str(v).lower() for v in (r.field_data or {}).values())
            sub_str = f"{r.submitter_name} {r.submitter_phone}".lower()
            if search in fdata_str or search in sub_str or (r.flag_reason and search in r.flag_reason.lower()):
                matching_ids.append(r.id)
        qs = qs.filter(id__in=matching_ids)

    paginator = Paginator(qs, page_size)
    page_obj = paginator.get_page(page_num)

    records_data = []
    for r in page_obj.object_list:
        records_data.append({
            'id': r.id,
            'status': r.status,
            'field_data': r.field_data or {},
            'photo_file': r.photo_file,
            'submitter_role': r.submitter_role,
            'submitter_name': r.submitter_name,
            'submitter_phone': r.submitter_phone,
            'idempotency_key': r.idempotency_key,
            'match_status': r.match_status,
            'match_details': r.match_details or {},
            'flag_code': r.flag_code,
            'flag_reason': r.flag_reason,
            'correction_token': r.correction_token,
            'correction_requested_fields': r.correction_requested_fields or [],
            'submitted_at': r.submitted_at.isoformat() if r.submitted_at else None,
            'device_id': r.device_id,
            'promoted': bool(r.promoted_card_id),
            'promoted_card_id': r.promoted_card_id,
            'promoted_at': r.promoted_at.isoformat() if r.promoted_at else None,
        })

    # Schema definition to display
    display_schema = campaign.form_schema or []
    if not display_schema and campaign.table:
        display_schema = campaign.table.fields or []

    return JsonResponse({
        'success': True,
        'records': records_data,
        'counts': counts,
        'campaign_id': campaign.id,
        'campaign_name': campaign.campaign_name,
        'destination_type': campaign.destination_type,
        'table_id': campaign.table_id,
        'table_name': campaign.table.name if campaign.table else None,
        'token': campaign.token,
        'form_schema': display_schema,
        'page': page_num,
        'page_size': page_size,
        'total_pages': paginator.num_pages,
        'total_records': paginator.count,
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_campaign_auto_check(request, campaign_id):
    """POST: Execute auto-check deduplication on all COLLECTION records in this campaign."""
    campaign = CollectionCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    res = DataCollectionService.auto_check_records(campaign=campaign, actor=request.user.username)
    return JsonResponse(res)


@csrf_exempt
@require_http_methods(['POST'])
def api_campaign_status_change(request, campaign_id):
    """POST: Manually move records between COLLECTION, CHECKED, CANCELED with structured rationale."""
    campaign = CollectionCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    record_ids = body.get('record_ids', [])
    new_status = str(body.get('new_status', '')).strip().lower()
    flag_code = body.get('flag_code')
    reason = body.get('reason', '')

    if not record_ids or not new_status:
        return JsonResponse({'success': False, 'message': 'record_ids and new_status are required.'}, status=400)

    try:
        res = DataCollectionService.change_status(
            campaign=campaign,
            record_ids=record_ids,
            new_status=new_status,
            flag_code=flag_code,
            reason=reason,
            actor=request.user.username,
        )
        return JsonResponse(res)
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)


@csrf_exempt
@require_http_methods(['POST'])
def api_campaign_request_correction(request, campaign_id):
    """POST: Generate unguessable 256-bit correction token for targeted parent correction."""
    campaign = CollectionCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    record_id = body.get('record_id')
    requested_fields = body.get('requested_fields', [])
    notes = body.get('notes', '')

    try:
        res = DataCollectionService.request_correction(
            campaign=campaign,
            record_id=record_id,
            requested_fields=requested_fields,
            notes=notes,
            actor=request.user.username,
        )
        origin = request.build_absolute_uri('/')[:-1]
        res['correction_url'] = f"{origin}/portal/correct/{res['correction_token']}"
        return JsonResponse(res)
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)


@require_http_methods(['GET'])
def api_campaign_events(request, campaign_id, record_id=None):
    """GET: Return immutable event sourcing audit log for a record or the entire campaign."""
    campaign = CollectionCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    if record_id:
        events = DataCollectionEvent.objects.filter(record_id=record_id).order_by('-created_at')
    else:
        events = DataCollectionEvent.objects.filter(campaign=campaign).order_by('-created_at')[:100]

    data = []
    for ev in events:
        data.append({
            'id': ev.id,
            'record_id': ev.record_id,
            'event_type': ev.event_type,
            'actor': ev.actor,
            'notes': ev.notes,
            'payload': ev.payload or {},
            'created_at': ev.created_at.isoformat(),
        })

    return JsonResponse({'success': True, 'events': data})


# =============================================================================
# WIZARD: CREATE TABLE FROM COLLECTION (WORKFLOW A)
# =============================================================================

@csrf_exempt
@require_http_methods(['POST'])
def api_campaign_create_table(request, campaign_id):
    """
    POST: Table Creation Wizard from Collection Data (Workflow A).
    Creates a new Table under the campaign's organisation, associates the campaign,
    and promotes all approved checked submissions into live IDCard records in PENDING status.
    """
    campaign = CollectionCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    table_name = body.get('table_name', '').strip() or campaign.campaign_name
    field_definitions = body.get('field_definitions')
    primary_identifiers = body.get('primary_identifiers')
    photo_field_name = body.get('photo_field_name', 'PHOTO')
    selected_record_ids = body.get('selected_record_ids')

    res = DataCollectionService.create_table_from_collection(
        campaign=campaign,
        table_name=table_name,
        field_definitions=field_definitions,
        primary_identifiers=primary_identifiers,
        photo_field_name=photo_field_name,
        selected_record_ids=selected_record_ids,
        actor=request.user.username,
    )

    if not res.get('success'):
        return JsonResponse(res, status=400)

    return JsonResponse(res)


# =============================================================================
# SYNCHRONIZATION: SYNC TO EXISTING TABLE (WORKFLOW B)
# =============================================================================

@csrf_exempt
@require_http_methods(['POST'])
def api_campaign_sync_table(request, campaign_id):
    """
    POST: Synchronize checked collection records into existing live table (Workflow B).
    Enforces sync policy (update_blank_only, replace_all, photo_only, create_missing)
    and conflict detection against live IDCards.
    """
    campaign = CollectionCampaign.objects.select_related('table').filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    if not campaign.table:
        return JsonResponse({'success': False, 'message': 'Campaign does not have an attached destination table.'}, status=400)

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    record_ids = body.get('record_ids')
    sync_policy = body.get('sync_policy') or campaign.sync_policy

    res = DataCollectionService.sync_to_existing_table(
        campaign=campaign,
        record_ids=record_ids,
        sync_policy=sync_policy,
        actor=request.user.username,
    )

    return JsonResponse(res)


# =============================================================================
# SCHEMA COMPATIBILITY & MAPPING PREVIEW
# =============================================================================

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_campaign_mapping_preview(request, campaign_id):
    """
    GET/POST: Generate a comprehensive field mapping preview between campaign schema
    and candidate destination table fields.
    """
    campaign = CollectionCampaign.objects.select_related('table').filter(id=campaign_id).first()
    if not campaign:
        return JsonResponse({'success': False, 'message': 'Campaign not found.'}, status=404)

    ok, err_resp = _verify_campaign_access(request, campaign)
    if not ok:
        return err_resp

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    # Determine destination schema
    target_table_id = body.get('target_table_id') or campaign.table_id
    if target_table_id:
        target_table = Table.objects.filter(id=target_table_id).first()
        dest_fields = target_table.fields if target_table else []
    else:
        dest_fields = body.get('destination_fields', campaign.form_schema or [])

    existing_mapping = body.get('existing_mapping') or campaign.destination_mapping or {}

    preview = FieldMappingService.generate_mapping_preview(
        source_schema=campaign.form_schema or [],
        destination_schema=dest_fields,
        existing_mapping=existing_mapping,
    )

    return JsonResponse({'success': True, 'preview': preview})


# =============================================================================
# BACKWARD COMPATIBLE TABLE WORKSPACE ENDPOINTS
# =============================================================================

@require_http_methods(['GET'])
def api_data_collection_records(request, table_id):
    """Backward compatible: return collection records for a specific table."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_records(request, campaign.id)


@csrf_exempt
@require_http_methods(['POST'])
def api_data_collection_auto_check(request, table_id):
    """Backward compatible: trigger auto-check for table."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_auto_check(request, campaign.id)


@csrf_exempt
@require_http_methods(['POST'])
def api_data_collection_promote(request, table_id):
    """Backward compatible: promote checked records to pending."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    ok, err_resp = _verify_table_access(request, table)
    if not ok:
        return err_resp

    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        body = request.POST.dict()

    record_ids = body.get('record_ids')
    res = DataCollectionService.promote_checked_to_pending(
        table=table,
        record_ids=record_ids,
        actor=request.user.username,
    )
    return JsonResponse(res)


@csrf_exempt
@require_http_methods(['POST'])
def api_data_collection_status_change(request, table_id):
    """Backward compatible: status change for table records."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_status_change(request, campaign.id)


@csrf_exempt
@require_http_methods(['POST'])
def api_data_collection_request_correction(request, table_id):
    """Backward compatible: request correction for table record."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_request_correction(request, campaign.id)


@require_http_methods(['GET'])
def api_data_collection_events(request, table_id, record_id):
    """Backward compatible: events for record."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_events(request, campaign.id, record_id=record_id)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_data_collection_config(request, table_id):
    """Backward compatible: get / update table collection config."""
    table = Table.objects.filter(id=table_id).first()
    if not table:
        return JsonResponse({'success': False, 'message': 'Table not found.'}, status=404)

    campaign = DataCollectionService.get_or_create_campaign_for_table(table)
    return api_campaign_detail_and_config(request, campaign.id)


# =============================================================================
# PUBLIC STUDENT SELF-COLLECTION PORTAL ENDPOINTS (SHARED ENGINE)
# =============================================================================

@csrf_exempt
@require_http_methods(['GET'])
def api_public_data_collection_meta(request, token):
    """
    GET: Return public metadata and instructions for student self-submission portal.
    Resolves both standalone campaigns (Workflow A) and table campaigns (Workflow B).
    Strictly cloaks all pre-existing student PII.
    """
    campaign = _resolve_campaign_or_link(token)
    if not campaign:
        return JsonResponse({'success': False, 'valid': False, 'message': 'Invalid collection link.'}, status=404)

    if campaign.campaign_state != 'ACTIVE':
        return JsonResponse({
            'success': False,
            'valid': False,
            'message': f"Data collection for this campaign is currently {campaign.campaign_state.lower()}."
        }, status=403)

    if campaign.expires_at and timezone.now() > campaign.expires_at:
        return JsonResponse({
            'success': False,
            'valid': False,
            'message': "The submission deadline for this collection campaign has ended."
        }, status=403)

    org_name = campaign.organisation.name if campaign.organisation else ''

    # Filter out system and binary fields to build clean student form schema
    collectible_fields = []
    source_fields = campaign.form_schema or (campaign.table.fields if campaign.table else [])

    for f in source_fields:
        fname = str(f.get('name', '')).strip()
        ftype = str(f.get('type', 'text')).strip().lower()
        if ftype in ('photo', 'rel_photo', 'signature') or fname.startswith('_'):
            continue
        collectible_fields.append({
            'name': fname,
            'label': f.get('label') or fname,
            'type': ftype,
            'required': f.get('required', True if fname.lower() in ('name', 'student name', 'roll no', 'roll_no', 'admission no') else False),
            'options': f.get('options', []),
        })

    return JsonResponse({
        'success': True,
        'valid': True,
        'table_name': campaign.campaign_name,
        'organisation_name': org_name,
        'destination_type': campaign.destination_type,
        'fields': collectible_fields,
        'allowed_classes': campaign.allowed_classes or [],
        'allow_parent_submission': campaign.allow_parent_submission,
        'instructions': campaign.instructions or 'Please enter your details carefully and upload a formal passport-size photograph.',
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_public_data_collection_submit(request, token):
    """
    POST: Public student / parent self-submission endpoint.
    Operates identically for both Workflow A (standalone) and Workflow B (table-bound).
    Validates token, enforces rate limiting, parses submitter metadata, checks magic bytes,
    and runs multi-tier identity resolution.
    """
    client_ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
    if not _check_rate_limit(client_ip):
        return JsonResponse({'success': False, 'message': 'Rate limit exceeded. Please wait a minute before submitting again.'}, status=429)

    content_length = int(request.META.get('CONTENT_LENGTH') or 0)
    if content_length > 15 * 1024 * 1024:
        return JsonResponse({'success': False, 'message': 'Payload exceeds 15MB size limit.'}, status=413)

    campaign = _resolve_campaign_or_link(token)
    if not campaign or campaign.campaign_state != 'ACTIVE':
        return JsonResponse({'success': False, 'message': 'Link is invalid or collection campaign is inactive.'}, status=403)

    if campaign.expires_at and timezone.now() > campaign.expires_at:
        return JsonResponse({'success': False, 'message': 'The deadline for this collection campaign has ended.'}, status=403)

    raw_fields = request.POST.get('fields', '{}')
    try:
        field_data = json.loads(raw_fields) if raw_fields else {}
    except Exception:
        return JsonResponse({'success': False, 'message': 'Invalid JSON fields payload.'}, status=400)

    if len(field_data) > 50:
        return JsonResponse({'success': False, 'message': 'Too many fields submitted.'}, status=400)

    submitter_info = {
        'submitter_role': str(request.POST.get('submitter_role', 'student')).strip().lower() or 'student',
        'submitter_name': str(request.POST.get('submitter_name', '')).strip(),
        'submitter_phone': str(request.POST.get('submitter_phone', '')).strip(),
    }

    idempotency_key = str(request.POST.get('idempotency_key') or request.META.get('HTTP_X_IDEMPOTENCY_KEY', '')).strip() or None
    device_id = str(request.POST.get('device_id', '')).strip() or None
    photo_file = request.FILES.get('photo') or request.FILES.get('image')

    res = DataCollectionService.ingest_submission(
        campaign=campaign,
        table=campaign.table,
        field_data=field_data,
        photo_file=photo_file,
        submitter_info=submitter_info,
        idempotency_key=idempotency_key,
        device_id=device_id,
        ip=client_ip,
    )

    if not res.get('success'):
        return JsonResponse({'success': False, 'message': res.get('message', 'Submission failed.')}, status=400)

    msg = "Your details and photograph have been received successfully!"
    if res['status'] == 'canceled':
        msg = "Your submission has been recorded. Note: A potential duplicate was detected and queued for administrative review."

    return JsonResponse({
        'success': True,
        'record_id': res['record_id'],
        'status': res['status'],
        'is_retry': res.get('is_retry', False),
        'message': msg,
    })


# =============================================================================
# PUBLIC STUDENT SELF-CORRECTION ENDPOINTS
# =============================================================================

@csrf_exempt
@require_http_methods(['GET'])
def api_public_correction_meta(request, token):
    """GET: Return public metadata and requested fields for student/parent targeted correction."""
    rec = DataCollectionRecord.objects.select_related('organisation', 'table', 'campaign').filter(correction_token=token).first()
    if not rec:
        return JsonResponse({'success': False, 'valid': False, 'message': 'Invalid or expired correction link.'}, status=404)

    if rec.promoted_card_id:
        return JsonResponse({'success': False, 'valid': False, 'message': 'This submission has already been finalized.'}, status=403)

    org_name = rec.organisation.name if rec.organisation else (rec.table.organisation.name if rec.table else '')
    camp_name = rec.campaign.campaign_name if rec.campaign else (rec.table.name if rec.table else 'Collection')

    return JsonResponse({
        'success': True,
        'valid': True,
        'table_name': camp_name,
        'organisation_name': org_name,
        'record_id': rec.id,
        'field_data': rec.field_data or {},
        'requested_fields': rec.correction_requested_fields or [],
        'has_photo': bool(rec.photo_file),
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_public_correction_submit(request, token):
    """POST: Submit corrected field data and/or new photograph for an existing record."""
    client_ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
    if not _check_rate_limit(client_ip):
        return JsonResponse({'success': False, 'message': 'Rate limit exceeded. Please wait a moment.'}, status=429)

    raw_fields = request.POST.get('fields', '{}')
    try:
        field_data = json.loads(raw_fields) if raw_fields else {}
    except Exception:
        field_data = {}

    photo_file = request.FILES.get('photo') or request.FILES.get('image')

    res = DataCollectionService.apply_correction(
        token=token,
        updated_fields=field_data,
        photo_file=photo_file,
    )

    if not res.get('success'):
        return JsonResponse(res, status=400)

    return JsonResponse(res)
