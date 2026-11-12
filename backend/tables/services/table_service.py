"""
IDCard Table Service — table schema CRUD and default-group provisioning.

Part of the IDCardService split. Handles:
- Table serialization, CRUD, toggle, list
- Default Table creation
"""
import logging
from typing import Dict, Any, List, Tuple

from django.shortcuts import get_object_or_404
from django.utils.timezone import localtime

from tables.models import Table, IDCard
from core.services.base import BaseService, ServiceResult


logger = logging.getLogger(__name__)


class IDCardTableService(BaseService):
    """Service for ID Card Table (schema) operations."""

    MAX_FIELDS_PER_TABLE = 30
    VALID_FIELD_TYPES = [
        'text', 'number', 'date', 'email', 'image', 'textarea', 'class', 'section',
        'course', 'branch', 'photo', 'rel_photo', 'mother_photo', 'father_photo',
        'barcode', 'qr_code', 'signature', 'select', 'class_section',
        'department', 'designation',
    ]
    LEGACY_REL_PHOTO_ALIASES = {'mother_photo', 'father_photo'}


    VALID_TABLE_TYPES = {'school_student', 'college_student', 'staff', 'custom'}

    @classmethod
    def _normalize_field_type(cls, field_type: str) -> str:
        """Map legacy relation-photo aliases to canonical rel_photo."""
        normalized = str(field_type or 'text').strip().lower()
        if normalized in cls.LEGACY_REL_PHOTO_ALIASES:
            return 'rel_photo'
        return normalized

    @classmethod
    def _infer_table_type(cls, table_name: str, org_name: str = '', org_type: str = '') -> str:
        """Smart-detect table type from table name, organisation name, and org_type.

        Rules (case-insensitive):
        1. Staff / Teacher / Employee / Faculty / HR / Driver -> 'staff'
        2. College keywords (college, university, degree, btech, mtech, bca, mca, semester, sem, branch, dept) -> 'college_student'
        3. School keywords (school, class, std, standard, grade, section, sec) -> 'school_student'
        4. Student / Pupil / List / Data:
           - if org_type == 'college' or org_name contains college keywords -> 'college_student'
           - if org_type == 'company' -> 'staff'
           - default -> 'school_student'
        5. Fallback -> 'custom'
        """
        import re
        name_l = (table_name or '').lower().strip()
        org_l  = (org_name or '').lower().strip()

        staff_kw   = r'\b(staff|teacher|teachers|employee|employees|emp|faculty|personnel|hr|driver|workers|management)\b'
        college_kw = r'\b(college|university|institute|polytechnic|degree|btech|mtech|bca|mca|mba|bsc|msc|ba|ma|bcom|mcom|semester|sem|branch|dept|department)\b'
        school_kw  = r'\b(school|vidyalaya|academy|convent|class|std|standard|grade|section|sec)\b'
        student_kw = r'\b(student|students|pupil|scholars|list|data|records|info|all)\b'

        if re.search(staff_kw, name_l):
            return 'staff'

        if re.search(college_kw, name_l):
            return 'college_student'

        if re.search(school_kw, name_l):
            return 'school_student'

        if re.search(student_kw, name_l):
            if org_type == 'college' or re.search(college_kw, org_l):
                return 'college_student'
            if org_type == 'company':
                return 'staff'
            return 'school_student'

        return 'custom'

    # ==================== Serialization ====================

    @classmethod
    def serialize_table(cls, table: Table) -> Dict[str, Any]:
        """Serialize Table to dict"""
        normalized_fields = []
        for field in (table.fields or []):
            if not isinstance(field, dict):
                continue
            normalized = dict(field)
            normalized['type'] = cls._normalize_field_type(field.get('type', 'text'))
            normalized_fields.append(normalized)

        from tables.models import IDCard
        from django.db.models import Count, Q

        counts = IDCard.objects.filter(table=table).aggregate(
            pending_count=Count('id', filter=Q(status='pending')),
            verified_count=Count('id', filter=Q(status='verified')),
            approved_count=Count('id', filter=Q(status='approved')),
            download_count=Count('id', filter=Q(status='download')),
            pool_count=Count('id', filter=Q(status='pool')),
            reprint_count=Count('id', filter=Q(status='reprint')),
        )

        # Count reprint requests
        rp_req_cnt = 0
        rp_conf_cnt = 0
        try:
            from reprint.models import ReprintRequest
            req_counts = ReprintRequest.objects.filter(table=table).aggregate(
                req_c=Count('id', filter=Q(status='requested')),
                conf_c=Count('id', filter=Q(status='confirmed')),
            )
            rp_req_cnt = req_counts['req_c'] or 0
            rp_conf_cnt = req_counts['conf_c'] or 0
        except Exception:
            pass

        p_cnt = counts['pending_count'] or 0
        v_cnt = counts['verified_count'] or 0
        a_cnt = counts['approved_count'] or 0
        d_cnt = counts['download_count'] or 0
        l_cnt = counts['pool_count'] or 0
        r_cnt = counts['reprint_count'] or 0

        org = getattr(table, 'organisation', None)
        if org:
            org_id = org.id
            org_name = org.name
        elif hasattr(table, 'group') and table.group and hasattr(table.group, 'client') and table.group.client:
            org_id = table.group.client.id
            org_name = table.group.client.name
        else:
            org_id = getattr(table, 'organisation_id', None)
            org_name = ''

        client_name = org_name

        return {
            'id': table.id,
            'name': table.name,
            'organisation_id': org_id,
            'organisation_name': org_name,
            'client_id': org_id,
            'client_name': client_name,
            'table_type': getattr(table, 'table_type', 'custom') or 'custom',
            'table_type_display': dict([
                ('school_student', 'School Student'),
                ('college_student', 'College Student'),
                ('staff', 'Staff'),
                ('custom', 'Custom'),
            ]).get(getattr(table, 'table_type', 'custom') or 'custom', 'Custom'),
            'fields': normalized_fields,
            'field_count': len(normalized_fields),
            'pending_count': p_cnt,
            'verified_count': v_cnt,
            'approved_count': a_cnt,
            'download_count': d_cnt,
            'pool_count': l_cnt,
            'reprint_count': r_cnt,
            'reprint_request_count': rp_req_cnt,
            'reprint_confirmed_count': rp_conf_cnt,
            'pending': p_cnt,
            'verified': v_cnt,
            'approved': a_cnt,
            'download': d_cnt,
            'downloaded': d_cnt,
            'printed': d_cnt,
            'request': rp_req_cnt,
            'requested': rp_req_cnt,
            'pool': l_cnt,
            'deleted': l_cnt,
            'reprint': r_cnt,
            'confirmed': rp_conf_cnt,
            'total_count': p_cnt + v_cnt + a_cnt + d_cnt + l_cnt + r_cnt,
            'is_active': table.is_active,
            'created_at': localtime(table.created_at).strftime('%d-%b-%Y %H:%M'),
            'updated_at': localtime(table.updated_at).strftime('%d-%b-%Y %H:%M'),
        }

    # ==================== CRUD ====================

    @classmethod
    def create_table(cls, group_id: int, data: Dict[str, Any]) -> ServiceResult:
        """Create a new ID Card Table"""
        try:
            group = get_object_or_404(Table, id=group_id)

            name = str(data.get('name') or data.get('table_name') or '').strip().upper()
            if not name:
                return ServiceResult(success=False, message='Table name is required!')

            fields = data.get('fields', [])
            if len(fields) > cls.MAX_FIELDS_PER_TABLE:
                return ServiceResult(
                    success=False,
                    message=f'Maximum {cls.MAX_FIELDS_PER_TABLE} fields allowed!'
                )

            # Validate and normalize fields
            validated_fields = []
            for idx, field in enumerate(fields):
                field_name = field.get('name', '').strip().upper()
                field_type = cls._normalize_field_type(field.get('type', 'text'))
                field_mandatory = bool(field.get('mandatory', False))
                field_show_path = bool(field.get('show_path', False))

                if not field_name:
                    return ServiceResult(
                        success=False,
                        message=f'Field {idx+1} name is required!'
                    )

                if field_type not in cls.VALID_FIELD_TYPES:
                    field_type = 'text'

                raw_options = field.get('options', [])
                if isinstance(raw_options, str):
                    parsed_options = [opt.strip() for opt in raw_options.split(',') if opt.strip()]
                elif isinstance(raw_options, list):
                    parsed_options = [str(opt).strip() for opt in raw_options if str(opt).strip()]
                else:
                    parsed_options = []

                validated_fields.append({
                    'name': field_name,
                    'type': field_type,
                    'subtype': str(field.get('subtype') or '').strip().lower(),
                    'order': idx,
                    'mandatory': field_mandatory,
                    'is_unique': bool(field.get('is_unique', False) or field.get('unique', False)),
                    'options': parsed_options,
                    'format_preset': str(field.get('format_preset') or '').strip().lower(),
                    'show_path': field_show_path,
                    'code_mode': str(field.get('code_mode') or '').strip().lower(),
                    'source_column': str(field.get('source_column') or '').strip().upper(),
                    'static_value': str(field.get('static_value') or '').strip(),
                    'code_prefix': str(field.get('code_prefix') or '').strip(),
                    'code_suffix': str(field.get('code_suffix') or '').strip(),
                    'code_config': field.get('code_config') if isinstance(field.get('code_config'), dict) else None,
                })


            # Determine organisation & table type: use explicit value if valid, else auto-detect
            org = getattr(group, 'organisation', None) or (group if hasattr(group, 'org_type') else None)
            org_name = getattr(org, 'name', '') if org else ''
            org_type = getattr(org, 'org_type', '') if org else ''
            raw_type = str(data.get('table_type') or '').strip().lower()
            if raw_type in cls.VALID_TABLE_TYPES:
                table_type = raw_type
            else:
                table_type = cls._infer_table_type(name, org_name, org_type)

            table = Table.objects.create(
                organisation=org,
                name=name,
                table_type=table_type,
                fields=validated_fields,
                is_active=True
            )

            # Record Table Creation in Audit Trail
            try:
                from operations.services import AuditService
                if org:
                    field_names = [f['name'] for f in validated_fields]
                    AuditService.record_event(
                        organisation=org,
                        actor=None,
                        event_type='create',
                        target_type='table',
                        target_id=table.id,
                        target_name=f"Table {table.name}",
                        target_table=table,
                        field_deltas=[{
                            'field_name': 'SCHEMA',
                            'before_value': None,
                            'after_value': f"{len(validated_fields)} fields ({', '.join(field_names[:5])})",
                            'change_type': 'table_create',
                        }],
                        visibility_scope='ORGANISATION',
                        source='table_manager',
                    )
            except Exception as audit_err:
                logger.debug("create_table audit error: %s", audit_err)

            return ServiceResult(
                success=True,
                message='Table created successfully!',
                data={'table': cls.serialize_table(table)}
            )

        except Exception as e:
            return ServiceResult(success=False, message=str(e))

    @classmethod
    def get_table(cls, table_id: int) -> ServiceResult:
        """Get a single ID Card Table"""
        try:
            table = get_object_or_404(Table, id=table_id)
            return ServiceResult(
                success=True,
                data={'table': cls.serialize_table(table)}
            )
        except Exception as e:
            return ServiceResult(success=False, message=str(e))

    @classmethod
    def update_table(cls, table_id: int, data: Dict[str, Any]) -> ServiceResult:
        """Update an ID Card Table"""
        try:
            table = get_object_or_404(Table, id=table_id)
            old_name = table.name
            old_fields = [f.get('name') for f in (table.fields or []) if isinstance(f, dict)]

            name = data.get('name', '').strip().upper()
            if not name:
                return ServiceResult(success=False, message='Table name is required!')

            fields = data.get('fields', [])
            if len(fields) > cls.MAX_FIELDS_PER_TABLE:
                return ServiceResult(
                    success=False,
                    message=f'Maximum {cls.MAX_FIELDS_PER_TABLE} fields allowed!'
                )

            # Validate fields
            validated_fields = []
            for idx, field in enumerate(fields):
                field_name = field.get('name', '').strip().upper()
                field_type = cls._normalize_field_type(field.get('type', 'text'))
                field_mandatory = bool(field.get('mandatory', False))
                field_show_path = bool(field.get('show_path', False))

                if not field_name:
                    return ServiceResult(
                        success=False,
                        message=f'Field {idx+1} name is required!'
                    )

                if field_type not in cls.VALID_FIELD_TYPES:
                    field_type = 'text'

                raw_options = field.get('options', [])
                if isinstance(raw_options, str):
                    parsed_options = [opt.strip() for opt in raw_options.split(',') if opt.strip()]
                elif isinstance(raw_options, list):
                    parsed_options = [str(opt).strip() for opt in raw_options if str(opt).strip()]
                else:
                    parsed_options = []

                validated_fields.append({
                    'name': field_name,
                    'type': field_type,
                    'subtype': str(field.get('subtype') or '').strip().lower(),
                    'order': idx,
                    'mandatory': field_mandatory,
                    'is_unique': bool(field.get('is_unique', False) or field.get('unique', False)),
                    'options': parsed_options,
                    'format_preset': str(field.get('format_preset') or '').strip().lower(),
                    'show_path': field_show_path,
                    'code_mode': str(field.get('code_mode') or '').strip().lower(),
                    'source_column': str(field.get('source_column') or '').strip().upper(),
                    'static_value': str(field.get('static_value') or '').strip(),
                    'code_prefix': str(field.get('code_prefix') or '').strip(),
                    'code_suffix': str(field.get('code_suffix') or '').strip(),
                    'code_config': field.get('code_config') if isinstance(field.get('code_config'), dict) else None,
                })


            # Determine / update table type — locked upon creation and cannot be changed on edit
            org = getattr(table, 'organisation', None) or getattr(getattr(table, 'group', None), 'client', None)
            existing_table_type = getattr(table, 'table_type', None)
            if existing_table_type and existing_table_type in cls.VALID_TABLE_TYPES:
                table_type = existing_table_type
            else:
                org_name = getattr(org, 'name', '') if org else ''
                org_type = getattr(org, 'org_type', '') if org else ''
                raw_type = str(data.get('table_type') or '').strip().lower()
                if raw_type in cls.VALID_TABLE_TYPES:
                    table_type = raw_type
                else:
                    table_type = cls._infer_table_type(name, org_name, org_type)

            table.name = name
            table.table_type = table_type
            table.fields = validated_fields
            table.save()

            # Detect column rename pairs
            rename_pairs = []
            old_fields_upper = [str(o).strip().upper() for o in old_fields if o]
            for f_data, v_field in zip(fields, validated_fields):
                exp_old = str(f_data.get('old_name') or f_data.get('original_name') or '').strip().upper()
                new_n = v_field['name']
                if exp_old and exp_old != new_n and exp_old in old_fields_upper:
                    rename_pairs.append((exp_old, new_n))

            if not rename_pairs and len(old_fields) == len(validated_fields):
                for o_n, v_field in zip(old_fields, validated_fields):
                    new_n = v_field['name']
                    if o_n and new_n and str(o_n).strip().upper() != new_n:
                        rename_pairs.append((str(o_n).strip().upper(), new_n))

            # Migrate card data and CardMedia for renamed columns
            if rename_pairs:
                cls._migrate_cards_for_renamed_fields(table.id, rename_pairs)

            # Ensure existing cards' field_data keys strictly match validated_fields casing
            cls._normalize_card_keys_for_table(table.id, validated_fields)

            # Record Schema & Column changes into Audit Trail
            try:
                from operations.services import AuditService
                new_fields = [f['name'] for f in validated_fields]
                old_fields_u = {str(o).strip().upper() for o in old_fields if o}
                new_fields_u = {str(n).strip().upper() for n in new_fields if n}
                renamed_old = {p[0] for p in rename_pairs}
                renamed_new = {p[1] for p in rename_pairs}
                added = [f for f in new_fields if f.upper() not in old_fields_u and f not in renamed_new]
                removed = [f for f in old_fields if str(f).strip().upper() not in new_fields_u and f not in renamed_old]

                deltas = []
                if old_name != name:
                    deltas.append({'field_name': 'TABLE_NAME', 'before_value': old_name, 'after_value': name, 'change_type': 'table_rename'})
                for old_col, new_col in rename_pairs:
                    deltas.append({'field_name': 'COLUMN_RENAME', 'before_value': old_col, 'after_value': new_col, 'change_type': 'column_rename'})
                if added:
                    deltas.append({'field_name': 'ADDED_COLUMNS', 'before_value': None, 'after_value': ', '.join(added), 'change_type': 'column_add'})
                if removed:
                    deltas.append({'field_name': 'REMOVED_COLUMNS', 'before_value': ', '.join(removed), 'after_value': None, 'change_type': 'column_delete'})
                if not deltas:
                    deltas.append({'field_name': 'COLUMNS_REORDERED', 'before_value': len(old_fields), 'after_value': len(new_fields), 'change_type': 'column_reorder'})

                if org:
                    AuditService.record_event(
                        organisation=org,
                        actor=None,
                        event_type='schema_change',
                        target_type='table',
                        target_id=table.id,
                        target_name=f"Table {table.name}",
                        target_table=table,
                        field_deltas=deltas,
                        visibility_scope='ORGANISATION',
                        source='table_manager',
                    )
            except Exception as audit_err:
                logger.debug("update_table audit error: %s", audit_err)

            # Invalidate table caches
            try:
                from tables.services.card_service import CardService
                CardService._bump_table_cache_versions(table)
            except Exception:
                pass

            return ServiceResult(
                success=True,
                message='Table updated successfully!',
                data={'table': cls.serialize_table(table)}
            )

        except Exception as e:
            return ServiceResult(success=False, message=str(e))

    @classmethod
    def delete_table(cls, table_id: int) -> ServiceResult:
        """Delete an ID Card Table"""
        try:
            table = get_object_or_404(Table, id=table_id)
            table_name = table.name
            org = getattr(table, 'organisation', None) or getattr(getattr(table, 'group', None), 'client', None)

            # Record deletion before deleting row
            try:
                from operations.services import AuditService
                if org:
                    AuditService.record_event(
                        organisation=org,
                        actor=None,
                        event_type='delete',
                        target_type='table',
                        target_id=table_id,
                        target_name=f"Table {table_name}",
                        target_table=None,
                        field_deltas=[{
                            'field_name': 'DELETED',
                            'before_value': f"Table {table_name}",
                            'after_value': 'Deleted',
                            'change_type': 'table_delete',
                        }],
                        visibility_scope='ORGANISATION',
                        source='table_manager',
                    )
            except Exception as audit_err:
                logger.debug("delete_table audit error: %s", audit_err)

            table.delete()

            return ServiceResult(
                success=True,
                message=f'Table "{table_name}" deleted successfully!'
            )
        except Exception as e:
            return ServiceResult(success=False, message=str(e))

    @classmethod
    def toggle_table_status(cls, table_id: int) -> ServiceResult:
        """Toggle ID Card Table active/inactive status (atomic to prevent lost toggles)"""
        try:
            from django.db import transaction
            with transaction.atomic():
                table = Table.objects.select_for_update().get(id=table_id)
                table.is_active = not table.is_active
                status = 'active' if table.is_active else 'inactive'
                status_display = 'Active' if table.is_active else 'Inactive'
                table.save(update_fields=['is_active', 'updated_at'])

                # Record status toggle in audit trail
                try:
                    from operations.services import AuditService
                    org = getattr(table, 'organisation', None) or getattr(getattr(table, 'group', None), 'client', None)
                    if org:
                        AuditService.record_event(
                            organisation=org,
                            actor=None,
                            event_type='status_change',
                            target_type='table',
                            target_id=table.id,
                            target_name=f"Table {table.name}",
                            target_table=table,
                            field_deltas=[{
                                'field_name': 'STATUS',
                                'before_value': 'Inactive' if table.is_active else 'Active',
                                'after_value': status_display,
                                'change_type': 'status_change',
                            }],
                            visibility_scope='ORGANISATION',
                            source='table_manager',
                        )
                except Exception as audit_err:
                    logger.debug("toggle_table_status audit error: %s", audit_err)

            return ServiceResult(
                success=True,
                message=f'Table status changed to {status_display}!',
                data={'status': status, 'status_display': status_display}
            )
        except Table.DoesNotExist:
            return ServiceResult(success=False, message='Table not found')
        except Exception as e:
            return ServiceResult(success=False, message=str(e))


    @classmethod
    def list_tables(cls, group_id: int) -> ServiceResult:
        """List all ID Card Tables for a group"""
        try:
            group = get_object_or_404(Table, id=group_id)
            tables = Table.objects.filter(group=group)

            return ServiceResult(
                success=True,
                data={'tables': [cls.serialize_table(t) for t in tables]}
            )
        except Exception as e:
            return ServiceResult(success=False, message=str(e))

    @classmethod
    def ensure_default_group(cls, client) -> 'Table':
        """Return the first Table for an organisation, creating one if none exists."""
        group = Table.objects.filter(organisation=client).first()
        if not group:
            group = Table.objects.create(
                organisation=client,
                name=f"{client.name} - Default Table",
                is_active=True,
            )
        return group

    @classmethod
    def find_duplicate_cards(cls, table_id: int, table: Table = None) -> Dict[str, Any]:
        """
        Scan all cards in a table to detect repeating/duplicate values for any columns
        configured with `is_unique: True`.
        Returns mapping of card_id -> { 'duplicate_fields': [...], 'duplicate_values': {...} }
        and duplicate counts without deleting or altering records.
        """
        from django.core.cache import cache as django_cache
        cache_key = f"tbl_dups:{table_id}"
        cached_result = django_cache.get(cache_key)
        if cached_result is not None:
            return cached_result

        if table is None:
            try:
                table = Table.objects.get(id=table_id)
            except Table.DoesNotExist:
                return {'card_duplicates': {}, 'total_duplicate_cards': 0, 'unique_fields': []}

        unique_fields = [
            f['name'] for f in (table.fields or [])
            if bool(f.get('is_unique') or f.get('unique'))
        ]
        if not unique_fields:
            res = {'card_duplicates': {}, 'total_duplicate_cards': 0, 'unique_fields': []}
            django_cache.set(cache_key, res, timeout=300)
            return res

        cards_raw = list(
            IDCard.objects.filter(table_id=table_id)
            .exclude(status='pool')
            .values_list('id', 'field_data')
        )

        # Track value -> list of card IDs for each unique field
        field_value_cards: Dict[str, Dict[str, List[int]]] = {fn: {} for fn in unique_fields}
        for cid, fd in cards_raw:
            if not fd or not isinstance(fd, dict):
                continue
            for fn in unique_fields:
                val = fd.get(fn) or fd.get(fn.upper()) or fd.get(fn.lower())
                if val is not None:
                    str_val = str(val).strip().upper()
                    if str_val:
                        field_value_cards[fn].setdefault(str_val, []).append(cid)

        card_duplicates: Dict[int, Dict[str, Any]] = {}
        for fn, val_map in field_value_cards.items():
            for str_val, cids in val_map.items():
                if len(cids) > 1:
                    for cid in cids:
                        if cid not in card_duplicates:
                            card_duplicates[cid] = {'duplicate_fields': [], 'duplicate_values': {}}
                        if fn not in card_duplicates[cid]['duplicate_fields']:
                            card_duplicates[cid]['duplicate_fields'].append(fn)
                        card_duplicates[cid]['duplicate_values'][fn] = str_val

        result = {
            'card_duplicates': card_duplicates,
            'total_duplicate_cards': len(card_duplicates),
            'unique_fields': unique_fields,
        }
        django_cache.set(cache_key, result, timeout=300)
        return result

    @classmethod
    def _migrate_cards_for_renamed_fields(cls, table_id: int, rename_pairs: List[Tuple[str, str]]):
        """
        Migrate card field_data and CardMedia field_name when a column title is renamed.
        Pops the old column name key and transfers its value to the new column name key,
        ensuring existing card data is preserved seamlessly.
        """
        if not rename_pairs:
            return

        from tables.models import IDCard
        try:
            from mediafiles.models import CardMedia
        except ImportError:
            CardMedia = None

        cards_to_update = []
        for card in IDCard.objects.filter(table_id=table_id).iterator(chunk_size=1000):
            fd = card.field_data or {}
            modified = False
            for old_col, new_col in rename_pairs:
                matching_key = None
                if old_col in fd:
                    matching_key = old_col
                else:
                    for k in fd.keys():
                        if k.strip().upper() == old_col:
                            matching_key = k
                            break

                if matching_key is not None:
                    val = fd.pop(matching_key)
                    fd[new_col] = val
                    modified = True

            if modified:
                card.field_data = fd
                cards_to_update.append(card)
                if len(cards_to_update) >= 500:
                    IDCard.objects.bulk_update(cards_to_update, ['field_data'], batch_size=500)
                    cards_to_update = []

        if cards_to_update:
            IDCard.objects.bulk_update(cards_to_update, ['field_data'], batch_size=500)

        # Update CardMedia records for renamed media fields
        if CardMedia is not None:
            for old_col, new_col in rename_pairs:
                CardMedia.objects.filter(
                    card__table_id=table_id,
                    field_name__iexact=old_col
                ).update(field_name=new_col)

    @classmethod
    def _normalize_card_keys_for_table(cls, table_id: int, validated_fields: List[Dict[str, Any]]):
        """
        Normalize existing cards' field_data keys so they strictly match validated_fields names.
        Ensures that if schema field is 'NAME', any existing card with 'Name' or 'name' gets
        migrated so all keys match the schema without data invisibility.
        """
        from tables.models import IDCard
        schema_names = {str(f['name']).strip().upper(): f['name'] for f in validated_fields if f.get('name')}
        cards_to_save = []
        for card in IDCard.objects.filter(table_id=table_id).iterator(chunk_size=1000):
            fd = card.field_data or {}
            new_fd = {}
            modified = False
            for k, v in fd.items():
                k_u = str(k).strip().upper()
                if k_u in schema_names:
                    target_k = schema_names[k_u]
                    new_fd[target_k] = v
                    if k != target_k:
                        modified = True
                else:
                    new_fd[k] = v
            if modified:
                card.field_data = new_fd
                cards_to_save.append(card)
                if len(cards_to_save) >= 500:
                    IDCard.objects.bulk_update(cards_to_save, ['field_data'], batch_size=500)
                    cards_to_save = []
        if cards_to_save:
            IDCard.objects.bulk_update(cards_to_save, ['field_data'], batch_size=500)
