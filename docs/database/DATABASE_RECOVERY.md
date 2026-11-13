# Pro-Panel Database Backup, Recovery & Production Cutover Guide (`DATABASE_RECOVERY.md`)

> [!CAUTION]
> Never execute destructive database operations (`DROP DATABASE`, `pg_restore --clean`, or schema cutover) on a production or shared PostgreSQL cluster without first creating and verifying a custom-format backup (`pg_dump -Fc`) and obtaining explicit human approval.

---

## 1. Pre-Rebuild Backup Archive Summary (Phase C Record)

Before rebuilding the Pro-Panel migration system, a complete, verified backup of the local database and all 182 historical migration files was created outside the Git repository:

- **Backup Directory**: `E:\E\propanel_backups\`
- **PostgreSQL Custom Dump**: `E:\E\propanel_backups\propanel_pre_rebuild_20261113_174621.dump`
  - **Size**: `335,292 bytes`
  - **SHA-256**: `f260c6ffd7141486425d185a2a9fa398c8ac28e8cfb77e764f6445a076d26340`
  - **Verified Catalog Objects (`pg_restore --list`)**: `766`
  - **Live Restore Verification**: Restored into temporary database `test_restore_verify_20261113_174621`, verified 100% table and row-count parity across all 56 tables, and dropped the temporary verification DB.
- **Historical Migrations Archive**: `E:\E\propanel_backups\migrations_archive_20261113_174621\` (182 files preserved).
- **Backup Manifests**:
  - `E:\E\propanel_backups\backup_manifest_20261113_174621.json`
  - `E:\E\propanel_backups\BACKUP_MANIFEST_20261113_174621.md`

---

## 2. Creating a Verified Database Backup

Use `backend/scripts/database_backup.sh` to create a custom-format PostgreSQL dump (`.dump`), verify its Table of Contents (`pg_restore --list`), compute its SHA-256 checksum, and write a JSON manifest:

```bash
POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
POSTGRES_DB=propanel_db \
POSTGRES_USER=postgres \
BACKUP_DIR=/var/backups/propanel \
bash backend/scripts/database_backup.sh
```

---

## 3. Restoring a Database Backup

Use `backend/scripts/database_restore.sh` with the required `--confirm` safety flag:

```bash
POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
POSTGRES_DB=propanel_db \
POSTGRES_USER=postgres \
bash backend/scripts/database_restore.sh /var/backups/propanel/propanel_propanel_db_<timestamp>.dump --confirm
```

---

## 4. Production Cutover Plan (Phase G — Requires Explicit Human Approval)

When deploying the rebuilt schema and clean initial migrations to the production VPS:

### Option A: Clean Cutover (When Production Database Has Zero Critical Tenant Data or Is Being Initialized Fresh)
1. **Maintenance Window**: Enable maintenance mode or stop Gunicorn/Celery workers.
2. **Mandatory Pre-Cutover Backup**:
   ```bash
   POSTGRES_DB=propanel_db POSTGRES_USER=postgres bash backend/scripts/database_backup.sh
   ```
3. **Create Fresh Database & Apply Clean Initial Migrations**:
   ```bash
   psql -U postgres -d postgres -c "CREATE DATABASE propanel_db_v2 OWNER propanel_user;"
   DATABASE_URL="postgres://propanel_user:<password>@localhost:5432/propanel_db_v2" python backend/manage.py migrate --noinput
   ```
4. **Run Schema, Migration & Health Verification**:
   ```bash
   DATABASE_URL="postgres://propanel_user:<password>@localhost:5432/propanel_db_v2" python backend/scripts/verify_database_schema.py
   DATABASE_URL="postgres://propanel_user:<password>@localhost:5432/propanel_db_v2" python backend/scripts/verify_migrations.py
   DATABASE_URL="postgres://propanel_user:<password>@localhost:5432/propanel_db_v2" python backend/scripts/database_health_check.py
   ```
5. **Atomic Database Swap / DSN Switch**:
   - Point `.env` `POSTGRES_DB=propanel_db_v2` (or rename databases after disconnecting clients), keeping the old database intact for instant rollback.
6. **Restart Application Services & Smoke Test**.

### Option B: Data-Preserving Cutover (Migrating Existing Rows from Legacy Table/Column Names into the Clean Schema)
If existing rows in `core_client`, `core_idcardtable`, `core_idcard`, `core_reprintrequest`, `operations_log`, etc. must be carried over into the newly created `propanel_db_v2`:
1. Perform Steps 1–4 of Option A so `propanel_db_v2` has the verified, clean schema built by `manage.py migrate`.
2. Copy data from the legacy database into `propanel_db_v2` mapping renamed tables/columns explicitly:
   - `core_client` -> `organisation_organisation` (`client_type` -> `org_type`, `perm_idcard_client_list` -> `perm_organisation_list`)
   - `organisation_manager` -> `organisation_manager` (`client_id` -> `organisation_id`)
   - `assistants_assistant` -> `assistants_assistant` (`client_id` -> `organisation_id`, `perm_idcard_client_list` -> `perm_organisation_list`, `perm_manage_client_staff` -> `perm_manage_assistants`)
   - `core_idcardtable` -> `tables_table` (`COALESCE(organisation_id, client_id)` -> `organisation_id`, `deleted_by_client` -> `deleted_by_manager`)
   - `core_idcard` -> `tables_idcard`
   - `core_reprintrequest` -> `reprint_reprintrequest`
   - `operations_log` -> `operations_operation`, `operations_change` -> `operations_operationchange`, `operations_bulk_transaction` -> `operations_bulktransaction`, `operations_audit_event` -> `operations_auditevent`
3. Synchronize all PostgreSQL sequences (`setval(pg_get_serial_sequence(...), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL)`).
4. Run `python backend/scripts/database_health_check.py` (which verifies 0 orphan rows, all FKs validated, and all sequences synchronized).

---

## 5. Rollback Procedure

If any issue occurs during or after cutover:
1. Point `DATABASE_URL` / `POSTGRES_DB` in `.env` back to the pre-cutover database (or restore the `.dump` file via `backend/scripts/database_restore.sh <dump_file> --confirm`).
2. Check out the pre-cutover Git commit (or restore archived migrations from `migrations_archive_<timestamp>`).
3. Restart Gunicorn/Celery services and verify health via `python backend/manage.py check`.

