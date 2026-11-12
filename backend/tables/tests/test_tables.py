from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest import mock

User = get_user_model()


class IDCardsModelTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table

		self.owner = User.objects.create_user(
			username='owner-model-id@test.com',
			email='owner-model-id@test.com',
			password='pass1234',
			role='client',
		)
		self.client_obj = Organisation.objects.create(user=self.owner, name='Model IDCards Client')
		self.table = Table.objects.create(
			organisation=self.client_obj,
			name='Students',
			fields=[
				{'name': 'Name', 'type': 'text', 'mandatory': True},
				{'name': 'Class', 'type': 'class', 'mandatory': True},
				{'name': 'Section', 'type': 'section', 'mandatory': False},
				{'name': 'Photo', 'type': 'photo', 'mandatory': True},
			],
		)

	def test_table_field_helpers_detect_class_section_and_images(self):
		self.assertTrue(self.table.has_class_field())
		self.assertTrue(self.table.has_section_field())
		self.assertTrue(self.table.has_image_fields())
		self.assertEqual(self.table.get_image_fields(), ['Photo'])

	def test_idcard_save_sanitizes_text_but_keeps_image_markers(self):
		from tables.models import IDCard

		card = IDCard.objects.create(
			table=self.table,
			field_data={
				'Name': 'Aditya🙂\u0007 Kumar',
				'Photo': 'PENDING:photo_1.jpg',
			},
			status='pending',
		)

		card.refresh_from_db()
		self.assertEqual(card.field_data['Name'], 'Aditya Kumar')
		self.assertEqual(card.field_data['Photo'], 'PENDING:photo_1.jpg')

	def test_idcard_client_and_group_properties(self):
		from tables.models import IDCard

		card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Neha', 'Class': '10', 'Photo': 'adarshimg/a.jpg'},
			status='pending',
		)

		self.assertEqual(card.table.id, self.table.id)
		self.assertEqual(card.client.id, self.client_obj.id)


class WorkflowServiceTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table, IDCard

		self.super_admin = User.objects.create_user(
			username='super-workflow@test.com',
			email='super-workflow@test.com',
			password='pass1234',
			role='super_admin',
		)
		self.client_user = User.objects.create_user(
			username='client-workflow@test.com',
			email='client-workflow@test.com',
			password='pass1234',
			role='client',
		)
		self.client_obj = Organisation.objects.create(
			user=self.client_user,
			name='Workflow Client',
			status='active',
			perm_idcard_verify=True,
			perm_idcard_approve=True,
			perm_idcard_delete=True,
			perm_idcard_retrieve=False,
			perm_idcard_reprint_list=True,
		)

		self.table = Table.objects.create(
			organisation=self.client_obj,
			name='Workflow Table',
			fields=[
				{'name': 'Name', 'type': 'text', 'mandatory': True},
				{'name': 'Photo', 'type': 'photo', 'mandatory': True},
				{'name': 'Class', 'type': 'class', 'mandatory': False},
			],
		)

		self.card_good_pending = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Good', 'Photo': 'adarshimg/good.jpg', 'Class': '10'},
			status='pending',
		)
		self.card_missing_text = IDCard.objects.create(
			table=self.table,
			field_data={'Name': '', 'Photo': 'adarshimg/missing-text.jpg'},
			status='pending',
		)
		self.card_missing_image = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'No Image', 'Photo': ''},
			status='pending',
		)

	def test_get_allowed_transitions_filters_by_permissions(self):
		from tables.services_workflow import WorkflowService

		allowed = WorkflowService.get_allowed_transitions(self.card_good_pending, user=self.client_user)
		self.assertIn('verified', allowed)
		self.assertIn('pool', allowed)

	def test_transition_rejects_invalid_target_status(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.transition(
			self.card_good_pending,
			'not-a-status',
			user=self.client_user,
		)
		self.assertFalse(result.success)
		self.assertIn('Invalid status', result.message)

	def test_transition_blocks_when_mandatory_fields_missing(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.transition(
			self.card_missing_text,
			'verified',
			user=self.client_user,
		)
		self.assertFalse(result.success)
		self.assertIn('required fields are empty', result.message)

	def test_transition_blocks_when_mandatory_images_missing(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.transition(
			self.card_missing_image,
			'verified',
			user=self.client_user,
		)
		self.assertFalse(result.success)
		self.assertIn('required fields are empty', result.message)

	def test_super_admin_bypasses_required_field_and_image_gates(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.transition(
			self.card_missing_image,
			'verified',
			user=self.super_admin,
		)
		self.assertTrue(result.success)
		self.card_missing_image.refresh_from_db()
		self.assertEqual(self.card_missing_image.status, 'verified')

	def test_transition_pool_to_pending_requires_retrieve_permission(self):
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService

		card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Pool Card', 'Photo': 'adarshimg/pool.jpg'},
			status='pool',
		)
		result = WorkflowService.transition(card, 'pending', user=self.client_user)
		self.assertFalse(result.success)
		self.assertIn('Permission denied', result.message)

	def test_transition_sets_and_clears_downloaded_timestamp(self):
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService

		card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Approved Card', 'Photo': 'adarshimg/appr.jpg'},
			status='approved',
		)

		first = WorkflowService.transition(card, 'download', user=self.super_admin)
		self.assertTrue(first.success)
		card.refresh_from_db()
		self.assertIsNotNone(card.downloaded_at)
		self.assertEqual(card.modified_by, self.super_admin.username)

		second = WorkflowService.transition(card, 'approved', user=self.super_admin)
		self.assertTrue(second.success)
		card.refresh_from_db()
		self.assertIsNone(card.downloaded_at)

	def test_bulk_transition_download_to_pending_clears_downloaded_timestamp(self):
		from django.utils import timezone
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService

		card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Bulk Downloaded', 'Photo': 'adarshimg/bulk-dl.jpg'},
			status='download',
			downloaded_at=timezone.now(),
		)

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=[card.id],
			target_status='pending',
			user=self.super_admin,
		)
		self.assertTrue(result.success)
		card.refresh_from_db()
		self.assertEqual(card.status, 'pending')
		self.assertIsNone(card.downloaded_at)

	def test_bulk_transition_pending_from_download_requires_retrieve_not_verify(self):
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService

		staff_like_user = User.objects.create_user(
			username='workflow-adminstaff@test.com',
			email='workflow-adminstaff@test.com',
			password='pass1234',
			role='operator',
		)
		card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Retrieve Only', 'Photo': 'adarshimg/retrieve.jpg'},
			status='download',
		)

		with mock.patch('tables.services_workflow.PermissionService.has', side_effect=lambda _u, perm: perm == 'perm_idcard_retrieve'):
			result = WorkflowService.bulk_transition(
				table=self.table,
				card_ids=[card.id],
				target_status='pending',
				user=staff_like_user,
			)

		self.assertTrue(result.success)
		card.refresh_from_db()
		self.assertEqual(card.status, 'pending')

	def test_bulk_transition_updates_eligible_and_skips_invalid(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=[self.card_good_pending.id, self.card_missing_text.id, self.card_missing_image.id],
			target_status='verified',
			user=self.client_user,
		)
		self.assertTrue(result.success)
		self.assertEqual(result.data['updated_count'], 1)
		self.assertEqual(result.data['skipped_count'], 2)

		self.card_good_pending.refresh_from_db()
		self.card_missing_text.refresh_from_db()
		self.card_missing_image.refresh_from_db()
		self.assertEqual(self.card_good_pending.status, 'verified')
		self.assertEqual(self.card_missing_text.status, 'pending')
		self.assertEqual(self.card_missing_image.status, 'pending')

	def test_bulk_transition_to_pool_sets_deleted_timestamp(self):
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService

		card_verified = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'To Pool', 'Photo': 'adarshimg/poolit.jpg'},
			status='verified',
		)

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=[card_verified.id],
			target_status='pool',
			user=self.client_user,
		)
		self.assertTrue(result.success)
		card_verified.refresh_from_db()
		self.assertEqual(card_verified.status, 'pool')
		self.assertIsNotNone(card_verified.deleted_at)

	def test_debug_workflow_reports_missing_fields_and_images(self):
		from tables.services_workflow import WorkflowService

		info = WorkflowService.debug_workflow(self.card_missing_image.id, user=self.client_user)
		self.assertEqual(info['current_status'], 'pending')
		self.assertNotIn('Name', info['mandatory_fields_missing'])
		self.assertIn('Photo', info['image_fields_missing'])

	def test_transition_without_user_does_not_crash(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.transition(
			self.card_good_pending,
			'verified',
			user=None,
		)
		self.assertTrue(result.success)
		self.card_good_pending.refresh_from_db()
		self.assertEqual(self.card_good_pending.status, 'verified')

	def test_transition_logs_per_card_activity_entry(self):
		from tables.services_workflow import WorkflowService
		from core.models import ActivityLog

		result = WorkflowService.transition(
			self.card_good_pending,
			'verified',
			user=self.client_user,
		)
		self.assertTrue(result.success)

		self.assertTrue(
			ActivityLog.objects.filter(
				action='card_status',
				target_model='IDCard',
				target_id=self.card_good_pending.id,
			).exists()
		)

	def test_bulk_transition_logs_single_bulk_activity_entry(self):
		from tables.models import IDCard
		from tables.services_workflow import WorkflowService
		from core.models import ActivityLog

		second_card = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Second', 'Photo': 'adarshimg/second.jpg', 'Class': '10'},
			status='pending',
		)

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=[self.card_good_pending.id, second_card.id],
			target_status='verified',
			user=self.client_user,
		)
		self.assertTrue(result.success)

		# Bulk transition should create one single bulk status log entry
		bulk_logs = ActivityLog.objects.filter(
			action='card_bulk_status',
			target_model='IDCard',
		)
		self.assertEqual(bulk_logs.count(), 1)
		self.assertIn('2 cards moved from Pending to Verified', bulk_logs.first().description)

		# It should not create individual status log entries
		self.assertFalse(
			ActivityLog.objects.filter(
				action='card_status',
				target_model='IDCard',
			).exists()
		)

	def test_bulk_transition_normalizes_invalid_card_ids(self):
		from tables.services_workflow import WorkflowService

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=['bad', None, -1, self.card_good_pending.id, str(self.card_good_pending.id)],
			target_status='verified',
			user=self.client_user,
		)

		self.assertTrue(result.success)
		self.card_good_pending.refresh_from_db()
		self.assertEqual(self.card_good_pending.status, 'verified')

	def test_bulk_transition_ignores_locked_cards_outside_target_table(self):
		from tables.models import Table, IDCard
		from tables.services_workflow import WorkflowService

		other_table = Table.objects.create(
			organisation=self.client_obj,
			name='Other Table',
			fields=self.table.fields,
		)
		locked_other_table_card = IDCard.objects.create(
			table=other_table,
			field_data={'Name': 'Locked', 'Photo': 'adarshimg/locked.jpg'},
			status='approved',
		)

		result = WorkflowService.bulk_transition(
			table=self.table,
			card_ids=[self.card_good_pending.id, locked_other_table_card.id],
			target_status='verified',
			user=self.client_user,
		)

		self.assertTrue(result.success)
		self.card_good_pending.refresh_from_db()
		locked_other_table_card.refresh_from_db()
		self.assertEqual(self.card_good_pending.status, 'verified')
		self.assertEqual(locked_other_table_card.status, 'approved')


class RowScopingCacheTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table

		self.owner = User.objects.create_user(
			username='scoping-owner@test.com',
			email='scoping-owner@test.com',
			password='pass1234',
			role='client',
		)
		self.client_obj = Organisation.objects.create(user=self.owner, name='Scoping Client')
		self.table = Table.objects.create(
			organisation=self.client_obj,
			name='Scoping Table',
			fields=[
				{'name': 'Name', 'type': 'text'},
				{'name': 'Class', 'type': 'class'},
				{'name': 'Section', 'type': 'section'},
			],
		)

	def test_scoping_distinct_cache_and_invalidation(self):
		from django.core.cache import cache
		from tables.models import IDCard
		from core.views.idcard_helpers import _get_distinct_field_values_cached, invalidate_table_distinct_cache

		# Ensure cache is empty initially
		invalidate_table_distinct_cache(self.table.id)
		
		# Create cards with classes and sections
		IDCard.objects.create(table=self.table, field_data={'Name': 'Alice', 'Class': '10', 'Section': 'A'})
		IDCard.objects.create(table=self.table, field_data={'Name': 'Bob', 'Class': '10', 'Section': 'B'})
		IDCard.objects.create(table=self.table, field_data={'Name': 'Charlie', 'Class': '11', 'Section': 'A'})

		# Call cached distinct lookup
		class_variants = ['Class', 'class', 'CLASS']

		# 1. First lookup triggers cache miss and database query
		classes_1 = _get_distinct_field_values_cached(self.table, 'class', class_variants)
		self.assertCountEqual(classes_1, ['10', '11'])

		# Verify cache is populated
		cache_key = f"table_distinct_fields:{self.table.id}:class"
		self.assertEqual(cache.get(cache_key), classes_1)

		# 2. Modify card, triggering post_save signal and cache invalidation
		card = IDCard.objects.create(table=self.table, field_data={'Name': 'Dave', 'Class': '12', 'Section': 'C'})
		self.assertIsNone(cache.get(cache_key)) # Cache must be cleared by signal receiver!

		# 3. Next lookup repopulates cache with new value
		classes_2 = _get_distinct_field_values_cached(self.table, 'class', class_variants)
		self.assertCountEqual(classes_2, ['10', '11', '12'])
		self.assertEqual(cache.get(cache_key), classes_2)

		# 4. Delete card, triggering post_delete signal and cache invalidation
		card.delete()
		self.assertIsNone(cache.get(cache_key))

		# 5. Lookup returns to original values
		classes_3 = _get_distinct_field_values_cached(self.table, 'class', class_variants)
		self.assertCountEqual(classes_3, ['10', '11'])

	def test_table_type_locked_on_update(self):
		from tables.services.table_service import IDCardTableService

		self.table.table_type = 'school_student'
		self.table.save()

		result = IDCardTableService.update_table(
			table_id=self.table.id,
			data={
				'name': 'Updated Students',
				'table_type': 'college_student',  # attempted change
				'fields': [
					{'name': 'Name', 'type': 'text', 'subtype': 'standard', 'mandatory': True},
					{'name': 'Class', 'type': 'text', 'subtype': 'class', 'mandatory': True},
				],
			},
		)
		self.assertTrue(result.success)
		self.table.refresh_from_db()
		self.assertEqual(self.table.name, 'UPDATED STUDENTS')
		# Table type must remain school_student because it was locked on creation
		self.assertEqual(self.table.table_type, 'school_student')

	def test_table_fields_preserve_subtype_and_detection(self):
		from tables.services.table_service import IDCardTableService
		from tables.views.helpers import _get_class_section_course_branch_field_names

		result = IDCardTableService.update_table(
			table_id=self.table.id,
			data={
				'name': 'Staff Table',
				'fields': [
					{'name': 'Emp Name', 'type': 'text', 'subtype': 'standard', 'mandatory': True},
					{'name': 'Role Title', 'type': 'text', 'subtype': 'designation', 'mandatory': True},
					{'name': 'Office Unit', 'type': 'text', 'subtype': 'department', 'mandatory': False},
					{'name': 'Avatar', 'type': 'photo', 'subtype': '', 'mandatory': False},
				],
			},
		)
		self.assertTrue(result.success)
		self.table.refresh_from_db()

		# Verify subtypes are preserved in JSON field definitions
		f_map = {f['name']: f for f in self.table.fields}
		self.assertEqual(f_map['ROLE TITLE']['subtype'], 'designation')
		self.assertEqual(f_map['OFFICE UNIT']['subtype'], 'department')
		self.assertEqual(f_map['EMP NAME']['subtype'], 'standard')

		# Verify helper extracts them as class (primary grouping) and section (secondary grouping)
		class_f, sec_f, _, _ = _get_class_section_course_branch_field_names(self.table)
		self.assertEqual(class_f, 'ROLE TITLE')
		self.assertEqual(sec_f, 'OFFICE UNIT')


class TableToggleStatusEndpointTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table

		self.owner = User.objects.create_user(
			username='toggle-owner@test.com',
			email='toggle-owner@test.com',
			password='pass1234',
			role='client',
		)
		self.client_obj = Organisation.objects.create(
			user=self.owner,
			name='Toggle Client',
			perm_idcard_setting_status=True,
		)
		self.table = Table.objects.create(
			organisation=self.client_obj,
			name='Toggle Table',
			fields=[{'name': 'Name', 'type': 'text'}],
			is_active=True,
		)

	def test_toggle_table_status_endpoint(self):
		self.client.force_login(self.owner)
		resp = self.client.post(f'/api/table/{self.table.id}/toggle-status/')
		self.assertEqual(resp.status_code, 200)
		data = resp.json()
		self.assertTrue(data['success'])
		self.table.refresh_from_db()
		self.assertFalse(self.table.is_active)

		# Toggle back to active
		resp2 = self.client.post(f'/api/table/{self.table.id}/toggle-status/')
		self.assertEqual(resp2.status_code, 200)
		self.table.refresh_from_db()
		self.assertTrue(self.table.is_active)

	def test_toggle_table_status_as_super_admin(self):
		admin = User.objects.create_user(
			username='admin-toggle@test.com',
			email='admin-toggle@test.com',
			password='pass',
			role='super_admin',
		)
		self.client.force_login(admin)
		resp = self.client.post(f'/api/table/{self.table.id}/toggle-status/')
		self.assertEqual(resp.status_code, 200)
		self.table.refresh_from_db()
		self.assertFalse(self.table.is_active)


class PhotoCollectionLinkPermissionTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table, IDCard

		self.owner_with_perm = User.objects.create_user(
			username='org_with_perm@test.com',
			email='org_with_perm@test.com',
			password='pass',
			role='client',
		)
		self.org_with_perm = Organisation.objects.create(
			user=self.owner_with_perm,
			name='Org With Perm',
			perm_idcard_photo_collection=True,
		)
		self.table_with_perm = Table.objects.create(
			organisation=self.org_with_perm,
			name='Students With Perm',
			fields=[
				{'name': 'Roll No', 'type': 'text'},
				{'name': 'Name', 'type': 'text'},
				{'name': 'Photo', 'type': 'photo'},
			],
		)
		self.card = IDCard.objects.create(
			table=self.table_with_perm,
			field_data={'Roll No': '101', 'Name': 'Rahul Sharma', 'Photo': ''},
			status='pending',
		)

		self.owner_no_perm = User.objects.create_user(
			username='org_no_perm@test.com',
			email='org_no_perm@test.com',
			password='pass',
			role='client',
		)
		self.org_no_perm = Organisation.objects.create(
			user=self.owner_no_perm,
			name='Org No Perm',
			perm_idcard_photo_collection=False,
		)
		self.table_no_perm = Table.objects.create(
			organisation=self.org_no_perm,
			name='Students No Perm',
			fields=[
				{'name': 'Roll No', 'type': 'text'},
				{'name': 'Name', 'type': 'text'},
				{'name': 'Photo', 'type': 'photo'},
			],
		)

	def test_config_forbidden_without_perm_idcard_photo_collection(self):
		self.client.force_login(self.owner_no_perm)
		resp = self.client.get(f'/api/table/{self.table_no_perm.id}/photo-collection/')
		self.assertEqual(resp.status_code, 403)
		data = resp.json()
		self.assertFalse(data['success'])

	def test_config_allowed_with_perm_idcard_photo_collection(self):
		self.client.force_login(self.owner_with_perm)
		resp = self.client.get(f'/api/table/{self.table_with_perm.id}/photo-collection/')
		self.assertEqual(resp.status_code, 200)
		data = resp.json()
		self.assertTrue(data['success'])
		self.assertIn('token', data['config'])








class CodeGenerationTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table, IDCard

		self.owner = User.objects.create_user(
			username='owner-codegen@test.com',
			email='owner-codegen@test.com',
			password='pass1234',
			role='client',
		)
		self.org = Organisation.objects.create(
			user=self.owner,
			name='CodeGen School',
			perm_idcard_edit=True,
		)
		self.table = Table.objects.create(
			organisation=self.org,
			name='Students CodeGen',
			fields=[
				{'name': 'Admission No', 'type': 'text'},
				{'name': 'Name', 'type': 'text'},
				{'name': 'Student QR', 'type': 'qr_code', 'code_mode': 'column', 'source_column': 'Admission No', 'code_prefix': 'STU-', 'code_suffix': ''},
				{'name': 'Library Barcode', 'type': 'barcode', 'code_mode': 'column', 'source_column': 'Admission No', 'code_prefix': '', 'code_suffix': ''},
				{'name': 'Portal QR', 'type': 'qr_code', 'code_mode': 'static', 'static_value': 'https://school.edu/verify'},
			],
		)
		self.card = IDCard.objects.create(
			table=self.table,
			field_data={
				'Admission No': 'ADM1001',
				'Name': 'John Doe',
			},
		)

	def test_qr_and_barcode_png_generation(self):
		from tables.services.code_generation_service import CodeGenerationService
		qr_bytes = CodeGenerationService.generate_qr_bytes('SAMPLE_QR')
		self.assertEqual(qr_bytes[:4], b'\x89PNG')

		bc_bytes = CodeGenerationService.generate_barcode_bytes('12345678')
		self.assertEqual(bc_bytes[:4], b'\x89PNG')

	def test_resolve_code_values(self):
		from tables.services.code_generation_service import CodeGenerationService
		fields = self.table.fields
		# Dynamic column
		val_qr = CodeGenerationService.resolve_code_value(self.card, fields[2])
		self.assertEqual(val_qr, 'STU-ADM1001')

		# Static link
		val_static = CodeGenerationService.resolve_code_value(self.card, fields[4])
		self.assertEqual(val_static, 'https://school.edu/verify')

	def test_generate_codes_for_table(self):
		from tables.services.code_generation_service import CodeGenerationService
		result = CodeGenerationService.generate_codes_for_table(self.table.id)
		self.assertTrue(result['success'])
		self.assertGreaterEqual(result['generated_count'], 3)
		self.card.refresh_from_db()
		self.assertTrue(self.card.field_data.get('Student QR', '').endswith('.png'))
		self.assertTrue(self.card.field_data.get('Library Barcode', '').endswith('.png'))
		self.assertTrue(self.card.field_data.get('Portal QR', '').endswith('.png'))

	def test_api_table_generate_codes_endpoint(self):
		self.client.force_login(self.owner)
		resp = self.client.post(f'/api/table/{self.table.id}/generate-codes/')
		self.assertEqual(resp.status_code, 200)
		data = resp.json()
		self.assertTrue(data['success'])
		self.assertIn('generated_count', data)

		# Test with JSON payload for specific card_ids
		import json
		resp2 = self.client.post(
			f'/api/table/{self.table.id}/generate-codes/',
			data=json.dumps({'card_ids': [self.card.id]}),
			content_type='application/json',
		)
		self.assertEqual(resp2.status_code, 200)
		self.assertTrue(resp2.json()['success'])
	def test_dual_mode_search_numeric_prioritizes_numeric_columns(self):
		from tables.models import IDCard
		from tables.services.card_service import IDCardCardService

		# Card 1 has Admission No "101", card 2 has "101" inside Name text
		c1 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Student A', 'Admission No': '101'},
			status='pending',
		)
		c2 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Student B 101', 'Admission No': '205'},
			status='pending',
		)

		res = IDCardCardService.list_cards(self.table.id, search='101')
		self.assertTrue(res.success)
		cards = res.data['cards']
		# Numeric query: exact match on numeric column (Admission No) ranks before Name column!
		self.assertEqual(cards[0]['id'], c1.id)

	def test_dual_mode_search_character_prioritizes_name_columns(self):
		from tables.models import IDCard
		from tables.services.card_service import IDCardCardService

		# Card 1 has Name "Aman Sharma", Card 2 has Admission No "Aman" but name "Rahul"
		c1 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Aman Sharma', 'Admission No': '500'},
			status='pending',
		)
		c2 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Rahul Verma', 'Admission No': 'Aman'},
			status='pending',
		)

		res = IDCardCardService.list_cards(self.table.id, search='Aman')
		self.assertTrue(res.success)
		cards = res.data['cards']
		# Character query: match on Name column ranks before Admission No column!
		self.assertEqual(cards[0]['id'], c1.id)

	def test_class_filter_fallback_and_cache_invalidation(self):
		from tables.models import IDCard
		from tables.views.helpers import _build_class_filter_q, invalidate_table_distinct_cache
		from django.core.cache import cache

		# Create a card with a newly added class "Grade-X"
		c = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'New Student', 'Class': 'Grade-X', 'Section': 'A'},
			status='pending',
		)

		# Build query with class filter "Grade-X"
		qs = IDCard.objects.filter(table=self.table)
		filtered_qs = _build_class_filter_q(qs, 'Grade-X', 'Class', table_id=self.table.id)
		self.assertTrue(filtered_qs.filter(id=c.id).exists())


