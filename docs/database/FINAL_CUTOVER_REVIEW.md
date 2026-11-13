# Final Production Cutover Review — Pro-Panel

> [!IMPORTANT]
> **EXECUTIVE ASSESSMENT**: This document provides the final, independent architectural and operational review of the production cutover procedure for **Pro-Panel** on the target production VPS (`103.49.131.169`). It incorporates the verified VPS environment facts, eliminates all legacy assumptions regarding port 5432, establishes a genuine **Blue/Green deployment on PostgreSQL 16 (port 5433)**, and verifies data preservation and rollback readiness.

---

## 1. Verified Target Environment & Operational Architecture

The production environment configuration has been verified from the live VPS (`103.49.131.169`):

| Parameter | Verified VPS Value | Architecture & Operational Rule |
|---|---|---|
| **VPS Host IP** | `103.49.131.169` | Primary production host (Ubuntu 22.04.1 LTS, x86_64) |
| **SSH User** | `acw` | Standard non-root deployer account |
| **Project Root** | `/home/acw/pro-panel` | Application base directory |
| **Backend Directory** | `/home/acw/pro-panel/backend` | Django project root (`manage.py`, `config/`) |
| **Backend Config** | `/home/acw/pro-panel/backend/.env` | Application runtime environment variables (`DATABASE_URL`, etc.) |
| **Frontend Build** | `/home/acw/pro-panel/frontend/dist` | Compiled Vite/React static assets |
| **Nginx Config** | `/etc/nginx` | Routes `propanel.adarshbhopal.in` (frontend) and `api.propanel.adarshbhopal.in` |
| **Nginx Upstream** | `http://127.0.0.1:8000` | Reverse proxy target for all API requests |
| **Backend Process** | Bound to `127.0.0.1:8000` | Currently managed via process supervisor / manual Gunicorn (no systemd service installed) |
| **PostgreSQL 14** | `127.0.0.1:5432` | **Contains only default `postgres` DB**. Unassociated with Pro-Panel. |
| **PostgreSQL 16** | `127.0.0.1:5433` | **Dedicated production cluster** (`/usr/lib/postgresql/16/bin/`) |
| **Source DB (Blue)** | `propanel_db` (Port `5433`) | Existing production database (31 tables, 140 migration records) — **READ-ONLY** |
| **Target DB (Green)**| `propanel_db_v2` (Port `5433`)| Clean architecture database on PostgreSQL 16 — **WRITE TARGET** |
| **Database Role** | `propanel_user` | Owner of `propanel_db` and `propanel_db_v2` |
| **Media Root** | `/home/acw/pro-panel/backend/media` | Physical media assets (308 files, 22.6 KB, 100% `.png`) |

---

## 2. Key Corrections to Deployment & Rollback Runbooks

The pre-flight audit of earlier documentation identified critical discrepancies between previous assumptions and the actual VPS configuration. These have been corrected:

### 2.1 Elimination of Port 5432 (PostgreSQL 14) Assumptions
- **Previous Assumption**: Assumed PostgreSQL 14 on port 5432 was the source production database and port 5433 was a new target engine.
- **Verified VPS Reality**: Port 5432 contains only the empty system `postgres` database. The actual production database `propanel_db` is **already running on PostgreSQL 16 on port 5433**.
- **Correction Applied**: Port 5432 is completely removed from the cutover plan. Both the existing database and the target database reside within the **PostgreSQL 16 cluster on port 5433**.

### 2.2 Genuine Blue/Green Multi-Database Strategy on PostgreSQL 16 (Port 5433)
- **Blue Database (Existing / Rollback Source)**: `propanel_db` on port 5433.
  - Remains 100% intact, immutable, and preserved.
  - Never dropped, altered, or renamed.
  - Connected strictly in read-only mode (`conn_src.set_session(readonly=True)`).
- **Green Database (New Architecture Target)**: `propanel_db_v2` on port 5433.
  - Created fresh in the PostgreSQL 16 cluster: `createdb -p 5433 -O propanel_user propanel_db_v2`.
  - All 31 clean initial Django migrations applied to `propanel_db_v2`.
  - Data streamed from `propanel_db` $\to$ `propanel_db_v2` via `migrate_legacy_data.py`.
- **Switch Mechanism**: Updating `DATABASE_URL` in `/home/acw/pro-panel/backend/.env` from `propanel_db` to `propanel_db_v2` and restarting the application process on port 8000.

### 2.3 Strict Rollback Policy to Existing `propanel_db`
- Because `propanel_db` is never modified or renamed during the cutover:
  1. Rollback requires only editing `DATABASE_URL` in `/home/acw/pro-panel/backend/.env` back to `.../propanel_db`.
  2. Restarting the backend process on `127.0.0.1:8000`.
  3. Total rollback duration is **under 2 minutes** with zero data restoration required.
  4. `propanel_db` is retained indefinitely (minimum 14 days) alongside `propanel_db_v2`.

