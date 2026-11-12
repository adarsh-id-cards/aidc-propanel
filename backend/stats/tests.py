from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.utils import timezone

from organisation.models import Organisation
from core.models import BackgroundTask, ActivityLog
from accounts.models import UserDeviceSession
from stats.models import StatsSnapshot
from stats.services import StatsService

User = get_user_model()


class StatisticsTests(TestCase):
    def setUp(self):
        # Create standard test users
        self.super_admin = User.objects.create_superuser(
            username='stats-admin@test.com',
            password='testpass123',
            email='stats-admin@test.com'
        )
        self.super_admin.role = 'super_admin'
        self.super_admin.save()

        self.client_user = User.objects.create_user(
            username='stats-client@test.com',
            password='testpass123',
            email='stats-client@test.com'
        )
        self.client_user.role = 'prime_manager'
        self.client_user.save()

        # Create client profile
        self.org = Organisation.objects.create(
            user=self.client_user,
            name='Stats Test Client',
            status='active'
        )

        # Create an assistant user
        self.assistant_user = User.objects.create_user(
            username='stats-assistant@test.com',
            password='testpass123',
            email='stats-assistant@test.com'
        )
        self.assistant_user.role = 'assistant'
        self.assistant_user.save()

        # Create a pro user
        self.pro_user = User.objects.create_user(
            username='stats-pro@test.com',
            password='testpass123',
            email='stats-pro@test.com'
        )
        self.pro_user.role = 'pro_user'
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(User)
        perm = Permission.objects.filter(codename='perm_pro_user_options').first()
        if perm:
            self.pro_user.user_permissions.add(perm)
        self.pro_user.save()

    def test_api_endpoint_denied_for_anonymous_user(self):
        response = self.client.get(reverse('api_statistics_data'))
        self.assertEqual(response.status_code, 401)

    def test_api_endpoint_denied_for_non_pro_user(self):
        self.assertTrue(self.client.login(username='stats-client@test.com', password='testpass123'))
        response = self.client.get(reverse('api_statistics_data'))
        self.assertEqual(response.status_code, 403)
        self.client.logout()

    def test_api_endpoint_accessible_for_pro_user(self):
        self.assertTrue(self.client.login(username='stats-pro@test.com', password='testpass123'))
        response = self.client.get(reverse('api_statistics_data'))
        self.assertEqual(response.status_code, 200)
        self.client.logout()

    def test_api_endpoint_returns_json_data_for_super_admin(self):
        self.assertTrue(self.client.login(username='stats-admin@test.com', password='testpass123'))
        
        # Test different ranges
        for r in ('hourly', 'daily', 'weekly', 'monthly'):
            response = self.client.get(reverse('api_statistics_data') + f'?range={r}')
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data['success'])
            self.assertIn('labels', data)
            self.assertIn('desktop_activity', data)
            self.assertIn('mobile_activity', data)
            self.assertIn('cards_created', data)
            self.assertIn('summary', data)
            self.assertIn('current_active_users', data['summary'])
            self.assertIn('peak_active_users', data['summary'])
            self.assertIn('live_by_role', data['summary'])
            self.assertIn('live_working_users', data['summary'])
            self.assertIn('live_idle_users', data['summary'])
            self.assertIn('live_users_roster', data)
            self.assertIn('work_summary', data)
            
        self.client.logout()

    def test_api_live_presence_breakdown_endpoint(self):
        self.assertTrue(self.client.login(username='stats-admin@test.com', password='testpass123'))
        response = self.client.get(reverse('api_live_presence_breakdown'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertIn('live_presence', data)
        self.assertIn('summary', data)
        self.assertIn('live_users_roster', data)
        self.client.logout()

    def test_live_working_vs_idle_classification(self):
        now = timezone.now()

        # Admin is active on web and performed card update
        UserDeviceSession.objects.create(
            user=self.super_admin,
            session_key='sess_admin_1',
            device_type='web',
            last_active=now,
        )
        ActivityLog.objects.create(
            user=self.super_admin,
            action='card_update',
            description='Updated ID card #101',
            created_at=now,
        )

        # Manager is active on mobile but idle (only login)
        UserDeviceSession.objects.create(
            user=self.client_user,
            session_key='sess_client_1',
            device_type='mobile',
            last_active=now,
        )
        ActivityLog.objects.create(
            user=self.client_user,
            action='login',
            description='User logged in via mobile',
            created_at=now - timedelta(minutes=2),
        )

        # Assistant is active on web and uploaded images
        UserDeviceSession.objects.create(
            user=self.assistant_user,
            session_key='sess_ast_1',
            device_type='web',
            last_active=now,
        )
        ActivityLog.objects.create(
            user=self.assistant_user,
            action='image_upload',
            description='Uploaded 5 student photos',
            created_at=now,
        )

        analysis = StatsService.get_live_presence_analysis()

        # Total 3 users live
        self.assertEqual(analysis['total_live_users'], 3)
        # 2 working (admin card_update, assistant image_upload), 1 idle (manager only login)
        self.assertEqual(analysis['live_working_users'], 2)
        self.assertEqual(analysis['live_idle_users'], 1)

        # Role breakdown
        self.assertEqual(analysis['live_by_role']['admins'], 1)
        self.assertEqual(analysis['live_by_role']['managers'], 1)
        self.assertEqual(analysis['live_by_role']['assistants'], 1)

        # Working by role
        self.assertEqual(analysis['live_working_by_role']['admins'], 1)
        self.assertEqual(analysis['live_working_by_role']['managers'], 0)
        self.assertEqual(analysis['live_working_by_role']['assistants'], 1)

        # Idle by role
        self.assertEqual(analysis['live_idle_by_role']['admins'], 0)
        self.assertEqual(analysis['live_idle_by_role']['managers'], 1)
        self.assertEqual(analysis['live_idle_by_role']['assistants'], 0)

        # Roster checks
        roster_map = {r['username']: r for r in analysis['live_users_roster']}
        self.assertTrue(roster_map['stats-admin@test.com']['is_working'])
        self.assertEqual(roster_map['stats-admin@test.com']['role_group'], 'admin')
        self.assertFalse(roster_map['stats-client@test.com']['is_working'])
        self.assertEqual(roster_map['stats-client@test.com']['role_group'], 'manager')
        self.assertTrue(roster_map['stats-assistant@test.com']['is_working'])
        self.assertEqual(roster_map['stats-assistant@test.com']['role_group'], 'assistant')

    def test_check_server_load_accessible_for_super_admin(self):
        self.assertTrue(self.client.login(username='stats-admin@test.com', password='testpass123'))
        response = self.client.get(reverse('api_check_server_load'))
        self.assertEqual(response.status_code, 200)
        self.client.logout()

    def test_check_server_load_denied_for_non_pro_user(self):
        self.assertTrue(self.client.login(username='stats-client@test.com', password='testpass123'))
        response = self.client.get(reverse('api_check_server_load'))
        self.assertEqual(response.status_code, 403)
        self.client.logout()
