import os
import re
import secrets
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from django.conf import settings


class SaaSSubscription(models.Model):
    """
    SaaS Tenant Subscription Model.
    Each client of the CardFlow SaaS platform has a SaaSSubscription.
    A subscription has:
    - Tier: lite, pro, or max
    - Quota of up to 3 Super Admins (sharing a common DB scope and common orgs)
    - Dedicated storage folder for photos and exports
    - Custom domain, branding, and landing page settings
    - Mobile app branding settings
    - Add-on packs (Auto Print, Auto Type, Auto Edit)
    """
    TIER_CHOICES = [
        ('lite', 'CardFlow Starter'),
        ('pro', 'CardFlow Professional'),
        ('max', 'CardFlow Enterprise'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('trial', 'Trial'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
    ]

    WEBSITE_TEMPLATES = [
        ('modern_minimal', 'Modern Minimal (Standard)'),
        ('corporate_bold', 'Corporate Bold'),
        ('creative_gradient', 'Creative Gradient'),
        ('educational_crest', 'Educational Crest & Academy'),
        ('sleek_enterprise', 'Sleek Dark & Enterprise Pro'),
    ]

    name = models.CharField(max_length=255, db_index=True, help_text='Client or Organization Group Name')
    slug = models.SlugField(max_length=100, unique=True, db_index=True, help_text='Unique identifier used for subdomains and storage paths')
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, default='pro', db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', db_index=True)
    
    # Storage isolation
    storage_folder = models.CharField(
        max_length=255,
        blank=True,
        help_text='Dedicated media storage folder path relative to MEDIA_ROOT (e.g. tenants/acme/)'
    )

    # Quotas and Limits
    max_super_admins = models.PositiveIntegerField(
        default=3,
        help_text='Maximum Super Admins allowed for this subscription (strict limit of 3)'
    )
    max_organisations = models.PositiveIntegerField(
        default=500,
        help_text='Maximum organisations allowed under this subscription (Lite: 100, Pro: 500, Max: 2000)'
    )
    max_cards = models.PositiveIntegerField(
        default=10000,
        help_text='Base card capacity quota (10,000 cards default across all tiers; expandable via add-ons)'
    )
    extra_cards_purchased = models.PositiveIntegerField(
        default=0,
        help_text='Additional card quota purchased in multiples of 1,000, 5,000, or 10,000'
    )

    # Custom Branding & White-Label Customization
    brand_name = models.CharField(
        max_length=100,
        default='CardFlow',
        help_text='Custom system brand name (e.g. ApexID, SchoolFlow). Replaces CardFlow in Pro/Max.'
    )
    brand_logo_url = models.CharField(
        max_length=500,
        blank=True,
        help_text='URL to custom logo image for panel and headers'
    )
    brand_name_customized = models.BooleanField(
        default=False,
        help_text='Whether the system name was white-labeled/customized (allowed once)'
    )
    panel_color_theme = models.CharField(
        max_length=50,
        default='#3b82f6',
        help_text='Primary theme color for the panel interface (Hex or HSL)'
    )
    panel_accent_theme = models.CharField(
        max_length=50,
        default='#1d4ed8',
        help_text='Secondary accent color for buttons and badges'
    )
    website_template = models.CharField(
        max_length=50,
        choices=WEBSITE_TEMPLATES,
        default='modern_minimal',
        help_text='Website template selected for tenant landing page'
    )

    # Domain & Landing Website Settings
    custom_domain = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        unique=True,
        help_text='Custom domain (e.g. cards.apexacademy.com) - available in Pro & Max'
    )
    custom_subdomain = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text='Subdomain on platform (e.g. apex.cardflow.io)'
    )
    landing_config = models.JSONField(
        default=dict,
        blank=True,
        help_text='Landing page configuration: hero_title, hero_subtitle, logo_url, brand_color, contact_email, contact_phone, is_published, sections'
    )

    # Mobile App Settings
    mobile_app_config = models.JSONField(
        default=dict,
        blank=True,
        help_text='Mobile app settings: app_name, bundle_id, theme_color, logo_url, is_enabled, download_url'
    )

    # ── Advanced Paid Add-ons (₹999/yr access + usage fee) ───────────────
    # 1. Auto Print: Directly print ID cards from final CardFlow data (₹499 per 10k)
    auto_print_active = models.BooleanField(default=False)
    auto_print_expires_at = models.DateField(null=True, blank=True)
    auto_print_credits = models.PositiveIntegerField(default=0)

    # 2. Auto Type: Automated typing from scanned forms/registers/PDFs (₹2,499 per 10k)
    auto_type_active = models.BooleanField(default=False)
    auto_type_expires_at = models.DateField(null=True, blank=True)
    auto_type_credits = models.PositiveIntegerField(default=0)

    # 3. Auto Edit: Auto face crop, photo enhancement, background cleanup (₹1,499 per 10k)
    auto_edit_active = models.BooleanField(default=False)
    auto_edit_expires_at = models.DateField(null=True, blank=True)
    auto_edit_credits = models.PositiveIntegerField(default=0)

    # ── Billing & Installment Plan ───────────────────────────────────────
    BILLING_PLAN_CHOICES = [
        ('split', '2-Step Split Plan (Setup + 10 Mos)'),
        ('one_time', 'One-Go Full Year Upfront'),
    ]
    billing_plan = models.CharField(
        max_length=20,
        choices=BILLING_PLAN_CHOICES,
        default='split',
        help_text='Selected payment structure: 2-step split or one-go upfront'
    )
    installments_paid = models.PositiveIntegerField(
        default=0,
        help_text='Number of monthly installments completed (out of 10 for split plan)'
    )
    installments_total = models.PositiveIntegerField(
        default=10,
        help_text='Total monthly installments required in split plan'
    )
    next_installment_due = models.DateField(
        null=True,
        blank=True,
        help_text='Due date for next monthly installment'
    )

    # ── Enterprise License Key Engine ────────────────────────────────────
    LICENSE_STATUS_CHOICES = [
        ('active', 'Active & Verified'),
        ('suspended', 'Suspended'),
        ('revoked', 'Revoked'),
        ('expired', 'Expired'),
    ]
    license_key = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text='Enterprise license key in format CF-<TIER>-<YEAR>-<CHUNK1>-<CHUNK2>-<CHUNK3>'
    )
    license_issued_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp when the license key was generated or reissued'
    )
    license_status = models.CharField(
        max_length=20,
        choices=LICENSE_STATUS_CHOICES,
        default='active',
        db_index=True,
        help_text='Current status of the software license'
    )

    renews_at = models.DateField(null=True, blank=True, help_text='Next billing / renewal date')
    notes = models.TextField(blank=True, help_text='Internal notes about this client')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'SaaS Subscription'
        verbose_name_plural = 'SaaS Subscriptions'
        indexes = [
            models.Index(fields=['status', 'tier'], name='saas_sub_st_tier_idx'),
            models.Index(fields=['status', '-created_at'], name='saas_sub_st_time_idx'),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_tier_display()} - {self.status.upper()})"

    @property
    def effective_card_limit(self):
        """Total allowed cards including purchased top-up packs."""
        return self.max_cards + self.extra_cards_purchased

    @property
    def is_license_valid(self):
        """Returns True if the tenant's license is active and not expired."""
        if self.status != 'active' or self.license_status != 'active':
            return False
        if self.renews_at and self.renews_at < timezone.now().date():
            return False
        return True

    def generate_license_key(self, force=False):
        """
        Generate a cryptographically secure, human-readable enterprise license key.
        Format: CF-<TIER>-<YEAR>-<XXXX>-<XXXX>-<XXXX>
        Example: CF-PRO-2026-9B4F-8E2A-7C1D
        """
        if self.license_key and not force:
            return self.license_key

        year = (self.created_at.year if self.created_at else timezone.now().year)
        tier_tag = (self.tier or 'pro').upper()

        for _ in range(10):
            c1 = secrets.token_hex(2).upper()
            c2 = secrets.token_hex(2).upper()
            c3 = secrets.token_hex(2).upper()
            candidate = f"CF-{tier_tag}-{year}-{c1}-{c2}-{c3}"
            if not SaaSSubscription.objects.filter(license_key=candidate).exclude(pk=self.pk).exists():
                self.license_key = candidate
                self.license_issued_at = timezone.now()
                self.license_status = 'active'
                return self.license_key

        candidate = f"CF-{tier_tag}-{year}-{int(timezone.now().timestamp())}"
        self.license_key = candidate
        self.license_issued_at = timezone.now()
        self.license_status = 'active'
        return self.license_key

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name) or 'client'
            slug = base_slug
            idx = 1
            while SaaSSubscription.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{idx}"
                idx += 1
            self.slug = slug

        if not self.storage_folder:
            self.storage_folder = f"tenants/{self.slug}"

        # Initialize default card quotas based on tier if creating new
        if not self.pk:
            if not self.max_cards:
                self.max_cards = 10000
            if self.tier == 'lite':
                if not self.max_organisations or self.max_organisations == 500:
                    self.max_organisations = 100
                self.max_cards = self.max_cards or 10000
            elif self.tier == 'pro':
                self.max_organisations = self.max_organisations or 500
                self.max_cards = self.max_cards or 10000
            elif self.tier == 'max':
                if not self.max_organisations or self.max_organisations == 500:
                    self.max_organisations = 2000
                self.max_cards = self.max_cards or 10000

        # Initialize default landing config if empty
        if not self.landing_config:
            self.landing_config = {
                'hero_title': f"Welcome to {self.name}",
                'hero_subtitle': 'Official Digital ID & Card Management Portal',
                'brand_color': self.panel_color_theme or '#3b82f6',
                'accent_color': self.panel_accent_theme or '#1d4ed8',
                'logo_url': '',
                'contact_email': '',
                'contact_phone': '',
                'is_published': True,
                'template': self.website_template,
                'sections': ['hero', 'features', 'portal_access', 'contact'],
                'features': ['Instant ID Card Issuance', 'Realtime Verification', 'Bulk Export & Reprinting']
            }

        # Initialize default mobile app config if empty
        if not self.mobile_app_config:
            self.mobile_app_config = {
                'app_name': f"{self.name} ID",
                'bundle_id': f"com.cardflow.tenant.{self.slug.replace('-', '')}",
                'theme_color': self.panel_color_theme or '#0ea5e9',
                'logo_url': '',
                'is_enabled': self.tier in ('pro', 'max'),
                'version': '1.0.0',
                'download_url': '',
            }

        # Auto-generate enterprise license key if not present
        if not self.license_key:
            self.generate_license_key()

        super().save(*args, **kwargs)

    def get_storage_path(self, *subpaths):
        """Return the absolute path inside this tenant's isolated storage folder."""
        folder = self.storage_folder or f"tenants/{self.slug}"
        full_path = os.path.join(settings.MEDIA_ROOT, folder, *subpaths)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        return full_path

    @property
    def super_admins_count(self):
        return self.users.filter(role='super_admin').count()

    @property
    def organisations_count(self):
        return self.organisations.count()


