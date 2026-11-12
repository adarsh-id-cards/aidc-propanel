from django.test import TestCase
from core.models import User
from operators.models import Operator
from operators.services import OperatorCreationService, OperatorPermissionService


class OperatorRolesTests(TestCase):
    def setUp(self):
        OperatorPermissionService.ensure_permissions_exist()
        self.super_admin = User.objects.create(
            username='admin_test_operator',
            email='admin_test_operator@example.com',
            is_superuser=True,
            is_staff=True,
        )

    def test_create_data_manager_operator(self):
        result = OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='Data',
            last_name='Manager',
            email='dm@example.com',
            operator_type='data_manager',
            permission_codenames=['can_add_idcard_data', 'can_edit_idcard_data'],
        )
        self.assertTrue(result.get('success'), result)
        operator_id = result['operator']['id']
        operator = Operator.objects.get(id=operator_id)
        self.assertEqual(operator.operator_type, 'data_manager')
        self.assertEqual(operator.designation, 'Data Manager')
        self.assertTrue(operator.perm_idcard_add)
        self.assertTrue(operator.perm_idcard_edit)

    def test_create_photographer_operator(self):
        result = OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='Photo',
            last_name='Grapher',
            email='photo@example.com',
            operator_type='photographer',
            permission_codenames=['can_add_idcard_data', 'can_edit_idcard_data', 'can_upload_images'],
        )
        self.assertTrue(result.get('success'), result)
        operator_id = result['operator']['id']
        operator = Operator.objects.get(id=operator_id)
        self.assertEqual(operator.operator_type, 'photographer')
        self.assertEqual(operator.designation, 'Photographer')
        
        # Verify photographer permissions: data mutation perms locked out, photo perms granted
        self.assertFalse(operator.perm_idcard_add)
        self.assertFalse(operator.perm_idcard_edit)
        self.assertFalse(operator.perm_idcard_delete)
        self.assertFalse(operator.perm_idcard_verify)
        self.assertFalse(operator.perm_idcard_approve)
        self.assertTrue(operator.perm_reupload_idcard_image)
        self.assertTrue(operator.perm_idcard_bulk_reupload)
        self.assertTrue(operator.perm_mobile_app)

    def test_update_operator_type_to_photographer(self):
        result = OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='Switch',
            last_name='User',
            email='switch@example.com',
            operator_type='data_manager',
            permission_codenames=['can_add_idcard_data'],
        )
        self.assertTrue(result.get('success'), result)
        operator_id = result['operator']['id']
        operator = Operator.objects.get(id=operator_id)
        self.assertEqual(operator.operator_type, 'data_manager')
        self.assertTrue(operator.perm_idcard_add)

        # Update role to photographer
        upd_result = OperatorCreationService.update_operator(
            updated_by=self.super_admin,
            operator_id=operator_id,
            operator_type='photographer',
        )
        self.assertTrue(upd_result.get('success'), upd_result)
        operator.refresh_from_db()
        self.assertEqual(operator.operator_type, 'photographer')
        self.assertFalse(operator.perm_idcard_add)
        self.assertTrue(operator.perm_reupload_idcard_image)
        self.assertTrue(operator.perm_mobile_app)

    def test_list_operators_returns_role_fields(self):
        OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='ListDM',
            last_name='One',
            email='listdm@example.com',
            operator_type='data_manager',
        )
        OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='ListPhoto',
            last_name='Two',
            email='listphoto@example.com',
            operator_type='photographer',
        )

        res = OperatorCreationService.list_operators(self.super_admin)
        self.assertTrue(res.get('success'))
        operators = res.get('operators', [])
        photo_op = next((o for o in operators if o['email'] == 'listphoto@example.com'), None)
        dm_op = next((o for o in operators if o['email'] == 'listdm@example.com'), None)

        self.assertIsNotNone(photo_op)
        self.assertEqual(photo_op['operator_type'], 'photographer')
        self.assertEqual(photo_op['role'], 'photographer')
        self.assertEqual(photo_op['role_title'], 'Photographer')

        self.assertIsNotNone(dm_op)
        self.assertEqual(dm_op['operator_type'], 'data_manager')
        self.assertEqual(dm_op['role'], 'data_manager')
        self.assertEqual(dm_op['role_title'], 'Data Manager')

    def test_operator_client_assignment_metadata_and_expiry(self):
        from organisation.models import Organisation
        org = Organisation.objects.create(name='Test School')
        
        result = OperatorCreationService.create_operator(
            created_by=self.super_admin,
            first_name='Assignee',
            last_name='Tester',
            email='assignee@example.com',
            operator_type='photographer',
            assigned_client_ids=[{
                'client_id': org.id,
                'expires_at': '2026-12-31T23:59:59',
                'permissions': {'can_upload': True}
            }]
        )
        self.assertTrue(result.get('success'), result)
        operator_id = result['operator']['id']
        operator = Operator.objects.get(id=operator_id)
        self.assertIn(org, operator.assigned_organisations.all())
        self.assertIn(str(org.id), operator.assignment_metadata)
        self.assertEqual(operator.assignment_metadata[str(org.id)]['expires_at'], '2026-12-31T23:59:59')

        # Test detail view
        detail_res = OperatorCreationService.get_operator_detail(self.super_admin, operator_id)
        self.assertTrue(detail_res.get('success'))
        assigned_orgs = detail_res['operator']['assigned_organisations']
        self.assertEqual(len(assigned_orgs), 1)
        self.assertEqual(assigned_orgs[0]['id'], org.id)
        self.assertEqual(assigned_orgs[0]['expires_at'], '2026-12-31T23:59:59')

        # Test update with new expiry
        upd = OperatorCreationService.update_operator(
            updated_by=self.super_admin,
            operator_id=operator_id,
            assigned_client_ids=[{
                'client_id': org.id,
                'expires_at': '2027-01-01T00:00:00'
            }]
        )
        self.assertTrue(upd.get('success'), upd)
        operator.refresh_from_db()
        self.assertEqual(operator.assignment_metadata[str(org.id)]['expires_at'], '2027-01-01T00:00:00')

