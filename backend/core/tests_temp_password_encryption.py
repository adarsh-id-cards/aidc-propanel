from django.test import TestCase
from django.contrib.auth import get_user_model
from core.services.auto_password_service import AutoPasswordService

User = get_user_model()


class TempPasswordEncryptionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='test_enc_user',
            email='test_enc@example.com',
            role='client',
        )

    def test_temp_password_encrypted_in_database(self):
        raw_password = 'TempSecretPassword99!'
        AutoPasswordService.assign_temp_password(self.user, raw_password, must_change=True)

        self.user.refresh_from_db()

        # Database field must be encrypted with enc: prefix and must NOT contain plaintext
        self.assertTrue(self.user.temp_password.startswith('enc:'))
        self.assertNotIn(raw_password, self.user.temp_password)

        # Decryption returns the exact plaintext password
        decrypted = AutoPasswordService.get_temp_password(self.user)
        self.assertEqual(decrypted, raw_password)

        # Standard Django authentication works
        self.assertTrue(self.user.check_password(raw_password))
        self.assertTrue(self.user.must_change_password)

    def test_legacy_plaintext_fallback(self):
        # Existing database records with unencrypted passwords must remain readable
        self.user.temp_password = 'legacy_unencrypted_pin'
        self.user.save(update_fields=['temp_password'])

        self.user.refresh_from_db()
        self.assertEqual(AutoPasswordService.get_temp_password(self.user), 'legacy_unencrypted_pin')

    def test_clear_temp_password(self):
        AutoPasswordService.assign_temp_password(self.user, 'TempSecret123!')
        AutoPasswordService.clear_temp_password(self.user)

        self.user.refresh_from_db()
        self.assertEqual(self.user.temp_password, '')
        self.assertEqual(AutoPasswordService.get_temp_password(self.user), '')
        self.assertFalse(self.user.must_change_password)