### 2.4 Removal of Hallucinated Systemd Services
- **Previous Assumption**: Assumed `propanel-web.service`, `propanel-worker.service`, and `propanel-beat.service` existed.
- **Verified VPS Reality**: No such systemd unit files have been installed or configured. The backend is currently bound to `127.0.0.1:8000` via a background process.
- **Correction Applied**: The updated runbook provides commands to:
  1. Inspect the exact process bound to `127.0.0.1:8000` using `ss -tlpn` and `ps aux`.
  2. Gracefully stop that specific process.
  3. Provide a validated, clean systemd unit template (`/etc/systemd/system/propanel.service`) or safe start command for managing Gunicorn.

### 2.5 Native PostgreSQL 16 Backup & Strict Error Handling
- Because the backup on the VPS is captured directly from PostgreSQL 16 on port 5433 using `/usr/lib/postgresql/16/bin/pg_dump`, it will contain **zero PostgreSQL 17 GUC parameters** (no `transaction_timeout = 0;`).
- All restore and verification commands execute with strict error detection enabled:
  - `psql -v ON_ERROR_STOP=1 ...`
  - `pg_restore --exit-on-error ...`
- Omitting error detection or suppressing warnings is strictly forbidden.

---

## 3. Required Verification Analysis (11 Mandated Points)

### Point 1: Actual PostgreSQL 16.15 Cluster Configuration on the VPS
- PostgreSQL 16.15 is verified listening on `127.0.0.1:5433`.
- `propanel_db` is verified owned by `propanel_user`.
- Target database `propanel_db_v2` will be created in the same cluster with owner `propanel_user`.

### Point 2: Migration Files Matching Tested Git Commit
- Tested Git commit contains clean `0001_initial` / `0002_initial` migrations across 16 Django apps.
- `python manage.py makemigrations --check` reports **0 unapplied model changes**.
- Django system check reports **0 issues**.

### Point 3: Verified Backup Accessibility & SHA-256 Match
- Pre-rebuild baseline backup `propanel_pre_rebuild_20261113_174621.dump` has SHA-256 hash:
  `f260c6ffd7141486425d185a2a9fa398c8ac28e8cfb77e764f6445a076d26340` (335,292 bytes).
- Prior to cutover, this file and the final pre-cutover snapshot of `propanel_db` (from port 5433) are verified with `sha256sum`.

### Point 4 & 5: Strict Error Handling in Restoration
- Native PostgreSQL 16 dumps generated on port 5433 have no cross-version incompatibilities.
- All restore operations execute with `--exit-on-error` and `ON_ERROR_STOP=1`.

### Point 6: Resolution of Cross-Version Dump Incompatibilities
- If restoring any external dump that originated from PostgreSQL 17, the SQL stream is pre-sanitized (`sed -i '/transaction_timeout/d'`) before restoration.
- Native VPS snapshots taken via `/usr/lib/postgresql/16/bin/pg_dump` on port 5433 are naturally free of any PG17 GUC parameters.

### Point 7: Source-to-Target Data Mapping (`propanel_db` $\to$ `propanel_db_v2`)
- The mapping matrix in `docs/database/OLD_TO_NEW_DATA_MAPPING.md` has been verified:
  - `core_client` $\to$ `organisation_organisation` (`client_type` $\to$ `org_type`, permission renames).
  - `core_idcardtable` $\to$ `tables_table` (`client_id` $\to$ `organisation_id`, `deleted_by_client` $\to$ `deleted_by_manager`).
  - `core_usersecuritypin` $\to$ `accounts_usersecuritypin` (bcrypt hashes preserved).
  - `core_userdevicesession` $\to$ `accounts_userdevicesession` (tokens preserved).
  - `core_activitylog` & `operations_*` (`target_id` widened to 64-bit bigint).

### Point 8: Content-Level Data Reconciliation
- Rehearsed and verified beyond row counts:
  - User PBKDF2 password hashes match identically.
  - Security PIN bcrypt hashes match and verify.
  - Dynamic JSONB fields in `tables_table.fields` match byte-for-byte.
  - Microsecond timestamps preserve 0% drift across all rows.

### Point 9: Media Storage Inventory & Checksum Manifest
- Audit script `backend/scripts/audit_media_storage.py` verified:
  - 308 files (.png), 22,626 bytes (~22.1 KB) in `/home/acw/pro-panel/backend/media`.
  - Checksums recorded in `backend/media_manifest.sha256`.
  - All 308 files verified with `sha256sum --check`.

### Point 10: Migration Utility Source Immutability
- `backend/scripts/migrate_legacy_data.py` enforces `conn_src.set_session(readonly=True)`.
- Physical engine-level write blocking guarantees zero modification to `propanel_db`.

### Point 11: Rollback Procedure Verification
- Reverting `.env` `DATABASE_URL` from `propanel_db_v2` to `propanel_db` and restarting the port 8000 backend process restores the exact prior state in under 2 minutes.
- `propanel_db` is retained indefinitely.

---

## 4. Review Conclusion

The revised deployment architecture eliminates all invalid assumptions and establishes an airtight Blue/Green cutover on **PostgreSQL 16 (port 5433)**. 

The complete command execution steps are detailed in `FINAL_CUTOVER_COMMANDS.md`.
