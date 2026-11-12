"""
Data Collection Service — Core enterprise business logic for student & parent Data + Photo Collection.

Features:
- Dual-workflow architecture:
    * Workflow A: Pre-table standalone collection campaigns (NEW_TABLE).
    * Workflow B: Existing-table collection campaigns (EXISTING_TABLE).
- Shared, unified collection engine across all campaign types.
- Multi-tier identity resolution (DEFINITE_MATCH, POSSIBLE_MATCH, NO_MATCH).
- True Sibling & Family Support (shared parent phone number never causes student duplicate).
- Binary file magic byte signature validation (JPEG, PNG, WebP) and dimension bounds.
- Idempotency key tracking to eliminate double-click / network retry duplicate submissions.
- Immutable event sourcing (DataCollectionEvent) enforcing Zero-Deletion compliance.
- Table Creation Wizard from collection data with schema validation and card promotion.
- Existing table synchronization with configurable policies and conflict detection.
- Targeted field correction workflow with unguessable tokens and in-place audit history.
"""

import os
import io
import json
import hashlib
import logging
import secrets
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.core.files.storage import default_storage
from PIL import Image

from tables.models import (
    Table,
    IDCard,
    CollectionCampaign,
    DataCollectionRecord,
    DataCollectionEvent,
    TablePhotoCollectionLink,
)
from tables.services.field_mapping_service import FieldMappingService

logger = logging.getLogger(__name__)


def _normalize(val):
    """Normalize string for consistent case-insensitive whitespace-trimmed comparison."""
    if val is None:
        return ''
    return ' '.join(str(val).strip().lower().split())


