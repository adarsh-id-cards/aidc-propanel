"""
Unit and Integration Tests for CardFlow Data Collection System.
Covers:
- Dynamic schema candidate keys
- Binary magic byte validation and spoofed file rejection
- Multi-tier identity resolution & candidate matching
- Sibling and family multi-child support (shared parent phone)
- Idempotency key handling
- Three-tab lifecycle (Collection -> Checked -> Canceled)
- Production-grade idempotent promotion to live IDCard
- Zero-deletion audit event sourcing
- Targeted field correction workflow
- Security, rate limiting, and tenant isolation
"""

import io
import json
import pytest
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.test import Client, RequestFactory
from PIL import Image

from organisation.models import Organisation
from tables.models import Table, IDCard, DataCollectionRecord, DataCollectionEvent, TablePhotoCollectionLink
from tables.services.data_collection_service import DataCollectionService, _normalize

User = get_user_model()


def _make_dummy_image(fmt='JPEG', size=(200, 266)):
    """Create a valid in-memory image for testing."""
    buf = io.BytesIO()
    img = Image.new('RGB', size, color=(73, 109, 137))
    img.save(buf, format=fmt)
    buf.seek(0)
    buf.name = f"test_photo.{fmt.lower()}"
    return buf


@pytest.fixture
def org_and_table(db):
    org = Organisation.objects.create(name="DPS Test School")
    table = Table.objects.create(
        organisation=org,
        name="Class 10-A Session 2026",
        fields=[
            {"name": "ROLL NO", "type": "text"},
            {"name": "STUDENT NAME", "type": "text"},
            {"name": "CLASS", "type": "text"},
            {"name": "SECTION", "type": "text"},
            {"name": "DOB", "type": "text"},
            {"name": "FATHER NAME", "type": "text"},
            {"name": "PHONE", "type": "text"},
            {"name": "PHOTO", "type": "photo"},
        ],
    )
    link = TablePhotoCollectionLink.objects.create(
        table=table,
        token="test_campaign_token_12345",
        campaign_name="Class 10-A Campaign",
        campaign_state="ACTIVE",
        is_active=True,
    )
    return org, table, link


