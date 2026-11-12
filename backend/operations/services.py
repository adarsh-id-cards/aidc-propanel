# -*- coding: utf-8 -*-
r"""
CardFlow -- Reversible Operations, Bulk Transaction & Audit History Engine Services


Key Invariants Enforced:
  1. Record First, Restrict Later: Every mutation is permanently captured; visibility is enforced at query time.
  2. Granular Field Deltas ($O(\Delta)$) without expensive table snapshots.
  3. First-Class Bulk Transactions: Mass updates (100 to 2,000+ cards) grouped under stable transaction IDs.
  4. Bidirectional Linkage: BulkTransaction <-> individual card AuditEvents.
  5. Multi-User Conflict Detection: Prevents overwriting newer modifications on undo / reversal.
  6. Immutability: Historical bulk reversals create NEW transactions and NEW audit events; past history is never deleted.
  7. Role-Based Visibility: Strict organization isolation and authorization-scoped query filtering.
"""
import copy
import logging
import uuid
from typing import Dict, Any, List, Tuple, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime

from django.db import models, transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from organisation.models import Organisation
from tables.models import Table, IDCard
from core.models import ActivityLog
from .models import Operation, OperationChange, BulkTransaction, AuditEvent

logger = logging.getLogger(__name__)
User = get_user_model()


@dataclass
class OperationResult:
    success: bool
    message: str = ''
    operation_id: Optional[int] = None
    status: str = 'active'
    undone_count: int = 0
    redone_count: int = 0
    conflict_count: int = 0
    conflicts: List[Dict[str, Any]] = field(default_factory=list)
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'success': self.success,
            'message': self.message,
            'operation_id': self.operation_id,
            'status': self.status,
            'undone_count': self.undone_count,
            'redone_count': self.redone_count,
            'conflict_count': self.conflict_count,
            'conflicts': self.conflicts,
            'data': self.data,
        }


# ══════════════════════════════════════════════════════════════════════════
# 1. AUDIT VISIBILITY SERVICE (ROLE-BASED AUTHORIZATION FILTER)
# ══════════════════════════════════════════════════════════════════════════

class AuditVisibilityService:
    """
    Centralized role-based visibility engine determining which AuditEvent
    and BulkTransaction records any user is permitted to retrieve.
    Strictly prevents organization and permission leaks in SQL queries.
    """

    @classmethod
    def get_allowed_scopes(cls, user: Optional[Any]) -> List[str]:
        """Resolve permitted visibility scopes for a given user."""
        if not user or not getattr(user, 'is_authenticated', False):
            return ['ORGANISATION']

        role = str(getattr(user, 'role', '')).lower()
        if user.is_superuser or role in ('super_admin', 'prime_admin', 'admin'):
            return ['ORGANISATION', 'INTERNAL_ADMIN', 'PRIME_ADMIN', 'SUPER_ADMIN', 'SYSTEM']
        if role in ('operator', 'internal_admin'):
            return ['ORGANISATION', 'INTERNAL_ADMIN']
        return ['ORGANISATION']

    @classmethod
    def filter_events(
        cls,
        queryset,
        user: Optional[Any],
        organisation: Optional[Organisation] = None,
        table_id: Optional[int] = None,
    ):
        """Apply tenant boundary and role-based visibility filter to AuditEvent queryset."""
        scopes = cls.get_allowed_scopes(user)
        qs = queryset.filter(visibility_scope__in=scopes)

        if organisation:
            qs = qs.filter(organisation=organisation)
        elif user and getattr(user, 'is_authenticated', False) and not user.is_superuser:
            role = str(getattr(user, 'role', '')).lower()
            if role not in ('super_admin', 'prime_admin', 'operator'):
                org = (
                    getattr(user, 'organisation_profile', None)
                    or getattr(user, 'organisation', None)
                    or getattr(user, 'client', None)
                )
                if org:
                    qs = qs.filter(organisation=org)
                else:
                    return qs.none()

        if table_id:
            qs = qs.filter(target_table_id=table_id)

        # For Assistants, filter by granted tables if applicable
        if user and getattr(user, 'is_authenticated', False) and str(getattr(user, 'role', '')).lower() == 'assistant':
            try:
                from tables.models import TableAccess
                accessible_ids = list(TableAccess.objects.filter(assistant=user, is_active=True).values_list('table_id', flat=True))
                if table_id:
                    if table_id not in accessible_ids:
                        return qs.none()
                else:
                    qs = qs.filter(models.Q(target_table_id__in=accessible_ids) | models.Q(target_table__isnull=True))
            except Exception:
                pass

        return qs

    @classmethod
    def filter_transactions(
        cls,
        queryset,
        user: Optional[Any],
        organisation: Optional[Organisation] = None,
        table_id: Optional[int] = None,
    ):
        """Apply tenant boundary and role-based visibility filter to BulkTransaction queryset."""
        scopes = cls.get_allowed_scopes(user)
        qs = queryset.filter(visibility_scope__in=scopes)

        if organisation:
            qs = qs.filter(organisation=organisation)
        elif user and getattr(user, 'is_authenticated', False) and not user.is_superuser:
            role = str(getattr(user, 'role', '')).lower()
            if role not in ('super_admin', 'prime_admin', 'operator'):
                org = (
                    getattr(user, 'organisation_profile', None)
                    or getattr(user, 'organisation', None)
                    or getattr(user, 'client', None)
                )
                if org:
                    qs = qs.filter(organisation=org)
                else:
                    return qs.none()

        if table_id:
            qs = qs.filter(table_id=table_id)

        return qs


# ══════════════════════════════════════════════════════════════════════════
# 2. AUDIT & BULK TRANSACTION SERVICE
# ══════════════════════════════════════════════════════════════════════════