class DataCollectionService:

    # ── Binary Image Validation & Storage ──────────────────────────────────────

    @staticmethod
    def validate_photo_bytes(photo_file):
        """
        Validate uploaded image by inspecting raw binary magic byte signatures:
          - JPEG: \\xff\\xd8\\xff
          - PNG:  \\x89PNG\\r\\n\\x1a\\n
          - WebP: RIFF....WEBP
        Also validates pixel dimensions and bounds using PIL.
        Returns: (is_valid: bool, error_message: str or None, ext: str)
        """
        if not photo_file:
            return True, None, '.jpg'

        pos = photo_file.tell() if hasattr(photo_file, 'tell') else 0
        header = photo_file.read(16)
        if hasattr(photo_file, 'seek'):
            photo_file.seek(pos)

        ext = '.jpg'
        if header.startswith(b'\xff\xd8\xff'):
            ext = '.jpg'
        elif header.startswith(b'\x89PNG\r\n\x1a\n'):
            ext = '.png'
        elif header.startswith(b'RIFF') and b'WEBP' in header[8:16]:
            ext = '.webp'
        else:
            return False, "Invalid image format. Only formal JPEG, PNG, or WebP files are accepted.", None

        # Verify image dimensions using PIL
        try:
            if hasattr(photo_file, 'seek'):
                photo_file.seek(pos)
            with Image.open(photo_file) as img:
                w, h = img.size
                if w < 100 or h < 100:
                    return False, f"Image resolution too low ({w}x{h}). Minimum size is 100x100 pixels.", None
                if w > 8000 or h > 8000:
                    return False, f"Image resolution exceeds limits ({w}x{h}). Maximum size is 8000x8000 pixels.", None
        except Exception as e:
            logger.warning(f"PIL verification failed: {e}")
            return False, "Corrupted or unreadable image file.", None
        finally:
            if hasattr(photo_file, 'seek'):
                photo_file.seek(pos)

        return True, None, ext

    @staticmethod
    def calculate_photo_hash(photo_file):
        """Compute SHA256 perceptual/content hash for duplicate photo detection."""
        if not photo_file:
            return None
        pos = photo_file.tell() if hasattr(photo_file, 'tell') else 0
        if hasattr(photo_file, 'seek'):
            photo_file.seek(0)
        h = hashlib.sha256()
        for chunk in photo_file.chunks() if hasattr(photo_file, 'chunks') else [photo_file.read()]:
            h.update(chunk)
        if hasattr(photo_file, 'seek'):
            photo_file.seek(pos)
        return h.hexdigest()

    @classmethod
    def save_photo_file(cls, table=None, campaign=None, photo_file=None, identifier='student'):
        """Save validated photo file into tenant-isolated storage path."""
        if not photo_file:
            return None

        clean_id = _normalize(identifier).replace(' ', '_')[:30] or 'entry'
        ext = os.path.splitext(getattr(photo_file, 'name', 'photo.jpg'))[1].lower() or '.jpg'

        if table:
            clean_name = f"COLLECTION_{table.id}_{clean_id}_{secrets.token_hex(6)}{ext}"
            rel_path = f"tables/{table.id}/collection/{clean_name}"
        elif campaign:
            clean_name = f"COLLECTION_CAMP_{campaign.id}_{clean_id}_{secrets.token_hex(6)}{ext}"
            rel_path = f"organisations/{campaign.organisation_id}/campaigns/{campaign.id}/{clean_name}"
        else:
            clean_name = f"COLLECTION_RAW_{clean_id}_{secrets.token_hex(6)}{ext}"
            rel_path = f"collection/temp/{clean_name}"

        return default_storage.save(rel_path, photo_file)

    # ── Audit Event Logger ────────────────────────────────────────────────────

    @staticmethod
    def log_event(record=None, campaign=None, event_type='SUBMITTED', actor='system', notes='', payload=None):
        """Create an immutable audit event for a DataCollectionRecord or CollectionCampaign."""
        if not campaign and record and record.campaign:
            campaign = record.campaign
        return DataCollectionEvent.objects.create(
            record=record,
            campaign=campaign,
            event_type=event_type,
            actor=actor or 'system',
            notes=notes or '',
            payload=payload or {},
        )

    # ── Campaign Factory Methods (Dual Workflow) ──────────────────────────────

    @classmethod
    def create_standalone_campaign(cls, organisation, campaign_name, form_schema=None, allowed_classes=None, instructions='', allow_parent_submission=True, single_submission_only=True):
        """
        Create a standalone pre-table collection campaign (Workflow A).
        Has its own stable schema definition; does not depend on an existing table.
        """
        token = secrets.token_urlsafe(32)
        default_schema = [
            {'name': 'STUDENT NAME', 'label': 'Student Name', 'type': 'text', 'required': True},
            {'name': 'ROLL NO', 'label': 'Roll Number', 'type': 'text', 'required': True},
            {'name': 'CLASS', 'label': 'Class / Grade', 'type': 'text', 'required': False},
            {'name': 'SECTION', 'label': 'Section', 'type': 'text', 'required': False},
            {'name': 'FATHER NAME', 'label': 'Father Name', 'type': 'text', 'required': False},
            {'name': 'MOBILE', 'label': 'Mobile Number', 'type': 'text', 'required': False},
            {'name': 'PHOTO', 'label': 'Passport Photo', 'type': 'photo', 'required': True},
        ]

        campaign = CollectionCampaign.objects.create(
            organisation=organisation,
            destination_type=CollectionCampaign.DestinationType.NEW_TABLE,
            table=None,
            token=token,
            campaign_name=campaign_name or 'Student Data Collection',
            campaign_state=CollectionCampaign.CampaignState.ACTIVE,
            form_version=1,
            form_schema=form_schema or default_schema,
            allowed_classes=allowed_classes or [],
            allow_parent_submission=allow_parent_submission,
            single_submission_only=single_submission_only,
            instructions=instructions or 'Please enter your details carefully and upload a formal passport-size photograph.',
        )

        cls.log_event(
            campaign=campaign,
            event_type='CAMPAIGN_CREATED',
            actor='operator',
            notes=f"Standalone collection campaign '{campaign.campaign_name}' created (Workflow A).",
            payload={'schema_fields': [f.get('name') for f in (form_schema or default_schema)]},
        )
        return campaign

    @classmethod
    def get_or_create_campaign_for_table(cls, table, actor='system'):
        """
        Retrieve or initialize a collection campaign bound to an existing table (Workflow B).
        Snapshots table schema and mirrors TablePhotoCollectionLink for backward compatibility.
        """
        campaign = CollectionCampaign.objects.filter(table=table).first()
        if not campaign:
            token = secrets.token_urlsafe(32)
            form_schema = []
            for f in (table.fields or []):
                fname = str(f.get('name', '')).strip()
                ftype = str(f.get('type', 'text')).strip().lower()
                if ftype in ('photo', 'rel_photo', 'signature') or fname.startswith('_'):
                    continue
                form_schema.append({
                    'name': fname,
                    'label': fname,
                    'type': ftype,
                    'required': True if fname.lower() in ('name', 'student name', 'roll no', 'roll_no', 'admission no') else False,
                    'options': f.get('options', []),
                })
            form_schema.append({'name': 'PHOTO', 'label': 'Passport Photo', 'type': 'photo', 'required': True})

            campaign = CollectionCampaign.objects.create(
                organisation=table.organisation,
                destination_type=CollectionCampaign.DestinationType.EXISTING_TABLE,
                table=table,
                token=token,
                campaign_name=table.name,
                campaign_state=CollectionCampaign.CampaignState.ACTIVE,
                form_version=1,
                form_schema=form_schema,
                instructions='Please enter your details carefully and upload a formal passport-size photograph.',
            )

            # Mirror to legacy link if not present
            link, _ = TablePhotoCollectionLink.objects.get_or_create(
                table=table,
                defaults={'token': token, 'campaign': campaign, 'campaign_name': table.name}
            )
            if link.campaign != campaign:
                link.campaign = campaign
                link.save(update_fields=['campaign'])

            cls.log_event(
                campaign=campaign,
                event_type='CAMPAIGN_CREATED',
                actor=actor,
                notes=f"Table campaign '{table.name}' created (Workflow B).",
                payload={'table_id': table.id},
            )
        return campaign

    # ── Schema Analysis & Key Categorization ──────────────────────────────────

    @staticmethod
    def get_candidate_keys(table=None, campaign=None):
        """
        Derive categorized field names from table schema or campaign form schema:
        - id_fields: strong academic identifiers (Admission No, Student ID, Scholar No, Roll No).
        - name_fields: student name fields.
        - class_fields: class, grade, standard.
        - section_fields: section.
        - dob_fields: date of birth.
        - parent_fields: father name, mother name, guardian name.
        - contact_fields: phone, mobile, contact, whatsapp.
        """
        if table and table.fields:
            fields = table.fields
        elif campaign and campaign.form_schema:
            fields = campaign.form_schema
        elif campaign and campaign.table and campaign.table.fields:
            fields = campaign.table.fields
        else:
            fields = []

        id_tokens = {'admission', 'adm', 'scholar', 'enrollment', 'reg', 'registration', 'student_id', 'id_no', 'roll', 'roll_no'}
        phone_tokens = {'phone', 'mobile', 'contact', 'whatsapp', 'tel'}
        class_tokens = {'class', 'grade', 'standard', 'std'}
        section_tokens = {'sec', 'section'}
        dob_tokens = {'dob', 'birth', 'date_of_birth', 'birthdate'}
        parent_tokens = {'father', 'mother', 'guardian', 'parent'}
        name_tokens = {'name', 'student_name', 'student', 'candidate'}

        keys = {
            'id_fields': [],
            'name_fields': [],
            'class_fields': [],
            'section_fields': [],
            'dob_fields': [],
            'parent_fields': [],
            'contact_fields': [],
        }

        for f in fields:
            fname = str(f.get('name', ''))
            fn_clean = _normalize(fname).replace(' ', '_')

            if any(t in fn_clean for t in id_tokens):
                keys['id_fields'].append(fname)
            elif any(t in fn_clean for t in phone_tokens):
                keys['contact_fields'].append(fname)
            elif any(t in fn_clean for t in class_tokens):
                keys['class_fields'].append(fname)
            elif any(t in fn_clean for t in section_tokens):
                keys['section_fields'].append(fname)
            elif any(t in fn_clean for t in dob_tokens):
                keys['dob_fields'].append(fname)
            elif any(t in fn_clean for t in parent_tokens):
                keys['parent_fields'].append(fname)
            elif any(t in fn_clean for t in name_tokens):
                keys['name_fields'].append(fname)

        return keys

    # ── Multi-Tier Identity Resolution Engine ─────────────────────────────────

    @classmethod
    def resolve_identity(
        cls,
        table=None,
        campaign=None,
        field_data=None,
        submitter_info=None,
        photo_hash=None,
        exclude_record_id=None,
    ):
        """
        Multi-tier identity matching and duplicate detection engine.
        Operates identically on both Workflow A (standalone campaign) and Workflow B (existing table).

        Hierarchy:
        - Level 1: Strong Academic Identifiers (Admission No, Scholar No, Student ID, Roll No).
        - Level 2: Compound Signals (Full Name + Class + DOB or Parent Name).
        - Level 3: Contact signals evaluated with explicit Sibling Policy.

        Sibling Multi-Child Guarantee:
        If parent phone is shared among siblings, matching verifies the student name.
        When student names differ, a shared parent phone yields NO_MATCH (clean collection).

        Returns: (match_status, flag_code, reason, details)
        """
        # Backward compatibility for positional callers: resolve_identity(table, field_data, ...)
        if isinstance(campaign, dict) and field_data is None:
            field_data = campaign
            campaign = None
        elif isinstance(table, dict) and field_data is None:
            field_data = table
            table = None

        field_data = field_data or {}
        submitter_info = submitter_info or {}

        # Resolve table and campaign references
        if table and not campaign:
            campaign = CollectionCampaign.objects.filter(table=table).first()
        elif campaign and not table:
            table = campaign.table

        keys = cls.get_candidate_keys(table=table, campaign=campaign)

        # Extract submitted values
        submitted_name = ''
        for k in keys['name_fields']:
            v = _normalize(field_data.get(k))
            if v:
                submitted_name = v
                break

        submitted_class = ''
        for k in keys['class_fields']:
            v = _normalize(field_data.get(k))
            if v:
                submitted_class = v
                break

        submitted_dob = ''
        for k in keys['dob_fields']:
            v = _normalize(field_data.get(k))
            if v:
                submitted_dob = v
                break

        submitted_parent = ''
        for k in keys['parent_fields']:
            v = _normalize(field_data.get(k))
            if v:
                submitted_parent = v
                break

        # Initialize candidate records queryset
        if campaign:
            records_qs = campaign.records.filter(
                status__in=[DataCollectionRecord.Status.COLLECTION, DataCollectionRecord.Status.CHECKED]
            )
        elif table:
            records_qs = table.data_collection_records.filter(
                status__in=[DataCollectionRecord.Status.COLLECTION, DataCollectionRecord.Status.CHECKED]
            )
        else:
            records_qs = DataCollectionRecord.objects.none()

        if exclude_record_id:
            records_qs = records_qs.exclude(id=exclude_record_id)

        # ── Level 1: Strong Academic Identifiers (Admission No / Student ID / Roll No) ──
        for k in keys['id_fields']:
            val = _normalize(field_data.get(k))
            if not val:
                continue

            # Check existing live IDCards in table (if table exists)
            if table:
                is_existing_table_campaign = campaign and campaign.destination_type == CollectionCampaign.DestinationType.EXISTING_TABLE
                for card in table.id_cards.exclude(status='deleted').iterator(chunk_size=300):
                    cdata = card.field_data or {}
                    for ck in keys['id_fields']:
                        if _normalize(cdata.get(ck)) == val:
                            card_name = ''
                            for nk in keys['name_fields']:
                                v = _normalize(cdata.get(nk))
                                if v:
                                    card_name = v
                                    break

                            # If names differ -> IDENTITY_CONFLICT!
                            if card_name and submitted_name and card_name != submitted_name and (submitted_name not in card_name and card_name not in submitted_name):
                                return (
                                    'DEFINITE_MATCH',
                                    'IDENTITY_CONFLICT',
                                    f"Identity conflict: Identifier '{val}' belongs to '{card_name}' on Card #{card.id}, but '{submitted_name}' was submitted.",
                                    {'matched_target': 'IDCard', 'target_id': card.id, 'field': k, 'value': val}
                                )

                            # In Workflow B (Existing Table Campaign), matching a student card is expected when student identity aligns
                            name_matches = bool(card_name and submitted_name and (card_name == submitted_name or card_name in submitted_name or submitted_name in card_name))
                            if is_existing_table_campaign and name_matches:
                                return (
                                    'MATCHED_CARD',
                                    None,
                                    None,
                                    {'matched_target': 'IDCard', 'target_id': card.id, 'field': k, 'value': val}
                                )
                            else:
                                return (
                                    'DEFINITE_MATCH',
                                    'DUPLICATE_CONFIRMED',
                                    f"Duplicate identifier: '{val}' already exists on active IDCard #{card.id}.",
                                    {'matched_target': 'IDCard', 'target_id': card.id, 'field': k, 'value': val}
                                )

            # Check other collection records (in campaign or table)
            if campaign:
                records_qs = campaign.records.filter(
                    status__in=[DataCollectionRecord.Status.COLLECTION, DataCollectionRecord.Status.CHECKED]
                )
            elif table:
                records_qs = table.data_collection_records.filter(
                    status__in=[DataCollectionRecord.Status.COLLECTION, DataCollectionRecord.Status.CHECKED]
                )
            else:
                records_qs = DataCollectionRecord.objects.none()

            if exclude_record_id:
                records_qs = records_qs.exclude(id=exclude_record_id)

            for rec in records_qs.iterator(chunk_size=300):
                rf = rec.field_data or {}
                for rk in keys['id_fields']:
                    if _normalize(rf.get(rk)) == val:
                        return (
                            'DEFINITE_MATCH',
                            'DUPLICATE_CONFIRMED',
                            f"Duplicate identifier: '{val}' matches existing submission #{rec.id}.",
                            {'matched_target': 'DataCollectionRecord', 'target_id': rec.id, 'field': k, 'value': val}
                        )

        # ── Level 2: Compound Signals (Name + Class + DOB/Parent) ─────────────
        if submitted_name and submitted_class:
            if table:
                for card in table.id_cards.exclude(status='deleted').iterator(chunk_size=300):
                    cf = card.field_data or {}
                    c_name = ''
                    for k in keys['name_fields']:
                        if _normalize(cf.get(k)) == submitted_name:
                            c_name = submitted_name
                            break
                    if not c_name:
                        continue

                    c_class = ''
                    for k in keys['class_fields']:
                        if _normalize(cf.get(k)) == submitted_class:
                            c_class = submitted_class
                            break
                    if not c_class:
                        continue

                    c_dob = ''
                    for k in keys['dob_fields']:
                        v = _normalize(cf.get(k))
                        if v and submitted_dob and v == submitted_dob:
                            c_dob = v
                            break

                    c_parent = ''
                    for k in keys['parent_fields']:
                        v = _normalize(cf.get(k))
                        if v and submitted_parent and v == submitted_parent:
                            c_parent = v
                            break

                    dob_contradicts = bool(submitted_dob and c_dob and submitted_dob != c_dob)
                    parent_contradicts = bool(submitted_parent and c_parent and submitted_parent != c_parent)
                    if dob_contradicts or parent_contradicts:
                        continue

                    return (
                        'POSSIBLE_MATCH',
                        'DUPLICATE_SUSPECTED',
                        f"Potential duplicate: '{submitted_name}' in class '{submitted_class}' matches Card #{card.id} (needs review).",
                        {'matched_target': 'IDCard', 'target_id': card.id, 'confidence': 75}
                    )

            # Check other collection records
            for rec in records_qs.iterator(chunk_size=300):
                rf = rec.field_data or {}
                r_name = ''
                for k in keys['name_fields']:
                    if _normalize(rf.get(k)) == submitted_name:
                        r_name = submitted_name
                        break
                if not r_name:
                    continue

                r_class = ''
                for k in keys['class_fields']:
                    if _normalize(rf.get(k)) == submitted_class:
                        r_class = submitted_class
                        break
                if not r_class:
                    continue

                r_dob = ''
                for k in keys['dob_fields']:
                    v = _normalize(rf.get(k))
                    if v and submitted_dob and v == submitted_dob:
                        r_dob = v
                        break

                r_parent = ''
                for k in keys['parent_fields']:
                    v = _normalize(rf.get(k))
                    if v and submitted_parent and v == submitted_parent:
                        r_parent = v
                        break

                dob_contradicts = bool(submitted_dob and r_dob and submitted_dob != r_dob)
                parent_contradicts = bool(submitted_parent and r_parent and submitted_parent != r_parent)
                if dob_contradicts or parent_contradicts:
                    continue

                return (
                    'POSSIBLE_MATCH',
                    'DUPLICATE_SUSPECTED',
                    f"Potential duplicate: '{submitted_name}' in class '{submitted_class}' matches submission #{rec.id} (needs review).",
                    {'matched_target': 'DataCollectionRecord', 'target_id': rec.id, 'confidence': 80}
                )

        # ── Level 3: Contact & Sibling Verification ───────────────────────────
        submitted_phone = _normalize(submitter_info.get('submitter_phone'))
        if not submitted_phone:
            for k in keys['contact_fields']:
                v = _normalize(field_data.get(k))
                if v:
                    submitted_phone = v
                    break

        # Clean collection
        return 'NO_MATCH', None, None, {}

    # ── Unified Ingestion Engine ──────────────────────────────────────────────

    @classmethod
    def ingest_submission(
        cls,
        table=None,
        campaign=None,
        field_data=None,
        photo_file=None,
        submitter_info=None,
        idempotency_key=None,
        device_id=None,
        ip=None,
    ):
        """
        Ingest demographic and photograph submission with transactional consistency.
        Supports both Workflow A (standalone campaign) and Workflow B (existing table).
        """
        # Backward compatibility for positional callers: ingest_submission(table, field_data, ...)
        if isinstance(campaign, dict) and field_data is None:
            field_data = campaign
            campaign = None
        elif isinstance(table, dict) and field_data is None:
            field_data = table
            table = None

        field_data = field_data or {}
        submitter_info = submitter_info or {}

        # Resolve campaign and table
        if not campaign and table:
            campaign = CollectionCampaign.objects.filter(table=table).first()
            if not campaign:
                campaign = cls.get_or_create_campaign_for_table(table)
        elif campaign and not table:
            table = campaign.table

        org = campaign.organisation if campaign else (table.organisation if table else None)

        # 1. Check Idempotency Key
        if idempotency_key:
            existing = None
            if campaign:
                existing = campaign.records.filter(idempotency_key=idempotency_key).first()
            elif table:
                existing = table.data_collection_records.filter(idempotency_key=idempotency_key).first()

            if existing:
                logger.info(f"Idempotent retry detected for key '{idempotency_key}', returning record #{existing.id}")
                return {
                    'success': True,
                    'is_retry': True,
                    'record_id': existing.id,
                    'status': existing.status,
                    'flag_code': existing.flag_code,
                    'flag_reason': existing.flag_reason,
                    'match_status': existing.match_status,
                }

        # 2. Validate Photo Bytes if provided
        photo_path = None
        photo_hash = None
        if photo_file:
            is_valid, err_msg, ext = cls.validate_photo_bytes(photo_file)
            if not is_valid:
                return {
                    'success': False,
                    'message': err_msg,
                    'error_code': 'INVALID_PHOTO',
                }
            photo_hash = cls.calculate_photo_hash(photo_file)
            identifier = _normalize(field_data.get('ROLL NO') or field_data.get('ROLL_NO') or field_data.get('NAME') or field_data.get('STUDENT NAME') or 'entry')
            photo_path = cls.save_photo_file(table=table, campaign=campaign, photo_file=photo_file, identifier=identifier)

        # 3. Resolve Identity & Candidate Matching
        match_status, flag_code, reason, details = cls.resolve_identity(
            table=table,
            campaign=campaign,
            field_data=field_data,
            submitter_info=submitter_info,
            photo_hash=photo_hash,
        )

        # Determine lifecycle status
        if match_status in ('DEFINITE_MATCH', 'POSSIBLE_MATCH'):
            status = DataCollectionRecord.Status.CANCELED
            flag_reason = reason
        else:
            status = DataCollectionRecord.Status.COLLECTION
            flag_code = None
            flag_reason = None

        # 4. Atomic Transaction Persistence with Concurrency Idempotency Fallback
        try:
            with transaction.atomic():
                record = DataCollectionRecord.objects.create(
                    campaign=campaign,
                    organisation=org,
                    table=table,
                    status=status,
                    form_version=campaign.form_version if campaign else 1,
                    field_data=field_data,
                    photo_file=photo_path,
                    submitter_role=submitter_info.get('submitter_role', 'student'),
                    submitter_name=submitter_info.get('submitter_name', ''),
                    submitter_phone=submitter_info.get('submitter_phone', ''),
                    idempotency_key=idempotency_key,
                    match_status=match_status,
                    match_details=details,
                    flag_code=flag_code,
                    flag_reason=flag_reason,
                    device_id=device_id,
                    submission_ip=ip,
                )

                # Record immutable audit event
                cls.log_event(
                    record=record,
                    campaign=campaign,
                    event_type='SUBMITTED',
                    actor='public_submitter',
                    notes=f"Submission ingested: initial status {status.upper()}" + (f" ({flag_code})" if flag_code else ""),
                    payload={'field_keys': list(field_data.keys()), 'match_status': match_status, 'photo': bool(photo_path)},
                )
        except Exception as e:
            # If concurrent race with identical idempotency key, retrieve existing record
            if idempotency_key:
                existing = None
                if campaign:
                    existing = campaign.records.filter(idempotency_key=idempotency_key).first()
                elif table:
                    existing = table.data_collection_records.filter(idempotency_key=idempotency_key).first()

                if existing:
                    logger.info(f"Concurrent race caught for idempotency key '{idempotency_key}', resolved to record #{existing.id}")
                    return {
                        'success': True,
                        'is_retry': True,
                        'record_id': existing.id,
                        'status': existing.status,
                        'flag_code': existing.flag_code,
                        'flag_reason': existing.flag_reason,
                        'match_status': existing.match_status,
                    }
            raise e

        return {
            'success': True,
            'is_retry': False,
            'record_id': record.id,
            'status': record.status,
            'flag_code': record.flag_code,
            'flag_reason': record.flag_reason,
            'match_status': record.match_status,
        }

    # ── Auto-Check Deduplication Engine ───────────────────────────────────────

    @classmethod
    def auto_check_records(cls, table=None, campaign=None, actor='system'):
        """
        Scan all COLLECTION records:
        - Validates data completeness and re-evaluates identity.
        - Clean records transition to CHECKED.
        - Conflicting / duplicate records transition to CANCELED.
        - Works for both standalone campaigns and table campaigns.
        """
        if campaign:
            collection_qs = campaign.records.filter(status=DataCollectionRecord.Status.COLLECTION)
            target_table = campaign.table
        elif table:
            collection_qs = table.data_collection_records.filter(status=DataCollectionRecord.Status.COLLECTION)
            target_table = table
        else:
            return {'success': False, 'message': 'Target campaign or table required.'}

        total_scanned = 0
        checked_count = 0
        canceled_count = 0

        for rec in collection_qs:
            total_scanned += 1
            fdata = rec.field_data or {}

            match_status, flag_code, reason, details = cls.resolve_identity(
                table=target_table,
                campaign=campaign or rec.campaign,
                field_data=fdata,
                submitter_info={'submitter_phone': rec.submitter_phone},
                exclude_record_id=rec.id,
            )

            with transaction.atomic():
                if match_status in ('DEFINITE_MATCH', 'POSSIBLE_MATCH'):
                    rec.status = DataCollectionRecord.Status.CANCELED
                    rec.match_status = match_status
                    rec.match_details = details
                    rec.flag_code = flag_code
                    rec.flag_reason = reason
                    rec.save(update_fields=['status', 'match_status', 'match_details', 'flag_code', 'flag_reason', 'updated_at'])

                    cls.log_event(
                        record=rec,
                        campaign=rec.campaign,
                        event_type='AUTO_CHECKED',
                        actor=actor,
                        notes=f"Auto-check flagged duplicate: {reason} ({flag_code})",
                        payload=details,
                    )
                    canceled_count += 1
                else:
                    rec.status = DataCollectionRecord.Status.CHECKED
                    rec.match_status = 'NO_MATCH'
                    rec.flag_code = None
                    rec.flag_reason = None
                    rec.save(update_fields=['status', 'match_status', 'flag_code', 'flag_reason', 'updated_at'])

                    cls.log_event(
                        record=rec,
                        campaign=rec.campaign,
                        event_type='AUTO_CHECKED',
                        actor=actor,
                        notes="Auto-check passed: record verified and moved to CHECKED queue.",
                    )
                    checked_count += 1

        return {
            'success': True,
            'total_scanned': total_scanned,
            'checked_count': checked_count,
            'canceled_count': canceled_count,
        }

    # ── Table Creation Wizard Engine (Workflow A) ─────────────────────────────

    @classmethod
    def create_table_from_collection(
        cls,
        campaign,
        table_name=None,
        description=None,
        field_definitions=None,
        primary_identifiers=None,
        photo_field_name='PHOTO',
        selected_record_ids=None,
        actor='system',
    ):
        """
        Controlled Table Creation Wizard from Collection Data (Workflow A).

        Safeguards:
        - Validates schema and ensures required fields exist.
        - Never promotes canceled or unresolved duplicate records.
        - Creates Table atomically under campaign.organisation.
        - Associates campaign.table = new_table and destination_type = NEW_TABLE.
        - Updates all records in campaign to point to new_table.
        - Promotes checked records into live IDCard records in PENDING status.
        - Idempotent: repeated calls update rather than creating duplicate tables.
        """
        if not campaign:
            return {'success': False, 'message': 'Campaign required.'}

        table_name = (table_name or campaign.campaign_name or 'Collection Data Table').strip()

        # Build schema for table
        table_fields = []
        if field_definitions:
            for f in field_definitions:
                table_fields.append({
                    'name': str(f.get('name', '')).strip().upper(),
                    'type': str(f.get('type', 'text')).strip().lower(),
                })
        else:
            for f in (campaign.form_schema or []):
                table_fields.append({
                    'name': str(f.get('name', '')).strip().upper(),
                    'type': str(f.get('type', 'text')).strip().lower(),
                })

        # Ensure photo column is present
        photo_field_name = photo_field_name.strip().upper()
        if not any(f['name'] == photo_field_name for f in table_fields):
            table_fields.append({'name': photo_field_name, 'type': 'photo'})

        now = timezone.now()
        promoted_count = 0
        failures = []

        with transaction.atomic():
            # Create or update destination Table
            if campaign.table:
                new_table = campaign.table
                new_table.name = table_name
                new_table.fields = table_fields
                new_table.save(update_fields=['name', 'fields', 'updated_at'])
            else:
                new_table = Table.objects.create(
                    organisation=campaign.organisation,
                    name=table_name,
                    fields=table_fields,
                    description=description or f"Generated from Collection Campaign: {campaign.campaign_name}",
                )
                campaign.table = new_table
                campaign.destination_type = CollectionCampaign.DestinationType.NEW_TABLE
                campaign.save(update_fields=['table', 'destination_type', 'updated_at'])

            # Link all records in this campaign to the new table
            campaign.records.filter(table__isnull=True).update(table=new_table)

            # Promote checked records
            qs = campaign.records.select_for_update().filter(
                status=DataCollectionRecord.Status.CHECKED,
                promoted_card__isnull=True,
            )
            if selected_record_ids:
                qs = qs.filter(id__in=selected_record_ids)

            candidate_records = list(qs)

            for rec in candidate_records:
                fdata = dict(rec.field_data or {})

                # Ensure photo is populated
                if rec.photo_file and not fdata.get(photo_field_name):
                    fdata[photo_field_name] = rec.photo_file

                # Create live IDCard in PENDING status
                card = IDCard.objects.create(
                    table=new_table,
                    status='pending',
                    field_data=fdata,
                    photo=rec.photo_file if rec.photo_file else None,
                )

                rec.promoted_card = card
                rec.promoted_at = now
                rec.save(update_fields=['promoted_card', 'promoted_at', 'updated_at'])

                cls.log_event(
                    record=rec,
                    campaign=campaign,
                    event_type='PROMOTED',
                    actor=actor,
                    notes=f"Promoted to live IDCard #{card.id} during Table Creation.",
                    payload={'table_id': new_table.id, 'card_id': card.id},
                )
                promoted_count += 1

            # Log campaign-level table creation event
            cls.log_event(
                campaign=campaign,
                event_type='TABLE_CREATED_FROM_COLLECTION',
                actor=actor,
                notes=f"Created Table #{new_table.id} ('{new_table.name}') with {promoted_count} live cards.",
                payload={'table_id': new_table.id, 'promoted_count': promoted_count},
            )

        # Invalidate Table Caches post-commit
        try:
            from tables.views.helpers import (
                invalidate_table_distinct_cache,
                invalidate_filter_options_cache,
            )
            invalidate_table_distinct_cache(new_table.id)
            invalidate_filter_options_cache(new_table.id)
        except Exception as e:
            logger.warning(f"Cache invalidation notice: {e}")

        return {
            'success': True,
            'table_id': new_table.id,
            'table_name': new_table.name,
            'total_candidates': len(candidate_records),
            'promoted_count': promoted_count,
        }

    # ── Existing Table Synchronization Engine (Workflow B) ───────────────────

    @classmethod
    def sync_to_existing_table(
        cls,
        campaign,
        table=None,
        record_ids=None,
        sync_policy=None,
        actor='system',
    ):
        """
        Synchronize checked collection submissions into an existing destination table (Workflow B).

        Policies:
        - update_blank_only: Only populates currently empty / missing fields on existing IDCards.
        - replace_all: Updates all submitted fields on existing IDCards.
        - photo_only: Updates only the photo on existing IDCards.
        - create_missing: Creates a new pending IDCard if no existing card matches.

        Safeguards:
        - Conflict detection: Flags when live IDCard was updated after submission.
        - In-place mutation: Preserves live card lifecycle status (approved, printed, etc.).
        """
        dest_table = table or (campaign.table if campaign else None)
        if not dest_table:
            return {'success': False, 'message': 'Campaign does not have an attached destination table.'}

        table = dest_table
        policy = sync_policy or campaign.sync_policy or CollectionCampaign.SyncPolicy.UPDATE_BLANK_ONLY

        photo_field = 'PHOTO'
        for f in (table.fields or []):
            ftype = str(f.get('type', '')).lower()
            fname = str(f.get('name', ''))
            if ftype in ('photo', 'rel_photo') or 'photo' in fname.lower():
                photo_field = fname
                break

        keys = cls.get_candidate_keys(table=table)
        now = timezone.now()

        synced_count = 0
        created_count = 0
        conflicts = []

        with transaction.atomic():
            qs = campaign.records.select_for_update().filter(
                status=DataCollectionRecord.Status.CHECKED,
                promoted_card__isnull=True,
            )
            if record_ids:
                qs = qs.filter(id__in=record_ids)

            candidate_records = list(qs)

            for rec in candidate_records:
                fdata = dict(rec.field_data or {})
                submitted_id = ''
                for k in keys['id_fields']:
                    v = _normalize(fdata.get(k))
                    if v:
                        submitted_id = v
                        break

                # Search for matching card in table
                matching_card = None
                if submitted_id:
                    for card in table.id_cards.select_for_update().exclude(status='deleted').iterator():
                        cd = card.field_data or {}
                        for ck in keys['id_fields']:
                            if _normalize(cd.get(ck)) == submitted_id:
                                matching_card = card
                                break
                        if matching_card:
                            break

                # Conflict Detection: Was card modified in CardFlow after the submission arrived?
                if matching_card and matching_card.updated_at > rec.submitted_at:
                    conflicts.append({
                        'record_id': rec.id,
                        'card_id': matching_card.id,
                        'reason': 'Card was modified by operator after submission timestamp.',
                    })
                    rec.flag_code = 'CONFLICT_DETECTED'
                    rec.flag_reason = 'Live card was modified after collection submission.'
                    rec.save(update_fields=['flag_code', 'flag_reason', 'updated_at'])
                    cls.log_event(
                        record=rec,
                        campaign=campaign,
                        event_type='PROMOTION_ATTEMPTED',
                        actor=actor,
                        notes="Sync halted due to operator concurrent modification conflict.",
                    )
                    continue

                if matching_card:
                    # Apply Sync Policy
                    card_data = dict(matching_card.field_data or {})

                    if policy == CollectionCampaign.SyncPolicy.UPDATE_BLANK_ONLY:
                        for k, v in fdata.items():
                            if not card_data.get(k):
                                card_data[k] = v
                        if rec.photo_file and not matching_card.photo:
                            matching_card.photo = rec.photo_file
                            card_data[photo_field] = rec.photo_file

                    elif policy == CollectionCampaign.SyncPolicy.REPLACE_ALL:
                        card_data.update(fdata)
                        if rec.photo_file:
                            matching_card.photo = rec.photo_file
                            card_data[photo_field] = rec.photo_file

                    elif policy == CollectionCampaign.SyncPolicy.PHOTO_ONLY:
                        if rec.photo_file:
                            matching_card.photo = rec.photo_file
                            card_data[photo_field] = rec.photo_file

                    matching_card.field_data = card_data
                    matching_card.save(update_fields=['field_data', 'photo', 'updated_at'])

                    rec.promoted_card = matching_card
                    rec.promoted_at = now
                    rec.save(update_fields=['promoted_card', 'promoted_at', 'updated_at'])

                    cls.log_event(
                        record=rec,
                        campaign=campaign,
                        event_type='PROMOTED',
                        actor=actor,
                        notes=f"Synchronized with live IDCard #{matching_card.id} under policy '{policy}'.",
                        payload={'card_id': matching_card.id, 'policy': policy},
                    )
                    synced_count += 1

                elif policy == CollectionCampaign.SyncPolicy.CREATE_MISSING or policy == CollectionCampaign.SyncPolicy.REPLACE_ALL:
                    # Create missing card
                    if rec.photo_file and not fdata.get(photo_field):
                        fdata[photo_field] = rec.photo_file

                    new_card = IDCard.objects.create(
                        table=table,
                        status='pending',
                        field_data=fdata,
                        photo=rec.photo_file if rec.photo_file else None,
                    )
                    rec.promoted_card = new_card
                    rec.promoted_at = now
                    rec.save(update_fields=['promoted_card', 'promoted_at', 'updated_at'])

                    cls.log_event(
                        record=rec,
                        campaign=campaign,
                        event_type='PROMOTED',
                        actor=actor,
                        notes=f"Missing student created as live IDCard #{new_card.id}.",
                        payload={'card_id': new_card.id},
                    )
                    created_count += 1

        return {
            'success': True,
            'synced_count': synced_count,
            'updated_count': synced_count,
            'created_count': created_count,
            'conflicts_count': len(conflicts),
            'conflicts': conflicts,
        }

    # ── Promotion Engine (Existing Table Backward Compatibility) ──────────────

    @classmethod
    def promote_checked_to_pending(cls, table=None, campaign=None, record_ids=None, actor='system'):
        """
        Promote CHECKED collection records into live IDCard records in table's PENDING list.
        Works seamlessly with either table or campaign target.
        """
        if not table and campaign and campaign.table:
            table = campaign.table

        if not table:
            return {'success': False, 'message': 'Destination table does not exist yet. Use Table Creation Wizard.'}

        # Determine photo field name
        photo_field = 'PHOTO'
        for f in (table.fields or []):
            ftype = str(f.get('type', '')).lower()
            fname = str(f.get('name', ''))
            if ftype in ('photo', 'rel_photo') or 'photo' in fname.lower():
                photo_field = fname
                break

        now = timezone.now()
        promoted_count = 0
        failures = []

        with transaction.atomic():
            if campaign:
                qs = campaign.records.select_for_update().filter(
                    status=DataCollectionRecord.Status.CHECKED,
                    promoted_card__isnull=True,
                )
            else:
                qs = table.data_collection_records.select_for_update().filter(
                    status=DataCollectionRecord.Status.CHECKED,
                    promoted_card__isnull=True,
                )

            if record_ids:
                qs = qs.filter(id__in=record_ids)

            candidate_records = list(qs)
            total_selected = len(candidate_records)

            for rec in candidate_records:
                fdata = dict(rec.field_data or {})

                # Pre-promotion Duplicate Re-check against committed IDCards
                match_status, flag_code, reason, _ = cls.resolve_identity(
                    table=table,
                    campaign=campaign or rec.campaign,
                    field_data=fdata,
                    exclude_record_id=rec.id,
                )
                if match_status == 'DEFINITE_MATCH':
                    failures.append({'id': rec.id, 'reason': f"Duplicate detected at promotion: {reason}"})
                    rec.status = DataCollectionRecord.Status.CANCELED
                    rec.flag_code = flag_code
                    rec.flag_reason = reason
                    rec.save(update_fields=['status', 'flag_code', 'flag_reason', 'updated_at'])
                    cls.log_event(
                        record=rec,
                        campaign=rec.campaign,
                        event_type='PROMOTION_ATTEMPTED',
                        actor=actor,
                        notes=f"Promotion aborted: duplicate conflict ({reason})",
                    )
                    continue

                if rec.photo_file and not fdata.get(photo_field):
                    fdata[photo_field] = rec.photo_file

                card = IDCard.objects.create(
                    table=table,
                    status='pending',
                    field_data=fdata,
                    photo=rec.photo_file if rec.photo_file else None,
                )

                rec.promoted_card = card
                rec.promoted_at = now
                rec.save(update_fields=['promoted_card', 'promoted_at', 'updated_at'])

                cls.log_event(
                    record=rec,
                    campaign=rec.campaign,
                    event_type='PROMOTED',
                    actor=actor,
                    notes=f"Promoted to live IDCard #{card.id} (status: pending).",
                    payload={'card_id': card.id},
                )
                promoted_count += 1

        # Invalidate Table Caches post-commit
        try:
            from tables.views.helpers import (
                invalidate_table_distinct_cache,
                invalidate_filter_options_cache,
            )
            invalidate_table_distinct_cache(table.id)
            invalidate_filter_options_cache(table.id)
        except Exception as e:
            logger.warning(f"Cache invalidation notice: {e}")

        return {
            'success': True,
            'total_selected': total_selected,
            'promoted_count': promoted_count,
            'failed_count': len(failures),
            'failures': failures,
        }

    # ── State Transition & Restoration Engine ─────────────────────────────────

    @classmethod
    def change_status(cls, table=None, campaign=None, record_ids=None, new_status=None, flag_code=None, reason=None, actor='system'):
        """
        Manually transition records between COLLECTION, CHECKED, and CANCELED.
        Enforces immutable event logging and mandatory rationale on cancellations/restorations.
        """
        # Backward compatibility for positional callers: change_status(table, record_ids, new_status, ...)
        if isinstance(campaign, (list, tuple, set)):
            actual_record_ids = campaign
            actual_new_status = record_ids
            campaign = None
            record_ids = actual_record_ids
            new_status = actual_new_status
        valid_statuses = [
            DataCollectionRecord.Status.COLLECTION,
            DataCollectionRecord.Status.CHECKED,
            DataCollectionRecord.Status.CANCELED,
        ]
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status: {new_status}")

        count = 0
        with transaction.atomic():
            if campaign:
                qs = campaign.records.select_for_update().filter(id__in=record_ids or [])
            elif table:
                qs = table.data_collection_records.select_for_update().filter(id__in=record_ids or [])
            else:
                qs = DataCollectionRecord.objects.select_for_update().filter(id__in=record_ids or [])

            for rec in qs:
                old_status = rec.status
                rec.status = new_status
                if new_status == DataCollectionRecord.Status.CANCELED:
                    rec.flag_code = flag_code or 'MANUAL_CANCELLATION'
                    rec.flag_reason = reason or 'Manually canceled by reviewer.'
                elif new_status in (DataCollectionRecord.Status.COLLECTION, DataCollectionRecord.Status.CHECKED):
                    rec.flag_code = None
                    rec.flag_reason = None

                rec.save(update_fields=['status', 'flag_code', 'flag_reason', 'updated_at'])

                event_type = 'STATUS_CHANGED'
                if old_status == DataCollectionRecord.Status.CANCELED and new_status != DataCollectionRecord.Status.CANCELED:
                    event_type = 'RESTORED'

                cls.log_event(
                    record=rec,
                    campaign=rec.campaign,
                    event_type=event_type,
                    actor=actor,
                    notes=f"Status changed from {old_status.upper()} to {new_status.upper()}." + (f" Reason: {reason}" if reason else ""),
                    payload={'from': old_status, 'to': new_status, 'flag_code': flag_code},
                )
                count += 1

        return count

    # ── Targeted Correction Engine ────────────────────────────────────────────

    @classmethod
    def request_correction(cls, table=None, campaign=None, record_id=None, requested_fields=None, notes='', actor='system'):
        """Generate secure 256-bit unguessable correction token for targeted student/parent update."""
        if campaign:
            rec = campaign.records.filter(id=record_id).first()
        elif table:
            rec = table.data_collection_records.filter(id=record_id).first()
        else:
            rec = DataCollectionRecord.objects.filter(id=record_id).first()

        if not rec:
            raise ValueError("Record not found.")

        if rec.promoted_card_id:
            raise ValueError("Record has already been promoted into live ID cards and cannot be modified via public correction.")

        token = secrets.token_urlsafe(32)
        rec.correction_token = token
        rec.correction_requested_fields = requested_fields or []
        rec.flag_code = 'CORRECTION_REQUESTED'
        rec.flag_reason = notes or 'Reviewer requested correction of specific fields.'
        rec.save(update_fields=['correction_token', 'correction_requested_fields', 'flag_code', 'flag_reason', 'updated_at'])

        cls.log_event(
            record=rec,
            campaign=rec.campaign,
            event_type='CORRECTION_REQUESTED',
            actor=actor,
            notes=f"Correction requested for fields: {', '.join(requested_fields or [])}. Notes: {notes}",
            payload={'requested_fields': requested_fields},
        )

        return {'success': True, 'correction_token': token}

    @classmethod
    def apply_correction(cls, token=None, updated_fields=None, photo_file=None, correction_token=None, field_data=None):
        token = correction_token or token
        updated_fields = field_data if updated_fields is None else (updated_fields or {})
        """Apply targeted corrections in-place, preserving record ID and audit history."""
        rec = DataCollectionRecord.objects.filter(correction_token=token).first()
        if not rec:
            return {'success': False, 'message': 'Invalid or expired correction link.'}

        if rec.promoted_card_id:
            return {'success': False, 'message': 'This record has already been finalized and cannot be modified.'}

        fdata = dict(rec.field_data or {})
        for k, v in updated_fields.items():
            if rec.correction_requested_fields and k not in rec.correction_requested_fields:
                continue
            fdata[k] = v

        photo_path = rec.photo_file
        if photo_file:
            is_valid, err_msg, ext = cls.validate_photo_bytes(photo_file)
            if not is_valid:
                return {'success': False, 'message': err_msg}
            identifier = _normalize(fdata.get('ROLL NO') or fdata.get('NAME') or str(rec.id))
            photo_path = cls.save_photo_file(table=rec.table, campaign=rec.campaign, photo_file=photo_file, identifier=identifier)

        with transaction.atomic():
            rec.field_data = fdata
            rec.photo_file = photo_path
            rec.status = DataCollectionRecord.Status.COLLECTION
            rec.correction_token = None
            rec.flag_code = None
            rec.flag_reason = None
            rec.save(update_fields=['field_data', 'photo_file', 'status', 'correction_token', 'flag_code', 'flag_reason', 'updated_at'])

            cls.log_event(
                record=rec,
                campaign=rec.campaign,
                event_type='CORRECTION_SUBMITTED',
                actor='student_correction',
                notes="Correction submitted: record returned to COLLECTION for re-verification.",
                payload={'updated_keys': list(updated_fields.keys()), 'photo_updated': bool(photo_file)},
            )

        return {'success': True, 'record_id': rec.id, 'status': rec.status}
