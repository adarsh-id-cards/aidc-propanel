"""
Management command: create_super_admin
======================================
Creates a Super Admin account.
Strict maximum of 3 Super Admins are allowed across the system.

Usage:
    python manage.py create_super_admin --email admin@example.com --password SecurePass123
    python manage.py create_super_admin --email admin@example.com --username admin1
"""
import getpass
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()
MAX_SUPER_ADMIN_QUOTA = 3


class Command(BaseCommand):
    help = f'Create a Super Admin account (strict quota of max {MAX_SUPER_ADMIN_QUOTA} allowed).'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email address for the Super Admin')
        parser.add_argument('--username', default=None, help='Username (defaults to email prefix)')
        parser.add_argument('--password', default=None, help='Password (will prompt if not provided)')
        parser.add_argument('--phone', default='', help='Contact phone number')
        parser.add_argument('--secondary-email-1', default='', help='First secondary login email')
        parser.add_argument('--secondary-email-2', default='', help='Second secondary login email')
        parser.add_argument('--first-name', default='', help='First name')
        parser.add_argument('--last-name', default='', help='Last name')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        username = options['username'] or email.split('@')[0]
        phone = options.get('phone', '').strip()
        sec_email_1 = options.get('secondary_email_1', '').strip().lower()
        sec_email_2 = options.get('secondary_email_2', '').strip().lower()
        first_name = options['first_name'] or 'Super'
        last_name = options['last_name'] or 'Admin'

        # Enforce quota of max 3 Super Admins in the system
        current_count = User.objects.filter(role='super_admin').count()
        if current_count >= MAX_SUPER_ADMIN_QUOTA:
            raise CommandError(
                f'Maximum {MAX_SUPER_ADMIN_QUOTA} Super Admins already exist in the system ({current_count}/{MAX_SUPER_ADMIN_QUOTA}).'
            )

        # Check if email is already taken
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f'A user with email {email} already exists.')

        # Check if username is already taken
        if User.objects.filter(username=username).exists():
            raise CommandError(f'A user with username "{username}" already exists.')

        password = options.get('password')
        if not password:
            password = getpass.getpass('Password: ')
            password_confirm = getpass.getpass('Password (again): ')
            if password != password_confirm:
                raise CommandError('Passwords do not match.')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role='super_admin',
            secondary_email_1=sec_email_1 or None,
            secondary_email_2=sec_email_2 or None,
            is_active=True,
            is_staff=True,
            is_superuser=True,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created Super Admin: {user.username} ({user.email}). '
                f'Active Super Admins: {User.objects.filter(role="super_admin").count()}/{MAX_SUPER_ADMIN_QUOTA}'
            )
        )