class TableFreezeTests(TestCase):
	def setUp(self):
		from organisation.models import Organisation
		from tables.models import Table, IDCard
		from django.utils import timezone
		import datetime

		self.super_admin = User.objects.create_user(
			username='freeze-admin@test.com',
			email='freeze-admin@test.com',
			password='pass',
			role='super_admin',
		)
		self.operator = User.objects.create_user(
			username='freeze-op@test.com',
			email='freeze-op@test.com',
			password='pass',
			role='operator',
		)
		self.client_user = User.objects.create_user(
			username='freeze-client@test.com',
			email='freeze-client@test.com',
			password='pass',
			role='client',
		)
		self.org = Organisation.objects.create(
			user=self.client_user,
			name='Freeze High School',
			perm_idcard_approved_list=True,
			perm_idcard_download_list=True,
		)
		from operators.models import Operator
		self.op_profile = Operator.objects.create(
			user=self.operator,
			perm_idcard_approved_list=True,
			perm_idcard_download_list=True,
		)
		self.op_profile.assigned_organisations.add(self.org)
		self.table = Table.objects.create(
			organisation=self.org,
			name='Batch 2026',
			fields=[
				{'name': 'Name', 'type': 'text'},
				{'name': 'Roll No', 'type': 'text'},
			],
		)

		now = timezone.now()
		# Card 1: moved to approved 2 hours ago
		self.card1 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Batch Student 1'},
			status='approved',
			status_changed_at=now - datetime.timedelta(hours=2),
		)
		# Card 2: moved to approved 1 hour ago
		self.card2 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Batch Student 2'},
			status='approved',
			status_changed_at=now - datetime.timedelta(hours=1),
		)
		# Card 3: newly moved to approved 5 minutes ago (newer card)
		self.card3 = IDCard.objects.create(
			table=self.table,
			field_data={'Name': 'Late Student 3'},
			status='approved',
			status_changed_at=now - datetime.timedelta(minutes=5),
		)

	def test_freeze_service_apply_and_unfreeze(self):
		from tables.models import IDCard
		from tables.services.freeze_service import TableFreezeService
		from django.utils import timezone
		import datetime

		now = timezone.now()
		from_str = (now - datetime.timedelta(hours=3)).isoformat()
		to_str = (now - datetime.timedelta(minutes=30)).isoformat()

		# Client user should be rejected
		client_res = TableFreezeService.apply_freeze(self.table, 'approved', from_str, to_str, self.client_user)
		self.assertFalse(client_res.success)

		# Operator user should succeed
		op_res = TableFreezeService.apply_freeze(self.table, 'approved', from_str, to_str, self.operator)
		self.assertTrue(op_res.success)
		info = op_res.data
		self.assertTrue(info['is_frozen'])
		self.assertEqual(info['cards_in_freeze'], 2) # card1 and card2 within window, card3 excluded
		self.assertEqual(info['total_cards_in_status'], 3)

		# Queryset filtering check
		qs = IDCard.objects.filter(table=self.table, status='approved')
		admin_qs = TableFreezeService.apply_freeze_to_queryset(qs, self.table.id, 'approved', self.super_admin)
		self.assertEqual(admin_qs.count(), 2)
		self.assertIn(self.card1, admin_qs)
		self.assertIn(self.card2, admin_qs)
		self.assertNotIn(self.card3, admin_qs)

		# Unfreeze table
		unfreeze_res = TableFreezeService.unfreeze_table(self.table, 'approved', self.operator)
		self.assertTrue(unfreeze_res.success)
		self.assertFalse(unfreeze_res.data['is_frozen'])

		# After unfreeze, all 3 cards appear
		unfrozen_qs = TableFreezeService.apply_freeze_to_queryset(qs, self.table.id, 'approved', self.super_admin)
		self.assertEqual(unfrozen_qs.count(), 3)

	def test_freeze_endpoints_and_json_response(self):
		import json
		from django.utils import timezone
		import datetime

		now = timezone.now()
		from_str = (now - datetime.timedelta(hours=3)).isoformat()
		to_str = (now - datetime.timedelta(minutes=30)).isoformat()

		# Freeze table via endpoint
		self.client.force_login(self.operator)
		freeze_resp = self.client.post(
			f'/api/table/{self.table.id}/freeze-table/',
			data=json.dumps({
				'status': 'approved',
				'frozen_from': from_str,
				'frozen_to': to_str,
			}),
			content_type='application/json',
		)
		self.assertEqual(freeze_resp.status_code, 200)
		self.assertTrue(freeze_resp.json()['success'])

		# Check freeze-info endpoint
		info_resp = self.client.get(f'/api/table/{self.table.id}/freeze-info/?status=approved')
		self.assertEqual(info_resp.status_code, 200)
		info_data = info_resp.json()['data']
		self.assertTrue(info_data['is_frozen'])
		self.assertEqual(info_data['cards_in_freeze'], 2)

		# Check cards-json returns freeze_info and isolates cards for operator
		cards_resp = self.client.get(f'/api/table/{self.table.id}/cards-json/?status=approved')
		self.assertEqual(cards_resp.status_code, 200)
		cards_data = cards_resp.json()
		self.assertEqual(cards_data['total'], 2)
		self.assertIsNotNone(cards_data.get('freeze_info'))
		self.assertTrue(cards_data['freeze_info']['is_frozen'])

		# Unfreeze via endpoint
		unfreeze_resp = self.client.post(
			f'/api/table/{self.table.id}/unfreeze-table/',
			data=json.dumps({'status': 'approved'}),
			content_type='application/json',
		)
		self.assertEqual(unfreeze_resp.status_code, 200)
		self.assertTrue(unfreeze_resp.json()['success'])


