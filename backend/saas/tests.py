import json
from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import SaaSSubscription, SaaSPayment, SaaSLead, SaaSTierFeature, SaaSPlatformLog
from .services import (
    SaaSStorageService,
    SaaSFeatureService,
    SaaSTelemetryService,
    SaaSBillingService,
    SaaSQuotaService,
)

User = get_user_model()


class SaaSSubscriptionModelTests(TestCase):
    def test_create_subscription_generates_slug_and_storage(self):
        sub = SaaSSubscription.objects.create(name='Global Academy Group', tier='pro')
        self.assertEqual(sub.slug, 'global-academy-group')
        self.assertEqual(sub.storage_folder, 'tenants/global-academy-group')
        self.assertEqual(sub.max_super_admins, 3)

    def test_storage_folder_creation(self):
        sub = SaaSSubscription.objects.create(name='Lincoln High School', tier='lite')
        path = sub.get_storage_path('adarshimg', 'test.jpg')
        self.assertTrue('tenants' in path)
        self.assertTrue('lincoln-high-school' in path)


class SuperAdminQuotaPerSubscriptionTests(TestCase):
    def setUp(self):
        self.sub_a = SaaSSubscription.objects.create(name='Client Alpha', slug='client-alpha')
        self.sub_b = SaaSSubscription.objects.create(name='Client Beta', slug='client-beta')

    def test_max_3_super_admins_per_subscription(self):
        # Create 3 super admins for Sub A
        for i in range(1, 4):
            User.objects.create_user(
                username=f'alpha_admin_{i}',
                email=f'alpha_{i}@test.com',
                password='pass',
                role='super_admin',
                subscription=self.sub_a,
            )
        self.assertEqual(User.objects.filter(role='super_admin', subscription=self.sub_a).count(), 3)

        # 4th super admin for Sub A must fail
        with self.assertRaises(ValidationError):
            User.objects.create_user(
                username='alpha_admin_4',
                email='alpha_4@test.com',
                password='pass',
                role='super_admin',
                subscription=self.sub_a,
            )

        # But Sub B can still create its own 3 super admins
        for i in range(1, 4):
            User.objects.create_user(
                username=f'beta_admin_{i}',
                email=f'beta_{i}@test.com',
                password='pass',
                role='super_admin',
                subscription=self.sub_b,
            )
        self.assertEqual(User.objects.filter(role='super_admin', subscription=self.sub_b).count(), 3)


class PrimeAdminAndPrimeOperatorTests(TestCase):
    def test_prime_admin_singleton(self):
        prime = User.objects.create_user(
            username='prime_master',
            email='prime@cardflow.io',
            password='masterpass123',
            role='prime_admin',
        )
        self.assertTrue(prime.is_superuser)
        self.assertTrue(prime.is_staff)
        self.assertTrue(prime.is_prime_admin)
        self.assertFalse(prime.is_super_admin)

        # Second prime admin must fail
        with self.assertRaises(ValidationError):
            User.objects.create_user(
                username='prime_master_2',
                email='prime2@cardflow.io',
                password='masterpass123',
                role='prime_admin',
            )

    def test_prime_operators_subroles(self):
        op_sales = User.objects.create_user(
            username='op_sales',
            email='sales@cardflow.io',
            password='pass',
            role='prime_operator',
            prime_operator_role='sales',
        )
        op_dev = User.objects.create_user(
            username='op_dev',
            email='dev@cardflow.io',
            password='pass',
            role='prime_operator',
            prime_operator_role='dev',
        )
        op_helper = User.objects.create_user(
            username='op_helper',
            email='helper@cardflow.io',
            password='pass',
            role='prime_operator',
            prime_operator_role='helper',
        )

        self.assertEqual(op_sales.prime_operator_role, 'sales')
        self.assertEqual(op_dev.prime_operator_role, 'dev')
        self.assertEqual(op_helper.prime_operator_role, 'helper')
        self.assertTrue(op_sales.is_prime_operator)
        self.assertTrue(op_sales.is_staff)
        self.assertFalse(op_sales.is_superuser)


