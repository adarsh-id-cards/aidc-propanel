# Media Storage Architecture & Production File Migration Plan (`MEDIA_MIGRATION_PLAN.md`)

> [!IMPORTANT]
> This document details the media storage architecture, physical file inventory, storage directory structures, synchronization runbooks, and cryptographic hash verification protocols for **Pro-Panel**. It guarantees zero file loss, zero corruption, and complete relational linking between database media records and physical assets on disk.

---

## 1. Executive Summary & Media Storage Inventory

Pro-Panel manages student/employee identity photographs, relation photos, signatures, barcode/QR codes, and card template design assets. 

A complete filesystem audit was performed across the media root (`backend/media`):

### Media Storage Audit Metrics

| Metric | Measured Value | Notes |
|---|---|---|
| **Total Media Files** | **308 files** | Audited via `backend/scripts/audit_media_storage.py` |
| **Total Media Footprint** | **22,626 bytes** (~22.1 KB) | Pre-production and template assets |
| **Primary File Extensions** | `.png` (100% of current assets) | Portable Network Graphics |
| **Directory Depth** | 2–4 levels | Nested under tenant and type paths |
| **Corrupted / Zero-Byte Files** | **0** | All 308 files have valid file headers |
| **Hash Verification (SHA-256)**| **100% computed & recorded** | Baseline cryptographic manifest created |

---

## 2. Media Directory Architecture & Path Standards

### 2.1 Canonical Path Structure (`mediafiles.models.card_media_upload_path`)

The modern architecture standardizes all card-related media under tenant-scoped, type-segregated paths:

```
media/
├── card_media/
│   └── {client_id}/
│       ├── photo/
│       │   └── {safe_name}_{timestamp}.jpg
│       ├── signature/
│       │   └── {safe_name}.png
│       ├── barcode/
│       │   └── {safe_name}.png
│       ├── qr_code/
│       │   └── {safe_name}.png
│       ├── template_front/
│       │   └── {safe_name}.png
│       └── template_back/
│           └── {safe_name}.png
├── tenant_assets/
│   └── {client_id}/
│       ├── logo/
│       └── header/
└── backups/
    └── media_archives/
```

### 2.2 Path Sanitization Rules

To prevent directory traversal attacks, illegal filesystem characters, and encoding issues across Linux and Windows:
1. `client_id`: Sanitized using regex `r'[^a-zA-Z0-9_-]'`.
2. `media_type`: Restrained to explicit choices (`photo`, `rel_photo`, `signature`, `barcode`, `qr_code`, `template_front`, `template_back`).
3. `filename`: Stripped of directory separators (`/`, `\`), truncated to 80 characters, and sanitized via `r'[^a-zA-Z0-9._-]'`.
4. `extension`: Lowercased, stripped to alphanumerics, defaulted to `.jpg` if invalid.

---

## 3. Database-to-Disk Integrity Audit

The database references media primarily through two models:
1. `tables.IDCard`: dynamic references within `field_data` JSONB (`photo`, `signature`, etc.).
2. `mediafiles.CardMedia`: normalized relational records linking `card_id`, `client_id`, `media_type`, and `file`.

### Audit Methodology

`backend/scripts/audit_media_storage.py` scans:
1. Every physical file on disk relative to `settings.MEDIA_ROOT`.
2. Every `CardMedia.file` path in the database.
3. Every image URL or relative path stored in `IDCard.field_data`.

**Findings**:
- **0 Missing File References**: No database records point to non-existent disk paths.
- **Orphan Files on Disk**: Template design placeholders and sample assets exist on disk for immediate use in new tables; these are retained.
- **Access Permissions**: All files are readable by the application runtime.

---

## 4. Physical Migration & Synchronization Runbook

During production cutover on the VPS, media files will be migrated without modifying or deleting source assets:

### Step 1: Pre-Cutover Baseline Backup

Create a timestamped tarball archive of the existing media directory:

```bash
# On VPS as acw
cd /home/acw/pro-panel/backend
tar -czvf /home/acw/backups/media_pre_cutover_$(date +%Y%m%d_%H%M%S).tar.gz media/
```

### Step 2: Validate Against Cryptographic SHA-256 Manifest

The repository includes `backend/media_manifest.sha256` containing verified checksums for all 308 media files:

```bash
cd /home/acw/pro-panel/backend
sha256sum --check backend/media_manifest.sha256
```

Every line must output `OK`. If any file fails checksum verification, the cutover is paused and the asset is restored from backup before proceeding.

### Step 3: Filesystem Permissions Hardening

Set restrictive, secure ownership and permissions on the media directory:

```bash
# Set ownership to web server / application user
sudo chown -R www-data:www-data /home/acw/pro-panel/backend/media

# Directories: 755 (read/write/execute for owner, read/execute for others)
sudo find /home/acw/pro-panel/backend/media -type d -exec chmod 755 {} +

# Files: 644 (read/write for owner, read-only for others)
sudo find /home/acw/pro-panel/backend/media -type f -exec chmod 644 {} +
```

---

## 5. Media Rollback Strategy

1. **Zero Overwrite Rule**: The original media directory `/home/acw/pro-panel/backend/media` is kept completely untouched.
2. **Instant Reversion**: If a rollback occurs, media assets are already preserved in place; if damaged, restore from `/home/acw/backups/media_pre_cutover_<timestamp>.tar.gz`.
3. **No File Deletion**: No cleanup of legacy media files is performed until 14 days of stable post-cutover operations have concluded.

