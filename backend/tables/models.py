import logging
import re

from django.conf import settings
from django.db import models
from organisation.models import Organisation

from mediafiles.constants import IMAGE_FIELD_TYPES

logger = logging.getLogger(__name__)


def _field_name_tokens(name):
    """Return normalized alphanumeric tokens from a field label."""
    return {tok for tok in re.split(r'[^a-z0-9]+', str(name or '').strip().lower()) if tok}


# ---------------------------------------------------------------------------
#   Text sanitizer — strips non-Latin-1 characters that cause ■ in PDF
# ---------------------------------------------------------------------------
_MULTI_SPACE_RE = re.compile(r' {2,}')
_IMAGE_PREFIXES = ('PENDING:', 'NOT_FOUND', 'adarshimg/', 'clients_imgs/',
                   'id_card_images/', 'id_photos/', 'staff_imgs/', 'tenants/')
_WS_CTRL_RE = re.compile(r'[\t\n\r\x0b\x0c]')
_C0_CTRL_RE = re.compile(r'[\x00-\x1f\x7f]')
_NON_LATIN1_RE = re.compile(r'[\x80-\x9f\u0100-\U0010ffff]')


def sanitize_text_for_storage(value: str) -> str:
    """Strip characters outside Helvetica's renderable range (0x20-0xFF)."""
    if not value or not isinstance(value, str):
        return value
    if '/' in value and any(value.startswith(p) for p in _IMAGE_PREFIXES):
        return value
    for prefix in _IMAGE_PREFIXES:
        if value.startswith(prefix):
            return value
    result = _WS_CTRL_RE.sub(' ', value)
    result = _C0_CTRL_RE.sub('', result)
    result = _NON_LATIN1_RE.sub(' ', result)
    return _MULTI_SPACE_RE.sub(' ', result).strip()