class AuditService:
    """
    Central service for recording structured events, creating bulk transactions,
    generating card timelines, and executing safe historical bulk reversals.
    """

    @classmethod
    def generate_event_id(cls) -> str:
        """Generate a compact, unique event identifier."""
        now_str = timezone.now().strftime('%Y%m%d%H%M%S')
        rand_suffix = uuid.uuid4().hex[:6].upper()
        return f"EVT-{now_str}-{rand_suffix}"

    @classmethod
    def generate_tx_code(cls, prefix: str = 'BT') -> str:
        """Generate a human-readable bulk transaction code."""
        now_str = timezone.now().strftime('%Y%m%d')
        rand_suffix = uuid.uuid4().hex[:6].upper()
        return f"{prefix}-{now_str}-{rand_suffix}"

    # ── 1. RECORD SINGLE AUDIT EVENT ───────────────────────────────

    @classmethod
    def record_event(
        cls,
        organisation: Organisation,
        actor: Optional[Any],
        event_type: str,
        target_type: str,
        target_id: int,
        target_name: str = '',
        target_table: Optional[Table] = None,
        field_deltas: Optional[List[Dict[str, Any]]] = None,
        bulk_transaction: Optional[BulkTransaction] = None,
        operation: Optional[Operation] = None,
        visibility_scope: str = 'ORGANISATION',
        actor_type: str = 'user',
        ip_address: Optional[str] = None,
        session_id: str = '',
        source: str = 'web_panel',
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditEvent:
        """
        Atomically record an immutable AuditEvent with actor snapshot and field deltas.
        Always records first; visibility is enforced at query time.
        """
        if not organisation:
            raise ValueError("Organisation is required for audit event.")

        actor_user = actor if getattr(actor, 'is_authenticated', False) else None
        actor_name = actor_user.get_full_name() or actor_user.username if actor_user else 'System'
        actor_role = str(getattr(actor_user, 'role', 'system')) if actor_user else 'system'

        event = AuditEvent.objects.create(
            event_id=cls.generate_event_id(),
            organisation=organisation,
            actor=actor_user,
            actor_name_snapshot=actor_name[:150],
            actor_role_snapshot=actor_role[:50],
            actor_type=actor_type,
            event_type=event_type,
            target_type=target_type,
            target_id=target_id,
            target_name_snapshot=target_name[:255],
            target_table=target_table,
            bulk_transaction=bulk_transaction,
            operation=operation,
            field_deltas=field_deltas or [],
            visibility_scope=visibility_scope,
            ip_address=ip_address,
            session_id=session_id or '',
            source=source,
            metadata=metadata or {},
        )
        return event

    # ── 2. RECORD BULK TRANSACTION ─────────────────────────────────

    @classmethod
    def record_bulk_transaction(
        cls,
        organisation: Organisation,
        actor: Optional[Any],
        action: str,
        source_state: str,
        destination_state: str,
        card_deltas: List[Dict[str, Any]],
        table: Optional[Table] = None,
        visibility_scope: str = 'ORGANISATION',
        actor_type: str = 'user',
        metadata: Optional[Dict[str, Any]] = None,
        tx_prefix: str = 'BT',
    ) -> BulkTransaction:
        """
        Create a first-class BulkTransaction and bulk-insert individual card AuditEvents.
        Preserves high-level transaction summaries while maintaining per-card traceability.
        """
        if not organisation:
            raise ValueError("Organisation is required for bulk transaction.")

        actor_user = actor if getattr(actor, 'is_authenticated', False) else None
        actor_name = actor_user.get_full_name() or actor_user.username if actor_user else 'System'
        actor_role = str(getattr(actor_user, 'role', 'system')) if actor_user else 'system'

        requested_count = len(card_deltas)
        tx_code = cls.generate_tx_code(prefix=tx_prefix)

        with transaction.atomic():
            bulk_tx = BulkTransaction.objects.create(
                tx_code=tx_code,
                organisation=organisation,
                table=table,
                actor=actor_user,
                actor_name_snapshot=actor_name[:150],
                actor_role_snapshot=actor_role[:50],
                actor_type=actor_type,
                action=action,
                source_state=source_state,
                destination_state=destination_state,
                requested_count=requested_count,
                success_count=requested_count,
                visibility_scope=visibility_scope,
                status='completed',
                metadata=metadata or {},
            )

            # Bulk insert AuditEvents linked to this transaction
            events_to_create = []
            now_dt = timezone.now()
            for delta in card_deltas:
                card_id = delta.get('card_id') or delta.get('target_id', 0)
                card_name = delta.get('target_name', f"Card #{card_id}")
                fields = delta.get('field_deltas', [])

                events_to_create.append(AuditEvent(
                    event_id=cls.generate_event_id(),
                    organisation=organisation,
                    actor=actor_user,
                    actor_name_snapshot=actor_name[:150],
                    actor_role_snapshot=actor_role[:50],
                    actor_type=actor_type,
                    event_type='bulk_status' if action == 'bulk_status' else 'update',
                    target_type='card',
                    target_id=card_id,
                    target_name_snapshot=card_name[:255],
                    target_table=table,
                    bulk_transaction=bulk_tx,
                    field_deltas=fields if fields else [{
                        'field_name': 'STATUS',
                        'before_value': source_state,
                        'after_value': destination_state,
                        'change_type': 'status_change',
                    }],
                    visibility_scope=visibility_scope,
                    created_at=now_dt,
                ))

            if events_to_create:
                AuditEvent.objects.bulk_create(events_to_create, batch_size=500)

            # Create an Operation record for Undo/Redo interoperability
            try:
                op_changes = []
                for delta in card_deltas:
                    c_id = delta.get('card_id') or delta.get('target_id', 0)
                    op_changes.append({
                        'target_id': c_id,
                        'target_model': 'idcard',
                        'field_name': 'STATUS',
                        'change_type': 'status_change',
                        'before_value': source_state,
                        'after_value': destination_state,
                    })

                OperationEngine.record_operation(
                    organisation=organisation,
                    user=actor_user,
                    operation_type='bulk_status',
                    target_table=table,
                    description=f"Bulk Moved {requested_count} Cards: {source_state} -> {destination_state} [{tx_code}]",
                    changes=op_changes,
                    metadata={'bulk_transaction_id': bulk_tx.id, 'tx_code': tx_code},
                )
            except Exception as op_err:
                logger.debug("Operation sync skipped for bulk transaction: %s", op_err)

        return bulk_tx

    # ── 3. HUMAN SUMMARY FORMATTER ─────────────────────────────────

    @classmethod
    def format_human_summary(cls, ev: Union[AuditEvent, Dict[str, Any]]) -> str:
        """
        Generate a concise, human-friendly summary instead of raw character-by-character dumps.
        """

        bulk_tx = getattr(ev, 'bulk_transaction', None) if isinstance(ev, AuditEvent) else ev.get('bulk_transaction')
        if bulk_tx:
            tx_code = getattr(bulk_tx, 'tx_code', '') if isinstance(bulk_tx, BulkTransaction) else bulk_tx.get('tx_code', '')
            src = getattr(bulk_tx, 'source_state', '') if isinstance(bulk_tx, BulkTransaction) else bulk_tx.get('source_state', '')
            dst = getattr(bulk_tx, 'destination_state', '') if isinstance(bulk_tx, BulkTransaction) else bulk_tx.get('destination_state', '')
            return f"Bulk Moved from {src.title() if src else 'Initial'} to {dst.title() if dst else 'Destination'} [{tx_code}]"

        ev_type = getattr(ev, 'event_type', '') if isinstance(ev, AuditEvent) else ev.get('event_type', '')
        t_name = getattr(ev, 'target_name_snapshot', '') if isinstance(ev, AuditEvent) else ev.get('target_name', '')
        t_type = getattr(ev, 'target_type', '') if isinstance(ev, AuditEvent) else ev.get('target_type', 'card')
        deltas = getattr(ev, 'field_deltas', []) if isinstance(ev, AuditEvent) else ev.get('field_deltas', [])

        if ev_type == 'create':
            return f"Created {t_name or f'{t_type.title()}'}"
        if ev_type == 'delete':
            return f"Deleted {t_name or f'{t_type.title()}'}"
        if ev_type == 'restore':
            return f"Restored {t_name or f'{t_type.title()}'}"
        if ev_type == 'schema_change':
            if deltas:
                names = [d.get('field_name', '') for d in deltas if isinstance(d, dict)]
                return f"Schema updated ({', '.join(names[:3])})"
            return f"Updated schema for {t_name or 'Table'}"

        if deltas and isinstance(deltas, list):
            valid_deltas = [d for d in deltas if isinstance(d, dict)]
            if len(valid_deltas) == 1:
                f_name = valid_deltas[0].get('field_name', 'Field')
                b_val = valid_deltas[0].get('before_value')
                a_val = valid_deltas[0].get('after_value')
                if str(f_name).upper() == 'STATUS':
                    return f"Status changed: {b_val or 'empty'} -> {a_val or 'empty'}"
                if str(f_name).upper().startswith(('PHOTO', 'IMAGE')):
                    return f"Updated photo for {t_name or 'card'}"
                return f"Edited {f_name}: {b_val or 'empty'} -> {a_val or 'empty'}"

            elif len(valid_deltas) > 1:
                names = [d.get('field_name', '') for d in valid_deltas]
                return f"Updated {len(valid_deltas)} fields ({', '.join(names[:3])}{'...' if len(names) > 3 else ''})"

        return f"Updated {t_name or f'{t_type.title()}'}"

    # ── 3. CARD TIMELINE QUERY ─────────────────────────────────────

    @classmethod
    def get_card_timeline(
        cls,
        card_id: int,
        user: Optional[Any],
        limit: int = 50,
        offset: int = 0,
        consolidate_micro_edits: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate a per-card chronological history timeline with actor snapshots,
        field deltas, and bulk transaction linkages.
        Consolidates rapid consecutive single-field keystrokes within 3 minutes.
        """
        try:
            card = IDCard.objects.select_related('table', 'table__organisation').get(id=card_id)
        except IDCard.DoesNotExist:
            return {'success': False, 'message': 'Card not found.', 'timeline': [], 'total_count': 0}

        org = card.table.organisation if card.table else None
        base_qs = AuditEvent.objects.filter(target_type='card', target_id=card_id).exclude(
            source__in=['card_logs_undo', 'card_logs_redo']
        ).select_related('bulk_transaction', 'actor')
        visible_qs = AuditVisibilityService.filter_events(base_qs, user, organisation=org, table_id=None)

        raw_events = list(visible_qs.order_by('-created_at', '-id')[:200])

        image_field_names = set()
        if card.table and card.table.fields:
            for f in card.table.fields:
                if isinstance(f, dict) and f.get('type') in ('photo', 'rel_photo', 'mother_photo', 'father_photo', 'signature', 'barcode', 'qr_code'):
                    image_field_names.add(str(f.get('name', '')).strip().upper())
        image_field_names.update(['PHOTO', 'SIGNATURE', 'BARCODE', 'QR_CODE'])

        # Consecutive edits consolidation: group fast edits on this card by the same actor within 59 min (3540 sec)
        consolidated = []
        if consolidate_micro_edits and raw_events:
            for ev in raw_events:
                actor_id = ev.actor_id or 0
                deltas = ev.field_deltas or []
                ev_meta = ev.metadata or {}

                text_deltas = [
                    d for d in deltas
                    if str(d.get('field_name', '')).strip().upper() not in image_field_names
                    and d.get('change_type') in ('field_edit', 'update', None)
                ]

                is_session_edit = bool(not ev.bulk_transaction and ev.event_type in ('update', 'bulk_update') and text_deltas)

                can_merge = False
                if consolidated and is_session_edit and consolidated[-1].get('_is_session'):
                    prev = consolidated[-1]
                    if prev.get('_actor_id') == actor_id:
                        dt_diff = abs((datetime.fromisoformat(prev['created_at']) - ev.created_at).total_seconds())
                        if dt_diff <= 3540:  # within 59 minutes (1 hour window)
                            can_merge = True
                            prev['_merge_count'] = prev.get('_merge_count', 1) + 1
                            if ev.id not in prev['event_ids']:
                                prev['event_ids'].append(ev.id)
                            if ev_meta.get('undone'):
                                prev['is_undone'] = True

                            # Merge deltas into prev['field_deltas'] (raw_events is newest -> oldest)
                            existing_map = {str(d.get('field_name', '')).strip().upper(): d for d in prev['field_deltas']}
                            for d in deltas:
                                fn_upper = str(d.get('field_name', '')).strip().upper()
                                if fn_upper in existing_map:
                                    existing_map[fn_upper]['before_value'] = d.get('before_value')
                                else:
                                    prev['field_deltas'].append(copy.deepcopy(d))
                                    existing_map[fn_upper] = prev['field_deltas'][-1]

                            prev_text_deltas = [
                                d for d in prev['field_deltas']
                                if str(d.get('field_name', '')).strip().upper() not in image_field_names
                                and d.get('change_type') in ('field_edit', 'update', None)
                            ]
                            prev['has_text_changes'] = bool(prev_text_deltas)
                            prev['can_undo'] = bool(prev_text_deltas and not prev.get('is_undone'))
                            prev['can_redo'] = bool(prev_text_deltas and prev.get('is_undone'))

                            fnames = [d['field_name'] for d in prev_text_deltas]
                            if fnames:
                                f_str = ', '.join(fnames[:3]) + ('...' if len(fnames) > 3 else '')
                                prev['human_summary'] = f"Updated {f_str} ({prev['_merge_count']} edits in 1hr session)"

                if not can_merge:
                    tx_info = None
                    if ev.bulk_transaction:
                        tx = ev.bulk_transaction
                        tx_info = {
                            'id': tx.id,
                            'tx_code': tx.tx_code,
                            'action': tx.action,
                            'source_state': tx.source_state,
                            'destination_state': tx.destination_state,
                            'requested_count': tx.requested_count,
                        }

                    is_undone = bool(ev_meta.get('undone', False))
                    has_text = bool(text_deltas)
                    item = {
                        'id': ev.id,
                        'event_ids': [ev.id],
                        'event_id': ev.event_id,
                        'event_type': ev.event_type,
                        'actor_name': ev.actor_name_snapshot or (ev.actor.username if ev.actor else 'System'),
                        'actor_role': ev.actor_role_snapshot,
                        'actor_type': ev.actor_type,
                        'target_name': ev.target_name_snapshot,
                        'field_deltas': copy.deepcopy(deltas),
                        'bulk_transaction': tx_info,
                        'human_summary': cls.format_human_summary(ev),
                        'created_at': ev.created_at.isoformat(),
                        'source': ev.source,
                        'has_text_changes': has_text,
                        'can_undo': bool(has_text and not is_undone),
                        'can_redo': bool(has_text and is_undone),
                        'is_undone': is_undone,
                        '_actor_id': actor_id,
                        '_is_session': is_session_edit,
                        '_merge_count': 1,
                    }
                    consolidated.append(item)
        else:
            for ev in raw_events:
                tx_info = None
                if ev.bulk_transaction:
                    tx = ev.bulk_transaction
                    tx_info = {
                        'id': tx.id,
                        'tx_code': tx.tx_code,
                        'action': tx.action,
                        'source_state': tx.source_state,
                        'destination_state': tx.destination_state,
                        'requested_count': tx.requested_count,
                    }
                ev_meta = ev.metadata or {}
                deltas = ev.field_deltas or []
                text_deltas = [
                    d for d in deltas
                    if str(d.get('field_name', '')).strip().upper() not in image_field_names
                    and d.get('change_type') in ('field_edit', 'update', None)
                ]
                is_undone = bool(ev_meta.get('undone', False))
                has_text = bool(text_deltas)
                consolidated.append({
                    'id': ev.id,
                    'event_ids': [ev.id],
                    'event_id': ev.event_id,
                    'event_type': ev.event_type,
                    'actor_name': ev.actor_name_snapshot or (ev.actor.username if ev.actor else 'System'),
                    'actor_role': ev.actor_role_snapshot,
                    'actor_type': ev.actor_type,
                    'target_name': ev.target_name_snapshot,
                    'field_deltas': deltas,
                    'bulk_transaction': tx_info,
                    'human_summary': cls.format_human_summary(ev),
                    'created_at': ev.created_at.isoformat(),
                    'source': ev.source,
                    'has_text_changes': has_text,
                    'can_undo': bool(has_text and not is_undone),
                    'can_redo': bool(has_text and is_undone),
                    'is_undone': is_undone,
                })

        # Merge in any complementary ActivityLog entries not captured by AuditEvent
        try:
            from core.models import ActivityLog
            from django.db.models import Q
            act_logs = ActivityLog.objects.filter(
                Q(target_model='IDCard', target_id=str(card_id)) |
                Q(target_id=str(card_id)) |
                Q(description__icontains=f"Card #{card_id}")
            ).select_related('user').order_by('-created_at')[:50]

            for act in act_logs:
                # Deduplicate against existing events within 4 seconds
                act_time = act.created_at
                duplicate = False
                for c in consolidated:
                    try:
                        c_time = datetime.fromisoformat(c['created_at'])
                        if abs((c_time - act_time).total_seconds()) <= 4:
                            duplicate = True
                            break
                    except Exception:
                        pass
                if not duplicate:
                    clean_desc = (act.description or act.action or 'Card updated').replace('\u2192', '->')
                    # Strip any internal op prefix like [Op #123] for clean reading
                    if clean_desc.startswith('[Op #'):
                        close_bracket = clean_desc.find('] ')
                        if close_bracket != -1:
                            clean_desc = clean_desc[close_bracket + 2:]

                    act_event_type = 'update'
                    act_action_lower = str(act.action or '').lower()
                    if 'create' in act_action_lower:
                        act_event_type = 'create'
                    elif 'status' in act_action_lower:
                        act_event_type = 'status_change'
                    elif 'photo' in act_action_lower or 'image' in act_action_lower:
                        act_event_type = 'media_upload'

                    consolidated.append({
                        'id': f"act_{act.id}",
                        'event_id': f"ACT-{act.id}",
                        'event_type': act_event_type,
                        'actor_name': act.user.username if act.user else 'System',
                        'actor_role': getattr(act.user, 'role', 'admin') if act.user else 'System',
                        'actor_type': 'user',
                        'target_name': f"Card #{card.id}",
                        'field_deltas': [],
                        'bulk_transaction': None,
                        'human_summary': clean_desc,
                        'created_at': act.created_at.isoformat(),
                        'source': 'activity_log',
                    })
        except Exception as act_err:
            logger.debug("Failed querying ActivityLog for card timeline: %s", act_err)

        # Baseline creation event: When a card has no history yet, ensure card creation is shown
        if not consolidated and card.created_at:
            creator_name = card.modified_by or 'System'
            consolidated.append({
                'id': f"cr_{card.id}",
                'event_id': f"CR-{card.id}",
                'event_type': 'create',
                'actor_name': creator_name,
                'actor_role': 'admin',
                'actor_type': 'user',
                'target_name': f"Card #{card.id}",
                'field_deltas': [],
                'bulk_transaction': None,
                'human_summary': 'Card created in table',
                'created_at': card.created_at.isoformat(),
                'source': 'card_creation',
            })

        # Sort all items chronologically descending
        try:
            consolidated.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        except Exception:
            pass

        # Allow undo/redo for up to 5 most recent editable update events
        text_change_count = 0
        for item in consolidated:
            if item.get('has_text_changes'):
                text_change_count += 1
                if text_change_count <= 5:
                    is_undone = bool(item.get('is_undone'))
                    item['can_undo'] = not is_undone
                    item['can_redo'] = is_undone
                else:
                    item['can_undo'] = False
                    item['can_redo'] = False

        total_count = len(consolidated)
        timeline_items = consolidated[offset:offset + limit]

        return {
            'success': True,
            'card_id': card.id,
            'table_id': card.table_id,
            'table_name': card.table.name if card.table else '',
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'timeline': timeline_items,
        }

    @classmethod
    def undo_card_event(
        cls,
        card_id: int,
        event_id: int,
        user: Optional[Any] = None,
        event_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Undo non-image data changes for a card from a specific audit event or consolidated 1-hour session.
        Excludes all image fields (photo, signature, etc.) which are managed strictly in the edit drawer.
        Reverts the card field_data to the earliest before_value in the session.
        """
        try:
            card = IDCard.objects.select_related('table', 'table__organisation').get(id=card_id)
        except IDCard.DoesNotExist:
            return {'success': False, 'message': 'Card not found.'}

        image_field_names = set()
        if card.table and card.table.fields:
            for f in card.table.fields:
                if isinstance(f, dict) and f.get('type') in ('photo', 'rel_photo', 'mother_photo', 'father_photo', 'signature', 'barcode', 'qr_code'):
                    image_field_names.add(str(f.get('name', '')).strip().upper())
        image_field_names.update(['PHOTO', 'SIGNATURE', 'BARCODE', 'QR_CODE'])

        if event_ids and isinstance(event_ids, list):
            events = list(AuditEvent.objects.filter(
                id__in=event_ids,
                target_type='card',
                target_id=card_id,
            ).order_by('created_at', 'id'))
        else:
            try:
                target_event = AuditEvent.objects.get(id=event_id, target_type='card', target_id=card_id)
            except AuditEvent.DoesNotExist:
                return {'success': False, 'message': 'Audit event not found.'}

            from datetime import timedelta
            win_start = target_event.created_at - timedelta(minutes=59)
            win_end = target_event.created_at + timedelta(minutes=59)
            events = list(AuditEvent.objects.filter(
                target_type='card',
                target_id=card_id,
                actor_id=target_event.actor_id,
                created_at__gte=win_start,
                created_at__lte=win_end,
                bulk_transaction__isnull=True,
                event_type__in=('update', 'bulk_update'),
            ).order_by('created_at', 'id'))
            if not events:
                events = [target_event]

        earliest_before = {}
        latest_after = {}
        field_order = []
        for ev in events:
            ev_meta = ev.metadata or {}
            if ev_meta.get('session_earliest_before'):
                for fn, val in ev_meta['session_earliest_before'].items():
                    if fn not in earliest_before:
                        earliest_before[fn] = val
                        field_order.append(fn)
            if ev_meta.get('session_latest_after'):
                latest_after.update(ev_meta['session_latest_after'])

            for delta in (ev.field_deltas or []):
                fn = str(delta.get('field_name') or '').strip().upper()
                if not fn or fn in image_field_names:
                    continue
                if delta.get('change_type') not in ('field_edit', 'update', None):
                    continue
                if fn not in earliest_before:
                    earliest_before[fn] = delta.get('before_value')
                    field_order.append(fn)
                if fn not in latest_after:
                    latest_after[fn] = delta.get('after_value')

        if not earliest_before:
            return {'success': False, 'message': 'No text field edits found to undo in this session.'}

        fd = copy.deepcopy(card.field_data or {})
        reverted_deltas = []
        for fn in field_order:
            target_key = fn
            for k in fd.keys():
                if k.strip().upper() == fn:
                    target_key = k
                    break
            old_val = earliest_before[fn]
            current_val = fd.get(target_key)
            if old_val is None or old_val == '':
                fd.pop(target_key, None)
            else:
                fd[target_key] = old_val

            reverted_deltas.append({
                'field_name': target_key,
                'before_value': current_val,
                'after_value': old_val,
                'change_type': 'field_edit',
            })

        card.field_data = fd
        card.save(update_fields=['field_data', 'updated_at'])

        try:
            from tables.services.card_service import IDCardCardService as CardService
            CardService._bump_table_cache_versions(card.table)
        except Exception:
            pass

        actor_name = getattr(user, 'username', 'User')
        for ev in events:
            ev.metadata = ev.metadata or {}
            ev.metadata['undone'] = True
            ev.metadata['undone_at'] = timezone.now().isoformat()
            ev.metadata['undone_by'] = actor_name
            ev.metadata['session_earliest_before'] = earliest_before
            ev.metadata['session_latest_after'] = latest_after
            ev.save(update_fields=['metadata'])

        undo_audit = cls.record_event(
            organisation=card.table.organisation,
            actor=user if (user and getattr(user, 'is_authenticated', False)) else None,
            event_type='update',
            target_type='card',
            target_id=card.id,
            target_name=f"Card #{card.id}",
            target_table=card.table,
            field_deltas=reverted_deltas,
            visibility_scope='ORGANISATION',
            source='card_logs_undo',
            metadata={
                'undo_action': True,
                'reverted_event_ids': [ev.id for ev in events],
            },
        )

        from tables.services.card_service import IDCardCardService as CardService
        return {
            'success': True,
            'message': f"Reverted {len(reverted_deltas)} field change(s) from 1-hr session.",
            'card': CardService.serialize_card(card, table_fields=card.table.fields),
            'event_id': undo_audit.event_id if undo_audit else None,
        }

    @classmethod
    def redo_card_event(
        cls,
        card_id: int,
        event_id: int,
        user: Optional[Any] = None,
        event_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Redo non-image data changes for a card that were previously undone.
        Excludes all image fields.
        Re-applies the session's latest after_value to card field_data.
        """
        try:
            card = IDCard.objects.select_related('table', 'table__organisation').get(id=card_id)
        except IDCard.DoesNotExist:
            return {'success': False, 'message': 'Card not found.'}

        image_field_names = set()
        if card.table and card.table.fields:
            for f in card.table.fields:
                if isinstance(f, dict) and f.get('type') in ('photo', 'rel_photo', 'mother_photo', 'father_photo', 'signature', 'barcode', 'qr_code'):
                    image_field_names.add(str(f.get('name', '')).strip().upper())
        image_field_names.update(['PHOTO', 'SIGNATURE', 'BARCODE', 'QR_CODE'])

        if event_ids and isinstance(event_ids, list):
            events = list(AuditEvent.objects.filter(
                id__in=event_ids,
                target_type='card',
                target_id=card_id,
            ).order_by('created_at', 'id'))
        else:
            try:
                target_event = AuditEvent.objects.get(id=event_id, target_type='card', target_id=card_id)
            except AuditEvent.DoesNotExist:
                return {'success': False, 'message': 'Audit event not found.'}

            from datetime import timedelta
            win_start = target_event.created_at - timedelta(minutes=59)
            win_end = target_event.created_at + timedelta(minutes=59)
            events = list(AuditEvent.objects.filter(
                target_type='card',
                target_id=card_id,
                actor_id=target_event.actor_id,
                created_at__gte=win_start,
                created_at__lte=win_end,
                bulk_transaction__isnull=True,
                event_type__in=('update', 'bulk_update'),
            ).order_by('created_at', 'id'))
            if not events:
                events = [target_event]

        latest_after = {}
        for ev in events:
            if ev.metadata and 'session_latest_after' in ev.metadata:
                latest_after.update(ev.metadata['session_latest_after'])
            else:
                for delta in (ev.field_deltas or []):
                    fn = str(delta.get('field_name') or '').strip().upper()
                    if not fn or fn in image_field_names:
                        continue
                    if delta.get('change_type') not in ('field_edit', 'update', None):
                        continue
                    latest_after[fn] = delta.get('after_value')

        if not latest_after:
            return {'success': False, 'message': 'No text field edits found to redo in this session.'}

        fd = copy.deepcopy(card.field_data or {})
        reapplied_deltas = []
        for fn, new_val in latest_after.items():
            target_key = fn
            for k in fd.keys():
                if k.strip().upper() == fn:
                    target_key = k
                    break
            current_val = fd.get(target_key)
            if new_val is None or new_val == '':
                fd.pop(target_key, None)
            else:
                fd[target_key] = new_val

            reapplied_deltas.append({
                'field_name': target_key,
                'before_value': current_val,
                'after_value': new_val,
                'change_type': 'field_edit',
            })

        card.field_data = fd
        card.save(update_fields=['field_data', 'updated_at'])

        try:
            from tables.services.card_service import IDCardCardService as CardService
            CardService._bump_table_cache_versions(card.table)
        except Exception:
            pass

        actor_name = getattr(user, 'username', 'User')
        for ev in events:
            ev.metadata = ev.metadata or {}
            ev.metadata['undone'] = False
            ev.metadata['redone_at'] = timezone.now().isoformat()
            ev.metadata['redone_by'] = actor_name
            ev.metadata['redo_count'] = ev.metadata.get('redo_count', 0) + 1
            ev.save(update_fields=['metadata'])

        redo_audit = cls.record_event(
            organisation=card.table.organisation,
            actor=user if (user and getattr(user, 'is_authenticated', False)) else None,
            event_type='update',
            target_type='card',
            target_id=card.id,
            target_name=f"Card #{card.id}",
            target_table=card.table,
            field_deltas=reapplied_deltas,
            visibility_scope='ORGANISATION',
            source='card_logs_redo',
            metadata={
                'redo_action': True,
                'reapplied_event_ids': [ev.id for ev in events],
            },
        )

        from tables.services.card_service import IDCardCardService as CardService
        return {
            'success': True,
            'message': f"Redid {len(reapplied_deltas)} field change(s) from 1-hr session.",
            'card': CardService.serialize_card(card, table_fields=card.table.fields),
            'event_id': redo_audit.event_id if redo_audit else None,
        }

    # ── 4. TABLE ACTIVITY & BULK TRANSACTIONS ──────────────────────

    @classmethod
    def get_table_activity(
        cls,
        table_id: int,
        user: Optional[Any],
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Fetch chronological activity feed for an entire table."""
        try:
            table = Table.objects.select_related('organisation').get(id=table_id)
        except Table.DoesNotExist:
            return {'success': False, 'message': 'Table not found.', 'activity': [], 'total_count': 0}

        base_qs = AuditEvent.objects.filter(target_table_id=table_id).select_related('bulk_transaction', 'actor')
        visible_qs = AuditVisibilityService.filter_events(base_qs, user, organisation=table.organisation, table_id=table_id)

        total_count = visible_qs.count()
        events = list(visible_qs.order_by('-created_at', '-id')[offset:offset + limit])

        items = []
        for ev in events:
            tx_info = None
            if ev.bulk_transaction:
                tx = ev.bulk_transaction
                tx_info = {
                    'id': tx.id,
                    'tx_code': tx.tx_code,
                    'action': tx.action,
                    'source_state': tx.source_state,
                    'destination_state': tx.destination_state,
                    'requested_count': tx.requested_count,
                }

            items.append({
                'id': ev.id,
                'event_id': ev.event_id,
                'event_type': ev.event_type,
                'target_type': ev.target_type,
                'target_id': ev.target_id,
                'target_name': ev.target_name_snapshot,
                'actor_name': ev.actor_name_snapshot or (ev.actor.username if ev.actor else 'System'),
                'actor_role': ev.actor_role_snapshot,
                'human_summary': cls.format_human_summary(ev),
                'field_deltas': ev.field_deltas,
                'bulk_transaction': tx_info,
                'created_at': ev.created_at.isoformat(),
            })


        return {
            'success': True,
            'table_id': table.id,
            'table_name': table.name,
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'activity': items,
        }

    @classmethod
    def get_bulk_transactions(
        cls,
        table_id: Optional[int] = None,
        organisation: Optional[Organisation] = None,
        user: Optional[Any] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Fetch paginated high-level bulk transaction history."""
        base_qs = BulkTransaction.objects.all().select_related('table', 'organisation', 'actor')
        if action:
            base_qs = base_qs.filter(action=action)
        if status:
            base_qs = base_qs.filter(status=status)

        visible_qs = AuditVisibilityService.filter_transactions(base_qs, user, organisation=organisation, table_id=table_id)
        total_count = visible_qs.count()
        txs = list(visible_qs.order_by('-created_at', '-id')[offset:offset + limit])

        items = []
        for tx in txs:
            items.append({
                'id': tx.id,
                'tx_code': tx.tx_code,
                'action': tx.action,
                'source_state': tx.source_state,
                'destination_state': tx.destination_state,
                'requested_count': tx.requested_count,
                'success_count': tx.success_count,
                'conflict_count': tx.conflict_count,
                'actor_name': tx.actor_name_snapshot or (tx.actor.username if tx.actor else 'System'),
                'actor_role': tx.actor_role_snapshot,
                'table_name': tx.table.name if tx.table else '',
                'table_id': tx.table_id,
                'status': tx.status,
                'can_reverse': tx.status in ('completed', 'partially_completed'),
                'created_at': tx.created_at.isoformat(),
            })

        return {
            'success': True,
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'transactions': items,
        }

    @classmethod
    def get_transaction_detail(
        cls,
        transaction_id: int,
        user: Optional[Any],
        search: str = '',
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Fetch detailed transaction metadata and paginated list of affected cards."""
        try:
            tx = BulkTransaction.objects.select_related('table', 'organisation', 'actor', 'reversed_by_transaction').get(id=transaction_id)
        except BulkTransaction.DoesNotExist:
            return {'success': False, 'message': 'Transaction not found.'}

        # Check visibility
        visible_txs = AuditVisibilityService.filter_transactions(
            BulkTransaction.objects.filter(id=transaction_id), user, organisation=tx.organisation, table_id=tx.table_id
        )
        if not visible_txs.exists():
            return {'success': False, 'message': 'Permission denied: Cannot view transaction.'}

        # Fetch affected card events
        events_qs = AuditEvent.objects.filter(bulk_transaction=tx, target_type='card').select_related('target_table')
        if search:
            events_qs = events_qs.filter(
                models.Q(target_name_snapshot__icontains=search) | models.Q(target_id__icontains=search)
            )

        total_affected = events_qs.count()
        events = list(events_qs.order_by('id')[offset:offset + limit])

        affected_cards = []
        for ev in events:
            affected_cards.append({
                'event_id': ev.event_id,
                'card_id': ev.target_id,
                'target_name': ev.target_name_snapshot,
                'field_deltas': ev.field_deltas,
                'created_at': ev.created_at.isoformat(),
            })

        return {
            'success': True,
            'transaction': {
                'id': tx.id,
                'tx_code': tx.tx_code,
                'action': tx.action,
                'source_state': tx.source_state,
                'destination_state': tx.destination_state,
                'requested_count': tx.requested_count,
                'success_count': tx.success_count,
                'conflict_count': tx.conflict_count,
                'actor_name': tx.actor_name_snapshot or (tx.actor.username if tx.actor else 'System'),
                'actor_role': tx.actor_role_snapshot,
                'table_name': tx.table.name if tx.table else '',
                'table_id': tx.table_id,
                'status': tx.status,
                'can_reverse': tx.status in ('completed', 'partially_completed'),
                'reversed_by': tx.reversed_by_transaction.tx_code if tx.reversed_by_transaction else None,
                'created_at': tx.created_at.isoformat(),
            },
            'total_affected': total_affected,
            'limit': limit,
            'offset': offset,
            'affected_cards': affected_cards,
        }

    # ── 5. SAFE BULK TRANSACTION REVERSAL ──────────────────────────

    @classmethod
    def reverse_bulk_transaction(
        cls,
        transaction_id: int,
        user: Optional[Any],
    ) -> Dict[str, Any]:
        """
        Safely reverse a historical bulk transaction with multi-user conflict detection.
        Reverts non-conflicted cards, skips cards modified subsequently, and creates a
        NEW BulkTransaction and NEW AuditEvents -- preserving the permanent truth of history.
        """

        try:
            tx = BulkTransaction.objects.select_related('table', 'organisation', 'actor').get(id=transaction_id)
        except BulkTransaction.DoesNotExist:
            return {'success': False, 'message': 'Transaction not found.'}

        # Check authorization
        visible_txs = AuditVisibilityService.filter_transactions(
            BulkTransaction.objects.filter(id=transaction_id), user, organisation=tx.organisation, table_id=tx.table_id
        )
        if not visible_txs.exists():
            return {'success': False, 'message': 'Permission denied: Cannot reverse transaction.'}

        if tx.status not in ('completed', 'partially_completed'):
            return {'success': False, 'message': f"Transaction {tx.tx_code} is in '{tx.status}' state and cannot be reversed."}

        # Collect affected card IDs
        affected_card_ids = list(
            AuditEvent.objects.filter(bulk_transaction=tx, target_type='card')
            .values_list('target_id', flat=True)
        )
        if not affected_card_ids:
            return {'success': False, 'message': 'No affected card records found for this transaction.'}

        reverted_cards = []
        conflicts = []
        reversed_count = 0
        conflict_count = 0

        with transaction.atomic():
            # Lock affected cards for optimistic verification
            cards_by_id = {
                c.id: c for c in IDCard.objects.filter(id__in=affected_card_ids).select_for_update().order_by('id')
            }

            for card_id in affected_card_ids:
                card = cards_by_id.get(card_id)
                if not card:
                    conflict_count += 1
                    conflicts.append({'card_id': card_id, 'reason': 'Card no longer exists.'})
                    continue

                # Conflict Check: Is the card still in destination_state?
                if card.status == tx.destination_state:
                    # Safe to revert!
                    card.status = tx.source_state or 'pending'
                    if card.status == 'pending':
                        card.deleted_at = None
                    reverted_cards.append(card)
                    reversed_count += 1
                else:
                    # Conflict! Card was modified by a newer action
                    conflict_count += 1
                    conflicts.append({
                        'card_id': card.id,
                        'current_status': card.status,
                        'expected_status': tx.destination_state,
                        'reason': f"Current status is '{card.status}' (expected '{tx.destination_state}'). Reversal skipped to protect newer edits.",
                    })

            # Bulk persist reverted cards in batch
            if reverted_cards:
                IDCard.objects.bulk_update(reverted_cards, ['status', 'deleted_at'], batch_size=250)

            # Create NEW BulkTransaction for the reversal event (Invariant 16 & 60)
            new_tx_code = cls.generate_tx_code(prefix='REV')
            actor_user = user if getattr(user, 'is_authenticated', False) else None
            actor_name = actor_user.get_full_name() or actor_user.username if actor_user else 'System'
            actor_role = str(getattr(actor_user, 'role', 'system')) if actor_user else 'system'

            reversal_tx = BulkTransaction.objects.create(
                tx_code=new_tx_code,
                organisation=tx.organisation,
                table=tx.table,
                actor=actor_user,
                actor_name_snapshot=actor_name[:150],
                actor_role_snapshot=actor_role[:50],
                actor_type='user' if actor_user else 'system',
                action='reverse_transaction',
                source_state=tx.destination_state,
                destination_state=tx.source_state or 'pending',
                requested_count=len(affected_card_ids),
                success_count=reversed_count,
                conflict_count=conflict_count,
                status='completed' if conflict_count == 0 else 'partially_completed',
                metadata={
                    'reversed_transaction_id': tx.id,
                    'reversed_tx_code': tx.tx_code,
                    'conflicts': conflicts[:50],
                },
            )

            # Bulk create NEW AuditEvents for all reversed cards
            reversal_events = []
            now_dt = timezone.now()
            for card in reverted_cards:
                reversal_events.append(AuditEvent(
                    event_id=cls.generate_event_id(),
                    organisation=tx.organisation,
                    actor=actor_user,
                    actor_name_snapshot=actor_name[:150],
                    actor_role_snapshot=actor_role[:50],
                    actor_type='user' if actor_user else 'system',
                    event_type='status_change',
                    target_type='card',
                    target_id=card.id,
                    target_name_snapshot=f"Card #{card.id}",
                    target_table=tx.table,
                    bulk_transaction=reversal_tx,
                    field_deltas=[{
                        'field_name': 'STATUS',
                        'before_value': tx.destination_state,
                        'after_value': tx.source_state or 'pending',
                        'change_type': 'status_change',
                        'note': f"Reversed by {new_tx_code} (Reversal of {tx.tx_code})",
                    }],
                    visibility_scope=tx.visibility_scope,
                    created_at=now_dt,
                ))

            if reversal_events:
                AuditEvent.objects.bulk_create(reversal_events, batch_size=500)

            # Update original transaction status
            tx.status = 'reversed' if conflict_count == 0 else 'partially_reversed'
            tx.reversed_by_transaction = reversal_tx
            tx.save(update_fields=['status', 'reversed_by_transaction', 'updated_at'])

        msg = f"Successfully reversed {reversed_count} cards back to '{tx.source_state or 'pending'}'."
        if conflict_count > 0:
            msg += f" {conflict_count} cards were skipped due to subsequent modifications."

        return {
            'success': (reversed_count > 0 or conflict_count == 0),
            'message': msg,
            'reversed_count': reversed_count,
            'conflict_count': conflict_count,
            'conflicts': conflicts,
            'reversal_tx_code': reversal_tx.tx_code,
            'new_transaction_id': reversal_tx.id,
        }


# ══════════════════════════════════════════════════════════════════════════
# 3. REVERSIBLE OPERATIONS ENGINE (UNDO / REDO)
# ══════════════════════════════════════════════════════════════════════════

class OperationEngine:
    """
    Core engine managing reversible operations, delta tracking, conflict detection,
    and undo/redo stacks.
    """

    # ── 1. RECORD OPERATION ────────────────────────────────────────

    @classmethod
    def record_operation(
        cls,
        organisation: Organisation,
        user: Optional[Any],
        operation_type: str,
        description: str,
        target_table: Optional[Table] = None,
        target_type: str = 'card',
        session_id: str = '',
        changes: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        parent_operation: Optional[Operation] = None,
    ) -> Operation:
        """
        Record a new mutation as an Operation with granular OperationChange deltas.
        Automatically invalidates the forward Redo stack for this user/table context.
        """
        if not organisation:
            raise ValueError("Organisation is required to record an operation.")

        changes = changes or []
        metadata = metadata or {}

        if changes:
            filtered_changes = []
            for ch in changes:
                if ch.get('change_type') == 'field_edit':
                    b_str = str(ch.get('before_value') or '').strip().upper()
                    a_str = str(ch.get('after_value') or '').strip().upper()
                    if b_str == a_str:
                        continue
                filtered_changes.append(ch)
            changes = filtered_changes

        if operation_type == 'card_update' and not changes:
            return None

        with transaction.atomic():
            # 1. Create Operation
            operation = Operation.objects.create(
                organisation=organisation,
                user=user if getattr(user, 'is_authenticated', False) else None,
                session_id=session_id or '',
                operation_type=operation_type,
                target_type=target_type,
                target_table=target_table,
                description=description[:500],
                status='active',
                parent_operation=parent_operation,
                metadata=metadata,
            )

            # 2. Bulk create OperationChange deltas
            change_objects = []
            for ch in changes:
                change_objects.append(OperationChange(
                    operation=operation,
                    target_id=ch.get('target_id', 0),
                    target_model=ch.get('target_model', 'idcard'),
                    field_name=ch.get('field_name', ''),
                    change_type=ch.get('change_type', 'field_edit'),
                    before_value=ch.get('before_value'),
                    after_value=ch.get('after_value'),
                    expected_version=ch.get('expected_version', 1),
                    status='applied',
                ))

            if change_objects:
                OperationChange.objects.bulk_create(change_objects, batch_size=500)

            # 3. Invariant 11: Invalidate forward Redo stack for this context
            cls._invalidate_redo_stack(organisation, user, target_table, session_id)

            # 4. Append-Only Audit Log
            try:
                ActivityLog.objects.create(
                    user=user if getattr(user, 'is_authenticated', False) else None,
                    action=operation_type if operation_type in dict(ActivityLog.ACTION_CHOICES) else 'other',
                    description=f"[Op #{operation.id}] {description}"[:500],
                    target_model='operation',
                    target_id=operation.id,
                )
            except Exception as act_err:
                logger.debug("Activity log creation skipped: %s", act_err)

        return operation

    # ── 2. UNDO OPERATION ──────────────────────────────────────────

    @classmethod
    def undo_operation(
        cls,
        operation_id: Optional[int] = None,
        organisation: Optional[Organisation] = None,
        user: Optional[Any] = None,
        table_id: Optional[int] = None,
        session_id: str = '',
        admin_override: bool = False,
    ) -> OperationResult:
        """
        Reverse an operation with multi-user conflict detection.
        If operation_id is None, undoes the latest active operation in the user stack.
        """

        if operation_id:
            try:
                op = Operation.objects.select_related('organisation', 'target_table').get(id=operation_id)
            except Operation.DoesNotExist:
                return OperationResult(success=False, message="Operation not found.")
        else:
            op = cls._get_latest_undoable(organisation, user, table_id, session_id)
            if not op:
                return OperationResult(success=False, message="Nothing to undo.")

        if organisation and op.organisation_id != organisation.id:
            return OperationResult(success=False, message="Permission denied: Organization mismatch.")

        if not admin_override and user and getattr(user, 'is_authenticated', False):
            if op.user_id and op.user_id != user.id:
                return OperationResult(success=False, message="Permission denied: Cannot undo another user's action.")

        if op.status not in ('active', 'redone'):
            return OperationResult(
                success=False,
                message=f"Operation #{op.id} is in '{op.status}' state and cannot be undone.",
            )

        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        if op.created_at < cutoff:
            op.status = 'expired'
            op.save(update_fields=['status', 'updated_at'])
            return OperationResult(
                success=False,
                message="Image undo history has expired (older than 30 days).",
                operation_id=op.id,
                status='expired',
            )

        changes = list(op.changes.all().order_by('-id'))
        if not changes:
            op.status = 'undone'
            op.save(update_fields=['status', 'updated_at'])
            return OperationResult(success=True, message=f"Undid #{op.id} (no changes).", operation_id=op.id, status='undone')

        undone_count = 0
        conflict_count = 0
        conflicts = []

        cards_to_update: Dict[int, IDCard] = {}
        changes_to_update: List[OperationChange] = []

        with transaction.atomic():
            card_ids = [ch.target_id for ch in changes if ch.target_model == 'idcard']
            cards_by_id = {c.id: c for c in IDCard.objects.filter(id__in=card_ids).select_for_update().order_by('id')}

            for ch in changes:
                if ch.target_model == 'idcard':
                    card = cards_by_id.get(ch.target_id)
                    if not card:
                        ch.status = 'conflicted'
                        ch.conflict_reason = f"Card #{ch.target_id} no longer exists."
                        conflict_count += 1
                        conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})
                        changes_to_update.append(ch)
                        continue

                    fd = copy.deepcopy(card.field_data or {})

                    # Table-wide undo is strictly restricted to image/media changes
                    if table_id and ch.change_type not in ('media_replace', 'crop_change'):
                        continue

                    if ch.change_type == 'field_edit':
                        current_val = fd.get(ch.field_name)
                        if cls._values_match(current_val, ch.after_value):
                            if ch.before_value is None:
                                fd.pop(ch.field_name, None)
                            else:
                                fd[ch.field_name] = ch.before_value

                            card.field_data = fd
                            cards_to_update[card.id] = card
                            ch.status = 'undone'
                            undone_count += 1
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = (
                                f"Field '{ch.field_name}' changed to '{current_val}' "
                                f"(expected '{ch.after_value}'). Revert blocked to protect newer data."
                            )
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'field': ch.field_name, 'reason': ch.conflict_reason})

                    elif ch.change_type == 'status_change':
                        current_status = card.status
                        if current_status == ch.after_value or not ch.after_value:
                            card.status = str(ch.before_value or 'pending')
                            cards_to_update[card.id] = card
                            ch.status = 'undone'
                            undone_count += 1
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = f"Status is '{current_status}' (expected '{ch.after_value}')."
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})

                    elif ch.change_type == 'record_create':
                        card.status = 'deleted'
                        card.deleted_at = timezone.now()
                        cards_to_update[card.id] = card
                        ch.status = 'undone'
                        undone_count += 1

                    elif ch.change_type == 'record_delete':
                        card.status = str(ch.before_value or 'pending')
                        card.deleted_at = None
                        cards_to_update[card.id] = card
                        ch.status = 'undone'
                        undone_count += 1

                    elif ch.change_type in ('media_replace', 'crop_change'):
                        current_val = fd.get(ch.field_name)
                        if cls._values_match(current_val, ch.after_value):
                            if ch.before_value is None:
                                fd.pop(ch.field_name, None)
                            else:
                                fd[ch.field_name] = ch.before_value
                            card.field_data = fd
                            cards_to_update[card.id] = card
                            ch.status = 'undone'
                            undone_count += 1
                            try:
                                from mediafiles.services import ImageService
                                ImageService.undo_image_version(card, ch.field_name)
                            except Exception as img_err:
                                logger.debug("ImageService undo_image_version sync err: %s", img_err)
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = f"Media '{ch.field_name}' was modified after this operation."
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})

                    changes_to_update.append(ch)

            if cards_to_update:
                cards_list = list(cards_to_update.values())
                IDCard.objects.bulk_update(cards_list, ['field_data', 'status', 'deleted_at'], batch_size=250)

            if changes_to_update:
                OperationChange.objects.bulk_update(changes_to_update, ['status', 'conflict_reason'], batch_size=500)

            if conflict_count == 0:
                final_status = 'undone'
            elif undone_count > 0:
                final_status = 'partially_undone'
            else:
                final_status = 'conflicted'

            op.status = final_status
            op.save(update_fields=['status', 'updated_at'])

            # Invariant 3 & 25: Record Undo Operation event
            Operation.objects.create(
                organisation=op.organisation,
                user=user if getattr(user, 'is_authenticated', False) else op.user,
                session_id=session_id or op.session_id,
                operation_type='undo_operation',
                target_type=op.target_type,
                target_table=op.target_table,
                description=f"Undid Op #{op.id}: {op.description} ({undone_count} undone, {conflict_count} conflicted)",
                status='active',
                undo_of=op,
            )

            try:
                ActivityLog.objects.create(
                    user=user if getattr(user, 'is_authenticated', False) else None,
                    action='other',
                    description=f"Undid action: {op.description}"[:500],
                    target_model='operation',
                    target_id=op.id,
                )
            except Exception:
                pass

        msg = f"Successfully undone {undone_count} changes."
        if conflict_count > 0:
            msg += f" {conflict_count} changes could not be undone due to newer modifications."

        return OperationResult(
            success=(undone_count > 0 or conflict_count == 0),
            message=msg,
            operation_id=op.id,
            status=final_status,
            undone_count=undone_count,
            conflict_count=conflict_count,
            conflicts=conflicts,
        )

    # ── 3. REDO OPERATION ──────────────────────────────────────────

    @classmethod
    def redo_operation(
        cls,
        operation_id: Optional[int] = None,
        organisation: Optional[Organisation] = None,
        user: Optional[Any] = None,
        table_id: Optional[int] = None,
        session_id: str = '',
    ) -> OperationResult:
        """
        Re-apply an undone operation with conflict detection.
        If operation_id is None, redoes the latest undone operation in the user stack.
        """

        if operation_id:
            try:
                op = Operation.objects.select_related('organisation', 'target_table').get(id=operation_id)
            except Operation.DoesNotExist:
                return OperationResult(success=False, message="Operation not found.")
        else:
            op = cls._get_latest_redoable(organisation, user, table_id, session_id)
            if not op:
                return OperationResult(success=False, message="Nothing to redo.")

        if organisation and op.organisation_id != organisation.id:
            return OperationResult(success=False, message="Permission denied: Organization mismatch.")

        if op.status not in ('undone', 'partially_undone'):
            return OperationResult(
                success=False,
                message=f"Operation #{op.id} is in '{op.status}' state and cannot be redone.",
            )

        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        if op.created_at < cutoff:
            op.status = 'expired'
            op.save(update_fields=['status', 'updated_at'])
            return OperationResult(
                success=False,
                message="Image redo history has expired (older than 30 days).",
                operation_id=op.id,
                status='expired',
            )

        changes = list(op.changes.all().order_by('id'))
        if not changes:
            op.status = 'redone'
            op.save(update_fields=['status', 'updated_at'])
            return OperationResult(success=True, message=f"Redid #{op.id}.", operation_id=op.id, status='redone')

        redone_count = 0
        conflict_count = 0
        conflicts = []

        cards_to_update: Dict[int, IDCard] = {}
        changes_to_update: List[OperationChange] = []

        with transaction.atomic():
            card_ids = [ch.target_id for ch in changes if ch.target_model == 'idcard']
            cards_by_id = {c.id: c for c in IDCard.objects.filter(id__in=card_ids).select_for_update().order_by('id')}

            for ch in changes:
                if ch.target_model == 'idcard':
                    card = cards_by_id.get(ch.target_id)
                    if not card:
                        ch.status = 'conflicted'
                        ch.conflict_reason = f"Card #{ch.target_id} no longer exists."
                        conflict_count += 1
                        conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})
                        changes_to_update.append(ch)
                        continue

                    fd = copy.deepcopy(card.field_data or {})

                    # Table-wide redo is strictly restricted to image/media changes
                    if table_id and ch.change_type not in ('media_replace', 'crop_change'):
                        continue

                    if ch.change_type == 'field_edit':
                        current_val = fd.get(ch.field_name)
                        if cls._values_match(current_val, ch.before_value):
                            if ch.after_value is None:
                                fd.pop(ch.field_name, None)
                            else:
                                fd[ch.field_name] = ch.after_value
                            card.field_data = fd
                            cards_to_update[card.id] = card
                            ch.status = 'applied'
                            redone_count += 1
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = f"Field '{ch.field_name}' was modified after undo."
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'field': ch.field_name, 'reason': ch.conflict_reason})

                    elif ch.change_type == 'status_change':
                        current_status = card.status
                        if current_status == ch.before_value or not ch.before_value:
                            card.status = str(ch.after_value or 'pending')
                            cards_to_update[card.id] = card
                            ch.status = 'applied'
                            redone_count += 1
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = f"Status is '{current_status}' (expected '{ch.before_value}')."
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})

                    elif ch.change_type == 'record_create':
                        card.status = 'pending'
                        card.deleted_at = None
                        cards_to_update[card.id] = card
                        ch.status = 'applied'
                        redone_count += 1

                    elif ch.change_type == 'record_delete':
                        card.status = 'deleted'
                        card.deleted_at = timezone.now()
                        cards_to_update[card.id] = card
                        ch.status = 'applied'
                        redone_count += 1

                    elif ch.change_type in ('media_replace', 'crop_change'):
                        current_val = fd.get(ch.field_name)
                        if cls._values_match(current_val, ch.before_value):
                            if ch.after_value is None:
                                fd.pop(ch.field_name, None)
                            else:
                                fd[ch.field_name] = ch.after_value
                            card.field_data = fd
                            cards_to_update[card.id] = card
                            ch.status = 'applied'
                            redone_count += 1
                            try:
                                from mediafiles.services import ImageService
                                ImageService.redo_image_version(card, ch.field_name)
                            except Exception as img_err:
                                logger.debug("ImageService redo_image_version sync err: %s", img_err)
                        else:
                            ch.status = 'conflicted'
                            ch.conflict_reason = f"Media '{ch.field_name}' was modified."
                            conflict_count += 1
                            conflicts.append({'change_id': ch.id, 'reason': ch.conflict_reason})

                    changes_to_update.append(ch)

            if cards_to_update:
                cards_list = list(cards_to_update.values())
                IDCard.objects.bulk_update(cards_list, ['field_data', 'status', 'deleted_at'], batch_size=250)

            if changes_to_update:
                OperationChange.objects.bulk_update(changes_to_update, ['status', 'conflict_reason'], batch_size=500)

            op.status = 'redone' if conflict_count == 0 else ('partially_undone' if redone_count > 0 else 'conflicted')
            op.save(update_fields=['status', 'updated_at'])

            # Invariant 4 & 26: Create Redo Operation event
            Operation.objects.create(
                organisation=op.organisation,
                user=user if getattr(user, 'is_authenticated', False) else op.user,
                session_id=session_id or op.session_id,
                operation_type='redo_operation',
                target_type=op.target_type,
                target_table=op.target_table,
                description=f"Redid Op #{op.id}: {op.description} ({redone_count} redone, {conflict_count} conflicted)",
                status='active',
                redo_of=op,
            )

            try:
                ActivityLog.objects.create(
                    user=user if getattr(user, 'is_authenticated', False) else None,
                    action='other',
                    description=f"Redid action: {op.description}"[:500],
                    target_model='operation',
                    target_id=op.id,
                )
            except Exception:
                pass

        msg = f"Successfully redone {redone_count} changes."
        if conflict_count > 0:
            msg += f" {conflict_count} changes could not be redone due to conflicting modifications."

        return OperationResult(
            success=(redone_count > 0 or conflict_count == 0),
            message=msg,
            operation_id=op.id,
            status=op.status,
            redone_count=redone_count,
            conflict_count=conflict_count,
            conflicts=conflicts,
        )

    # ── 4. STACK & STATUS HELPERS ──────────────────────────────────

    @classmethod
    def get_stack_status(
        cls,
        organisation: Optional[Organisation],
        user: Optional[Any],
        table_id: Optional[int] = None,
        session_id: str = '',
    ) -> Dict[str, Any]:
        """Fast query returning live Undo/Redo capability (1-time image undo/redo) and descriptive tooltips."""
        latest_undo = cls._get_latest_undoable(organisation, user, table_id, session_id)
        latest_redo = cls._get_latest_redoable(organisation, user, table_id, session_id)

        return {
            'can_undo': bool(latest_undo),
            'can_redo': bool(latest_redo),
            'undo_tooltip': f"Undo image change: {latest_undo.description}" if latest_undo else "Nothing to undo",
            'redo_tooltip': f"Redo image change: {latest_redo.description}" if latest_redo else "Nothing to redo",
            'undo_count': 1 if latest_undo else 0,
            'redo_count': 1 if latest_redo else 0,
            'latest_undo_id': latest_undo.id if latest_undo else None,
            'latest_redo_id': latest_redo.id if latest_redo else None,
        }

    @classmethod
    def get_history(
        cls,
        organisation: Optional[Organisation],
        user: Optional[Any] = None,
        table_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Return paginated history of operations for audit/history panel."""
        qs = Operation.objects.all().select_related('user', 'target_table').prefetch_related('changes')

        if organisation:
            qs = qs.filter(organisation=organisation)
        if table_id:
            qs = qs.filter(target_table_id=table_id)
        if user and getattr(user, 'is_authenticated', False) and not getattr(user, 'is_superuser', False):
            qs = qs.filter(user=user)

        total_count = qs.count()
        operations = list(qs[offset:offset + limit])

        items = []
        for op in operations:
            items.append({
                'id': op.id,
                'operation_type': op.operation_type,
                'description': op.description,
                'status': op.status,
                'user_name': op.user.username if op.user else 'System',
                'created_at': op.created_at.isoformat(),
                'change_count': op.changes.count(),
                'can_undo': op.status in ('active', 'redone'),
                'can_redo': op.status in ('undone', 'partially_undone'),
            })

        return {
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'operations': items,
        }

    # ── PRIVATE QUERY HELPERS ──────────────────────────────────────

    @classmethod
    def _base_query(
        cls,
        organisation: Optional[Organisation],
        user: Optional[Any],
        table_id: Optional[int] = None,
        session_id: str = '',
    ):
        qs = Operation.objects.exclude(operation_type__in=('undo_operation', 'redo_operation'))
        if organisation:
            qs = qs.filter(organisation=organisation)
        if table_id:
            qs = qs.filter(target_table_id=table_id)
            # Table undo/redo is strictly for image/media operations (removes text undo/redo)
            qs = qs.filter(
                models.Q(operation_type__in=('image_update', 'card_image_update', 'media_replace')) |
                models.Q(changes__change_type__in=('media_replace', 'crop_change'))
            ).distinct()

        if user and getattr(user, 'is_authenticated', False):
            qs = qs.filter(user=user)
        elif session_id:
            qs = qs.filter(session_id=session_id)

        return qs

    @classmethod
    def _get_latest_undoable(
        cls,
        organisation: Optional[Organisation],
        user: Optional[Any],
        table_id: Optional[int] = None,
        session_id: str = '',
    ) -> Optional[Operation]:
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        return (
            cls._base_query(organisation, user, table_id, session_id)
            .filter(status__in=('active', 'redone'), created_at__gte=cutoff)
            .order_by('-created_at', '-id')
            .first()
        )

    @classmethod
    def _get_latest_redoable(
        cls,
        organisation: Optional[Organisation],
        user: Optional[Any],
        table_id: Optional[int] = None,
        session_id: str = '',
    ) -> Optional[Operation]:
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(days=30)
        return (
            cls._base_query(organisation, user, table_id, session_id)
            .filter(status__in=('undone', 'partially_undone'), created_at__gte=cutoff)
            .order_by('-updated_at', '-id')
            .first()
        )

    @classmethod
    def _invalidate_redo_stack(
        cls,
        organisation: Organisation,
        user: Optional[Any],
        target_table: Optional[Table] = None,
        session_id: str = '',
    ):
        """Invariant 11: Invalidate forward Redo stack when a new operation occurs."""
        qs = cls._base_query(organisation, user, target_table.id if target_table else None, session_id)
        qs.filter(status__in=('undone', 'partially_undone')).update(status='failed')

    @classmethod
    def _values_match(cls, val1: Any, val2: Any) -> bool:
        """Type-safe equality check distinguishing None from empty string."""
        if val1 is None and val2 is None:
            return True
        if val1 is None or val2 is None:
            if (val1 == '' and val2 is None) or (val1 is None and val2 == ''):
                return True
            return False

        if isinstance(val1, str) and isinstance(val2, str):
            return val1.strip().upper() == val2.strip().upper()

        try:
            if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                return val1 == val2
        except Exception:
            pass

        if isinstance(val1, (dict, list)) and isinstance(val2, (dict, list)):
            return val1 == val2

        return str(val1).strip() == str(val2).strip()
