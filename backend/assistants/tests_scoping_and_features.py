import json
from django.test import TestCase
from django.urls import reverse
from core.models import User
from organisation.models import Organisation, OrganisationManager
from assistants.models import Assistant
from tables.models import Table, IDCard


class AssistantScopingAndFeaturePermissionsTest(TestCase):
    def setUp(self):
        # 1. Super Admin
        self.super_admin = User.objects.create_user(
            username='admin_boss',
            email='admin@cardsflow.test',
            password='Password123!',
            role='super_admin',
            is_superuser=True,
        )

        # 2. Organisations
        self.org1_user = User.objects.create_user(
            username='org1_user',
            email='org1@cardsflow.test',
            password='Password123!',
            role='prime_manager',
        )
        self.org1 = Organisation.objects.create(
            name='Delhi Public School',
            user=self.org1_user,
            status='active',
            perm_idcard_pending_list=True,
            perm_idcard_verified_list=True,
            perm_idcard_approved_list=True,
            perm_idcard_add=True,
            perm_idcard_edit=True,
            perm_idcard_delete=True,
            perm_idcard_verify=True,
            perm_idcard_approve=True,
        )

        self.org2_user = User.objects.create_user(
            username='org2_user',
            email='org2@cardsflow.test',
            password='Password123!',
            role='prime_manager',
        )
        self.org2 = Organisation.objects.create(
            name='St Xavier College',
            user=self.org2_user,
            status='active',
        )

        # 3. Tables
        self.school_table = Table.objects.create(
            organisation=self.org1,
            name='Student ID Cards',
            fields=[
                {'name': 'Full Name', 'type': 'text'},
                {'name': 'Class', 'type': 'class'},
                {'name': 'Section', 'type': 'section'},
                {'name': 'Branch', 'type': 'branch'},
                {'name': 'Photo', 'type': 'photo'},
            ],
        )

        # Cards in School Table
        self.card_10_a_cs = IDCard.objects.create(
            table=self.school_table,
            field_data={
                'Full Name': 'Aarav Sharma',
                'Class': '10th',
                'Section': 'A',
                'Branch': 'Computer Science',
            },
            status='pending',
        )
        self.card_10_b_cs = IDCard.objects.create(
            table=self.school_table,
            field_data={
                'Full Name': 'Diya Patel',
                'Class': '10th',
                'Section': 'B',
                'Branch': 'Computer Science',
            },
            status='pending',
        )
        self.card_9_a_me = IDCard.objects.create(
            table=self.school_table,
            field_data={
                'Full Name': 'Kabir Singh',
                'Class': '9th',
                'Section': 'A',
                'Branch': 'Mechanical',
            },
            status='pending',
        )
        self.card_9_b_me = IDCard.objects.create(
            table=self.school_table,
            field_data={
                'Full Name': 'Riya Sen',
                'Class': '9th',
                'Section': 'B',
                'Branch': 'Mechanical',
            },
            status='pending',
        )

        # 4. Assistant User
        self.asst_user = User.objects.create_user(
            username='asst_user1',
            email='asst1@cardsflow.test',
            password='Password123!',
            role='assistant',
        )
        self.assistant = Assistant.objects.create(
            user=self.asst_user,
            organisation=self.org1,
            manager=self.org1_user,
            perm_idcard_pending_list=True,
            perm_idcard_verified_list=True,
            perm_idcard_approved_list=True,
            perm_idcard_add=True,
            perm_idcard_edit=True,
            perm_idcard_delete=True,
            perm_idcard_verify=True,
            perm_idcard_approve=True,
            assigned_table_ids=[self.school_table.id],
        )

        # 5. Super Manager in Org1
        self.sm_user = User.objects.create_user(
            username='sm_user1',
            email='sm1@cardsflow.test',
            password='Password123!',
            role='super_manager',
        )
        self.sm_profile = OrganisationManager.objects.create(
            user=self.sm_user,
            organisation=self.org1,
            manager_type='super_manager',
            is_active=True,
        )

    def test_assistant_class_scoping_filters_view_and_mutations(self):
        """Assistant with assigned Class='10th' sees ONLY 10th cards and cannot add/edit other classes."""
        self.assistant.allowed_classes = ['10th']
        self.assistant.allowed_sections = []
        self.assistant.allowed_branches = []
        self.assistant.save()

        self.client.force_login(self.asst_user)

        # 1. Fetch cards list
        url = reverse('tables:api_idcard_cards_json', args=[self.school_table.id])
        res = self.client.get(url, {'status': 'pending'})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        cards = data.get('cards', [])
        # Out of 4 cards, exactly 2 are 10th
        self.assertEqual(len(cards), 2)
        classes_seen = {c['field_data'].get('Class') for c in cards}
        self.assertEqual(classes_seen, {'10th'})

        # 2. Try to add card for class '9th' -> rejected 400
        create_url = reverse('tables:api_idcard_create', args=[self.school_table.id])
        payload_invalid = {
            'field_data': {
                'Full Name': 'Sneha Rao',
                'Class': '9th',
                'Section': 'A',
            }
        }
        res_create_fail = self.client.post(
            create_url,
            data=json.dumps(payload_invalid),
            content_type='application/json',
        )
        self.assertEqual(res_create_fail.status_code, 400)
        self.assertIn('assigned classes', res_create_fail.json().get('message', ''))

        # 3. Add card for class '10th' -> succeeds
        payload_valid = {
            'field_data': {
                'Full Name': 'Sneha Rao',
                'Class': '10th',
                'Section': 'C',
            }
        }
        res_create_ok = self.client.post(
            create_url,
            data=json.dumps(payload_valid),
            content_type='application/json',
        )
        created_card_id = res_create_ok.json().get('card', {}).get('id')
        self.assertIsNotNone(created_card_id)

        # 4. Try to update newly created card to '9th' -> rejected 400
        update_url = reverse('tables:api_idcard_update', args=[created_card_id])
        res_update_fail = self.client.post(
            update_url,
            data=json.dumps({'field_data': {'Class': '9th'}}),
            content_type='application/json',
        )
        self.assertEqual(res_update_fail.status_code, 400)
        self.assertIn('assigned classes', res_update_fail.json().get('message', ''))

    def test_assistant_section_scoping_filters_view_and_mutations(self):
        """Assistant with assigned Section='A' sees ONLY Section A cards."""
        self.assistant.allowed_classes = []
        self.assistant.allowed_sections = ['A']
        self.assistant.allowed_branches = []
        self.assistant.save()

        self.client.force_login(self.asst_user)

        # 1. Fetch cards list
        url = reverse('tables:api_idcard_cards_json', args=[self.school_table.id])
        res = self.client.get(url, {'status': 'pending'})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        cards = data.get('cards', [])
        # Exactly 2 cards have Section A (10th-A and 9th-A)
        self.assertEqual(len(cards), 2)
        sections_seen = {c['field_data'].get('Section') for c in cards}
        self.assertEqual(sections_seen, {'A'})

        # 2. Try to add card with Section B -> rejected 400
        create_url = reverse('tables:api_idcard_create', args=[self.school_table.id])
        res_create_fail = self.client.post(
            create_url,
            data=json.dumps({'field_data': {'Full Name': 'Test User', 'Class': '10th', 'Section': 'B'}}),
            content_type='application/json',
        )
        self.assertEqual(res_create_fail.status_code, 400)
        self.assertIn('assigned sections', res_create_fail.json().get('message', ''))

        # 3. Add card with Section A -> succeeds
        res_create_ok = self.client.post(
            create_url,
            data=json.dumps({'field_data': {'Full Name': 'Test User', 'Class': '10th', 'Section': 'A'}}),
            content_type='application/json',
        )
        self.assertEqual(res_create_ok.status_code, 200)

    def test_assistant_branch_scoping_filters_view_and_mutations(self):
        """Assistant with assigned Branch='Computer Science' sees ONLY Computer Science cards."""
        self.assistant.allowed_classes = []
        self.assistant.allowed_sections = []
        self.assistant.allowed_branches = ['Computer Science']
        self.assistant.save()

        self.client.force_login(self.asst_user)

        # 1. Fetch cards list
        url = reverse('tables:api_idcard_cards_json', args=[self.school_table.id])
        res = self.client.get(url, {'status': 'pending'})
        self.assertEqual(res.status_code, 200)
        cards = res.json().get('cards', [])
        # 2 cards have Computer Science
        self.assertEqual(len(cards), 2)
        branches_seen = {c['field_data'].get('Branch') for c in cards}
        self.assertEqual(branches_seen, {'Computer Science'})

        # 2. Try to add Mechanical card -> rejected 400
        create_url = reverse('tables:api_idcard_create', args=[self.school_table.id])
        res_fail = self.client.post(
            create_url,
            data=json.dumps({'field_data': {'Full Name': 'Mech Guy', 'Branch': 'Mechanical'}}),
            content_type='application/json',
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn('assigned branches', res_fail.json().get('message', ''))

    def test_assistant_feature_permission_enforcement(self):
        """Assistant permissions are strictly enforced: disabled features block actions with 403."""
        # Disable add, edit, and delete on assistant
        self.assistant.perm_idcard_add = False
        self.assistant.perm_idcard_edit = False
        self.assistant.perm_idcard_delete = False
        self.assistant.save()

        self.client.force_login(self.asst_user)

        # 1. Attempt Add Card -> 403
        create_url = reverse('tables:api_idcard_create', args=[self.school_table.id])
        res_add = self.client.post(
            create_url,
            data=json.dumps({'field_data': {'Full Name': 'Denied Name'}}),
            content_type='application/json',
        )
        self.assertEqual(res_add.status_code, 403)

        # 2. Attempt Edit Card -> 403
        update_url = reverse('tables:api_idcard_update', args=[self.card_10_a_cs.id])
        res_edit = self.client.post(
            update_url,
            data=json.dumps({'field_data': {'Full Name': 'Hacked Name'}}),
            content_type='application/json',
        )
        self.assertEqual(res_edit.status_code, 403)

        # 3. Attempt Delete Card -> 403
        delete_url = reverse('tables:api_idcard_delete', args=[self.card_10_a_cs.id])
        res_del = self.client.post(delete_url)
        self.assertEqual(res_del.status_code, 403)

    def test_manager_and_assistant_api_endpoints(self):
        """Verify API endpoints for managers and assistants listing scoped and global."""
        self.client.force_login(self.super_admin)

        # 1. Managers endpoint scoped to org1
        mgr_url_scoped = reverse('api_managers_list_create') + f'?organisation_id={self.org1.id}'
        res_m1 = self.client.get(mgr_url_scoped)
        self.assertEqual(res_m1.status_code, 200)
        m1_data = res_m1.json().get('managers', [])
        # Should contain prime manager and super manager for org1
        self.assertTrue(any(m['username'] == 'org1_user' for m in m1_data))
        self.assertTrue(any(m['username'] == 'sm_user1' for m in m1_data))
        self.assertFalse(any(m['username'] == 'org2_user' for m in m1_data))

        # 2. Managers endpoint all
        mgr_url_all = reverse('api_managers_list_create') + '?organisation_id=all'
        res_mall = self.client.get(mgr_url_all)
        self.assertEqual(res_mall.status_code, 200)
        mall_data = res_mall.json().get('managers', [])
        usernames_all = {m['username'] for m in mall_data}
        self.assertIn('org1_user', usernames_all)
        self.assertIn('org2_user', usernames_all)
        self.assertIn('sm_user1', usernames_all)

        # 3. Assistants endpoint scoped to org1
        asst_url_scoped = reverse('assistants:api_staff_list') + f'?organisation_id={self.org1.id}'
        res_a1 = self.client.get(asst_url_scoped)
        self.assertEqual(res_a1.status_code, 200)
        a1_data = res_a1.json().get('staff', [])
        self.assertEqual(len(a1_data), 1)
        self.assertEqual(a1_data[0]['username'] if 'username' in a1_data[0] else a1_data[0]['name'], 'asst_user1')

        # 4. Assistants endpoint all
        asst_url_all = reverse('assistants:api_staff_list') + '?organisation_id=all'
        res_aall = self.client.get(asst_url_all)
        self.assertEqual(res_aall.status_code, 200)
        aall_data = res_aall.json().get('staff', [])
        self.assertEqual(len(aall_data), 1)

    def test_super_admin_assistant_lifecycle_and_scoped_creation(self):
        """Verify super admin can create, toggle, and delete assistants for organisations."""
        self.client.force_login(self.super_admin)

        # 1. Create assistant for org2
        create_url = reverse('assistants:api_staff_list')
        payload = {
            'name': 'Org2 Assistant Test',
            'email': 'org2asst@cardsflow.test',
            'phone': '9876543210',
            'client_id': self.org2.id,
            'perm_idcard_add': True,
            'perm_idcard_edit': True,
        }
        res_create = self.client.post(
            create_url,
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(res_create.status_code, 200)
        new_staff_id = res_create.json().get('data', {}).get('staff_id')
        self.assertIsNotNone(new_staff_id)

        # 2. Toggle status
        toggle_url = reverse('assistants:api_staff_toggle_status', args=[new_staff_id])
        res_toggle = self.client.post(toggle_url)
        self.assertEqual(res_toggle.status_code, 200)
        self.assertFalse(res_toggle.json().get('data', {}).get('is_active', True))

        # 3. Delete assistant
        del_url = reverse('assistants:api_staff_detail', args=[new_staff_id])
        res_del = self.client.delete(del_url)
        self.assertEqual(res_del.status_code, 200)
        self.assertFalse(Assistant.objects.filter(id=new_staff_id).exists())

    def test_prime_manager_detail_and_delete_protection(self):
        """Verify manager detail endpoint handles prime_ prefixed IDs and protects primary manager."""
        self.client.force_login(self.super_admin)

        # 1. Fetch prime manager details via prime_ prefix
        prime_id = f'prime_{self.org1_user.id}'
        url = reverse('api_managers_detail', args=[prime_id])
        res_get = self.client.get(url)
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json().get('manager', {}).get('username'), 'org1_user')

        # 2. Attempt to delete prime manager -> blocked 400
        res_del = self.client.delete(url)
        self.assertEqual(res_del.status_code, 400)
        self.assertIn('Primary Manager', res_del.json().get('message', ''))

