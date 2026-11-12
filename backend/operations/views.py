"""
CardFlow — Reversible Operations, Bulk Transactions & Audit History API Views

Endpoints:
  - POST /api/operations/undo/
  - POST /api/operations/redo/
  - GET  /api/operations/stack/
  - GET  /api/operations/history/
  - GET  /api/operations/audit/cards/<card_id>/timeline/
  - GET  /api/operations/audit/tables/<table_id>/activity/
  - GET  /api/operations/audit/transactions/
  - GET  /api/operations/audit/transactions/<transaction_id>/
  - POST /api/operations/audit/transactions/<transaction_id>/reverse/
  - GET  /api/operations/audit/export/
"""
import csv
import json
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator

from organisation.models import Organisation
from tables.models import Table, IDCard
from core.services.permission_service import PermissionService
from organisation.services_access import OrganisationAccessService
from .services import OperationEngine, AuditService, AuditVisibilityService

logger = logging.getLogger(__name__)


def _get_request_org(request, table_id=None):
    """Safely resolve organisation from authenticated user and scoped table."""
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return None

    if PermissionService.is_super_admin(user):
        org_id = request.GET.get('org_id') or request.GET.get('client_id')
        if org_id:
            try:
                return Organisation.objects.get(id=int(org_id))
            except (Organisation.DoesNotExist, ValueError):
                pass
        if table_id:
            try:
                t = Table.objects.select_related('organisation').get(id=int(table_id))
                return t.organisation
            except (Table.DoesNotExist, ValueError):
                pass
        return None

    # For non-superadmin: strictly resolve their authorized organisation
    org = OrganisationAccessService.get_organisation_for_user(user)
    if table_id and org:
        try:
            t = Table.objects.select_related('organisation').get(id=int(table_id))
            if not OrganisationAccessService.can_access_table(user, t):
                return None
            return t.organisation
        except (Table.DoesNotExist, ValueError):
            return None
    return org


def _require_auth(request):
    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required.'}, status=401)
    return None


def _parse_json(request):
    try:
        return json.loads(request.body) if request.body else {}
    except Exception:
        return {}


# ══════════════════════════════════════════════════════════════════════════
# 1. UNDO / REDO REST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

@require_http_methods(['POST'])
def undo_view(request):
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    if not PermissionService.is_super_admin(request.user) and not PermissionService.is_prime_admin(request.user):
        return JsonResponse({'success': False, 'message': 'Only Super Admin can undo operations.'}, status=403)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    table_id = data.get('table_id') or request.GET.get('table_id')
    operation_id = data.get('operation_id')
    session_id = data.get('session_id', '')
    org = _get_request_org(request, table_id)

    res = OperationEngine.undo_operation(
        operation_id=int(operation_id) if operation_id else None,
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        session_id=session_id,
        admin_override=getattr(request.user, 'is_superuser', False),
    )

    stack = OperationEngine.get_stack_status(
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        session_id=session_id,
    )

    return JsonResponse({
        **res.to_dict(),
        'stack_status': stack,
    }, status=200 if res.success else 400)


@require_http_methods(['POST'])
def redo_view(request):
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    if not PermissionService.is_super_admin(request.user) and not PermissionService.is_prime_admin(request.user):
        return JsonResponse({'success': False, 'message': 'Only Super Admin can redo operations.'}, status=403)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    table_id = data.get('table_id') or request.GET.get('table_id')
    operation_id = data.get('operation_id')
    session_id = data.get('session_id', '')
    org = _get_request_org(request, table_id)

    res = OperationEngine.redo_operation(
        operation_id=int(operation_id) if operation_id else None,
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        session_id=session_id,
    )

    stack = OperationEngine.get_stack_status(
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        session_id=session_id,
    )

    return JsonResponse({
        **res.to_dict(),
        'stack_status': stack,
    }, status=200 if res.success else 400)


@require_http_methods(['GET'])
def stack_status_view(request):
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    if not PermissionService.is_super_admin(request.user) and not PermissionService.is_prime_admin(request.user):
        return JsonResponse({
            'success': True,
            'can_undo': False,
            'can_redo': False,
            'undo_count': 0,
            'redo_count': 0,
            'undo_tooltip': 'Super Admin only',
            'redo_tooltip': 'Super Admin only',
        })

    table_id = request.GET.get('table_id')
    session_id = request.GET.get('session_id', '')
    org = _get_request_org(request, table_id)

    stack = OperationEngine.get_stack_status(
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        session_id=session_id,
    )
    return JsonResponse({'success': True, **stack})


@require_http_methods(['GET'])
def history_view(request):
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    table_id = request.GET.get('table_id')
    limit = min(int(request.GET.get('limit', 50)), 200)
    offset = max(int(request.GET.get('offset', 0)), 0)
    org = _get_request_org(request, table_id)

    res = OperationEngine.get_history(
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        table_id=int(table_id) if table_id else None,
        limit=limit,
        offset=offset,
    )
    return JsonResponse({'success': True, **res})


# ══════════════════════════════════════════════════════════════════════════
# 2. AUDIT HISTORY & CARD TIMELINE REST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════

