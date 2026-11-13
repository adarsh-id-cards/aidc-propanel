"""
Statistics & Live Activity Analytics Service
============================================
Provides real-time aggregated metrics, user presence categorization (Working vs Idle),
role-based breakdowns (Admins, Managers, Assistants), operational velocity KPIs,
and historical time-series aggregation.
"""

import logging
from datetime import datetime, timedelta
import calendar

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Max, Sum
from django.utils import timezone

from accounts.models import UserDeviceSession
from core.models import ActivityLog, BackgroundTask, ClientPresenceSession
from organisation.models import Organisation
from stats.models import StatsSnapshot, ServerLoadAlert
from tables.models import IDCard

logger = logging.getLogger(__name__)
User = get_user_model()


class StatsService:
    """Service layer for computing system statistics and real-time live presence."""

    # Online window: user is considered online if seen within the last 5 minutes (300s)
    LIVE_ONLINE_WINDOW_SECONDS = 300
    # Working window: user is considered actively working if they performed a mutating action within 10 minutes (600s)
    LIVE_WORKING_WINDOW_SECONDS = 600

    # Mutating actions that classify a user as "Active Working"
    MUTATING_WORK_ACTIONS = {
        'card_create',
        'card_update',
        'card_delete',
        'card_status',
        'card_bulk_status',
        'card_bulk_upload',
        'card_bulk_download',
        'card_export',
        'image_upload',
        'image_reupload',
        'card_image_delete',
        'group_create',
        'group_update',
        'group_delete',
        'table_create',
        'table_update',
        'table_delete',
        'reprint_request',
        'reprint_status',
        'reprint_reject',
        'bulk_delete',
        'bulk_upgrade',
        'client_create',
        'client_update',
        'client_status',
        'staff_create',
        'staff_update',
        'staff_assignment',
        'staff_status',
        'backup_initiate',
        'backup_start',
        'email_send',
        'email_resend',
        'notification_create',
        'client_message_send',
    }

    # Map raw action to human readable action name
    ACTION_DISPLAY_MAP = {
        'card_create': 'Created ID cards',
        'card_update': 'Updated ID card',
        'card_delete': 'Deleted ID card',
        'card_status': 'Changed card status',
        'card_bulk_status': 'Bulk status update',
        'card_bulk_upload': 'Bulk uploaded cards',
        'card_bulk_download': 'Bulk downloaded cards',
        'card_export': 'Exported cards',
        'image_upload': 'Uploaded photo',
        'image_reupload': 'Re-uploaded photo',
        'card_image_delete': 'Removed card photo',
        'group_create': 'Created table/class',
        'group_update': 'Updated table/class',
        'group_delete': 'Deleted table/class',
        'table_create': 'Created table',
        'table_update': 'Updated table',
        'table_delete': 'Deleted table',
        'reprint_request': 'Requested reprint',
        'reprint_status': 'Updated reprint status',
        'reprint_reject': 'Rejected reprint',
        'bulk_delete': 'Bulk deleted cards',
        'bulk_upgrade': 'Bulk upgraded cards',
        'client_create': 'Created organisation',
        'client_update': 'Updated organisation',
        'client_status': 'Changed org status',
        'staff_create': 'Added assistant',
        'staff_update': 'Updated assistant',
        'staff_assignment': 'Updated class assignment',
        'staff_status': 'Changed assistant status',
        'backup_initiate': 'Initiated backup',
        'backup_start': 'Started backup',
        'email_send': 'Sent email',
        'notification_create': 'Created notification',
        'login': 'Logged in',
        'logout': 'Logged out',
    }

    @classmethod
    def get_role_category(cls, user):
        """
        Categorize a user into one of three primary role groups:
        - 'admin': Super Admin, Prime Admin, Operator, Photographer, Pro User
        - 'manager': Organisation Manager, Super Manager, Prime Manager, Client
        - 'assistant': Assistant, Staff, Client Staff
        """
        role = str(getattr(user, 'role', '') or '').strip().lower()
        if user.is_superuser or role in ('super_admin', 'prime_admin', 'operator', 'photographer', 'pro_user'):
            return 'admin'
        if role in ('client', 'manager', 'prime_manager', 'super_manager', 'organisation_manager'):
            return 'manager'
        if role in ('assistant', 'staff', 'client_staff'):
            return 'assistant'
        return 'admin' if user.is_staff else 'manager'

    @classmethod
    def get_role_display_name(cls, user):
        """Return human-readable role display name."""
        role = str(getattr(user, 'role', '') or '').strip().lower()
        role_map = {
            'super_admin': 'Super Admin',
            'prime_admin': 'Prime Admin',
            'operator': 'Operator',
            'photographer': 'Photographer',
            'pro_user': 'Pro User',
            'client': 'Organisation Manager',
            'manager': 'Organisation Manager',
            'super_manager': 'Super Manager',
            'prime_manager': 'Prime Manager',
            'assistant': 'Assistant',
            'staff': 'Staff',
            'client_staff': 'Client Assistant',
        }
        return role_map.get(role, role.replace('_', ' ').title() or 'User')

    @classmethod
    def get_user_organisation_name(cls, user):
        """Find the organisation name associated with a user."""
        role_group = cls.get_role_category(user)
        if role_group == 'admin':
            return 'System Administration'

        try:
            if hasattr(user, 'client_profile') and user.client_profile:
                return user.client_profile.name
            if hasattr(user, 'org_manager_profile') and user.org_manager_profile and user.org_manager_profile.organisation:
                return user.org_manager_profile.organisation.name
            
            org = Organisation.objects.filter(user_id=user.id).only('name').first()
            if org:
                return org.name

            from organisation.models import OrganisationManager
            om = OrganisationManager.objects.filter(user_id=user.id).select_related('organisation').first()
            if om and om.organisation:
                return om.organisation.name

            from assistants.models import Assistant
            ast = Assistant.objects.filter(user_id=user.id).select_related('organisation').first()
            if ast and ast.organisation:
                return ast.organisation.name

            from staff.models import Staff
            st = Staff.objects.filter(user_id=user.id).select_related('client').first()
            if st and st.client:
                return st.client.name
        except Exception:
            pass

        return '—'

    @classmethod
    def get_live_presence_analysis(cls, live_window_seconds=None, working_window_seconds=None):
        """
        Analyze all currently online users:
        - Total live online count
        - Role breakdown (Admins, Managers, Assistants)
        - Activity status (Active Working vs Open/Browsing/Idle)
        - Detailed roster of all live users with their latest work action
        """
        live_window = live_window_seconds or cls.LIVE_ONLINE_WINDOW_SECONDS
        working_window = working_window_seconds or cls.LIVE_WORKING_WINDOW_SECONDS

        now = timezone.now()
        live_cutoff = now - timedelta(seconds=live_window)
        working_cutoff = now - timedelta(seconds=working_window)

        # 1. Retrieve all active device sessions within live cutoff
        device_sessions = list(
            UserDeviceSession.objects.filter(last_active__gte=live_cutoff)
            .select_related('user')
            .order_by('-last_active')
        )

        # 2. Also retrieve active tab presence sessions within live cutoff
        presence_sessions = list(
            ClientPresenceSession.objects.filter(
                closed_at__isnull=True,
                last_seen_at__gte=live_cutoff,
            ).select_related('user', 'client')
            .order_by('-last_seen_at')
        )

        # 3. Deduplicate active users and gather latest session data
        active_users_map = {}  # user_id -> dict

        for ds in device_sessions:
            if not ds.user or not ds.user.is_active:
                continue
            uid = ds.user_id
            if uid not in active_users_map:
                active_users_map[uid] = {
                    'user': ds.user,
                    'device_type': ds.device_type or 'web',
                    'last_seen': ds.last_active,
                    'ip_address': ds.ip_address or '',
                    'user_agent': ds.user_agent or '',
                }
            else:
                if ds.last_active > active_users_map[uid]['last_seen']:
                    active_users_map[uid]['last_seen'] = ds.last_active
                    active_users_map[uid]['device_type'] = ds.device_type or active_users_map[uid]['device_type']

        for ps in presence_sessions:
            if not ps.user or not ps.user.is_active:
                continue
            uid = ps.user_id
            if uid not in active_users_map:
                active_users_map[uid] = {
                    'user': ps.user,
                    'device_type': 'web',
                    'last_seen': ps.last_seen_at,
                    'ip_address': '',
                    'user_agent': '',
                    'org_name': ps.client.name if ps.client else None,
                }
            else:
                if ps.last_seen_at > active_users_map[uid]['last_seen']:
                    active_users_map[uid]['last_seen'] = ps.last_seen_at
                if ps.client and not active_users_map[uid].get('org_name'):
                    active_users_map[uid]['org_name'] = ps.client.name

        active_user_ids = list(active_users_map.keys())

        # 4. Fetch recent mutating activity logs for active users within working cutoff
        recent_logs = list(
            ActivityLog.objects.filter(
                user_id__in=active_user_ids,
                created_at__gte=working_cutoff,
                action__in=cls.MUTATING_WORK_ACTIONS,
            ).order_by('-created_at')
        )

        user_latest_work_log = {}
        for log in recent_logs:
            if log.user_id not in user_latest_work_log:
                user_latest_work_log[log.user_id] = log

        # Also check running background tasks
        running_tasks = list(
            BackgroundTask.objects.filter(
                user_id__in=active_user_ids,
                status__in=['pending', 'processing'],
            ).order_by('-created_at')
        )
        user_running_tasks = {}
        for bt in running_tasks:
            if bt.user_id not in user_running_tasks:
                user_running_tasks[bt.user_id] = bt

        # Also get any latest non-mutating log (e.g. login) for idle users as fallback
        non_mutating_logs = list(
            ActivityLog.objects.filter(
                user_id__in=active_user_ids,
            ).order_by('-created_at')[:100]
        )
        user_any_latest_log = {}
        for l in non_mutating_logs:
            if l.user_id not in user_any_latest_log:
                user_any_latest_log[l.user_id] = l

        # 5. Build Live Roster and Compute Aggregates
        live_roster = []
        role_counts = {'admins': 0, 'managers': 0, 'assistants': 0}
        working_role_counts = {'admins': 0, 'managers': 0, 'assistants': 0}
        idle_role_counts = {'admins': 0, 'managers': 0, 'assistants': 0}

        working_device_counts = {'web': 0, 'mobile': 0}
        idle_device_counts = {'web': 0, 'mobile': 0}

        for uid, udata in active_users_map.items():
            user = udata['user']
            role_group = cls.get_role_category(user)
            role_display = cls.get_role_display_name(user)
            org_name = udata.get('org_name') or cls.get_user_organisation_name(user)
            device_type = udata['device_type']
            last_seen = udata['last_seen']

            # Determine if working or idle
            work_log = user_latest_work_log.get(uid)
            running_task = user_running_tasks.get(uid)

            if running_task:
                is_working = True
                status_label = 'Active Working'
                task_name = running_task.get_task_type_display() if hasattr(running_task, 'get_task_type_display') else 'Background Task'
                last_action = f'Processing {task_name} ({running_task.progress}%)'
                last_action_time = running_task.created_at
            elif work_log:
                is_working = True
                status_label = 'Active Working'
                desc = (work_log.description or '').strip()
                if desc and len(desc) <= 80:
                    last_action = desc
                else:
                    action_name = cls.ACTION_DISPLAY_MAP.get(work_log.action, work_log.get_action_display() if hasattr(work_log, 'get_action_display') else work_log.action.replace('_', ' ').title())
                    last_action = action_name
                last_action_time = work_log.created_at
            else:
                is_working = False
                status_label = 'Open / Browsing'
                fallback_log = user_any_latest_log.get(uid)
                if fallback_log and (now - fallback_log.created_at).total_seconds() < 3600:
                    last_action = fallback_log.description or cls.ACTION_DISPLAY_MAP.get(fallback_log.action, 'Online')
                    last_action_time = fallback_log.created_at
                else:
                    last_action = 'Viewing Dashboard / Online'
                    last_action_time = last_seen

            # Tally counts
            role_key = f'{role_group}s'
            role_counts[role_key] = role_counts.get(role_key, 0) + 1

            if is_working:
                working_role_counts[role_key] = working_role_counts.get(role_key, 0) + 1
                working_device_counts[device_type] = working_device_counts.get(device_type, 0) + 1
            else:
                idle_role_counts[role_key] = idle_role_counts.get(role_key, 0) + 1
                idle_device_counts[device_type] = idle_device_counts.get(device_type, 0) + 1

            # Format roster entry
            user_full_name = (user.get_full_name() or '').strip() or user.username
            live_roster.append({
                'user_id': user.id,
                'name': user_full_name,
                'username': user.username,
                'email': user.email or '—',
                'role': str(getattr(user, 'role', '') or 'user'),
                'role_display': role_display,
                'role_group': role_group,
                'organisation': org_name,
                'device_type': device_type,
                'is_working': is_working,
                'status_label': status_label,
                'last_action': last_action,
                'last_action_time': last_action_time.isoformat() if last_action_time else None,
                'last_seen_at': last_seen.isoformat() if last_seen else None,
                'ip_address': udata.get('ip_address', ''),
            })

        # Sort roster: Active Working first, then by last seen desc
        live_roster.sort(key=lambda r: (1 if r['is_working'] else 0, r['last_seen_at'] or ''), reverse=True)

        total_live = len(live_roster)
        total_working = sum(1 for r in live_roster if r['is_working'])
        total_idle = total_live - total_working

        desktop_live = working_device_counts['web'] + idle_device_counts['web']
        mobile_live = working_device_counts['mobile'] + idle_device_counts['mobile']

        return {
            'total_live_users': total_live,
            'current_active_users': total_live,
            'live_desktop_users': desktop_live,
            'live_mobile_users': mobile_live,
            'live_working_users': total_working,
            'live_idle_users': total_idle,
            'live_by_role': role_counts,
            'live_working_by_role': {
                'admins': working_role_counts['admins'],
                'managers': working_role_counts['managers'],
                'assistants': working_role_counts['assistants'],
            },
            'live_idle_by_role': {
                'admins': idle_role_counts['admins'],
                'managers': idle_role_counts['managers'],
                'assistants': idle_role_counts['assistants'],
            },
            'live_by_device': {
                'desktop_working': working_device_counts['web'],
                'desktop_idle': idle_device_counts['web'],
                'mobile_working': working_device_counts['mobile'],
                'mobile_idle': idle_device_counts['mobile'],
            },
            'live_users_roster': live_roster,
        }

    @classmethod
    def get_operational_work_summary_today(cls):
        """
        Compute total volume and velocity of work performed today:
        - Cards created, verified, approved, printed/downloaded, reprinted
        - Photos uploaded
        - Total distinct organisations active today
        """
        now = timezone.localtime(timezone.now())
        start_of_today = timezone.make_aware(datetime.combine(now.date(), datetime.min.time()))
        end_of_today = timezone.make_aware(datetime.combine(now.date(), datetime.max.time()))

        cards_created_today = IDCard.objects.filter(
            created_at__range=(start_of_today, end_of_today)
        ).count()

        cards_verified_today = ActivityLog.objects.filter(
            created_at__range=(start_of_today, end_of_today),
            action__in=['card_status', 'card_bulk_status'],
            description__icontains='verified'
        ).count()

        cards_approved_today = ActivityLog.objects.filter(
            created_at__range=(start_of_today, end_of_today),
            action__in=['card_status', 'card_bulk_status'],
            description__icontains='approved'
        ).count()

        cards_printed_today = IDCard.objects.filter(
            status='download',
            updated_at__range=(start_of_today, end_of_today)
        ).count()

        cards_reprinted_today = ActivityLog.objects.filter(
            created_at__range=(start_of_today, end_of_today),
            action__in=['reprint_request', 'reprint_status']
        ).count()

        photos_uploaded_today = ActivityLog.objects.filter(
            created_at__range=(start_of_today, end_of_today),
            action__in=['image_upload', 'image_reupload']
        ).count()

        total_cards_ever = IDCard.objects.count()

        # Active organisations today
        active_org_cnt = Organisation.objects.filter(
            tables__id_cards__updated_at__range=(start_of_today, end_of_today)
        ).distinct().count()
        if active_org_cnt == 0:
            active_org_cnt = Organisation.objects.filter(status='active').count()
        total_active_orgs = active_org_cnt

        return {
            'cards_created_today': cards_created_today,
            'cards_verified_today': cards_verified_today,
            'cards_approved_today': cards_approved_today,
            'cards_printed_today': cards_printed_today,
            'cards_reprinted_today': cards_reprinted_today,
            'photos_uploaded_today': photos_uploaded_today,
            'active_organisations_today': total_active_orgs,
            'total_cards_ever': total_cards_ever,
        }

    @classmethod
    def take_hourly_snapshot(cls):
        """Take an hourly snapshot if latest is older than 1 hour."""
        now = timezone.localtime(timezone.now())
        latest = StatsSnapshot.objects.order_by('-timestamp').first()
        if latest and (now - timezone.localtime(latest.timestamp)) < timedelta(hours=1):
            return

        presence_data = cls.get_live_presence_analysis()
        desktop_users = presence_data['live_desktop_users']
        mobile_users = presence_data['live_mobile_users']
        live_total = presence_data['total_live_users']

        hour_ago = now - timedelta(hours=1)
        cards_created = IDCard.objects.filter(created_at__gte=hour_ago).count()
        processing_jobs = BackgroundTask.objects.filter(status__in=['pending', 'processing']).count()

        peak = max(desktop_users + mobile_users, live_total)

        StatsSnapshot.objects.create(
            timestamp=now,
            active_desktop_users=desktop_users,
            active_mobile_users=mobile_users,
            active_clients=presence_data['live_by_role']['managers'],
            active_assistants=presence_data['live_by_role']['assistants'],
            peak_active_users=peak,
            total_cards_created=cards_created,
            batch_jobs_count=processing_jobs,
        )

    @classmethod
    def get_time_series_data(cls, range_type='hourly'):
        """
        Generate time-series activity datasets across selected range:
        - 'hourly' (last 24 hours)
        - 'daily' (last 30 days)
        - 'weekly' (last 12 weeks)
        - 'monthly' (last 12 months)
        """
        range_type = str(range_type or 'hourly').strip().lower()
        if range_type not in ('hourly', 'daily', 'weekly', 'monthly'):
            range_type = 'hourly'

        now = timezone.localtime(timezone.now())
        labels = []
        desktop_activity = []
        mobile_activity = []
        client_activity = []
        assistant_activity = []
        admin_activity = []
        working_activity = []
        cards_created = []
        all_user_activity = []

        snapshots_qs = StatsSnapshot.objects.order_by('timestamp')

        if range_type == 'hourly':
            start_time = now - timedelta(hours=24)
            snapshots = list(snapshots_qs.filter(timestamp__gte=start_time))

            for i in range(24):
                slot_start = start_time + timedelta(hours=i)
                slot_end = slot_start + timedelta(hours=1)
                labels.append(slot_end.strftime('%H:00'))

                bucket = [s for s in snapshots if slot_start <= timezone.localtime(s.timestamp) < slot_end]
                if bucket:
                    da = int(sum((s.active_desktop_users or 0) for s in bucket) / len(bucket))
                    ma = int(sum((s.active_mobile_users or 0) for s in bucket) / len(bucket))
                    cc = sum(s.total_cards_created for s in bucket)
                    mgr = int(sum((s.active_clients or 0) for s in bucket) / len(bucket))
                    ast = int(sum((s.active_assistants or 0) for s in bucket) / len(bucket))
                else:
                    # Estimate from logs
                    da, ma, mgr, ast = cls._estimate_activity_from_logs(slot_start, slot_end)
                    cc = IDCard.objects.filter(created_at__gte=slot_start, created_at__lt=slot_end).count()

                desktop_activity.append(da)
                mobile_activity.append(ma)
                client_activity.append(mgr)
                assistant_activity.append(ast)
                cards_created.append(cc)

                # Count distinct active users from ActivityLog in this hour
                au = ActivityLog.objects.filter(
                    created_at__gte=slot_start,
                    created_at__lt=slot_end,
                ).values('user_id').distinct().count()

                working_u = ActivityLog.objects.filter(
                    created_at__gte=slot_start,
                    created_at__lt=slot_end,
                    action__in=cls.MUTATING_WORK_ACTIONS,
                ).values('user_id').distinct().count()

                working_activity.append(working_u)
                all_user_activity.append(max(au, da + ma))
                admin_activity.append(max(0, au - (mgr + ast)))

        elif range_type == 'daily':
            start_time = now - timedelta(days=30)
            snapshots = list(snapshots_qs.filter(timestamp__gte=start_time))

            for i in range(30):
                day = (start_time + timedelta(days=i + 1)).date()
                labels.append(day.strftime('%b %d'))

                day_start = timezone.make_aware(datetime.combine(day, datetime.min.time()))
                day_end = timezone.make_aware(datetime.combine(day, datetime.max.time()))

                bucket = [s for s in snapshots if timezone.localtime(s.timestamp).date() == day]
                if bucket:
                    da = int(sum((s.active_desktop_users or 0) for s in bucket) / len(bucket))
                    ma = int(sum((s.active_mobile_users or 0) for s in bucket) / len(bucket))
                    cc = sum(s.total_cards_created for s in bucket)
                    mgr = int(sum((s.active_clients or 0) for s in bucket) / len(bucket))
                    ast = int(sum((s.active_assistants or 0) for s in bucket) / len(bucket))
                else:
                    da, ma, mgr, ast = cls._estimate_activity_from_logs(day_start, day_end)
                    cc = IDCard.objects.filter(created_at__range=(day_start, day_end)).count()

                desktop_activity.append(da)
                mobile_activity.append(ma)
                client_activity.append(mgr)
                assistant_activity.append(ast)
                cards_created.append(cc)

                au = ActivityLog.objects.filter(
                    created_at__range=(day_start, day_end),
                ).values('user_id').distinct().count()

                working_u = ActivityLog.objects.filter(
                    created_at__range=(day_start, day_end),
                    action__in=cls.MUTATING_WORK_ACTIONS,
                ).values('user_id').distinct().count()

                working_activity.append(working_u)
                all_user_activity.append(max(au, da + ma))
                admin_activity.append(max(0, au - (mgr + ast)))

        elif range_type == 'weekly':
            start_time = now - timedelta(weeks=12)
            snapshots = list(snapshots_qs.filter(timestamp__gte=start_time))

            for i in range(12):
                wk_start = start_time + timedelta(weeks=i)
                wk_end = wk_start + timedelta(weeks=1)
                iso_wk = wk_start.isocalendar()[1]
                labels.append(f'Wk {iso_wk}')

                bucket = [s for s in snapshots if wk_start <= timezone.localtime(s.timestamp) < wk_end]
                if bucket:
                    da = int(sum((s.active_desktop_users or 0) for s in bucket) / len(bucket))
                    ma = int(sum((s.active_mobile_users or 0) for s in bucket) / len(bucket))
                    cc = sum(s.total_cards_created for s in bucket)
                    mgr = int(sum((s.active_clients or 0) for s in bucket) / len(bucket))
                    ast = int(sum((s.active_assistants or 0) for s in bucket) / len(bucket))
                else:
                    da, ma, mgr, ast = cls._estimate_activity_from_logs(wk_start, wk_end)
                    cc = IDCard.objects.filter(created_at__gte=wk_start, created_at__lt=wk_end).count()

                desktop_activity.append(da)
                mobile_activity.append(ma)
                client_activity.append(mgr)
                assistant_activity.append(ast)
                cards_created.append(cc)

                au = ActivityLog.objects.filter(
                    created_at__gte=wk_start, created_at__lt=wk_end,
                ).values('user_id').distinct().count()

                working_u = ActivityLog.objects.filter(
                    created_at__gte=wk_start, created_at__lt=wk_end,
                    action__in=cls.MUTATING_WORK_ACTIONS,
                ).values('user_id').distinct().count()

                working_activity.append(working_u)
                all_user_activity.append(max(au, da + ma))
                admin_activity.append(max(0, au - (mgr + ast)))

        else:  # monthly
            for i in range(12):
                offset = 11 - i
                target_month = now.month - offset
                target_year = now.year
                while target_month < 1:
                    target_month += 12
                    target_year -= 1

                _, last_day = calendar.monthrange(target_year, target_month)
                mo_start = timezone.make_aware(datetime(target_year, target_month, 1, 0, 0, 0))
                mo_end = timezone.make_aware(datetime(target_year, target_month, last_day, 23, 59, 59))
                labels.append(mo_start.strftime('%b %Y'))

                bucket = list(StatsSnapshot.objects.filter(timestamp__gte=mo_start, timestamp__lte=mo_end))
                if bucket:
                    da = int(sum((s.active_desktop_users or 0) for s in bucket) / len(bucket))
                    ma = int(sum((s.active_mobile_users or 0) for s in bucket) / len(bucket))
                    cc = sum(s.total_cards_created for s in bucket)
                    mgr = int(sum((s.active_clients or 0) for s in bucket) / len(bucket))
                    ast = int(sum((s.active_assistants or 0) for s in bucket) / len(bucket))
                else:
                    da, ma, mgr, ast = cls._estimate_activity_from_logs(mo_start, mo_end)
                    cc = IDCard.objects.filter(created_at__range=(mo_start, mo_end)).count()

                desktop_activity.append(da)
                mobile_activity.append(ma)
                client_activity.append(mgr)
                assistant_activity.append(ast)
                cards_created.append(cc)

                au = ActivityLog.objects.filter(
                    created_at__range=(mo_start, mo_end),
                ).values('user_id').distinct().count()

                working_u = ActivityLog.objects.filter(
                    created_at__range=(mo_start, mo_end),
                    action__in=cls.MUTATING_WORK_ACTIONS,
                ).values('user_id').distinct().count()

                working_activity.append(working_u)
                all_user_activity.append(max(au, da + ma))
                admin_activity.append(max(0, au - (mgr + ast)))

        return {
            'labels': labels,
            'desktop_activity': desktop_activity,
            'mobile_activity': mobile_activity,
            'client_activity': client_activity,
            'assistant_activity': assistant_activity,
            'admin_activity': admin_activity,
            'working_activity': working_activity,
            'all_user_activity': all_user_activity,
            'cards_created': cards_created,
            'batch_jobs_count': cards_created,
        }

    @classmethod
    def _estimate_activity_from_logs(cls, start_time, end_time):
        """Estimate desktop, mobile, manager, and assistant activity counts from ActivityLog."""
        active_logs = ActivityLog.objects.filter(created_at__range=(start_time, end_time)).select_related('user')
        uids = set(active_logs.values_list('user_id', flat=True).distinct())

        if not uids:
            return 0, 0, 0, 0

        users = User.objects.filter(id__in=uids)
        mgr_cnt = 0
        ast_cnt = 0
        mob_cnt = 0
        desk_cnt = 0

        mobile_actions = set(
            active_logs.filter(
                Q(action__in=['login', 'logout'], description__icontains='mobile app') |
                Q(user__role='photographer')
            ).values_list('user_id', flat=True).distinct()
        )

        for u in users:
            cat = cls.get_role_category(u)
            if cat == 'manager':
                mgr_cnt += 1
            elif cat == 'assistant':
                ast_cnt += 1

            if u.id in mobile_actions or u.role == 'photographer':
                mob_cnt += 1
            else:
                desk_cnt += 1

        return desk_cnt, mob_cnt, mgr_cnt, ast_cnt

    @classmethod
    def get_complete_statistics_payload(cls, range_type='hourly'):
        """
        Generate complete unified statistics payload containing:
        1. Live presence analysis (working vs idle, role distribution, live roster)
        2. Today's operational velocity metrics
        3. Historical time-series datasets for charts
        4. Peak and server metrics
        """
        cls.take_hourly_snapshot()

        live_data = cls.get_live_presence_analysis()
        work_summary = cls.get_operational_work_summary_today()
        time_series = cls.get_time_series_data(range_type=range_type)

        # Overwrite the latest point on charts with real live numbers
        if time_series['desktop_activity']:
            time_series['desktop_activity'][-1] = max(time_series['desktop_activity'][-1], live_data['live_desktop_users'])
        if time_series['mobile_activity']:
            time_series['mobile_activity'][-1] = max(time_series['mobile_activity'][-1], live_data['live_mobile_users'])
        if time_series['client_activity']:
            time_series['client_activity'][-1] = max(time_series['client_activity'][-1], live_data['live_by_role']['managers'])
        if time_series['assistant_activity']:
            time_series['assistant_activity'][-1] = max(time_series['assistant_activity'][-1], live_data['live_by_role']['assistants'])
        if time_series['working_activity']:
            time_series['working_activity'][-1] = max(time_series['working_activity'][-1], live_data['live_working_users'])
        if time_series['all_user_activity']:
            time_series['all_user_activity'][-1] = max(time_series['all_user_activity'][-1], live_data['total_live_users'])

        # Calculate today's peak
        today = timezone.localdate()
        todays_snapshots = StatsSnapshot.objects.filter(timestamp__date=today)
        peak_active_users = live_data['total_live_users']
        for snap in todays_snapshots:
            snap_peak = max(snap.peak_active_users, snap.active_desktop_users + snap.active_mobile_users)
            if snap_peak > peak_active_users:
                peak_active_users = snap_peak

        # Calculate busiest 2-hour interval
        busiest_hour_str = '12:00 - 14:00'
        all_users = time_series['all_user_activity']
        labels = time_series['labels']
        if len(all_users) >= 2 and range_type == 'hourly':
            max_sum = -1
            max_idx = -1
            for idx in range(len(all_users) - 1):
                s = all_users[idx] + all_users[idx + 1]
                if s > max_sum:
                    max_sum = s
                    max_idx = idx
            if max_idx != -1 and max_idx < len(labels):
                try:
                    start_hour = int(labels[max_idx].split(':')[0])
                    end_hour = (start_hour + 2) % 24
                    busiest_hour_str = f'{start_hour:02d}:00 - {end_hour:02d}:00'
                except Exception:
                    pass

        summary = {
            'current_active_users': live_data['total_live_users'],
            'live_desktop_users': live_data['live_desktop_users'],
            'live_mobile_users': live_data['live_mobile_users'],
            'live_working_users': live_data['live_working_users'],
            'live_idle_users': live_data['live_idle_users'],
            'peak_active_users': peak_active_users,
            'peak_working_hour': busiest_hour_str,
            'busiest_interval': busiest_hour_str,
            'total_cards_ever': work_summary['total_cards_ever'],
            'live_by_role': live_data['live_by_role'],
            'live_working_by_role': live_data['live_working_by_role'],
            'live_idle_by_role': live_data['live_idle_by_role'],
            'live_by_device': live_data['live_by_device'],
        }

        return {
            'success': True,
            **time_series,
            'summary': summary,
            'live_presence': live_data,
            'live_users_roster': live_data['live_users_roster'],
            'work_summary': work_summary,
        }