class SaaSCardTopupRequest(models.Model):
    """
    Super Admin request for extra card packs in multiples of 1,000, 5,000, or 10,000.
    """
    QUANTITY_CHOICES = [
        (1000, '1,000 Extra Cards'),
        (5000, '5,000 Extra Cards'),
        (10000, '10,000 Extra Cards'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved & Credited'),
        ('rejected', 'Rejected'),
    ]

    subscription = models.ForeignKey(
        SaaSSubscription,
        on_delete=models.CASCADE,
        related_name='card_topups'
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saas_card_topup_requests',
    )
    quantity = models.PositiveIntegerField(choices=QUANTITY_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Card Top-up Request'
        verbose_name_plural = 'Card Top-up Requests'

    def approve(self):
        """Approve and increment subscription extra cards."""
        if self.status != 'approved':
            self.status = 'approved'
            self.approved_at = timezone.now()
            self.save(update_fields=['status', 'approved_at'])
            self.subscription.extra_cards_purchased += self.quantity
            self.subscription.save(update_fields=['extra_cards_purchased'])


class SaaSAddonRequest(models.Model):
    """
    Super Admin request for paid Add-ons: Auto Print, Auto Type, or Auto Edit.
    Access fee: ₹999/yr, Usage packs: 10,000 items.
    """
    ADDON_CHOICES = [
        ('auto_print', 'Auto Print (ID Card Printing Engine)'),
        ('auto_type', 'Auto Type (AI Form / OCR Extraction)'),
        ('auto_edit', 'Auto Edit (Face Detection & Auto-Crop)'),
    ]

    REQUEST_TYPE_CHOICES = [
        ('annual_access', 'Annual Access License (₹999/yr)'),
        ('usage_pack', '10,000 Usage Processing Pack'),
        ('bundle', 'Annual Access + 10,000 Usage Pack'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved & Activated'),
        ('rejected', 'Rejected'),
    ]

    subscription = models.ForeignKey(
        SaaSSubscription,
        on_delete=models.CASCADE,
        related_name='addon_requests'
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saas_addon_requests',
    )
    addon_type = models.CharField(max_length=30, choices=ADDON_CHOICES)
    request_type = models.CharField(max_length=30, choices=REQUEST_TYPE_CHOICES, default='annual_access')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    credits_to_add = models.PositiveIntegerField(default=10000)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Add-on Request'
        verbose_name_plural = 'Add-on Requests'

    def approve(self):
        """Activate add-on and credit processing quota."""
        self.status = 'approved'
        self.approved_at = timezone.now()
        self.save(update_fields=['status', 'approved_at'])

        sub = self.subscription
        one_year_later = timezone.now().date() + timezone.timedelta(days=365)

        if self.addon_type == 'auto_print':
            sub.auto_print_active = True
            sub.auto_print_expires_at = one_year_later
            if self.request_type in ('usage_pack', 'bundle'):
                sub.auto_print_credits += self.credits_to_add
            sub.save()
        elif self.addon_type == 'auto_type':
            sub.auto_type_active = True
            sub.auto_type_expires_at = one_year_later
            if self.request_type in ('usage_pack', 'bundle'):
                sub.auto_type_credits += self.credits_to_add
            sub.save()
        elif self.addon_type == 'auto_edit':
            sub.auto_edit_active = True
            sub.auto_edit_expires_at = one_year_later
            if self.request_type in ('usage_pack', 'bundle'):
                sub.auto_edit_credits += self.credits_to_add
            sub.save()


class SaaSPayment(models.Model):
    """
    SaaS Payments & Billing Ledger.
    Tracks client subscription payments, invoices, dates, and manual payment verification.
    """
    STATUS_CHOICES = [
        ('completed', 'Completed'),
        ('pending_verification', 'Pending Verification'),
        ('rejected', 'Rejected'),
        ('refunded', 'Refunded'),
    ]

    METHOD_CHOICES = [
        ('upi', 'UPI / QR Code'),
        ('bank_transfer', 'Bank Transfer (NEFT/IMPS/RTGS)'),
        ('cash', 'Cash / Cheque'),
        ('other', 'Other Manual'),
    ]

    PLAN_TYPE_CHOICES = [
        ('setup_fee', 'One-Time Setup (2 Months Free)'),
        ('monthly', 'Monthly Subscription (₹499/mo)'),
        ('quarterly', 'Quarterly Subscription (₹1,399 / 3 mos)'),
        ('half_yearly', 'Half-Yearly Subscription (₹2,599 / 6 mos)'),
        ('yearly', 'Yearly Subscription (₹4,999 / 1 yr)'),
        ('extra_cards', 'Extra Card Pack Top-up'),
        ('addon', 'Add-on License / Pack'),
        ('custom', 'Custom Payment'),
        ('split_step1', 'Step 1: One-Time Annual Setup (2 Mos Free)'),
        ('split_installment', 'Step 2: Monthly Installment'),
        ('one_time_annual', 'One-Go Full Year Payment'),
    ]

    subscription = models.ForeignKey(
        SaaSSubscription,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='INR')
    payment_date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='completed')
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    payment_method = models.CharField(max_length=50, choices=METHOD_CHOICES, default='upi')
    payment_plan_type = models.CharField(max_length=30, choices=PLAN_TYPE_CHOICES, default='one_time_annual')
    utr_number = models.CharField(max_length=100, blank=True, default='', help_text='Bank UTR or UPI transaction reference')
    screenshot_url = models.TextField(blank=True, default='', help_text='Payment proof screenshot image path or data URL')
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_saas_payments'
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']
        verbose_name = 'SaaS Payment'
        verbose_name_plural = 'SaaS Payments'

    def __str__(self):
        return f"{self.invoice_number} - {self.subscription.name} - ₹{self.amount} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            import random
            year = timezone.now().year
            rand_code = ''.join(random.choices('0123456789', k=5))
            self.invoice_number = f"INV-{year}-{rand_code}"
        super().save(*args, **kwargs)


class SaaSLead(models.Model):
    """
    Sales Pipeline & Leads CRM for Prime Admin & Sales Operators.
    Tracks prospective clients, interest level, demo status, and deal size.
    """
    PIPELINE_STATUS_CHOICES = [
        ('new', 'New Lead'),
        ('contacted', 'Contacted'),
        ('demo_scheduled', 'Demo Scheduled'),
        ('proposal_sent', 'Proposal Sent'),
        ('closed_won', 'Closed Won (Converted)'),
        ('closed_lost', 'Closed Lost'),
    ]

    name = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True)
    tier_interested = models.CharField(
        max_length=20,
        choices=SaaSSubscription.TIER_CHOICES,
        default='pro'
    )
    pipeline_status = models.CharField(
        max_length=30,
        choices=PIPELINE_STATUS_CHOICES,
        default='new',
        db_index=True
    )
    estimated_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'SaaS Lead'
        verbose_name_plural = 'SaaS Leads'

    def __str__(self):
        return f"{self.name} - {self.company_name} ({self.get_pipeline_status_display()})"


class SaaSTierFeature(models.Model):
    """
    Feature Matrix Configuration for Tiers (Lite, Pro, Max).
    All core platform features are ON by default across tiers.
    The primary distinction is Card Limits and White-Label Customization.
    """
    tier = models.CharField(
        max_length=20,
        choices=SaaSSubscription.TIER_CHOICES,
        unique=True,
        db_index=True
    )
    display_name = models.CharField(max_length=100)
    price_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    features = models.JSONField(
        default=dict,
        help_text='Feature flags dict: all core features ON by default, toggleable by Prime Admin'
    )
    limits = models.JSONField(
        default=dict,
        help_text='Numeric limits: max_organisations (100/500/2000), max_cards (10k/25k/50k)'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'SaaS Tier Feature Matrix'
        verbose_name_plural = 'SaaS Tier Feature Matrices'

    def __str__(self):
        return f"{self.display_name} ({self.tier})"

    @classmethod
    def get_default_matrix(cls):
        """
        Return the default feature definitions for all 3 tiers.
        Rule: ALL core platform features are ON by default across all tiers.
        All tiers have base 10,000 cards default and ₹499/month recurring price.
        Tiers differ in One-Time Setup Fee (₹4,999 Starter, ₹7,499 Professional, ₹9,999 Enterprise),
        Website offerings (Standard subdomain vs 5-template static vs bespoke dynamic CMS),
        and Mobile App offerings (Shared standard vs dedicated brand listing vs bespoke animated app).
        """
        card_packs = {
            'pack_5k': {'cards': 5000, 'monthly_price': 49.00},
            'pack_10k': {'cards': 10000, 'monthly_price': 79.00},
            'pack_25k': {'cards': 25000, 'monthly_price': 149.00},
            'pack_50k': {'cards': 50000, 'monthly_price': 249.00},
        }
        common_features = {
            'bulk_docx_xlsx_embedded': True,
            'custom_branding_export': True,
            'reprint_suite': True,
            'high_throughput_worker': True,
            'audit_logs_telemetry': True,
            'priority_rendering': True,
            'custom_domain': True,
            'custom_landing_website': True,
            'custom_android_app': True,
            'custom_panel_branding': True,
        }
        return {
            'lite': {
                'display_name': 'CardFlow Starter',
                'setup_fee': 4999.00,
                'price_monthly': 499.00,
                'pricing_plans': {
                    'setup_fee': 4999.00,
                    'free_validity_months': 2,
                    'monthly_recurring': 499.00,
                    'quarterly_prepay': 1399.00,
                    'half_yearly_prepay': 2599.00,
                    'yearly_prepay': 4999.00,
                    # Backward compat aliases
                    'split_step1_annual': 4999.00,
                    'split_monthly_installment': 499.00,
                    'split_installments_count': 10,
                    'split_total': 9989.00,
                    'one_time_annual': 4999.00,
                    'one_time_savings': 989.00,
                },
                'card_expansion_packs': card_packs,
                'features': dict(common_features),
                'tier_specifications': {
                    'website_type': 'Primary Cloud Subdomain (yourbrand.cardflow.io)',
                    'website_templates_count': 0,
                    'website_updates_per_year': 0,
                    'mobile_app_type': 'Shared Standard CardFlow App (Play Store Publishing Add-on Available)',
                    'app_updates_per_year': 0,
                },
                'limits': {
                    'max_super_admins': 3,
                    'max_organisations': None,  # Unlimited
                    'max_cards': 10000,
                    'max_managers_per_org': 5,
                    'max_assistants_per_manager': 100,
                }
            },
            'pro': {
                'display_name': 'CardFlow Professional',
                'setup_fee': 7499.00,
                'price_monthly': 499.00,
                'pricing_plans': {
                    'setup_fee': 7499.00,
                    'free_validity_months': 2,
                    'monthly_recurring': 499.00,
                    'quarterly_prepay': 1399.00,
                    'half_yearly_prepay': 2599.00,
                    'yearly_prepay': 4999.00,
                    # Backward compat aliases
                    'split_step1_annual': 7499.00,
                    'split_monthly_installment': 499.00,
                    'split_installments_count': 10,
                    'split_total': 12489.00,
                    'one_time_annual': 4999.00,
                    'one_time_savings': 989.00,
                },
                'card_expansion_packs': card_packs,
                'features': dict(common_features),
                'tier_specifications': {
                    'website_type': 'Fully Customizable Static Website (5 Templates, Custom Colors & Section Reordering)',
                    'website_templates_count': 5,
                    'website_updates_per_year': 10,
                    'mobile_app_type': 'Dedicated Android App (Custom Play Store Listing Name & Icon, Splash Screen Logo, In-App Header Logo & Colors)',
                    'app_updates_per_year': 0,
                },
                'limits': {
                    'max_super_admins': 3,
                    'max_organisations': None,  # Unlimited
                    'max_cards': 10000,
                    'max_managers_per_org': 5,
                    'max_assistants_per_manager': 100,
                }
            },
            'max': {
                'display_name': 'CardFlow Enterprise',
                'setup_fee': 9999.00,
                'price_monthly': 499.00,
                'pricing_plans': {
                    'setup_fee': 9999.00,
                    'free_validity_months': 2,
                    'monthly_recurring': 499.00,
                    'quarterly_prepay': 1399.00,
                    'half_yearly_prepay': 2599.00,
                    'yearly_prepay': 4999.00,
                    # Backward compat aliases
                    'split_step1_annual': 9999.00,
                    'split_monthly_installment': 499.00,
                    'split_installments_count': 10,
                    'split_total': 14989.00,
                    'one_time_annual': 4999.00,
                    'one_time_savings': 989.00,
                },
                'card_expansion_packs': card_packs,
                'features': dict(common_features),
                'tier_specifications': {
                    'website_type': 'Bespoke Dynamic Custom Website (Unique Build, Not Template) + CMS Website Admin Control Dashboard',
                    'website_templates_count': 0,
                    'website_updates_per_year': 10,
                    'mobile_app_type': 'Fully Customized Bespoke App (Animated Splash Screen, Social Links, In-App Feature Colors)',
                    'app_updates_per_year': 10,
                },
                'limits': {
                    'max_super_admins': 3,
                    'max_organisations': None,  # Unlimited
                    'max_cards': 10000,
                    'max_managers_per_org': 5,
                    'max_assistants_per_manager': 100,
                }
            }
        }


class SaaSPlatformLog(models.Model):
    """
    Central Audit & Telemetry Log for SaaS Platform, Prime Admin & Prime Operators.
    Captures security anomalies, billing lifecycle events, license regenerations,
    tenant status changes, and operator actions.
    """
    LOG_LEVEL_CHOICES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('critical', 'Critical Security Alert'),
    ]

    CATEGORY_CHOICES = [
        ('security', 'Security Anomaly & Access'),
        ('billing', 'Billing & Ledger Event'),
        ('license', 'License & Certificate Event'),
        ('tenant', 'Tenant Lifecycle & Settings'),
        ('operator', 'Operator Action & Audit'),
        ('system', 'System & Engine Telemetry'),
    ]

    subscription = models.ForeignKey(
        SaaSSubscription,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='platform_logs',
        help_text='Associated tenant subscription (if tenant-specific)'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saas_platform_logs',
        help_text='User who initiated the action or triggered the event'
    )
    actor_name_snapshot = models.CharField(max_length=150, blank=True, default='')
    actor_role_snapshot = models.CharField(max_length=50, blank=True, default='')
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='system', db_index=True)
    level = models.CharField(max_length=20, choices=LOG_LEVEL_CHOICES, default='info', db_index=True)
    action = models.CharField(max_length=100, db_index=True, help_text='Short identifier e.g. LICENSE_REISSUED, PAYMENT_VERIFIED')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'SaaS Platform Log'
        verbose_name_plural = 'SaaS Platform Logs'
        indexes = [
            models.Index(fields=['category', '-created_at'], name='saas_log_cat_time_idx'),
            models.Index(fields=['level', '-created_at'], name='saas_log_lvl_time_idx'),
            models.Index(fields=['subscription', '-created_at'], name='saas_log_sub_time_idx'),
        ]

    def __str__(self):
        return f"[{self.level.upper()}] [{self.category.upper()}] {self.action}: {self.title} ({self.created_at})"