@require_http_methods(['GET'])
def card_timeline_view(request, card_id):
    """Return chronological audit timeline for a specific card."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    limit = min(int(request.GET.get('limit', 50)), 200)
    offset = max(int(request.GET.get('offset', 0)), 0)

    res = AuditService.get_card_timeline(
        card_id=int(card_id),
        user=request.user if request.user.is_authenticated else None,
        limit=limit,
        offset=offset,
    )
    return JsonResponse(res, status=200 if res.get('success') else 404)


@require_http_methods(['POST'])
def card_undo_event_view(request, card_id, event_id):
    """Undo non-image data changes from a specific audit event or 1-hour session on a card."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    data = _parse_json(request)
    event_ids = data.get('event_ids')

    res = AuditService.undo_card_event(
        card_id=int(card_id),
        event_id=int(event_id),
        user=request.user if request.user.is_authenticated else None,
        event_ids=event_ids,
    )
    return JsonResponse(res, status=200 if res.get('success') else 400)


@require_http_methods(['POST'])
def card_redo_event_view(request, card_id, event_id):
    """Redo non-image data changes that were undone for a card."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    data = _parse_json(request)
    event_ids = data.get('event_ids')

    res = AuditService.redo_card_event(
        card_id=int(card_id),
        event_id=int(event_id),
        user=request.user if request.user.is_authenticated else None,
        event_ids=event_ids,
    )
    return JsonResponse(res, status=200 if res.get('success') else 400)


@require_http_methods(['GET'])
def table_activity_view(request, table_id):
    """Return high-level activity feed for a table."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    limit = min(int(request.GET.get('limit', 50)), 200)
    offset = max(int(request.GET.get('offset', 0)), 0)

    res = AuditService.get_table_activity(
        table_id=int(table_id),
        user=request.user if request.user.is_authenticated else None,
        limit=limit,
        offset=offset,
    )
    return JsonResponse(res, status=200 if res.get('success') else 404)


@require_http_methods(['GET'])
def bulk_transactions_list_view(request):
    """Return list of bulk transactions with filters."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    table_id = request.GET.get('table_id')
    action = request.GET.get('action')
    status = request.GET.get('status')
    limit = min(int(request.GET.get('limit', 50)), 200)
    offset = max(int(request.GET.get('offset', 0)), 0)
    org = _get_request_org(request, table_id)

    res = AuditService.get_bulk_transactions(
        table_id=int(table_id) if table_id else None,
        organisation=org,
        user=request.user if request.user.is_authenticated else None,
        action=action,
        status=status,
        limit=limit,
        offset=offset,
    )
    return JsonResponse(res)


@require_http_methods(['GET'])
def bulk_transaction_detail_view(request, transaction_id):
    """Return detailed metadata and affected card list for a bulk transaction."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    search = request.GET.get('search', '').strip()
    limit = min(int(request.GET.get('limit', 100)), 500)
    offset = max(int(request.GET.get('offset', 0)), 0)

    res = AuditService.get_transaction_detail(
        transaction_id=int(transaction_id),
        user=request.user if request.user.is_authenticated else None,
        search=search,
        limit=limit,
        offset=offset,
    )
    return JsonResponse(res, status=200 if res.get('success') else 404)


@require_http_methods(['POST'])
def reverse_bulk_transaction_view(request, transaction_id):
    """Safely reverse a historical bulk transaction with conflict checking (Super Admin only)."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    if not PermissionService.is_super_admin(request.user) and not PermissionService.is_prime_admin(request.user):
        return JsonResponse({'success': False, 'message': 'Only Super Admin can reverse bulk transactions.'}, status=403)

    res = AuditService.reverse_bulk_transaction(
        transaction_id=int(transaction_id),
        user=request.user if request.user.is_authenticated else None,
    )
    return JsonResponse(res, status=200 if res.get('success') else 400)


@require_http_methods(['GET'])
def export_audit_view(request):
    """Export authorized audit history to CSV."""
    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    table_id = request.GET.get('table_id')
    org = _get_request_org(request, table_id)
    user = request.user if request.user.is_authenticated else None

    from .models import AuditEvent
    base_qs = AuditEvent.objects.all().select_related('target_table', 'actor', 'bulk_transaction')
    visible_qs = AuditVisibilityService.filter_events(
        base_qs, user, organisation=org, table_id=int(table_id) if table_id else None
    )

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="audit_export_{table_id or "all"}.csv"'

    writer = csv.writer(response)
    writer.writerow(['Event ID', 'Event Type', 'Target Type', 'Target ID', 'Target Name', 'Actor', 'Role', 'Date & Time', 'Bulk Transaction Code'])

    for ev in visible_qs.order_by('-created_at')[:2000]:
        writer.writerow([
            ev.event_id,
            ev.event_type,
            ev.target_type,
            ev.target_id,
            ev.target_name_snapshot,
            ev.actor_name_snapshot or (ev.actor.username if ev.actor else 'System'),
            ev.actor_role_snapshot,
            ev.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            ev.bulk_transaction.tx_code if ev.bulk_transaction else '',
        ])

    # Record an audit event for the export action itself (Invariant 51 & 73)
    if org:
        try:
            AuditService.record_event(
                organisation=org,
                actor=user,
                event_type='export_data',
                target_type='table' if table_id else 'organisation',
                target_id=int(table_id) if table_id else org.id,
                target_name=f"Audit Export ({visible_qs.count()} events)",
                visibility_scope='INTERNAL_ADMIN',
            )
        except Exception:
            pass

    return response
