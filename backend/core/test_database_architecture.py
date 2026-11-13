"""
Comprehensive Database Architecture, Migration Integrity, Workflow & Tenant Isolation Tests.

Covers:
1. Schema & Migration Verification (verify_database_schema, verify_migrations, database_health_check)
2. Authentication, Roles & Account Security (User, UserDeviceSession, UserSecurityPin)
3. Organisations & Managers (Organisation, OrganisationManager, legacy attribute compatibility)
4. Staff & Permissions (Operator, Assistant, Photographer, PhotographerAssignment, StaffCompatWrapper)
5. Tables, ID Cards, Media, Reprints & Public Data Collection
6. Operations, Undo/Redo, Bulk Transactions & 64-bit Generic target_id Auditing
7. SaaS Subscriptions, Payments, Top-ups, Add-ons & Leads
8. Desktop & Mobile Device Tokens
9. Telemetry & Statistics Snapshots
10. Multi-Tenant Isolation & Referential Integrity (CASCADE / SET_NULL)
"""
import pytest
from decimal import Decimal
from django.apps import apps
from django.db import IntegrityError, connection
from django.utils import timezone

from accounts.models import UserDeviceSession, UserSecurityPin
from assistants.models import Assistant
from core.models import (
    ActivityLog,
    BackgroundTask,
    BackupTask,
    ClientMessage,
    ClientPresenceSession,
    EmailLog,
    ExportTemplate,
    Notification,
    NotificationRead,
    Photographer,
    PhotographerAssignment,
    SystemMetricSnapshot,
    SystemSettings,
    User,
)
from desktop_app.models import DesktopAppDevice
from mediafiles.models import CardMedia
from mobile_api.models import MobileDeviceToken
from operations.models import AuditEvent, BulkTransaction, Operation, OperationChange
from operators.models import Operator
from organisation.models import Organisation, OrganisationManager
from reprint.models import ReprintRequest
from saas.models import (
    SaaSAddonRequest,
    SaaSCardTopupRequest,
    SaaSLead,
    SaaSPayment,
    SaaSPlatformLog,
    SaaSSubscription,
    SaaSTierFeature,
)
from staff.models import Staff
from stats.models import ServerLoadAlert, StatsSnapshot
from tables.models import (
    CollectionCampaign,
    DataCollectionEvent,
    DataCollectionRecord,
    IDCard,
    Table,
    TableAccess,
    TableFreeze,
    TablePhotoCollectionLink,
)


@pytest.mark.django_db
class TestDatabaseSchemaAndMigrations:
    """Verify model metadata, physical table names, column names, and scripts."""

    def test_canonical_model_app_labels_and_table_names(self):
        expected = {
            (Organisation, "organisation", "organisation_organisation"),
            (OrganisationManager, "organisation", "organisation_manager"),
            (Table, "tables", "tables_table"),
            (IDCard, "tables", "tables_idcard"),
            (ReprintRequest, "reprint", "reprint_reprintrequest"),
            (Operation, "operations", "operations_operation"),
            (OperationChange, "operations", "operations_operationchange"),
            (BulkTransaction, "operations", "operations_bulktransaction"),
            (AuditEvent, "operations", "operations_auditevent"),
            (Assistant, "assistants", "assistants_assistant"),
            (Operator, "operators", "operators_operator"),
            (CardMedia, "mediafiles", "mediafiles_cardmedia"),
            (User, "core", "core_user"),
        }
        for model_cls, exp_app, exp_table in expected:
            assert model_cls._meta.app_label == exp_app
            assert model_cls._meta.db_table == exp_table

    def test_no_legacy_db_column_overrides_remain(self):
        assert Organisation._meta.get_field("org_type").column == "org_type"
        assert (
            Organisation._meta.get_field("perm_organisation_list").column
            == "perm_organisation_list"
        )
        assert (
            OrganisationManager._meta.get_field("organisation").column
            == "organisation_id"
        )
        assert Table._meta.get_field("organisation").column == "organisation_id"
        assert (
            Table._meta.get_field("deleted_by_manager").column == "deleted_by_manager"
        )
        assert Assistant._meta.get_field("organisation").column == "organisation_id"
        assert (
            Assistant._meta.get_field("perm_organisation_list").column
            == "perm_organisation_list"
        )
        assert (
            Assistant._meta.get_field("perm_manage_assistants").column
            == "perm_manage_assistants"
        )

    def test_verify_schema_and_health_scripts_pass(self):
        from scripts.verify_database_schema import verify_schema
        from scripts.database_health_check import run_health_check

        schema_res = verify_schema()
        assert schema_res["status"] == "PASS", f"Schema errors: {schema_res['errors']}"

        health_res = run_health_check()
        assert health_res["status"] == "HEALTHY", f"Health issues: {health_res['issues']}"


