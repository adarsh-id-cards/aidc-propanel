"""
Tests for Role Hierarchy & Architecture Restructure:
- Strict ceiling of maximum 3 Super Admins across the system (Model, CLI, and API enforcement)
- Prime Admin concept retired (disallowed role, deprecated CLI)
- Super Admin platform authority: creates/manages Operators, Photographers, and Organisations
- Operators and Photographers can be assigned to multiple Organisations (many-to-many)
- Managers belong to ONE Organisation only (single-organisation constraint)
- Strict ceiling of maximum 5 Managers per Organisation
- Assistants belong to their Manager's Organisation only
- Strict ceiling of maximum 100 Assistants per Manager
- Super Admin self-revocation and last-admin deletion protections
"""
import json
from django.test import TestCase, Client
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.utils import timezone

from organisation.models import Organisation, OrganisationManager
from operators.models import Operator
from assistants.models import Assistant
from core.models import Photographer, PhotographerAssignment
from accounts.services import AuthService
from core.services.permission_service import PermissionService

User = get_user_model()


class SuperAdminHierarchyTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_super_admin_quota_maximum_3_total(self):
        """System permits max 3 super admins total across model, CLI, and API."""
        # 1. Create Super Admin #1 via create_super_admin CLI
        call_command(
            'create_super_admin',
            email='sa1@cardflow.in',
            username='super_1',
            password='Password123!',
        )
        sa1 = User.objects.get(username='super_1')
        self.assertEqual(sa1.role, 'super_admin')
        self.assertTrue(sa1.is_superuser)
        self.assertTrue(sa1.is_staff)

        self.client.force_login(sa1)

        # 2. Create Super Admin #2 via API
        resp2 = self.client.post('/api/super-admins/', json.dumps({
            'username': 'super_2',
            'email': 'sa2@cardflow.in',
            'password': 'SuperPassword123!',
            'first_name': 'Super',
            'last_name': 'Two',
        }), content_type='application/json')
        self.assertEqual(resp2.status_code, 201)

        # 3. Create Super Admin #3 via API
        resp3 = self.client.post('/api/super-admins/', json.dumps({
            'username': 'super_3',
            'email': 'sa3@cardflow.in',
            'password': 'SuperPassword123!',
            'first_name': 'Super',
            'last_name': 'Three',
        }), content_type='application/json')
        self.assertEqual(resp3.status_code, 201)

        # 4. Quota check: 3 used, 0 available
        resp_get = self.client.get('/api/super-admins/')
        self.assertEqual(resp_get.status_code, 200)
        data = resp_get.json()
        self.assertEqual(data['quota']['used'], 3)
        self.assertEqual(data['quota']['available'], 0)
        self.assertEqual(data['quota']['counter_display'], '3/3')
        self.assertFalse(data['quota']['can_create'])

        # 5. Attempting to create Super Admin #4 via API must fail
        resp4 = self.client.post('/api/super-admins/', json.dumps({
            'username': 'super_4',
            'email': 'sa4@cardflow.in',
            'password': 'SuperPassword123!',
        }), content_type='application/json')
        self.assertEqual(resp4.status_code, 400)
        self.assertIn('quota limit reached', resp4.json()['message'])

        # 6. Attempting to create Super Admin #4 via CLI must fail
        with self.assertRaises(CommandError):
            call_command(
                'create_super_admin',
                email='sa4_cli@cardflow.in',
                username='super_4_cli',
                password='Password123!',
            )

        # 7. Attempting to create Super Admin #4 directly via User model must raise ValidationError
        fourth_sa = User(
            username='direct_sa4',
            email='direct_sa4@cardflow.in',
            role='super_admin',
        )
        fourth_sa.set_password('Password123!')
        with self.assertRaises(ValidationError):
            fourth_sa.save()

    def test_prime_admin_singleton_quota_enforced(self):
        """Prime Admin command creates the singleton owner and second prime admin is rejected."""
        # 1. Running create_prime_admin command creates the singleton Prime Admin
        call_command(
            'create_prime_admin',
            email='prime_test@cardflow.in',
            username='prime_test_owner',
            password='TestPassword123!',
        )
        pa = User.objects.get(username='prime_test_owner')
        self.assertEqual(pa.role, 'prime_admin')
        self.assertTrue(pa.is_superuser)
        self.assertTrue(pa.is_staff)

        # 2. Attempting to create a second Prime Admin must raise ValidationError
        second_pa = User(
            username='second_prime',
            email='second_prime@cardflow.in',
            role='prime_admin',
        )
        with self.assertRaises(ValidationError):
            second_pa.save()

    def test_super_admin_self_protection(self):
        """Super Admin cannot revoke or delete their own account, and cannot delete the last Super Admin."""
        sa = User.objects.create_user(
            username='solo_admin',
            email='solo@cardflow.in',
            password='Password123!',
            role='super_admin',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_login(sa)

        # Self-revocation attempt blocked
        res_rev = self.client.post(f'/api/super-admins/{sa.id}/revoke/', json.dumps({'revoke': True}), content_type='application/json')
        self.assertEqual(res_rev.status_code, 400)
        self.assertIn('cannot revoke your own', res_rev.json()['message'].lower())

        # Self-deletion attempt blocked
        res_del = self.client.delete(f'/api/super-admins/{sa.id}/delete/')
        self.assertEqual(res_del.status_code, 400)
        self.assertIn('cannot delete your own', res_del.json()['message'].lower())

        # Deleting last remaining super admin via model delete() blocked
        with self.assertRaises(ValidationError):
            sa.delete()

    def test_operators_and_photographers_multi_org_assignment(self):
        """Operators and Photographers can be assigned to as many organisations as needed."""
        sa = User.objects.create_user(
            username='super_boss',
            email='boss@cardflow.in',
            password='Pass!',
            role='super_admin',
            is_staff=True,
            is_superuser=True,
        )

        # Create 3 organisations
        org1 = Organisation.objects.create(name='Alpha Academy', owner=sa)
        org2 = Organisation.objects.create(name='Beta College', owner=sa)
        org3 = Organisation.objects.create(name='Gamma University', owner=sa)

        # Operator assigned to all 3 orgs
        op_user = User.objects.create_user(username='op_multi', email='op@cardflow.in', role='operator')
        op = Operator.objects.create(user=op_user)
        op.assigned_organisations.add(org1, org2, org3)
        self.assertEqual(op.assigned_organisations.count(), 3)
        self.assertIn(org1, op.assigned_organisations.all())
        self.assertIn(org2, op.assigned_organisations.all())
        self.assertIn(org3, op.assigned_organisations.all())

        # Photographer assigned to all 3 orgs
        ph_user = User.objects.create_user(username='ph_multi', email='ph@cardflow.in', role='photographer')
        photographer = Photographer.objects.create(user=ph_user)
        PhotographerAssignment.objects.create(photographer=photographer, client=org1)
        PhotographerAssignment.objects.create(photographer=photographer, client=org2)
        PhotographerAssignment.objects.create(photographer=photographer, client=org3)
        self.assertEqual(photographer.photographer_assignments.count(), 3)

    def test_manager_belongs_to_one_org_only(self):
        """A manager can belong to only one organisation (single-organisation constraint)."""
        sa = User.objects.create_user(username='sa_m', email='sam@cardflow.in', role='super_admin')
        org1 = Organisation.objects.create(name='Org 1', owner=sa)
        org2 = Organisation.objects.create(name='Org 2', owner=sa)

        mgr_user = User.objects.create_user(username='mgr_user', email='mgr@org1.in', role='super_manager')
        OrganisationManager.objects.create(
            user=mgr_user,
            organisation=org1,
            manager_type='super_manager',
        )

        # Attempting to assign same user as manager in Org 2 must raise ValidationError
        dup_mgr = OrganisationManager(
            user=mgr_user,
            organisation=org2,
            manager_type='super_manager',
        )
        with self.assertRaises(ValidationError):
            dup_mgr.save()

    def test_max_5_managers_per_organisation(self):
        """An organisation can have a maximum of 5 managers."""
        sa = User.objects.create_user(username='sa_mgr_limit', email='salim@cardflow.in', role='super_admin')
        org = Organisation.objects.create(name='Strict Limit Org', owner=sa)

        # Create 5 managers
        for i in range(1, 6):
            u = User.objects.create_user(username=f'mgr_{i}', email=f'mgr_{i}@org.in', role='super_manager')
            OrganisationManager.objects.create(
                user=u,
                organisation=org,
                manager_type='super_manager',
            )
        self.assertEqual(OrganisationManager.objects.filter(organisation=org).count(), 5)

        # 6th manager must raise ValidationError
        u6 = User.objects.create_user(username='mgr_6', email='mgr_6@org.in', role='super_manager')
        m6 = OrganisationManager(user=u6, organisation=org, manager_type='super_manager')
        with self.assertRaises(ValidationError):
            m6.save()

    def test_manager_max_100_assistants_limit(self):
        """A manager can have a maximum of 100 assistants."""
        sa = User.objects.create_user(username='sa_ast', email='sa_ast@cardflow.in', role='super_admin')
        org = Organisation.objects.create(name='Mega Org', owner=sa)
        mgr_user = User.objects.create_user(username='mgr_with_asts', email='mgr_ast@org.in', role='super_manager')
        OrganisationManager.objects.create(user=mgr_user, organisation=org, manager_type='super_manager')

        # Create 100 assistants
        assistants_batch = []
        for i in range(100):
            au = User.objects.create_user(username=f'ast_{i}', email=f'ast_{i}@org.in', role='assistant')
            # Save 100 assistants directly
            asst = Assistant(user=au, organisation=org, manager=mgr_user)
            assistants_batch.append(asst)
        Assistant.objects.bulk_create(assistants_batch)
        self.assertEqual(Assistant.objects.filter(manager=mgr_user).count(), 100)

        # 101st assistant must raise ValidationError
        au_101 = User.objects.create_user(username='ast_101', email='ast_101@org.in', role='assistant')
        asst_101 = Assistant(user=au_101, organisation=org, manager=mgr_user)
        with self.assertRaises(ValidationError):
            asst_101.save()

    def test_assistant_must_belong_to_manager_org_only(self):
        """Assistants must belong to their manager's organisation only."""
        sa = User.objects.create_user(username='sa_ast_org', email='sa_ast_org@cardflow.in', role='super_admin')
        org1 = Organisation.objects.create(name='Org Alpha', owner=sa)
        org2 = Organisation.objects.create(name='Org Beta', owner=sa)

        mgr_user = User.objects.create_user(username='mgr_alpha', email='mgr@alpha.in', role='super_manager')
        OrganisationManager.objects.create(user=mgr_user, organisation=org1, manager_type='super_manager')

        asst_user = User.objects.create_user(username='ast_mismatch', email='ast@mismatch.in', role='assistant')

        # Attempting to assign assistant to org2 while manager is in org1 must raise ValidationError
        mismatched_asst = Assistant(
            user=asst_user,
            organisation=org2,
            manager=mgr_user,
        )
        with self.assertRaises(ValidationError):
            mismatched_asst.save()