class SaaSFeatureGatingTests(TestCase):
    def setUp(self):
        self.sub_lite = SaaSSubscription.objects.create(name='Lite Client', tier='lite')
        self.sub_pro = SaaSSubscription.objects.create(name='Pro Client', tier='pro')
        self.sub_max = SaaSSubscription.objects.create(name='Max Client', tier='max')

    def test_tier_feature_matrix_resolution(self):
        # All tiers have all core features ON by default
        self.assertTrue(SaaSFeatureService.has_feature(self.sub_lite, 'bulk_docx_xlsx_embedded'))
        self.assertTrue(SaaSFeatureService.has_feature(self.sub_pro, 'bulk_docx_xlsx_embedded'))
        self.assertTrue(SaaSFeatureService.has_feature(self.sub_max, 'bulk_docx_xlsx_embedded'))

        # Base card quota is 10,000 cards across all tiers; organisation limits distinguish tiers
        self.assertEqual(self.sub_lite.max_cards, 10000)
        self.assertEqual(self.sub_lite.max_organisations, 100)
        self.assertEqual(self.sub_pro.max_cards, 10000)
        self.assertEqual(self.sub_pro.max_organisations, 500)
        self.assertEqual(self.sub_max.max_cards, 10000)
        self.assertEqual(self.sub_max.max_organisations, 2000)

    def test_quota_service_and_extra_cards(self):
        from saas.services import SaaSQuotaService
        sub = SaaSSubscription.objects.create(name='Quota School', tier='lite')
        self.assertEqual(sub.effective_card_limit, 10000)

        # Request extra cards
        from saas.models import SaaSCardTopupRequest
        topup = SaaSCardTopupRequest.objects.create(
            subscription=sub,
            quantity=5000,
            amount=1199.00,
        )
        self.assertEqual(topup.status, 'pending')
        topup.approve()
        sub.refresh_from_db()
        self.assertEqual(sub.extra_cards_purchased, 5000)
        self.assertEqual(sub.effective_card_limit, 15000)

    def test_paid_addons_pricing_and_activation(self):
        from saas.services import SaaSAddonService
        from saas.models import SaaSAddonRequest
        sub = SaaSSubscription.objects.create(name='Addon Academy', tier='pro')
        self.assertFalse(sub.auto_print_active)

        # Request Auto Print bundle (access + 10k cards)
        req = SaaSAddonRequest.objects.create(
            subscription=sub,
            addon_type='auto_print',
            request_type='bundle',
            amount=1498.00,
            credits_to_add=10000,
        )
        req.approve()
        sub.refresh_from_db()
        self.assertTrue(sub.auto_print_active)
        self.assertEqual(sub.auto_print_credits, 10000)

        # Deduct credits
        ok, msg = SaaSAddonService.deduct_credits(sub, 'auto_print', qty=250)
        self.assertTrue(ok)
        sub.refresh_from_db()
        self.assertEqual(sub.auto_print_credits, 9750)


class SaaSApiEndpointTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.prime_admin = User.objects.create_user(
            username='prime_owner',
            email='owner@cardflow.io',
            password='Password123!',
            role='prime_admin',
        )
        self.sub = SaaSSubscription.objects.create(name='Springfield High', tier='pro')
        self.super_admin = User.objects.create_user(
            username='super_admin_springfield',
            email='admin@springfield.edu',
            password='Password123!',
            role='super_admin',
            subscription=self.sub,
        )

    def test_overview_api(self):
        self.client.force_login(self.prime_admin)
        res = self.client.get('/api/saas/overview/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertIn('overview', data)
        self.assertGreaterEqual(data['overview']['total_tenants'], 1)

    def test_create_and_list_subscriptions(self):
        self.client.force_login(self.prime_admin)
        post_res = self.client.post(
            '/api/saas/subscriptions/',
            data='{"name": "New Horizons College", "tier": "max"}',
            content_type='application/json',
        )
        self.assertEqual(post_res.status_code, 201)

        list_res = self.client.get('/api/saas/subscriptions/')
        self.assertEqual(list_res.status_code, 200)
        subs = list_res.json()['subscriptions']
        self.assertTrue(any(s['name'] == 'New Horizons College' for s in subs))

    def test_payments_ledger_api(self):
        self.client.force_login(self.prime_admin)
        pay_res = self.client.post(
            '/api/saas/payments/',
            data=f'{{"subscription_id": {self.sub.id}, "amount": 149.00, "payment_method": "stripe"}}',
            content_type='application/json',
        )
        self.assertEqual(pay_res.status_code, 201)

        get_res = self.client.get('/api/saas/payments/')
        self.assertEqual(get_res.status_code, 200)
        pays = get_res.json()['payments']
        self.assertEqual(len(pays), 1)
        self.assertEqual(pays[0]['amount'], 149.00)

    def test_leads_crm_api(self):
        self.client.force_login(self.prime_admin)
        lead_res = self.client.post(
            '/api/saas/leads/',
            data='{"name": "Principal Skinner", "company_name": "Springfield Elementary", "email": "skinner@springfield.edu", "tier_interested": "pro"}',
            content_type='application/json',
        )
        self.assertEqual(lead_res.status_code, 201)

        get_res = self.client.get('/api/saas/leads/')
        self.assertEqual(get_res.status_code, 200)
        leads = get_res.json()['leads']
        self.assertTrue(any(l['company_name'] == 'Springfield Elementary' for l in leads))

    def test_subscription_quota_api(self):
        self.client.force_login(self.super_admin)
        res = self.client.get('/api/saas/subscription/quota/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        quota = data['quota']
        self.assertEqual(quota['tier'], 'pro')
        self.assertEqual(quota['effective_card_limit'], 10000)
        self.assertIn('addons', quota)
        self.assertIn('auto_print', quota['addons'])
        self.assertIn('auto_type', quota['addons'])
        self.assertIn('auto_edit', quota['addons'])

    def test_request_extra_cards_api(self):
        self.client.force_login(self.super_admin)
        res = self.client.post(
            '/api/saas/subscription/request-extra-cards/',
            data='{"quantity": 5000, "notes": "Need for exam season"}',
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 201)
        topup_id = res.json()['request_id']

        # Prime Admin approves it
        self.client.force_login(self.prime_admin)
        approve_res = self.client.post(f'/api/saas/topups/{topup_id}/approve/')
        self.assertEqual(approve_res.status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.extra_cards_purchased, 5000)
        self.assertEqual(self.sub.effective_card_limit, 15000)

    def test_request_addon_api(self):
        self.client.force_login(self.super_admin)
        res = self.client.post(
            '/api/saas/subscription/request-addon/',
            data='{"addon_type": "auto_edit", "request_type": "annual_access"}',
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 201)
        addon_req_id = res.json()['request_id']

        # Prime Admin approves
        self.client.force_login(self.prime_admin)
        approve_res = self.client.post(f'/api/saas/addons/{addon_req_id}/approve/')
        self.assertEqual(approve_res.status_code, 200)
        self.sub.refresh_from_db()
        self.assertTrue(self.sub.auto_edit_active)

    def test_prime_admin_support_mode_enter_account(self):
        # Prime Admin enters Super Admin account via Support Mode
        self.client.force_login(self.prime_admin)
        res = self.client.post(f'/api/saas/subscriptions/{self.sub.id}/impersonate/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['target_user']['id'], self.super_admin.id)
        self.assertIn('redirect_url', data)

        # Confirm session is now impersonating super_admin
        me_res = self.client.get('/api/auth/me/')
        self.assertEqual(me_res.status_code, 200)
        self.assertTrue(me_res.json().get('is_impersonating'))

        # Exit Support Mode
        exit_res = self.client.post('/api/auth/impersonate/stop/')
        self.assertEqual(exit_res.status_code, 200)
        self.assertTrue(exit_res.json()['success'])



class EphemeralExportCleanupTests(TestCase):
    def test_ephemeral_cleanup_deletes_old_files_and_marks_tasks(self):
        import os
        import time
        from django.conf import settings
        from core.models import BackgroundTask
        from core.services.ephemeral_cleanup_service import EphemeralExportCleanupService

        export_dir = os.path.join(settings.MEDIA_ROOT, 'exports')
        os.makedirs(export_dir, exist_ok=True)
        test_file = os.path.join(export_dir, 'test_export_purge.pdf')
        with open(test_file, 'wb') as f:
            f.write(b'%PDF-1.4 dummy export data')

        past_time = time.time() - (40 * 60)
        os.utime(test_file, (past_time, past_time))

        user = User.objects.create_user(username='exporter', email='exporter@test.com', password='pass')
        from django.utils import timezone
        cutoff = timezone.now() - timezone.timedelta(minutes=40)
        task = BackgroundTask.objects.create(
            user=user,
            task_type='export_pdf',
            status='completed',
            result_path='exports/test_export_purge.pdf',
            completed_at=cutoff,
        )

        stats = EphemeralExportCleanupService.run_cleanup(ttl_minutes=20)
        self.assertGreaterEqual(stats['files_deleted'], 1)
        self.assertFalse(os.path.exists(test_file))

        task.refresh_from_db()
        self.assertEqual(task.status, 'expired')


class SecurityServiceAndAlarmsTests(TestCase):
    def setUp(self):
        from django.test import RequestFactory
        from django.core.cache import cache
        from core.services.security_service import SecurityService
        from core.models import ActivityLog

        self.rf = RequestFactory()
        self.SecurityService = SecurityService
        self.ActivityLog = ActivityLog
        cache.clear()

    def test_brute_force_failed_login_detection_and_blocking(self):
        req = self.rf.post('/api/auth/login/', REMOTE_ADDR='203.0.113.42')
        self.assertFalse(self.SecurityService.is_ip_blocked(req))

        for _ in range(4):
            alarm = self.SecurityService.record_failed_login(req, 'target_admin')
            self.assertFalse(alarm)

        self.assertFalse(self.SecurityService.is_ip_blocked(req))

        # 5th failed attempt triggers alarm and block
        alarm = self.SecurityService.record_failed_login(req, 'target_admin')
        self.assertTrue(alarm)
        self.assertTrue(self.SecurityService.is_ip_blocked(req))

        alarm_log = self.ActivityLog.objects.filter(action='security_alarm').first()
        self.assertIsNotNone(alarm_log)
        self.assertIn('consecutive failed logins', alarm_log.description)
        self.assertEqual(alarm_log.ip_address, '203.0.113.42')

    def test_cross_tenant_probe_detection(self):
        user = User.objects.create_user(username='sneaky_user', email='sneaky@test.com', password='pass')
        req = self.rf.get('/api/organisations/999/', REMOTE_ADDR='198.51.100.12')
        req.user = user

        self.SecurityService.record_cross_tenant_probe(req, user, attempted_tenant_id='TargetTenant')
        alarm_log = self.ActivityLog.objects.filter(action='security_alarm', ip_address='198.51.100.12').first()
        self.assertIsNotNone(alarm_log)
        self.assertIn('Unauthorized crossover attempt blocked', alarm_log.description)


class ScopedActivityLogsAndServerInfoTests(TestCase):
    def setUp(self):
        from core.models import ActivityLog
        self.ActivityLog = ActivityLog
        self.client = Client()
        self.prime_admin = User.objects.create_user(
            username='prime_boss', email='boss@cardflow.io', password='pass', role='prime_admin',
        )
        self.sub_a = SaaSSubscription.objects.create(name='Tenant A', slug='tenant-a')
        self.sub_b = SaaSSubscription.objects.create(name='Tenant B', slug='tenant-b')

        self.super_admin_a = User.objects.create_user(
            username='admin_a', email='admin_a@tenanta.com', password='pass',
            role='super_admin', subscription=self.sub_a,
        )
        self.super_admin_b = User.objects.create_user(
            username='admin_b', email='admin_b@tenantb.com', password='pass',
            role='super_admin', subscription=self.sub_b,
        )

        self.ActivityLog.objects.create(
            user=self.super_admin_a,
            action='table_create',
            description='Tenant A created table',
        )
        self.ActivityLog.objects.create(
            user=self.super_admin_b,
            action='table_create',
            description='Tenant B created table',
        )

    def test_super_admin_only_sees_tenant_logs(self):
        self.client.force_login(self.super_admin_a)
        res = self.client.get('/api/activity-logs/')
        self.assertEqual(res.status_code, 200)
        logs = res.json()['logs']
        descriptions = [l['description'] for l in logs]
        self.assertIn('Tenant A created table', descriptions)
        self.assertNotIn('Tenant B created table', descriptions)

    def test_prime_admin_sees_all_system_logs(self):
        self.client.force_login(self.prime_admin)
        res = self.client.get('/api/activity-logs/')
        self.assertEqual(res.status_code, 200)
        logs = res.json()['logs']
        descriptions = [l['description'] for l in logs]
        self.assertIn('Tenant A created table', descriptions)
        self.assertIn('Tenant B created table', descriptions)


class SaaSDualStepPricingAndManualPaymentTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.sub = SaaSSubscription.objects.create(name='Acme School System', tier='lite')
        self.super_admin = User.objects.create_user(
            username='acme_super_admin',
            email='admin@acme.edu',
            password='password123',
            role='super_admin',
            subscription=self.sub,
        )
        self.prime_admin = User.objects.create_user(
            username='saas_prime_master',
            email='master@cardflow.io',
            password='masterpassword123',
            role='prime_admin',
        )

    def test_tier_pricing_configuration(self):
        pricing = SaaSBillingService.TIER_PRICING
        # Starter: 4999 setup (2 mos free) + 499/mo or 4999/yr
        self.assertEqual(pricing['lite']['display_name'], 'CardFlow Starter')
        self.assertEqual(pricing['lite']['setup_fee'], 4999.00)
        self.assertEqual(pricing['lite']['monthly_price'], 499.00)
        self.assertEqual(pricing['lite']['quarterly_price'], 1399.00)
        self.assertEqual(pricing['lite']['half_yearly_price'], 2599.00)
        self.assertEqual(pricing['lite']['yearly_price'], 4999.00)
        self.assertEqual(pricing['lite']['max_cards'], 10000)

        # Professional: 7499 setup (2 mos free) + 499/mo or 4999/yr
        self.assertEqual(pricing['pro']['display_name'], 'CardFlow Professional')
        self.assertEqual(pricing['pro']['setup_fee'], 7499.00)
        self.assertEqual(pricing['pro']['monthly_price'], 499.00)
        self.assertEqual(pricing['pro']['quarterly_price'], 1399.00)
        self.assertEqual(pricing['pro']['half_yearly_price'], 2599.00)
        self.assertEqual(pricing['pro']['yearly_price'], 4999.00)
        self.assertEqual(pricing['pro']['max_cards'], 10000)

        # Enterprise: 9999 setup (2 mos free) + 499/mo or 4999/yr
        self.assertEqual(pricing['max']['display_name'], 'CardFlow Enterprise')
        self.assertEqual(pricing['max']['setup_fee'], 9999.00)
        self.assertEqual(pricing['max']['monthly_price'], 499.00)
        self.assertEqual(pricing['max']['quarterly_price'], 1399.00)
        self.assertEqual(pricing['max']['half_yearly_price'], 2599.00)
        self.assertEqual(pricing['max']['yearly_price'], 4999.00)
        self.assertEqual(pricing['max']['max_cards'], 10000)

    def test_manual_payment_submission(self):
        payment = SaaSBillingService.submit_manual_payment(
            subscription=self.sub,
            amount=Decimal('4999.00'),
            payment_method='upi',
            payment_plan_type='split_step1',
            utr_number='UPI123456789012',
            screenshot_url='https://example.com/receipt.jpg',
            notes='Annual Step 1 Setup',
        )
        self.assertEqual(payment.status, 'pending_verification')
        self.assertEqual(payment.amount, Decimal('4999.00'))
        self.assertEqual(payment.utr_number, 'UPI123456789012')
        self.assertEqual(payment.payment_plan_type, 'split_step1')

    def test_verify_payment_split_step1_gives_60_days_free_buffer(self):
        payment = SaaSBillingService.submit_manual_payment(
            subscription=self.sub,
            amount=Decimal('4999.00'),
            payment_method='bank_transfer',
            payment_plan_type='split_step1',
            utr_number='HDFC99887766',
        )
        ok, msg = SaaSBillingService.verify_payment(payment, verified_by=self.prime_admin, action='approve')
        self.assertTrue(ok)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'active')
        self.assertEqual(self.sub.billing_plan, 'split')
        self.assertEqual(self.sub.installments_paid, 0)
        self.assertIsNotNone(self.sub.next_installment_due)
        # Should be roughly 60 days ahead
        delta = (self.sub.next_installment_due - timezone.now().date()).days
        self.assertIn(delta, [59, 60, 61])

    def test_verify_payment_split_installment(self):
        self.sub.billing_plan = 'split'
        self.sub.installments_paid = 1
        self.sub.save()

        payment = SaaSBillingService.submit_manual_payment(
            subscription=self.sub,
            amount=Decimal('499.00'),
            payment_method='upi',
            payment_plan_type='split_installment',
            utr_number='UPI_INSTALLMENT_2',
        )
        ok, msg = SaaSBillingService.verify_payment(payment, verified_by=self.prime_admin, action='approve')
        self.assertTrue(ok)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.installments_paid, 2)
        delta = (self.sub.next_installment_due - timezone.now().date()).days
        self.assertIn(delta, [29, 30, 31])

    def test_verify_payment_one_time_annual(self):
        payment = SaaSBillingService.submit_manual_payment(
            subscription=self.sub,
            amount=Decimal('8999.00'),
            payment_method='upi',
            payment_plan_type='one_time_annual',
            utr_number='UPI_FULL_YEAR_8999',
        )
        ok, msg = SaaSBillingService.verify_payment(payment, verified_by=self.prime_admin, action='approve')
        self.assertTrue(ok)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'active')
        self.assertEqual(self.sub.billing_plan, 'one_time')
        self.assertEqual(self.sub.installments_paid, 10)
        self.assertIsNone(self.sub.next_installment_due)

    def test_verify_payment_rejection(self):
        payment = SaaSBillingService.submit_manual_payment(
            subscription=self.sub,
            amount=Decimal('4999.00'),
            payment_method='upi',
            payment_plan_type='split_step1',
            utr_number='INVALID_UTR_123',
        )
        ok, msg = SaaSBillingService.verify_payment(
            payment,
            verified_by=self.prime_admin,
            action='reject',
            rejection_reason='UTR not found in bank ledger',
        )
        self.assertTrue(ok)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'rejected')
        self.assertEqual(payment.rejection_reason, 'UTR not found in bank ledger')

    def test_api_submit_and_verify_endpoints(self):
        self.client.force_login(self.super_admin)
        submit_res = self.client.post(
            '/api/saas/payments/submit/',
            data=json.dumps({
                'amount': 4999,
                'payment_plan_type': 'split_step1',
                'payment_method': 'upi',
                'utr_number': 'TESTUTR987654321',
                'screenshot_url': 'https://example.com/proof.png',
            }),
            content_type='application/json',
        )
        self.assertEqual(submit_res.status_code, 201)
        pay_id = submit_res.json()['payment_id']

        # Prime Admin verifies and approves
        self.client.force_login(self.prime_admin)
        verify_res = self.client.post(
            f'/api/saas/payments/{pay_id}/verify/',
            data=json.dumps({'action': 'approve'}),
            content_type='application/json',
        )
        self.assertEqual(verify_res.status_code, 200)
        self.assertTrue(verify_res.json()['success'])

        self.sub.refresh_from_db()
        self.assertEqual(self.sub.status, 'active')


class SaaSLicenseAndPlatformLogsTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.sub = SaaSSubscription.objects.create(name='Global Apex Institute', tier='pro')
        self.super_admin = User.objects.create_user(
            username='apex_super_admin',
            email='admin@apex.edu',
            password='password123',
            role='super_admin',
            subscription=self.sub,
        )
        self.prime_admin = User.objects.create_user(
            username='saas_prime_owner',
            email='owner@cardflow.io',
            password='masterpassword123',
            role='prime_admin',
        )
        self.dev_operator = User.objects.create_user(
            username='prime_dev_eng',
            email='dev@staff.cardflow.io',
            password='devpassword123',
            role='prime_operator',
            prime_operator_role='dev',
        )

    def test_license_key_auto_generated_on_creation(self):
        self.assertIsNotNone(self.sub.license_key)
        self.assertTrue(self.sub.license_key.startswith('CF-PRO-'))
        self.assertEqual(self.sub.license_status, 'active')
        self.assertTrue(self.sub.is_license_valid)

    def test_license_in_quota_api(self):
        self.client.force_login(self.super_admin)
        res = self.client.get('/api/saas/subscription/quota/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('license', data['quota'])
        lic = data['quota']['license']
        self.assertEqual(lic['license_key'], self.sub.license_key)
        self.assertEqual(lic['license_status'], 'active')
        self.assertTrue(lic['is_license_valid'])

    def test_regenerate_license_api(self):
        old_key = self.sub.license_key
        self.client.force_login(self.dev_operator)
        res = self.client.post(f'/api/saas/subscriptions/{self.sub.id}/regenerate-license/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        new_key = data['license_key']
        self.assertNotEqual(old_key, new_key)
        self.assertTrue(new_key.startswith('CF-PRO-'))

        self.sub.refresh_from_db()
        self.assertEqual(self.sub.license_key, new_key)

        # Check platform log was recorded
        log = SaaSPlatformLog.objects.filter(subscription=self.sub, action='LICENSE_REISSUED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.category, 'license')
        self.assertEqual(log.actor, self.dev_operator)

    def test_platform_logs_api(self):
        # Create a log entry
        SaaSPlatformLog.objects.create(
            subscription=self.sub,
            actor=self.dev_operator,
            actor_name_snapshot='prime_dev_eng',
            actor_role_snapshot='prime_operator',
            category='security',
            level='critical',
            action='UNAUTHORIZED_ACCESS_BLOCKED',
            title='Cross-tenant access blocked',
            description='Attempt to access tenant isolated media',
        )

        self.client.force_login(self.prime_admin)
        res = self.client.get('/api/saas/logs/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('logs', data)
        self.assertIn('stats', data)
        self.assertGreaterEqual(data['stats']['critical_alerts'], 1)

        # Non-prime user gets 403
        self.client.force_login(self.super_admin)
        res_forbidden = self.client.get('/api/saas/logs/')
        self.assertEqual(res_forbidden.status_code, 403)



