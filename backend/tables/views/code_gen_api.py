"""
API endpoint for generating QR Codes and Barcodes on ID Cards.
"""
import json
import logging
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from core.services.permission_service import api_require_permission
from tables.models import Table
from tables.services.code_generation_service import CodeGenerationService
from tables.views.helpers import _safe_error, _check_client_scope_by_table

logger = logging.getLogger(__name__)


@require_http_methods(['POST'])
@api_require_permission('perm_idcard_edit')
def api_table_generate_codes(request, table_id: int):
    """
    Generate QR Codes and Barcodes for cards in the specified table.
    Payload (optional):
        - card_ids: List[int] (if not provided, generates for all active cards)
        - field_name: str (if provided, generates for this specific code field only)
    """
    # Multi-tenant and permission scope check
    table, scope_err = _check_client_scope_by_table(request.user, table_id)
    if scope_err:
        return scope_err

    card_ids = None
    field_name = None

    if request.body and request.body.strip():
        try:
            body = json.loads(request.body.decode('utf-8') if isinstance(request.body, bytes) else request.body)
            if isinstance(body.get('card_ids'), list):
                card_ids = [int(cid) for cid in body['card_ids'] if str(cid).isdigit()]
            if body.get('field_name'):
                field_name = str(body['field_name']).strip()
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            pass
        except Exception as parse_err:
            logger.debug("Failed to parse generate-codes request body: %s", parse_err)

    try:
        result = CodeGenerationService.generate_codes_for_table(
            table_id=table.id,
            card_ids=card_ids,
            field_name=field_name,
        )
        return JsonResponse(result, status=200)
    except Exception as exc:
        logger.exception("Error generating codes for table %s: %s", table_id, exc)
        return _safe_error(exc, "Failed to generate codes")
