# -----------------------------------------------------------------------------
# CardFlow — B2B Enterprise SaaS Platform
# Copyright (c) 2024-2026 KDR Softwares. All Rights Reserved.
# Founder & Principal Architect: Roshan Damor (@logicbyroshan) - KDR Softwares
# Proprietary and Confidential Commercial Software.
# -----------------------------------------------------------------------------
"""
Management command: bootstrap_production
========================================
Turnkey production bootstrap and verification command for CardFlow.
Idempotently establishes or audits all essential multi-tenant role accounts,
tenant subscriptions, sample organisation schemas, and access credentials.

Usage:
    python manage.py bootstrap_production
    python manage.py bootstrap_production --default-password "SecurePass@2026"
    python manage.py bootstrap_production --verify-only
"""

import sys
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class Command(BaseCommand):
    help = 'Idempotently bootstrap or verify all production accounts, subscriptions, and credentials for CardFlow.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--default-password',
            default='Password@123',
            help='Default password to assign to bootstrapped accounts (default: Password@123)',
        )
        parser.add_argument(
            '--prime-password',
            default=None,
            help='Explicit password for prime_admin',
        )
        parser.add_argument(
            '--super-password',
            default=None,
            help='Explicit password for super_admin (shree_admin)',
        )
        parser.add_argument(
            '--manager-password',
            default=None,
            help='Explicit password for prime_manager (dps_principal)',
        )
        parser.add_argument(
            '--verify-only',
            action='store_true',
            help='Audit and verify existing production setup without creating or mutating records.',
        )

    def handle(self, *args, **options):
        verify_only = options.get('verify_only', False)
        default_pwd = options.get('default_password') or 'Password@123'
        prime_pwd = options.get('prime_password') or default_pwd
        super_pwd = options.get('super_password') or default_pwd
        manager_pwd = options.get('manager_password') or default_pwd

        self.stdout.write(self.style.MIGRATE_HEADING('\n====================================================================='))
        self.stdout.write(self.style.MIGRATE_HEADING('  CARDFLOW ENTERPRISE SAAS — PRODUCTION BOOTSTRAP & AUDIT'))
        self.stdout.write(self.style.MIGRATE_HEADING('  Proprietary Software by KDR Softwares (Roshan Damor / @logicbyroshan)'))
        self.stdout.write(self.style.MIGRATE_HEADING('=====================================================================\n'))

        # ---------------------------------------------------------------------
        # 1. PRIME ADMIN (Platform Domain Owner)
        # ---------------------------------------------------------------------
        prime_username = 'prime_admin'
        prime_email = 'prime@cardflow.io'
        prime_user = User.objects.filter(role='prime_admin').first() or User.objects.filter(username=prime_username).first()

        if prime_user:
            prime_status = 'Existing [Active]'
            if not verify_only:
                prime_user.role = 'prime_admin'
                prime_user.is_superuser = True
                prime_user.is_staff = True
                prime_user.set_password(prime_pwd)
                prime_user.save()
                prime_status = 'Verified & Credential Synced'
        else:
            if verify_only:
                prime_status = 'MISSING'
            else:
                prime_user = User.objects.create(
                    username=prime_username,
                    email=prime_email,
                    role='prime_admin',
                    first_name='Prime',
                    last_name='Admin',
                    is_superuser=True,
                    is_staff=True,
                )
                prime_user.set_password(prime_pwd)
                prime_user.save()
                prime_status = 'Created Successfully'

        # ---------------------------------------------------------------------
        # 2. SUPER ADMIN (Tenant Domain Owner)
        # ---------------------------------------------------------------------
        super_username = 'shree_admin'
        super_email = 'admin@shreeidcards.in'
        super_user = User.objects.filter(username=super_username).first() or User.objects.filter(role='super_admin').first()

        if super_user:
            super_status = 'Existing [Active]'
            if not verify_only:
                super_user.role = 'super_admin'
                super_user.set_password(super_pwd)
                super_user.save()
                super_status = 'Verified & Credential Synced'
        else:
            if verify_only:
                super_status = 'MISSING'
            else:
                super_user = User.objects.create(
                    username=super_username,
                    email=super_email,
                    role='super_admin',
                    first_name='Super',
                    last_name='Admin',
                )
                super_user.set_password(super_pwd)
                super_user.save()
                super_status = 'Created Successfully'

        # ---------------------------------------------------------------------
        # 3. TENANT SAAS SUBSCRIPTION
        # ---------------------------------------------------------------------
        sub_status = 'Auditing...'
        subscription = None
        try:
            from saas.models import SaaSSubscription
            if super_user and getattr(super_user, 'subscription', None):
                subscription = super_user.subscription
            else:
                subscription = SaaSSubscription.objects.first()

            if not subscription and not verify_only:
                subscription = SaaSSubscription.objects.create(
                    name='Shree ID Cards Private Ltd',
                    slug='shree',
                    tier='pro',
                    status='active',
                    max_cards=10000,
                    max_super_admins=3,
                    max_organisations=999999,  # Unlimited organisations representation
                )
                if super_user:
                    super_user.subscription = subscription
                    super_user.save(update_fields=['subscription'])
                sub_status = 'Created [Pro Tier, Unlimited Orgs]'
            elif subscription:
                if not verify_only:
                    subscription.max_organisations = 999999
                    subscription.save(update_fields=['max_organisations'])
                    if super_user and super_user.subscription_id != subscription.id:
                        super_user.subscription = subscription
                        super_user.save(update_fields=['subscription'])
                sub_status = f'Active [{subscription.tier.upper()} Tier, Unlimited Orgs]'
            else:
                sub_status = 'MISSING'
        except Exception as e:
            sub_status = f'Error: {e}'

        # ---------------------------------------------------------------------
        # 4. ORGANISATION (School / Institution)
        # ---------------------------------------------------------------------
        org_status = 'Auditing...'
        org = None
        try:
            from organisation.models import Organisation
            org = Organisation.objects.filter(name__icontains='Delhi Public School').first()
            if not org and not verify_only:
                org = Organisation.objects.create(
                    name='Delhi Public School, Ahmedabad',
                    org_type='school',
                    owner=super_user,
                    subscription=subscription,
                    is_default=True,
                )
                org_status = 'Created Successfully'
            elif org:
                if not verify_only and subscription and not org.subscription:
                    org.subscription = subscription
                    org.save(update_fields=['subscription'])
                org_status = 'Existing [Active]'
            else:
                org_status = 'MISSING'
        except Exception as e:
            org_status = f'Error: {e}'

        # ---------------------------------------------------------------------
        # 5. PRIME MANAGER (School Owner)
        # ---------------------------------------------------------------------
        manager_username = 'dps_principal'
        manager_email = 'principal@dpsahmedabad.edu'
        manager_user = User.objects.filter(username=manager_username).first() or User.objects.filter(role='prime_manager').first()

        if manager_user:
            manager_status = 'Existing [Active]'
            if not verify_only:
                manager_user.role = 'prime_manager'
                manager_user.set_password(manager_pwd)
                manager_user.save()
                if org and org.user_id != manager_user.id:
                    org.user = manager_user
                    org.save(update_fields=['user'])
                manager_status = 'Verified & Credential Synced'
        else:
            if verify_only:
                manager_status = 'MISSING'
            else:
                manager_user = User.objects.create(
                    username=manager_username,
                    email=manager_email,
                    role='prime_manager',
                    first_name='DPS',
                    last_name='Principal',
                )
                manager_user.set_password(manager_pwd)
                manager_user.save()
                if org:
                    org.user = manager_user
                    org.save(update_fields=['user'])
                manager_status = 'Created Successfully'

        # ---------------------------------------------------------------------
        # 6. DEFAULT TABLE SCHEMA
        # ---------------------------------------------------------------------
        table_status = 'Auditing...'
        try:
            from tables.models import Table
            if org:
                table = Table.objects.filter(organisation=org).first()
                if not table and not verify_only:
                    default_fields = [
                        {'name': 'Student Name', 'type': 'text', 'order': 1},
                        {'name': 'Admission No', 'type': 'text', 'order': 2},
                        {'name': 'Class', 'type': 'class', 'order': 3},
                        {'name': 'Section', 'type': 'section', 'order': 4},
                        {'name': 'Roll No', 'type': 'number', 'order': 5},
                        {'name': 'Blood Group', 'type': 'text', 'order': 6},
                        {'name': 'Father Name', 'type': 'text', 'order': 7},
                        {'name': 'Mobile No', 'type': 'phone', 'order': 8},
                        {'name': 'Student Photo', 'type': 'photo', 'order': 9},
                    ]
                    table = Table.objects.create(
                        organisation=org,
                        name='Class 10 - Section A',
                        table_type='school_student',
                        fields=default_fields,
                    )
                    table_status = 'Created [9 Schema Fields]'
                elif table:
                    table_status = f'Existing ["{table.name}" - {len(table.fields)} Fields]'
                else:
                    table_status = 'MISSING'
        except Exception as e:
            table_status = f'Error: {e}'

        # ---------------------------------------------------------------------
        # 7. PRIME OPERATOR
        # ---------------------------------------------------------------------
        op_username = 'sales.op'
        op_email = 'operator@cardflow.io'
        op_user = User.objects.filter(username=op_username).first()
        if not op_user and not verify_only:
            op_user = User.objects.create(
                username=op_username,
                email=op_email,
                role='prime_operator',
                first_name='Production',
                last_name='Operator',
            )
            op_user.set_password(default_pwd)
            op_user.save()
            op_status = 'Created Successfully'
        elif op_user:
            if not verify_only:
                op_user.role = 'prime_operator'
                op_user.set_password(default_pwd)
                op_user.save()
            op_status = 'Existing [Active]'
        else:
            op_status = 'MISSING'

        # ---------------------------------------------------------------------
        # SUMMARY DISPLAY
        # ---------------------------------------------------------------------
        self.stdout.write(self.style.SUCCESS('[OK] Deployment Audit Complete!\n'))

        headers = f"{'ROLE / ENTITY':<22} | {'USERNAME':<16} | {'PASSWORD':<16} | {'PORTAL URL':<20} | {'STATUS':<24}"
        separator = "-" * len(headers)
        self.stdout.write(separator)
        self.stdout.write(headers)
        self.stdout.write(separator)

        rows = [
            ("Platform Prime Admin", prime_username, prime_pwd, "/saas/ or /panel/", prime_status),
            ("Tenant Super Admin", super_username, super_pwd, "/panel/", super_status),
            ("Tenant Subscription", "Tenant Plan", "N/A", "/panel/subscription", sub_status),
            ("Organisation (DPS)", "DPS Org", "N/A", "/panel/clients", org_status),
            ("School Prime Manager", manager_username, manager_pwd, "/panel/", manager_status),
            ("Default Schema Table", "Class 10 - Sec A", "N/A", "/table/{id}/", table_status),
            ("Production Operator", op_username, default_pwd, "/panel/", op_status),
        ]

        for role, usr, pwd, url, st in rows:
            self.stdout.write(f"{role:<22} | {usr:<16} | {pwd:<16} | {url:<20} | {st:<24}")

        self.stdout.write(separator + "\n")
        self.stdout.write(self.style.NOTICE("API Health Endpoint:  GET /api/health/"))
        self.stdout.write(self.style.NOTICE("Swagger / OpenAPI:    GET /api/docs/ (if configured)"))
        self.stdout.write(self.style.NOTICE("Frontend SPA Root:    /\n"))