@pytest.mark.django_db
class TestWorkflowsAndBackwardCompatibility:
    """Verify end-to-end domain workflows and Python legacy attribute compatibility."""

    def test_auth_and_account_security_workflow(self):
        user = User.objects.create_user(
            username="sec_user",
            email="sec@example.com",
            password="StrongPassword123!",
            role="client",
        )
        session = UserDeviceSession.objects.create(
            user=user,
            session_key="sess_abc_123",
            device_type="web",
            user_agent="Chrome on Windows",
            ip_address="127.0.0.1",
        )
        pin = UserSecurityPin.objects.create(user=user, pin_hash="hashed_pin_value")
        assert user.device_sessions.count() == 1
        assert user.security_pin == pin
        assert session.user_id == user.id

        # Non-empty duplicate email must be rejected by unique_user_email constraint
        with pytest.raises(IntegrityError):
            User.objects.create_user(
                username="sec_user_2",
                email="sec@example.com",
                password="StrongPassword123!",
            )

    def test_organisation_and_manager_legacy_compatibility(self):
        owner = User.objects.create_user(
            username="org_owner", email="owner@example.com", role="client"
        )
        # Create Organisation using legacy kwargs client_type and perm_idcard_client_list
        org = Organisation.objects.create(
            name="Sunrise Academy",
            owner=owner,
            client_type="school",
            perm_idcard_client_list=True,
        )
        assert org.org_type == "school"
        assert org.client_type == "school"
        assert org.perm_organisation_list is True
        assert org.perm_idcard_client_list is True

        # Update via legacy properties and save(update_fields=[...])
        org.client_type = "other"
        org.perm_idcard_client_list = False
        org.save(update_fields=["client_type", "perm_idcard_client_list"])
        org.refresh_from_db()
        assert org.org_type == "other"
        assert org.perm_organisation_list is False

        # Create OrganisationManager using legacy client kwarg
        mgr_user = User.objects.create_user(
            username="mgr_1", email="mgr1@example.com", role="client"
        )
        mgr = OrganisationManager.objects.create(
            client=org,
            user=mgr_user,
            department="Administration",
            manager_type="prime_manager",
        )
        assert mgr.organisation == org
        assert mgr.client == org
        assert mgr.organisation_id == org.id
        assert mgr.client_id == org.id

    def test_staff_and_assistants_workflow(self):
        org = Organisation.objects.create(name="Metro College")
        op_user = User.objects.create_user(
            username="op_1", email="op1@example.com", role="admin_staff"
        )
        ast_user = User.objects.create_user(
            username="ast_1", email="ast1@example.com", role="client_staff"
        )
        ph_user = User.objects.create_user(
            username="ph_1", email="ph1@example.com", role="photographer"
        )

        op = Operator.objects.create(
            user=op_user, department="Print", perm_idcard_client_list=True
        )
        op.assigned_organisations.add(org)
        assert org in op.assigned_organisations.all()

        # Create Assistant using legacy kwargs
        ast = Assistant.objects.create(
            user=ast_user,
            client=org,
            department="Admin",
            perm_idcard_client_list=True,
            perm_manage_client_staff=True,
        )
        assert ast.organisation == org
        assert ast.client == org
        assert ast.perm_organisation_list is True
        assert ast.perm_manage_assistants is True

        ph = Photographer.objects.create(user=ph_user)
        assign = PhotographerAssignment.objects.create(photographer=ph, client=org)
        assert assign.client == org

        # Verify Staff compatibility layer
        staff_qs = Staff.objects.filter(staff_type="assistant")
        assert staff_qs.count() == 1
        wrapped_ast = staff_qs.first()
        assert wrapped_ast.organisation_id == org.id
        assert wrapped_ast.client_id == org.id

    def test_tables_idcards_media_reprint_and_collection_workflow(self):
        org = Organisation.objects.create(name="Apex High")
        mgr_user = User.objects.create_user(
            username="mgr_303", email="mgr303@example.com", role="client"
        )
        mgr = OrganisationManager.objects.create(
            organisation=org, user=mgr_user, department="Academic"
        )

        # Create Table using legacy client and deleted_by_client kwargs
        tbl = Table.objects.create(
            client=org,
            name="Class 10-A",
            fields=[{"name": "Full Name", "type": "text"}],
            deleted_by_client=True,
        )
        assert tbl.organisation == org
        assert tbl.client == org
        assert tbl.deleted_by_manager is True
        assert tbl.deleted_by_client is True

        tbl.deleted_by_client = False
        tbl.save(update_fields=["deleted_by_client"])
        tbl.refresh_from_db()
        assert tbl.deleted_by_manager is False

        # Create IDCard using legacy group kwarg
        card = IDCard.objects.create(
            group=tbl,
            field_data={"Full Name": "Aarav Verma", "Roll No": "101"},
            status="pending",
        )
        assert card.table == tbl
        assert card.group == tbl
        assert card.table_id == tbl.id
        assert card.group_id == tbl.id

        # CardMedia & ReprintRequest
        media = CardMedia.objects.create(
            card=card,
            client=org,
            original_filename="101.jpg",
        )
        reprint = ReprintRequest.objects.create(
            card=card,
            group=tbl,
            requested_by=mgr_user,
            reason="Damaged card",
        )
        assert media.card == card
        assert reprint.table == tbl
        assert reprint.group == tbl

        # TableAccess, TableFreeze, PhotoCollectionLink, Campaign & Record
        access = TableAccess.objects.create(
            table=tbl, manager=mgr_user, can_view=True
        )
        freeze = TableFreeze.objects.create(
            table=tbl, status="pending", frozen_by=mgr_user
        )
        link = TablePhotoCollectionLink.objects.create(
            table=tbl, token="tok_photo_303"
        )
        campaign = CollectionCampaign.objects.create(
            organisation=org,
            table=tbl,
            campaign_name="2026 Intake",
            token="tok_camp_303",
        )
        record = DataCollectionRecord.objects.create(
            table=tbl,
            campaign=campaign,
            promoted_card=card,
            field_data={"Full Name": "Aarav Verma"},
            idempotency_key="idem_001",
        )
        event = DataCollectionEvent.objects.create(
            record=record, actor="mgr_303", event_type="SUBMITTED"
        )
        assert access.table == tbl
        assert freeze.table == tbl
        assert link.table == tbl
        assert event.record == record

    def test_64bit_generic_target_id_operations_and_auditing(self):
        org = Organisation.objects.create(name="Global Corp")
        actor = User.objects.create_user(
            username="auditor_1", email="auditor1@example.com", role="superadmin"
        )
        tbl = Table.objects.create(organisation=org, name="Staff Cards")

        # 64-bit ID exceeding 32-bit signed integer limit (2^31 - 1 = 2,147,483,647)
        large_64bit_id = 9_000_000_000_123

        op = Operation.objects.create(
            user=actor,
            organisation=org,
            target_table=tbl,
            operation_type="status_change",
            status="completed",
        )
        op_change = OperationChange.objects.create(
            operation=op,
            target_model="idcard",
            target_id=large_64bit_id,
            field_name="status",
            before_value="pending",
            after_value="verified",
        )
        bulk_tx = BulkTransaction.objects.create(
            tx_code="BT-20261113-001",
            actor=actor,
            organisation=org,
            table=tbl,
            action="bulk_status",
            requested_count=1,
            success_count=1,
        )
        audit_ev = AuditEvent.objects.create(
            event_id="EVT-20261113-001",
            actor=actor,
            organisation=org,
            target_table=tbl,
            bulk_transaction=bulk_tx,
            event_type="status_change",
            target_type="card",
            target_id=large_64bit_id,
        )
        act_log = ActivityLog.objects.create(
            user=actor,
            action="update",
            target_model="IDCard",
            target_id=large_64bit_id,
        )

        op_change.refresh_from_db()
        audit_ev.refresh_from_db()
        act_log.refresh_from_db()
        assert op_change.target_id == large_64bit_id
        assert audit_ev.target_id == large_64bit_id
        assert act_log.target_id == large_64bit_id

    def test_saas_devices_and_telemetry_models(self):
        admin = User.objects.create_user(
            username="saas_admin", email="saas@example.com", role="superadmin"
        )
        tier = SaaSTierFeature.objects.create(
            tier="pro",
            display_name="Pro Tier",
            price_monthly=Decimal("499.00"),
        )
        sub = SaaSSubscription.objects.create(
            name="Acme Prints",
            tier="pro",
            status="active",
            max_cards=10000,
        )
        payment = SaaSPayment.objects.create(
            subscription=sub,
            verified_by=admin,
            amount=Decimal("4999.00"),
            payment_method="upi",
        )
        topup = SaaSCardTopupRequest.objects.create(
            subscription=sub,
            requested_by=admin,
            quantity=5000,
            amount=Decimal("1500.00"),
        )
        addon = SaaSAddonRequest.objects.create(
            subscription=sub,
            requested_by=admin,
            addon_type="auto_print",
            amount=Decimal("999.00"),
        )
        lead = SaaSLead.objects.create(
            name="Rohan",
            company_name="Rohan Corp",
            email="rohan@example.com",
            phone="9999999999",
        )
        log = SaaSPlatformLog.objects.create(
            subscription=sub,
            actor=admin,
            action="SUBSCRIPTION_CREATED",
            title="Subscription Created",
        )
        device = DesktopAppDevice.objects.create(
            installation_id="inst-uuid-0001",
            device_name="Workstation-1",
            token_prefix="ppd_0001",
            token_hash="sha256_hash_0001",
        )
        mob_token = MobileDeviceToken.objects.create(
            user=admin,
            push_token="fcm_token_xyz",
        )
        stat = StatsSnapshot.objects.create(
            active_clients=1,
            total_cards_created=100,
        )
        alert = ServerLoadAlert.objects.create(
            level="warning",
            last_count=55,
        )
        metric = SystemMetricSnapshot.objects.create(
            cpu_percent=42.0,
            memory_percent=58.0,
            health_state="healthy",
        )
        assert payment.subscription == sub
        assert topup.subscription == sub
        assert addon.subscription == sub
        assert lead.company_name == "Rohan Corp"
        assert log.subscription == sub
        assert device.device_name == "Workstation-1"
        assert mob_token.user == admin
        assert tier.tier == "pro"
        assert stat.total_cards_created == 100
        assert alert.level == "warning"
        assert metric.health_state == "healthy"

    def test_multi_tenant_isolation_and_cascade_integrity(self):
        org_a = Organisation.objects.create(name="Tenant A")
        org_b = Organisation.objects.create(name="Tenant B")

        table_a = Table.objects.create(organisation=org_a, name="Table A")
        table_b = Table.objects.create(organisation=org_b, name="Table B")

        card_a = IDCard.objects.create(table=table_a, field_data={"Name": "Alice"})
        card_b = IDCard.objects.create(table=table_b, field_data={"Name": "Bob"})

        # Tenant-scoped queries must strictly isolate records
        assert list(Table.objects.filter(organisation=org_a)) == [table_a]
        assert list(IDCard.objects.filter(table__organisation=org_a)) == [card_a]
        assert list(IDCard.objects.filter(table__organisation=org_b)) == [card_b]

        # Deleting Tenant A cascades cleanly to Table A and Card A without affecting Tenant B
        org_a.delete()
        assert not Table.objects.filter(id=table_a.id).exists()
        assert not IDCard.objects.filter(id=card_a.id).exists()
        assert Table.objects.filter(id=table_b.id).exists()
        assert IDCard.objects.filter(id=card_b.id).exists()