class Table(models.Model):
    """
    Table — the core schema unit belonging to an Organisation.

    Collapses the old Table + Table two-level hierarchy into
    a single flat model. Each Organisation has Tables; each Table defines
    the field configuration (column names & types) for its ID Cards.

    Each Table also carries the status lists (pending, verified, approved,
    downloaded, pool/deleted, reprint) — these are statuses on IDCard records
    within the Table, not separate sub-models.
    """

    TABLE_TYPE_CHOICES = [
        ('school_student', 'School Student'),
        ('college_student', 'College Student'),
        ('staff', 'Staff / Employee'),
        ('custom', 'Custom'),
    ]

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tables',
    )
    name = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True, null=True)
    table_type = models.CharField(
        max_length=20,
        choices=TABLE_TYPE_CHOICES,
        default='custom',
        help_text='Auto-detected from table name and organisation type.',
    )
    # Field definitions: [{name, type, order}, ...]
    fields = models.JSONField(
        default=list,
        help_text='List of field configurations: [{name, type, order}]. Max 20 fields.',
    )
    is_active = models.BooleanField(default=True)
    deleted_by_manager = models.BooleanField(
        default=False,
        help_text='True when the prime manager soft-deletes this table.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __init__(self, *args, **kwargs):
        if 'client' in kwargs:
            kwargs.setdefault('organisation', kwargs.pop('client'))
        if 'client_id' in kwargs:
            kwargs.setdefault('organisation_id', kwargs.pop('client_id'))
        if 'deleted_by_client' in kwargs:
            kwargs.setdefault('deleted_by_manager', kwargs.pop('deleted_by_client'))
        if 'group' in kwargs:
            group_val = kwargs.pop('group')
            if 'organisation' not in kwargs and 'organisation_id' not in kwargs:
                kwargs['organisation'] = getattr(group_val, 'organisation', getattr(group_val, 'client', group_val))
        super().__init__(*args, **kwargs)

    @property
    def client(self):
        return self.organisation

    @client.setter
    def client(self, value):
        self.organisation = value

    @property
    def client_id(self):
        return self.organisation_id

    @client_id.setter
    def client_id(self, value):
        self.organisation_id = value

    @property
    def group(self):
        return self

    @property
    def group_id(self):
        return self.id

    @property
    def deleted_by_client(self):
        return self.deleted_by_manager

    @deleted_by_client.setter
    def deleted_by_client(self, value):
        self.deleted_by_manager = value

    # ── Field introspection helpers ──────────────────────────

    def has_class_field(self):
        class_tokens = {'class', 'std', 'standard', 'grade'}
        return any(
            f.get('type') == 'class' or bool(_field_name_tokens(f.get('name', '')) & class_tokens)
            for f in self.fields
        )

    def has_section_field(self):
        section_tokens = {'section', 'sec', 'div', 'division'}
        return any(
            f.get('type') == 'section' or bool(_field_name_tokens(f.get('name', '')) & section_tokens)
            for f in self.fields
        )

    def has_course_field(self):
        course_tokens = {'course', 'program', 'programme'}
        return any(
            f.get('type') == 'course' or bool(_field_name_tokens(f.get('name', '')) & course_tokens)
            for f in self.fields
        )

    def has_branch_field(self):
        branch_tokens = {'branch', 'stream', 'dept', 'department'}
        return any(
            f.get('type') == 'branch' or bool(_field_name_tokens(f.get('name', '')) & branch_tokens)
            for f in self.fields
        )

    def has_image_fields(self):
        return any(f.get('type') in IMAGE_FIELD_TYPES for f in self.fields)

    def get_image_fields(self):
        return [f.get('name') for f in self.fields if f.get('type') in IMAGE_FIELD_TYPES]

    def delete_all_card_images(self):
        for card in self.id_cards.all().iterator(chunk_size=200):
            card.delete_images()

    def delete(self, *args, **kwargs):
        self.delete_all_card_images()
        super().delete(*args, **kwargs)

    def clean(self):
        from django.core.exceptions import ValidationError
        if len(self.fields) > 20:
            raise ValidationError('Maximum 20 fields allowed per table.')

    def save(self, *args, **kwargs):
        if len(self.fields) > 20:
            from django.core.exceptions import ValidationError
            raise ValidationError('Maximum 20 fields allowed per table.')
        if 'update_fields' in kwargs and kwargs['update_fields'] is not None:
            mapped_fields = []
            for f in kwargs['update_fields']:
                if f == 'deleted_by_client':
                    mapped_fields.append('deleted_by_manager')
                elif f == 'client':
                    mapped_fields.append('organisation')
                elif f == 'client_id':
                    mapped_fields.append('organisation_id')
                else:
                    mapped_fields.append(f)
            kwargs['update_fields'] = mapped_fields
        super().save(*args, **kwargs)

    def __str__(self):
        org_name = self.organisation.name if self.organisation_id else 'No Organisation'
        return f"{self.name} — {org_name}"

    class Meta:
        app_label = 'tables'
        db_table = 'tables_table'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organisation', 'is_active'], name='tbl_org_active_idx'),
            models.Index(fields=['is_active'], name='tbl_is_active_idx'),
            models.Index(fields=['created_at'], name='tbl_created_at_idx'),
            models.Index(fields=['organisation', 'deleted_by_manager', 'is_active'], name='tbl_org_del_act_idx'),
            models.Index(fields=['deleted_by_manager', 'is_active'], name='tbl_del_act_idx'),
        ]