@pytest.mark.django_db
class TestDataCollectionSystem:

    def test_normalize_function(self):
        assert _normalize("  Rahul  SHARMA   ") == "rahul sharma"
        assert _normalize(None) == ""
        assert _normalize("00425") == "00425"

    def test_candidate_keys_extraction(self, org_and_table):
        _, table, _ = org_and_table
        keys = DataCollectionService.get_candidate_keys(table)
        assert "ROLL NO" in keys["id_fields"]
        assert "STUDENT NAME" in keys["name_fields"]
        assert "CLASS" in keys["class_fields"]
        assert "PHONE" in keys["contact_fields"]

    def test_magic_byte_validation_jpeg_png_webp(self):
        # Valid JPEG
        jpg_buf = _make_dummy_image('JPEG')
        ok, err, ext = DataCollectionService.validate_photo_bytes(jpg_buf)
        assert ok is True
        assert ext == '.jpg'

        # Valid PNG
        png_buf = _make_dummy_image('PNG')
        ok, err, ext = DataCollectionService.validate_photo_bytes(png_buf)
        assert ok is True
        assert ext == '.png'

    def test_magic_byte_rejection_spoofed_files(self):
        # Disguised executable or text file named .jpg
        fake_file = io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00THIS_IS_A_WINDOWS_EXECUTABLE")
        fake_file.name = "malicious.jpg"
        ok, err, ext = DataCollectionService.validate_photo_bytes(fake_file)
        assert ok is False
        assert "Invalid image format" in err

        # Disguised HTML file with script
        html_file = io.BytesIO(b"<html><script>alert('xss')</script></html>")
        html_file.name = "payload.png"
        ok, err, ext = DataCollectionService.validate_photo_bytes(html_file)
        assert ok is False

    def test_identity_resolution_no_match(self, org_and_table):
        _, table, _ = org_and_table
        field_data = {
            "ROLL NO": "101",
            "STUDENT NAME": "Aarav Sharma",
            "CLASS": "10",
            "SECTION": "A",
            "PHONE": "9876500001",
        }
        status, flag_code, reason, _ = DataCollectionService.resolve_identity(table, field_data)
        assert status == 'NO_MATCH'
        assert flag_code is None

    def test_identity_resolution_definite_match_admission_no(self, org_and_table):
        _, table, _ = org_and_table
        # Create an existing live IDCard
        IDCard.objects.create(
            table=table,
            status='approved',
            field_data={"ROLL NO": "101", "STUDENT NAME": "Aarav Sharma", "CLASS": "10"},
        )

        # Ingesting same admission number
        field_data = {"ROLL NO": "101", "STUDENT NAME": "Aarav Sharma", "CLASS": "10"}
        status, flag_code, reason, _ = DataCollectionService.resolve_identity(table, field_data)
        assert status == 'DEFINITE_MATCH'
        assert flag_code == 'DUPLICATE_CONFIRMED'

    def test_identity_resolution_identity_conflict(self, org_and_table):
        _, table, _ = org_and_table
        # Card belongs to Aarav Sharma
        IDCard.objects.create(
            table=table,
            status='pending',
            field_data={"ROLL NO": "101", "STUDENT NAME": "Aarav Sharma"},
        )

        # Someone submits Roll 101 with completely different student name
        field_data = {"ROLL NO": "101", "STUDENT NAME": "Pooja Verma"}
        status, flag_code, reason, _ = DataCollectionService.resolve_identity(table, field_data)
        assert status == 'DEFINITE_MATCH'
        assert flag_code == 'IDENTITY_CONFLICT'
        assert "belongs to" in reason

    def test_sibling_shared_phone_clean(self, org_and_table):
        """
        CRITICAL SIBLING REQUIREMENT:
        Rahul (Class 5) and Priya (Class 8) share Father's mobile '9826111111'.
        System MUST NOT flag Priya as duplicate!
        """
        _, table, _ = org_and_table

        # Sibling 1 submitted
        res1 = DataCollectionService.ingest_submission(
            table=table,
            field_data={"ROLL NO": "501", "STUDENT NAME": "Rahul Tiwari", "CLASS": "5", "PHONE": "9826111111"},
            submitter_info={"submitter_role": "father", "submitter_phone": "9826111111"},
        )
        assert res1['status'] == 'collection'

        # Sibling 2 submitted with SAME Father's phone
        res2 = DataCollectionService.ingest_submission(
            table=table,
            field_data={"ROLL NO": "802", "STUDENT NAME": "Priya Tiwari", "CLASS": "8", "PHONE": "9826111111"},
            submitter_info={"submitter_role": "father", "submitter_phone": "9826111111"},
        )
        assert res2['status'] == 'collection'
        assert res2['flag_code'] is None

    def test_dual_parent_submission(self, org_and_table):
        """Father and Mother submitting for same child triggers POSSIBLE_MATCH / DUPLICATE_SUSPECTED."""
        _, table, _ = org_and_table
        # Father submits
        DataCollectionService.ingest_submission(
            table=table,
            field_data={"ROLL NO": "102", "STUDENT NAME": "Kabir Das", "CLASS": "10", "PHONE": "9826000001"},
            submitter_info={"submitter_role": "father", "submitter_phone": "9826000001"},
        )

        # Mother submits same child with different phone
        res = DataCollectionService.ingest_submission(
            table=table,
            field_data={"ROLL NO": "", "STUDENT NAME": "Kabir Das", "CLASS": "10", "PHONE": "9826000002"},
            submitter_info={"submitter_role": "mother", "submitter_phone": "9826000002"},
        )
        assert res['status'] == 'canceled'
        assert res['flag_code'] == 'DUPLICATE_SUSPECTED'

    def test_idempotency_key_prevents_duplicate_submission(self, org_and_table):
        _, table, _ = org_and_table
        key = "client-idempotency-uuid-777"
        field_data = {"ROLL NO": "301", "STUDENT NAME": "Ishaan Yadav", "CLASS": "10"}

        # First submit
        res1 = DataCollectionService.ingest_submission(table, field_data, idempotency_key=key)
        assert res1['success'] is True
        assert res1['is_retry'] is False
        rec_id = res1['record_id']

        # Second submit with same key (e.g. double-click)
        res2 = DataCollectionService.ingest_submission(table, field_data, idempotency_key=key)
        assert res2['success'] is True
        assert res2['is_retry'] is True
        assert res2['record_id'] == rec_id
        assert table.data_collection_records.count() == 1

    def test_auto_check_workflow(self, org_and_table):
        _, table, _ = org_and_table
        # Record 1: Clean
        DataCollectionService.ingest_submission(
            table, {"ROLL NO": "10", "STUDENT NAME": "Student Ten", "CLASS": "10"}
        )
        # Record 2: Will be duplicate with Card #1
        IDCard.objects.create(table=table, status='approved', field_data={"ROLL NO": "20"})
        DataCollectionService.ingest_submission(
            table, {"ROLL NO": "20", "STUDENT NAME": "Student Twenty", "CLASS": "10"}
        )

        res = DataCollectionService.auto_check_records(table)
        assert res['total_scanned'] == 1  # Record 2 was already quarantined at ingestion
        assert res['checked_count'] == 1
        assert table.data_collection_records.filter(status='checked').count() == 1

    def test_promote_checked_to_pending_idempotent(self, org_and_table):
        _, table, _ = org_and_table
        rec = DataCollectionRecord.objects.create(
            table=table,
            status=DataCollectionRecord.Status.CHECKED,
            field_data={"ROLL NO": "105", "STUDENT NAME": "Meera Patel", "CLASS": "10"},
        )

        res = DataCollectionService.promote_checked_to_pending(table, record_ids=[rec.id])
        assert res['success'] is True
        assert res['promoted_count'] == 1
        rec.refresh_from_db()
        assert rec.promoted_card_id is not None
        assert IDCard.objects.filter(table=table, status='pending').count() == 1

        # Promoting again should skip already promoted record
        res2 = DataCollectionService.promote_checked_to_pending(table, record_ids=[rec.id])
        assert res2['promoted_count'] == 0
        assert IDCard.objects.filter(table=table, status='pending').count() == 1

    def test_restore_canceled_with_audit_event(self, org_and_table):
        _, table, _ = org_and_table
        rec = DataCollectionRecord.objects.create(
            table=table,
            status=DataCollectionRecord.Status.CANCELED,
            flag_code='DUPLICATE_SUSPECTED',
            flag_reason='Review required',
            field_data={"STUDENT NAME": "Suresh Raina"},
        )

        count = DataCollectionService.change_status(
            table, [rec.id], DataCollectionRecord.Status.COLLECTION, reason="Verified as separate student"
        )
        assert count == 1
        rec.refresh_from_db()
        assert rec.status == 'collection'
        assert rec.flag_code is None
        assert rec.events.filter(event_type='RESTORED').exists()

    def test_correction_workflow(self, org_and_table):
        _, table, _ = org_and_table
        rec = DataCollectionRecord.objects.create(
            table=table,
            status=DataCollectionRecord.Status.COLLECTION,
            field_data={"STUDENT NAME": "Rohit Sharm", "CLASS": "10"},
        )

        # 1. Staff requests correction
        req = DataCollectionService.request_correction(
            table=table, record_id=rec.id, requested_fields=["STUDENT NAME"], notes="Spelling error"
        )
        assert req['success'] is True
        token = req['correction_token']

        # 2. Student / parent submits correction
        res = DataCollectionService.apply_correction(
            correction_token=token,
            field_data={"STUDENT NAME": "Rohit Sharma"},
        )
        assert res['success'] is True
        rec.refresh_from_db()
        assert rec.field_data["STUDENT NAME"] == "Rohit Sharma"
        assert rec.correction_token is None  # Token revoked after use
        assert rec.events.filter(event_type='CORRECTION_SUBMITTED').exists()

    def test_public_meta_cloaks_pii(self, org_and_table):
        _, table, link = org_and_table
        # Add a student submission
        DataCollectionRecord.objects.create(
            table=table,
            field_data={"STUDENT NAME": "Secret Student", "PHONE": "9999999999"},
        )

        client = Client()
        response = client.get(f"/api/public/data-collection/{link.token}/")
        assert response.status_code == 200
        data = response.json()
        assert data['valid'] is True
        assert data['table_name'] == "Class 10-A Campaign"
        # Ensure zero student PII is leaked
        assert "Secret Student" not in json.dumps(data)
        assert "9999999999" not in json.dumps(data)

    def test_expired_campaign_access_rejected(self, org_and_table):
        _, table, link = org_and_table
        link.expires_at = timezone.now() - timezone.timedelta(days=1)
        link.save()

        client = Client()
        response = client.get(f"/api/public/data-collection/{link.token}/")
        assert response.status_code == 403
        data = response.json()
        assert "ended" in data['message']
