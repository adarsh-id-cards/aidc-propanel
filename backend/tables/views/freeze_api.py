import json
import logging
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from tables.services.freeze_service import TableFreezeService
from tables.views.helpers import _check_client_scope_by_table

logger = logging.getLogger(__name__)


@require_http_methods(["GET"])
def api_table_freeze_info(request, table_id):
    """
    GET /api/table/<table_id>/freeze-info/?status=approved
    Returns freeze status, active boundaries, and default earliest/latest movement timestamps.
    Restricted to superadmins and operators.
    """
    table, err = _check_client_scope_by_table(request.user, table_id)
    if err:
        return err

    if not TableFreezeService.is_admin_or_operator(request.user):
        return JsonResponse({
            'success': False,
            'message': 'Only operators and superadmins can view or manage table freeze.'
        }, status=403)

    status = request.GET.get('status', 'approved')
    info = TableFreezeService.get_freeze_info(table, status, request.user)
    return JsonResponse({'success': True, 'data': info}, status=200)


@require_http_methods(["POST"])
def api_table_freeze_apply(request, table_id):
    """
    POST /api/table/<table_id>/freeze-table/
    Payload: {"status": "approved", "frozen_from": "...", "frozen_to": "..."}
    Freezes table status to isolate current batch of cards.
    """
    table, err = _check_client_scope_by_table(request.user, table_id)
    if err:
        return err

    if not TableFreezeService.is_admin_or_operator(request.user):
        return JsonResponse({
            'success': False,
            'message': 'Only operators and superadmins can freeze tables.'
        }, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = {}

    status = data.get('status', 'approved')
    from_dt_str = data.get('frozen_from')
    to_dt_str = data.get('frozen_to')

    result = TableFreezeService.apply_freeze(table, status, from_dt_str, to_dt_str, request.user)
    if not result.success:
        return JsonResponse({'success': False, 'message': result.message}, status=400)

    return JsonResponse({'success': True, 'data': result.data, 'message': 'Table frozen successfully.'}, status=200)


@require_http_methods(["POST"])
def api_table_freeze_unfreeze(request, table_id):
    """
    POST /api/table/<table_id>/unfreeze-table/
    Payload: {"status": "approved"}
    Unfreezes the table status, allowing new cards to appear immediately.
    """
    table, err = _check_client_scope_by_table(request.user, table_id)
    if err:
        return err

    if not TableFreezeService.is_admin_or_operator(request.user):
        return JsonResponse({
            'success': False,
            'message': 'Only operators and superadmins can unfreeze tables.'
        }, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = {}

    status = data.get('status', 'approved')
    result = TableFreezeService.unfreeze_table(table, status, request.user)
    if not result.success:
        return JsonResponse({'success': False, 'message': result.message}, status=400)

    return JsonResponse({'success': True, 'data': result.data, 'message': 'Table unfrozen successfully.'}, status=200)