class IDCard(models.Model):
    """
    Individual ID Card — linked directly to a Table (flat, no group level).

    Status lists on IDCard represent the workflow stages:
    pending → verified → approved → printed/downloaded → (pool if deleted) → reprint
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('verified', 'Verified'),
        ('approved', 'Approved'),
        ('printed', 'Printed'),
        ('request', 'Requested'),
        ('deleted', 'Deleted'),
        ('download', 'Downloaded'),
        ('pool', 'In Pool'),
        ('reprint', 'Reprint'),
    ]

    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='id_cards')

    field_data = models.JSONField(
        default=dict,
        help_text='Dynamic field values based on table fields.',
    )
    photo = models.ImageField(
        upload_to='id_photos/',
        blank=True,
        null=True,
        help_text='DEPRECATED: Use CardMedia model for new photos',
    )
    original_photo_name = models.CharField(
        max_length=255, blank=True, null=True, db_index=True,
        help_text='Original photo name from Excel for matching',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    modified_by = models.CharField(max_length=150, blank=True, default='')

    def __str__(self):
        field_data = self.field_data or {}
        name = field_data.get('name', field_data.get('Name', f'Card #{self.id}'))
        table_name = self.table.name if self.table_id else 'Unknown Table'
        return f"{name} — {table_name}"

    def __init__(self, *args, **kwargs):
        if 'group' in kwargs:
            kwargs.setdefault('table', kwargs.pop('group'))
        if 'group_id' in kwargs:
            kwargs.setdefault('table_id', kwargs.pop('group_id'))
        super().__init__(*args, **kwargs)

    @property
    def organisation(self):
        """Convenience: get the organisation this card belongs to."""
        if self.table:
            return self.table.organisation
        return None

    @property
    def client(self):
        """Legacy compat — returns the organisation this card belongs to."""
        return self.organisation

    @property
    def group(self):
        """Legacy compat — returns the Table itself (group level removed)."""
        return self.table

    @group.setter
    def group(self, value):
        self.table = value

    @property
    def group_id(self):
        return self.table_id

    @group_id.setter
    def group_id(self, value):
        self.table_id = value

    def delete_images(self):
        """Delete all image files associated with this card (incl. thumbnails)"""
        from mediafiles.services import ImageService
        if self.field_data:
            for field_name, value in self.field_data.items():
                if value and isinstance(value, str) and value not in ['NOT_FOUND', '']:
                    if 'adarshimg/' in value or 'id_card_images/' in value:
                        try:
                            ImageService.delete_image(value)
                        except Exception as e:
                            logger.warning("Could not delete image %s: %s", value, e)
        if self.photo:
            try:
                from django.core.files.storage import default_storage
                if default_storage.exists(self.photo.name):
                    default_storage.delete(self.photo.name)
            except Exception as e:
                logger.warning("Could not delete photo: %s", e)

    def delete(self, *args, **kwargs):
        self.delete_images()
        super().delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        if self.field_data and isinstance(self.field_data, dict):
            for key, value in self.field_data.items():
                if isinstance(value, str):
                    self.field_data[key] = sanitize_text_for_storage(value)
        super().save(*args, **kwargs)

    class Meta:
        app_label = 'tables'
        db_table = 'tables_idcard'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['table', 'status']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['table', 'created_at']),
            models.Index(fields=['created_at']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['table', 'status', '-id'], name='tbl_status_id_desc'),
            models.Index(fields=['table', 'status', '-status_changed_at', '-id'], name='tbl_st_chg_id_idx'),
            models.Index(fields=['table', 'status', '-downloaded_at', '-id'], name='tbl_st_dld_id_idx'),
            models.Index(fields=['table', 'status', '-deleted_at', '-id'], name='tbl_st_del_id_idx'),
            models.Index(fields=['downloaded_at'], name='tbl_downloaded_at_idx'),
            models.Index(fields=['deleted_at'], name='tbl_deleted_at_idx'),
            models.Index(fields=['status_changed_at'], name='tbl_status_changed_at_idx'),
        ]


class TableAccess(models.Model):
    """
    TableAccess model — relational table delegation between Organisation Tables
    and Super Managers / Guest Managers.
    Enforces that Super Managers only receive access to specific tables delegated by Prime Manager.
    """
    table = models.ForeignKey(
        Table,
        on_delete=models.CASCADE,
        related_name='manager_accesses',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='table_accesses',
    )
    can_view = models.BooleanField(default=True)
    can_edit_cards = models.BooleanField(default=True)
    can_approve_print = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tables_tableaccess'
        constraints = [
            models.UniqueConstraint(fields=['table', 'manager'], name='unique_table_manager_access')
        ]

    def __str__(self):
        return f"{self.manager.username} -> {self.table.name}"


class CollectionCampaign(models.Model):
    """
    Authoritative Campaign model for Student Data & Photograph Collection.
    Supports dual workflows:
      - Workflow A (NEW_TABLE): Campaign created before a table exists.
        Has its own stable schema (form_schema). A table is created later
        via the Table Creation Wizard from verified submissions.
      - Workflow B (EXISTING_TABLE): Campaign bound to an existing Table.
        Pulls table schema, synchronizes updates, and promotes into the live table.
    """
    class DestinationType(models.TextChoices):
        NEW_TABLE = 'NEW_TABLE', 'New Table'
        EXISTING_TABLE = 'EXISTING_TABLE', 'Existing Table'

    class CampaignState(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ACTIVE = 'ACTIVE', 'Active'
        PAUSED = 'PAUSED', 'Paused'
        CLOSED = 'CLOSED', 'Closed'
        ARCHIVED = 'ARCHIVED', 'Archived'

    class SyncPolicy(models.TextChoices):
        UPDATE_BLANK_ONLY = 'update_blank_only', 'Update Blank Only'
        REPLACE_ALL = 'replace_all', 'Replace All'
        PHOTO_ONLY = 'photo_only', 'Photo Only'
        CREATE_MISSING = 'create_missing', 'Create Missing Only'

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='collection_campaigns',
        help_text='Tenant organization owning this collection campaign.'
    )
    destination_type = models.CharField(
        max_length=20,
        choices=DestinationType.choices,
        default=DestinationType.EXISTING_TABLE,
        db_index=True,
    )
    table = models.ForeignKey(
        Table,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collection_campaigns',
        help_text='Destination table (null for pre-table campaigns until table is created).'
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    campaign_name = models.CharField(max_length=255)
    campaign_state = models.CharField(
        max_length=20,
        choices=CampaignState.choices,
        default=CampaignState.ACTIVE,
        db_index=True,
    )
    form_version = models.PositiveIntegerField(
        default=1,
        help_text='Monotonically increasing form schema version sequence.',
    )
    form_schema = models.JSONField(
        default=list,
        blank=True,
        help_text='Stable schema definition for this campaign: [{name, label, type, required, options}].',
    )
    allowed_classes = models.JSONField(
        default=list,
        blank=True,
        help_text='Permitted class/grade values (empty allows all).',
    )
    allow_parent_submission = models.BooleanField(
        default=True,
        help_text='Permit parents and guardians to submit for students.',
    )
    destination_mapping = models.JSONField(
        default=dict,
        blank=True,
        help_text='Mapping from campaign form fields to destination table fields {collection_field: table_field}.',
    )
    sync_policy = models.CharField(
        max_length=30,
        choices=SyncPolicy.choices,
        default=SyncPolicy.UPDATE_BLANK_ONLY,
        help_text='Synchronization strategy when updating existing live records.',
    )
    single_submission_only = models.BooleanField(
        default=True,
        help_text='Allow only 1 submission per verified student. Re-uploads will be blocked.',
    )
    device_lockout_enabled = models.BooleanField(
        default=True,
        help_text='Block repeat upload attempts from the same phone/device once submitted.',
    )
    instructions = models.TextField(
        blank=True,
        default='',
        help_text='Custom instructions displayed to students on the upload portal.',
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tables_collectioncampaign'
        verbose_name = 'Collection Campaign'
        verbose_name_plural = 'Collection Campaigns'
        ordering = ['-created_at']

    def __str__(self):
        return f"CollectionCampaign({self.campaign_name}, state={self.campaign_state}, token={self.token[:8]}...)"


class TablePhotoCollectionLink(models.Model):
    """Configuration and public access token for student photo self-collection."""
    table = models.OneToOneField(
        Table,
        on_delete=models.CASCADE,
        related_name='photo_collection_link',
    )
    campaign = models.ForeignKey(
        CollectionCampaign,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='legacy_links',
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    campaign_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='Human-readable campaign title (defaults to table name).',
    )
    campaign_state = models.CharField(
        max_length=20,
        default='ACTIVE',
        choices=[
            ('DRAFT', 'Draft'),
            ('ACTIVE', 'Active'),
            ('PAUSED', 'Paused'),
            ('CLOSED', 'Closed'),
            ('ARCHIVED', 'Archived'),
        ],
        db_index=True,
    )
    form_version = models.PositiveIntegerField(
        default=1,
        help_text='Monotonically increasing form schema version sequence.',
    )
    form_schema = models.JSONField(
        default=list,
        blank=True,
        help_text='Frozen snapshot of table fields used when this form was published.',
    )
    allowed_classes = models.JSONField(
        default=list,
        blank=True,
        help_text='Permitted class/grade values (empty allows all).',
    )
    allow_parent_submission = models.BooleanField(
        default=True,
        help_text='Permit parents and guardians to submit for students.',
    )
    verification_fields = models.JSONField(
        default=list,
        help_text='Table columns student must provide to verify identity (e.g. ["ROLL_NO", "NAME"]).',
    )
    media_fields = models.JSONField(
        default=list,
        help_text='Table media fields to collect (e.g. ["PHOTO", "SIGNATURE"]).',
    )
    single_submission_only = models.BooleanField(
        default=True,
        help_text='Allow only 1 submission per verified student. Re-uploads will be blocked.',
    )
    device_lockout_enabled = models.BooleanField(
        default=True,
        help_text='Block repeat upload attempts from the same phone/device once submitted.',
    )
    instructions = models.TextField(
        blank=True,
        default='',
        help_text='Custom instructions displayed to students on the upload portal.',
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tables_photocollectionlink'
        verbose_name = 'Table Photo Collection Link'
        verbose_name_plural = 'Table Photo Collection Links'

    def __str__(self):
        return f"PhotoCollectionLink({self.table.name}, token={self.token[:8]}...)"


class DataCollectionRecord(models.Model):
    """
    Standalone ingestion record for Student Data & Photo Collection.
    Flow lifecycle:
      - COLLECTION: Raw received submission.
      - CHECKED: Auto-verified / validated; ready for promotion to table's PENDING list.
      - CANCELED: Flagged, duplicate, or suspicious submission (never permanently deleted).
    """
    class Status(models.TextChoices):
        COLLECTION = 'collection', 'Collection'
        CHECKED = 'checked', 'Checked'
        CANCELED = 'canceled', 'Canceled'

    campaign = models.ForeignKey(
        CollectionCampaign,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='records',
        help_text='Campaign under which this record was submitted.',
    )
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='data_collection_records',
        help_text='Tenant organization owning this record.',
    )
    table = models.ForeignKey(
        Table,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='data_collection_records',
        help_text='Destination table (null for pre-table campaigns until table is created).',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.COLLECTION,
        db_index=True,
    )
    form_version = models.PositiveIntegerField(
        default=1,
        help_text='Schema version snapshot under which this record was submitted.',
    )
    field_data = models.JSONField(
        default=dict,
        help_text='Submitted demographic and academic fields.',
    )
    photo_file = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        help_text='Relative media path to uploaded student photo.',
    )
    submitter_role = models.CharField(
        max_length=30,
        default='student',
        blank=True,
        help_text='Role of the person submitting: student, father, mother, guardian, staff, other.',
    )
    submitter_name = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Full name of the submitter (if not student).',
    )
    submitter_phone = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text='Contact phone of the submitter (if not student).',
    )
    idempotency_key = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        db_index=True,
        help_text='Client-supplied UUID preventing duplicate submissions on network retries.',
    )
    match_status = models.CharField(
        max_length=20,
        default='NO_MATCH',
        choices=[
            ('NO_MATCH', 'No Match'),
            ('POSSIBLE_MATCH', 'Possible Match'),
            ('DEFINITE_MATCH', 'Definite Match'),
        ],
        db_index=True,
        help_text='Identity resolution confidence level.',
    )
    match_details = models.JSONField(
        default=dict,
        blank=True,
        help_text='Structured candidate match score, reasons, and colliding IDs.',
    )
    flag_code = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        help_text='Machine-readable cancellation or suspicion code.',
    )
    flag_reason = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Reason for being flagged or marked as canceled.',
    )
    correction_token = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        unique=True,
        db_index=True,
        help_text='Secure token permitting self-service correction by student/parent.',
    )
    correction_requested_fields = models.JSONField(
        default=list,
        blank=True,
        help_text='Fields designated by reviewer as requiring correction.',
    )
    device_id = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        help_text='Device fingerprint used during submission.',
    )
    submission_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
    )
    submitted_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )
    updated_at = models.DateTimeField(
        auto_now=True,
    )
    promoted_card = models.ForeignKey(
        'tables.IDCard',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='source_collection_records',
        help_text='Reference to IDCard created when promoted to Pending.',
    )
    promoted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        db_table = 'tables_datacollectionrecord'
        verbose_name = 'Data Collection Record'
        verbose_name_plural = 'Data Collection Records'
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(
                fields=['table', 'idempotency_key'],
                condition=models.Q(table__isnull=False, idempotency_key__isnull=False),
                name='unique_table_idempotency_key',
            ),
            models.UniqueConstraint(
                fields=['campaign', 'idempotency_key'],
                condition=models.Q(campaign__isnull=False, idempotency_key__isnull=False),
                name='unique_campaign_idempotency_key',
            ),
        ]
        indexes = [
            models.Index(fields=['table', 'status']),
            models.Index(fields=['table', '-submitted_at']),
            models.Index(fields=['table', 'idempotency_key']),
            models.Index(fields=['table', 'match_status']),
        ]

    def __str__(self):
        tbl_name = self.table.name if self.table else (self.campaign.campaign_name if self.campaign else 'Standalone')
        return f"DataCollectionRecord({tbl_name}, id={self.id}, status={self.status})"


class DataCollectionEvent(models.Model):
    """
    Immutable audit event log for Data Collection submissions.
    Enforces the Zero-Deletion and full regulatory traceability mandate.
    """
    campaign = models.ForeignKey(
        CollectionCampaign,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='audit_events',
        help_text='Campaign associated with this audit event.',
    )
    record = models.ForeignKey(
        DataCollectionRecord,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='events',
        help_text='Record associated with this audit event (null for campaign-level events).',
    )
    event_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text='Event type: SUBMITTED, AUTO_CHECKED, STATUS_CHANGED, CORRECTION_REQUESTED, CORRECTION_SUBMITTED, PROMOTION_ATTEMPTED, PROMOTED, RESTORED.',
    )
    actor = models.CharField(
        max_length=150,
        default='system',
        help_text='Username of staff member or "public_submitter".',
    )
    notes = models.TextField(
        blank=True,
        default='',
        help_text='Human explanation or error diagnostic.',
    )
    payload = models.JSONField(
        default=dict,
        blank=True,
        help_text='Contextual payload diff or snapshot.',
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )

    class Meta:
        db_table = 'tables_datacollectionevent'
        verbose_name = 'Data Collection Event'
        verbose_name_plural = 'Data Collection Events'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['record', '-created_at']),
            models.Index(fields=['event_type', '-created_at']),
        ]

    def __str__(self):
        return f"DataCollectionEvent({self.record_id}, {self.event_type}, {self.created_at.isoformat()})"


class TableFreeze(models.Model):
    """
    TableFreeze — allows operators and superadmins to freeze a table status (e.g. approved or download)
    to a specific time window so cards moved after the freeze_to timestamp are hidden
    during batch processing for all operators and superadmins.
    """
    table = models.ForeignKey(
        Table,
        on_delete=models.CASCADE,
        related_name='freezes',
    )
    status = models.CharField(max_length=20, db_index=True)
    is_frozen = models.BooleanField(default=True, db_index=True)
    frozen_from = models.DateTimeField(null=True, blank=True)
    frozen_to = models.DateTimeField(null=True, blank=True)
    frozen_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='table_freezes',
    )
    frozen_by_name = models.CharField(max_length=150, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tables_tablefreeze'
        verbose_name = 'Table Freeze'
        verbose_name_plural = 'Table Freezes'
        constraints = [
            models.UniqueConstraint(fields=['table', 'status'], name='unique_table_status_freeze')
        ]

    def __str__(self):
        return f"TableFreeze({self.table.name}, status={self.status}, frozen={self.is_frozen})"




# ── Cache invalidation signals ──────────────────────────────────────────
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver


@receiver(post_save, sender=IDCard)
@receiver(post_delete, sender=IDCard)
def clear_idcard_distinct_values_cache(sender, instance, **kwargs):
    """Clear distinct values cache when card data changes."""
    table_id = getattr(instance, 'table_id', None)
    if table_id:
        try:
            from tables.views.helpers import (
                invalidate_table_distinct_cache,
                invalidate_class_variant_cache,
                invalidate_filter_options_cache,
            )
            invalidate_table_distinct_cache(table_id)
            invalidate_class_variant_cache(table_id)
            invalidate_filter_options_cache(table_id)
        except Exception:
            pass


# ── Legacy compatibility aliases ────────────────────────────────────────
# Old code importing IDCardTable / IDCardGroup will use Table instead
IDCardTable = Table
IDCardGroup = Table
