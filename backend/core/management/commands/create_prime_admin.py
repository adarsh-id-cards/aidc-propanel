"""
Management command: create_prime_admin
======================================
Creates or updates the singleton SaaS Prime Admin (Platform Owner) account.
Prime Admin is the top-level platform administrator in the SaaS architecture.

Usage:
    python manage.py create_prime_admin --email prime@cardflow.io --password SecurePass123
    python manage.py create_prime_admin --email prime@cardflow.io --username prime_admin --password SecurePass123
"""
import getpass
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create or update the singleton SaaS Prime Admin account.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email address for the Prime Admin')
        parser.add_argument('--username', default=None, help='Username (defaults to email prefix or prime_admin)')
        parser.add_argument('--password', default=None, help='Password (will prompt if not provided)')
        parser.add_argument('--phone', default='', help='Contact phone number')
        parser.add_argument('--secondary-email-1', default='', help='First secondary login email')
        parser.add_argument('--secondary-email-2', default='', help='Second secondary login email')
        parser.add_argument('--first-name', default='Prime', help='First name')
        parser.add_argument('--last-name', default='Admin', help='Last name')

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        username = options['username'] or email.split('@')[0] or 'prime_admin'
        phone = options.get('phone', '').strip()
        sec_email_1 = options.get('secondary_email_1', '').strip().lower()
        sec_email_2 = options.get('secondary_email_2', '').strip().lower()
        first_name = options.get('first_name') or 'Prime'
        last_name = options.get('last_name') or 'Admin'

        password = options.get('password')
        if not password:
            try:
                password = getpass.getpass('Password: ')
                password_confirm = getpass.getpass('Password (again): ')
                if password != password_confirm:
                    raise CommandError('Passwords do not match.')
            except (EOFError, KeyboardInterrupt):
                raise CommandError('Password input cancelled.')

        existing_prime = User.objects.filter(role='prime_admin').first()

        if existing_prime:
            # Update existing Prime Admin
            existing_prime.email = email
            existing_prime.username = username
            existing_prime.first_name = first_name
            existing_prime.last_name = last_name
            existing_prime.phone = phone
            existing_prime.secondary_email_1 = sec_email_1 or None
            existing_prime.secondary_email_2 = sec_email_2 or None
            existing_prime.is_active = True
            existing_prime.is_staff = True
            existing_prime.is_superuser = True
            existing_prime.must_change_password = False
            existing_prime.is_revoked = False
            existing_prime.set_password(password)
            existing_prime.save()

            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully updated existing Prime Admin: {existing_prime.username} ({existing_prime.email})'
                )
            )
            return

        # Check if email is already taken by a different user
        conflict_email = User.objects.filter(email__iexact=email).exclude(role='prime_admin').first()
        if conflict_email:
            raise CommandError(f'A user with email "{email}" already exists with role "{conflict_email.role}".')

        # Check if username is already taken by a different user
        conflict_user = User.objects.filter(username=username).exclude(role='prime_admin').first()
        if conflict_user:
            raise CommandError(f'A user with username "{username}" already exists with role "{conflict_user.role}".')

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role='prime_admin',
            secondary_email_1=sec_email_1 or None,
            secondary_email_2=sec_email_2 or None,
            is_active=True,
            is_staff=True,
            is_superuser=True,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created SaaS Prime Admin: {user.username} ({user.email})'
            )
        )
