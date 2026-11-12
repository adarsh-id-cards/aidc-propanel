import logging
from datetime import datetime as dt
import datetime as p_datetime
from typing import Optional, Dict, Any, Tuple, List

from django.core.cache import cache
from django.db.models import Min, Max, Q
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_datetime, parse_date
from django.utils.timezone import make_aware, is_naive

from core.services.base import BaseService, ServiceResult
from core.services.permission_service import PermissionService
from tables.models import Table, IDCard, TableFreeze

logger = logging.getLogger(__name__)


class TableFreezeService(BaseService):
    """
    Manages shared table freezing for operator and superadmin batch workflows.
    When a status (e.g. 'approved' or 'download') is frozen, cards moved after
    the frozen_to boundary are hidden from the admin side to avoid batch disruptions.
    """

    CACHE_PREFIX = "table_freeze"
    CACHE_TTL = 300  # 5 minutes

    @classmethod
    def canonical_status(cls, status: Optional[str]) -> str:
        """Normalize status string to canonical storage key."""
        st = str(status or '').strip().lower()
        if st in ('download', 'printed', 'downloaded'):
            return 'download'
        if st in ('pool', 'deleted'):
            return 'pool'
        if st in ('request', 'requested'):
            return 'request'
        return st or 'approved'

    @classmethod
    def is_admin_or_operator(cls, user) -> bool:
        """Check if caller has admin or operator role privilege for freeze actions."""
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if getattr(user, 'is_superuser', False):
            return True
        if PermissionService.is_super_admin(user) or PermissionService.is_prime_admin(user):
            return True
        if PermissionService.is_operator(user) or PermissionService.is_prime_operator(user):
            return True
        role = getattr(user, 'role', '').lower()
        return role in ('super_admin', 'prime_admin', 'operator', 'prime_operator')

    @classmethod
    def _cache_key(cls, table_id: int, status: str) -> str:
        return f"{cls.CACHE_PREFIX}:{table_id}:{cls.canonical_status(status)}"

    @classmethod
    def parse_datetime(cls, val_str: Optional[str], is_end: bool = False) -> Optional[p_datetime.datetime]:
        """Robust parser for ISO/custom datetime strings into timezone-aware datetime."""
        if not val_str:
            return None
        val_clean = str(val_str).strip()
        parsed = parse_datetime(val_clean)
        if not parsed:
            d = parse_date(val_clean)
            if d:
                t = p_datetime.time(23, 59, 59) if is_end else p_datetime.time(0, 0, 0)
                parsed = p_datetime.datetime.combine(d, t)
        if not parsed:
            try:
                parsed = dt.fromisoformat(val_clean)
            except Exception:
                pass
        if parsed and is_naive(parsed):
            parsed = make_aware(parsed)
        return parsed

    @classmethod
    def get_active_freeze(cls, table_id: int, status: str) -> Optional[Dict[str, Any]]:
        """
        Fast cached lookup for active freeze configuration.
        Returns a dict of freeze boundaries or None if table status is not frozen.
        """
        cache_key = cls._cache_key(table_id, status)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached if cached.get('is_frozen') else None

        canon_st = cls.canonical_status(status)
        freeze = TableFreeze.objects.filter(table_id=table_id, status=canon_st, is_frozen=True).first()
        if not freeze:
            cache.set(cache_key, {'is_frozen': False}, cls.CACHE_TTL)
            return None

        data = {
            'id': freeze.id,
            'is_frozen': True,
            'status': freeze.status,
            'frozen_from': freeze.frozen_from.isoformat() if freeze.frozen_from else None,
            'frozen_to': freeze.frozen_to.isoformat() if freeze.frozen_to else None,
            'frozen_by_name': freeze.frozen_by_name or (freeze.frozen_by.username if freeze.frozen_by else 'Admin'),
            'updated_at': freeze.updated_at.isoformat() if freeze.updated_at else None,
        }
        cache.set(cache_key, data, cls.CACHE_TTL)
        return data

    @classmethod
    def invalidate_freeze_cache(cls, table_id: int, status: str):
        """Evict cached freeze info on freeze/unfreeze changes."""
        cache.delete(cls._cache_key(table_id, status))

    @classmethod
    def get_bulk_movement_presets(cls, table: Table, canon_st: str) -> List[Dict[str, Any]]:
        """
        Returns recent bulk movements (where count > 1 cards were moved together)
        for this table and status. Excludes single card actions.
        """
        from datetime import timedelta
        from django.db.models import Count
        from operations.models import BulkTransaction
        presets = []
        seen_dts = []

        # 1. Query BulkTransaction records for this table (success_count > 1)
        dest_states = ['download', 'printed'] if canon_st in ('download', 'printed') else [canon_st]
        bt_qs = BulkTransaction.objects.filter(
            table=table,
            destination_state__in=dest_states,
            success_count__gt=1,
        ).order_by('-created_at')[:5]

        for bt in bt_qs:
            dt = bt.created_at
            seen_dts.append(dt)
            presets.append({
                'id': f'bt_{bt.id}',
                'label': f'Last Bulk Move ({bt.success_count} cards)' if len(presets) == 0 else f'Bulk Batch ({bt.success_count} cards)',
                'count': bt.success_count,
                'from': (dt - timedelta(minutes=1)).isoformat(),
                'to': (dt + timedelta(minutes=1)).isoformat(),
                'created_at': dt.isoformat(),
                'source_state': bt.source_state,
                'destination_state': bt.destination_state,
            })

        # 2. Query IDCard movement timestamp clusters (where count > 1 cards share timestamp)
        time_field = 'downloaded_at' if canon_st in ('download', 'printed') else 'status_changed_at'
        card_clusters = IDCard.objects.filter(
            table=table,
            status__in=['download', 'printed'] if canon_st in ('download', 'printed') else [canon_st],
            **{f'{time_field}__isnull': False}
        ).values(time_field).annotate(cnt=Count('id')).filter(cnt__gt=1).order_by(f'-{time_field}')[:5]

        if not card_clusters and canon_st in ('download', 'printed'):
            card_clusters = IDCard.objects.filter(
                table=table,
                status__in=['download', 'printed'],
                status_changed_at__isnull=False
            ).values('status_changed_at').annotate(cnt=Count('id')).filter(cnt__gt=1).order_by('-status_changed_at')[:5]
            time_field = 'status_changed_at'

        for cluster in card_clusters:
            dt = cluster[time_field]
            if dt and not any(abs((dt - s).total_seconds()) < 60 for s in seen_dts):
                cnt = cluster['cnt']
                seen_dts.append(dt)
                presets.append({
                    'id': f'cluster_{int(dt.timestamp())}',
                    'label': f'Last Bulk Move ({cnt} cards)' if len(presets) == 0 else f'Bulk Batch ({cnt} cards)',
                    'count': cnt,
                    'from': (dt - timedelta(minutes=1)).isoformat(),
                    'to': (dt + timedelta(minutes=1)).isoformat(),
                    'created_at': dt.isoformat(),
                    'source_state': '',
                    'destination_state': canon_st,
                })

        return presets[:5]

    @classmethod
    def get_freeze_info(cls, table: Table, status: str, user=None) -> Dict[str, Any]:
        """
        Returns complete freeze status, current boundaries, and default boundaries
        (earliest and latest card moved timestamp in this status).
        """
        canon_st = cls.canonical_status(status)
        table_id = table.id

        # Query active freeze record
        freeze = TableFreeze.objects.filter(table_id=table_id, status=canon_st).first()
        is_frozen = bool(freeze and freeze.is_frozen)

        # Base card query for this status to compute default min/max movement timestamps
        cards_qs = IDCard.objects.filter(table_id=table_id)
        if canon_st == 'download':
            cards_qs = cards_qs.filter(status__in=['download', 'printed'])
            earliest_dt = cards_qs.aggregate(
                val=Min(Coalesce('downloaded_at', 'status_changed_at', 'created_at'))
            )['val']
            latest_dt = cards_qs.aggregate(
                val=Max(Coalesce('downloaded_at', 'status_changed_at', 'created_at'))
            )['val']
        elif canon_st == 'pool':
            cards_qs = cards_qs.filter(status__in=['pool', 'deleted'])
            earliest_dt = cards_qs.aggregate(
                val=Min(Coalesce('deleted_at', 'status_changed_at', 'created_at'))
            )['val']
            latest_dt = cards_qs.aggregate(
                val=Max(Coalesce('deleted_at', 'status_changed_at', 'created_at'))
            )['val']
        else:
            cards_qs = cards_qs.filter(status=canon_st)
            earliest_dt = cards_qs.aggregate(
                val=Min(Coalesce('status_changed_at', 'created_at'))
            )['val']
            latest_dt = cards_qs.aggregate(
                val=Max(Coalesce('status_changed_at', 'created_at'))
            )['val']

        total_in_status = cards_qs.count()

        cards_in_freeze = total_in_status
        if is_frozen and freeze:
            frozen_qs = cards_qs
            if canon_st == 'download':
                time_q = Q()
                if freeze.frozen_from:
                    time_q &= (Q(downloaded_at__gte=freeze.frozen_from) | Q(downloaded_at__isnull=True, status_changed_at__gte=freeze.frozen_from))
                if freeze.frozen_to:
                    time_q &= (Q(downloaded_at__lte=freeze.frozen_to) | Q(downloaded_at__isnull=True, status_changed_at__lte=freeze.frozen_to))
                if time_q:
                    frozen_qs = frozen_qs.filter(time_q)
            elif canon_st == 'pool':
                time_q = Q()
                if freeze.frozen_from:
                    time_q &= (Q(deleted_at__gte=freeze.frozen_from) | Q(deleted_at__isnull=True, status_changed_at__gte=freeze.frozen_from))
                if freeze.frozen_to:
                    time_q &= (Q(deleted_at__lte=freeze.frozen_to) | Q(deleted_at__isnull=True, status_changed_at__lte=freeze.frozen_to))
                if time_q:
                    frozen_qs = frozen_qs.filter(time_q)
            else:
                time_q = Q()
                if freeze.frozen_from:
                    time_q &= (Q(status_changed_at__gte=freeze.frozen_from) | Q(status_changed_at__isnull=True, created_at__gte=freeze.frozen_from))
                if freeze.frozen_to:
                    time_q &= (Q(status_changed_at__lte=freeze.frozen_to) | Q(status_changed_at__isnull=True, created_at__lte=freeze.frozen_to))
                if time_q:
                    frozen_qs = frozen_qs.filter(time_q)
            cards_in_freeze = frozen_qs.count()

        return {
            'is_frozen': is_frozen,
            'status': canon_st,
            'frozen_from': freeze.frozen_from.isoformat() if (freeze and freeze.frozen_from) else None,
            'frozen_to': freeze.frozen_to.isoformat() if (freeze and freeze.frozen_to) else None,
            'frozen_by_name': freeze.frozen_by_name if freeze else '',
            'frozen_at': freeze.updated_at.isoformat() if freeze else None,
            'default_from': earliest_dt.isoformat() if earliest_dt else None,
            'default_to': latest_dt.isoformat() if latest_dt else None,
            'cards_in_freeze': cards_in_freeze,
            'total_cards_in_status': total_in_status,
            'total_unfrozen_cards': total_in_status,
            'bulk_movement_presets': cls.get_bulk_movement_presets(table, canon_st),
        }

    @classmethod
    def apply_freeze(cls, table: Table, status: str, from_dt_str: Optional[str],
                     to_dt_str: Optional[str], user) -> ServiceResult:
        """
        Freeze the table status to the given date-time window for operators and superadmins.
        """
        if not cls.is_admin_or_operator(user):
            return ServiceResult(success=False, message="Only operators and superadmins can freeze tables.")

        canon_st = cls.canonical_status(status)
        from_dt = cls.parse_datetime(from_dt_str, is_end=False)
        to_dt = cls.parse_datetime(to_dt_str, is_end=True)

        if from_dt and to_dt and from_dt > to_dt:
            return ServiceResult(success=False, message="From date & time cannot be after To date & time.")

        name = ''
        if user:
            name = (getattr(user, 'get_full_name', lambda: '')() or '').strip() or getattr(user, 'username', '')

        freeze, _ = TableFreeze.objects.update_or_create(
            table=table,
            status=canon_st,
            defaults={
                'is_frozen': True,
                'frozen_from': from_dt,
                'frozen_to': to_dt,
                'frozen_by': user if getattr(user, 'is_authenticated', False) else None,
                'frozen_by_name': name,
            }
        )

        cls.invalidate_freeze_cache(table.id, canon_st)
        info = cls.get_freeze_info(table, canon_st, user)
        return ServiceResult(success=True, data=info)

    @classmethod
    def unfreeze_table(cls, table: Table, status: str, user) -> ServiceResult:
        """
        Unfreeze the table status, allowing all newly moved cards to appear immediately.
        """
        if not cls.is_admin_or_operator(user):
            return ServiceResult(success=False, message="Only operators and superadmins can unfreeze tables.")

        canon_st = cls.canonical_status(status)
        TableFreeze.objects.filter(table=table, status=canon_st).update(is_frozen=False)
        cls.invalidate_freeze_cache(table.id, canon_st)
        info = cls.get_freeze_info(table, canon_st, user)
        return ServiceResult(success=True, data=info)

    @classmethod
    def apply_freeze_to_queryset(cls, qs, table_id: int, status: str, user):
        """
        Applies active freeze time boundaries to queryset if caller is admin/operator.
        Non-admin users (assistants, managers, clients) are exempt.
        """
        if not cls.is_admin_or_operator(user):
            return qs

        freeze = cls.get_active_freeze(table_id, status)
        if not freeze or not freeze.get('is_frozen'):
            return qs

        canon_st = cls.canonical_status(status)
        from_dt = cls.parse_datetime(freeze.get('frozen_from'), is_end=False)
        to_dt = cls.parse_datetime(freeze.get('frozen_to'), is_end=True)

        if not from_dt and not to_dt:
            return qs

        if canon_st == 'download':
            time_filter = Q()
            if from_dt:
                time_filter &= (Q(downloaded_at__gte=from_dt) | Q(downloaded_at__isnull=True, status_changed_at__gte=from_dt))
            if to_dt:
                time_filter &= (Q(downloaded_at__lte=to_dt) | Q(downloaded_at__isnull=True, status_changed_at__lte=to_dt))
            if time_filter:
                qs = qs.filter(time_filter)
        elif canon_st == 'pool':
            time_filter = Q()
            if from_dt:
                time_filter &= (Q(deleted_at__gte=from_dt) | Q(deleted_at__isnull=True, status_changed_at__gte=from_dt))
            if to_dt:
                time_filter &= (Q(deleted_at__lte=to_dt) | Q(deleted_at__isnull=True, status_changed_at__lte=to_dt))
            if time_filter:
                qs = qs.filter(time_filter)
        else:
            time_filter = Q()
            if from_dt:
                time_filter &= (Q(status_changed_at__gte=from_dt) | Q(status_changed_at__isnull=True, created_at__gte=from_dt))
            if to_dt:
                time_filter &= (Q(status_changed_at__lte=to_dt) | Q(status_changed_at__isnull=True, created_at__lte=to_dt))
            if time_filter:
                qs = qs.filter(time_filter)

        return qs
