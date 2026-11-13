# Final Production Cutover Commands — Pro-Panel

> [!CAUTION]
> **HUMAN AUTHORIZATION REQUIRED**: Do NOT execute these commands against the live production environment without explicit human authorization. Every command is classified by machine, target database, operational risk (Read-Only vs Destructive), expected output, and failure handling procedure.

---

## Command Execution Taxonomy

| Dimension | Classifications |
|---|---|
| **Executing Machine** | `Production VPS (103.49.131.169)` |
| **Executing User** | `acw` (Application deployer) or `postgres` (DB Admin) or `root` (Systemd/Nginx) |
| **Affected Database** | `None` / `Source DB (port 5432)` / `Target DB (port 5433)` / `Filesystem` |
| **Nature** | `Read-Only` (Zero data risk) or `State-Change` (Service/config) or `Destructive` (Target drop/write) |
| **Failure Policy** | Immediate halt / Abort / Rollback trigger |

---

## Explicit Checkpoint Gates

```
  [START]
     │
     ▼
[CHECKPOINT 1] Pre-Flight Health, Backup Integrity & VPS Verification ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 2] Stop Application Services & Maintenance Splash         ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 3] Capture Final Pre-Cutover Backups & Checksums          ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 4] Recreate Clean Target Database on Port 5433            ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 5] Apply Clean 0001_initial Migrations                    ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 6] Execute High-Throughput Data Migration (ETL)           ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 7] Synchronize & Verify Media Assets (SHA-256)            ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 8] Point Configuration to Port 5433 & Restart Services    ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 9] Smoke Testing & Production Traffic Restoration         ──> [HUMAN APPROVAL]
     │
     ▼
   [DONE]
```

---

## Phase 0: Pre-Flight Audit & Environment Verification (Read-Only)

### Command 0.1: Verify VPS Host Identity & Kernel
- **Purpose**: Verify the operator is connected to the correct production server.
- **Machine**: Production VPS (`103.49.131.169`) as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  hostname -I && uname -a && whoami
  ```
- **Expected Output**:
  ```
  103.49.131.169 ... Linux ... x86_64 ... acw
  ```
- **Failure Handling**: If IP does NOT match `103.49.131.169`, disconnect immediately.

---

### Command 0.2: Verify PostgreSQL 16.15 Cluster Status on Port 5433
- **Purpose**: Ensure PostgreSQL 16.15 is running and listening on port 5433.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  ss -tlpn | grep 5433
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -c "SELECT version();"
  ```
- **Expected Output**:
  ```
  LISTEN ... 127.0.0.1:5433 ...
  PostgreSQL 16.15 (Ubuntu 16.15-...) ...
  ```
- **Failure Handling**: If port 5433 is not listening, start cluster: `sudo systemctl start postgresql@16-main`. If version is not 16.x, abort.

---

### Command 0.3: Verify Git Commit on VPS Repository
- **Purpose**: Confirm `/home/acw/pro-panel` is checked out to the tested architecture commit.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel
  git status --porcelain
  git log -1 --format="Commit: %H | Date: %cd | Subject: %s"
  ```
- **Expected Output**: Zero modified/untracked files; commit hash matches the approved Phase G Git commit.
- **Failure Handling**: If git status is dirty, run `git stash` or investigate before proceeding. Do NOT run cutover on mismatched code.

---

### Command 0.4: Verify Baseline Backup File & SHA-256 Checksum
- **Purpose**: Confirm verified pre-rebuild backup is present on VPS with identical SHA-256 checksum.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (Filesystem).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  mkdir -p /home/acw/backups
  ls -la /home/acw/backups/propanel_pre_rebuild_20261113_174621.dump
  sha256sum /home/acw/backups/propanel_pre_rebuild_20261113_174621.dump
  ```
- **Expected Output**:
  ```
  f260c6ffd7141486425d185a2a9fa398c8ac28e8cfb77e764f6445a076d26340  /home/acw/backups/propanel_pre_rebuild_20261113_174621.dump
  ```
- **Failure Handling**: If hash does not match, re-copy the backup from staging/source machine. Do NOT proceed with corrupted dump.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 1 GATE: PRE-FLIGHT AUDIT COMPLETE
> Verify commands 0.1 through 0.4 succeeded. **Obtain explicit human approval before proceeding to stop services.**

---

## Phase 1: Service Shutdown & Maintenance Splash

### Command 1.1: Enable Nginx Maintenance Splash Page
- **Purpose**: Gracefully inform users that planned maintenance is in progress and reject new write traffic.
- **Machine**: Production VPS as user `root` (or with `sudo`).
- **Affected DB**: None (Web traffic).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Output**:
  ```
  nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
  nginx: configuration file /etc/nginx/nginx.conf test is successful
  ```
- **Failure Handling**: If `nginx -t` fails, revert symlink to production and abort.

---

### Command 1.2: Stop Application Web, Worker, and Beat Daemons
- **Purpose**: Prevent any background job or in-flight HTTP request from mutating source database data.
- **Machine**: Production VPS as user `root` (or `sudo`).
- **Affected DB**: None.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo systemctl stop propanel-web propanel-worker propanel-beat
  sudo systemctl is-active propanel-web propanel-worker propanel-beat || true
  ```
- **Expected Output**:
  ```
  inactive
  inactive
  inactive
  ```
- **Failure Handling**: If any service remains `active`, force terminate: `sudo systemctl kill -s SIGKILL propanel-web` etc.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 2 GATE: SERVICES STOPPED & MAINTENANCE ACTIVE
> Confirm no application processes are running. **Obtain explicit human approval before capturing final backups.**

---

## Phase 2: Final Production Snapshot & Dump Sanitization

### Command 2.1: Capture Final Production PostgreSQL Backup from Port 5432
- **Purpose**: Create a clean, immutable snapshot of the production database at the exact moment of maintenance initiation.
- **Machine**: Production VPS as user `postgres`.
- **Affected DB**: Source DB (`propanel_db` on port 5432).
- **Nature**: `Read-Only` on source DB.
- **Command**:
  ```bash
  CUTOVER_TIME=$(date +%Y%m%d_%H%M%S)
  sudo mkdir -p /home/acw/backups/cutover_${CUTOVER_TIME}
  sudo chown -R postgres:postgres /home/acw/backups/cutover_${CUTOVER_TIME}

  # Capture using PostgreSQL 16 client binary to prevent PG17 GUC incompatibility
  sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
      -h 127.0.0.1 -p 5432 -U postgres -F c -b -v \
      -f "/home/acw/backups/cutover_${CUTOVER_TIME}/propanel_source_final_${CUTOVER_TIME}.dump" \
      propanel_db
  ```
- **Expected Output**: Complete verbose TOC dump finishing with exit code `0`.
- **Failure Handling**: If dump fails, services are still safe. Restart services or investigate disk space (`df -h`).

---

### Command 2.2: Capture Plain SQL Backup & Compute Checksum
- **Purpose**: Ensure emergency plain-text SQL fallback exists and record SHA-256 hash.
- **Machine**: Production VPS as user `postgres`.
- **Affected DB**: Source DB (port 5432).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
      -h 127.0.0.1 -p 5432 -U postgres -F p \
      -f "/home/acw/backups/cutover_${CUTOVER_TIME}/propanel_source_final_${CUTOVER_TIME}.sql" \
      propanel_db

  cd "/home/acw/backups/cutover_${CUTOVER_TIME}"
  sha256sum propanel_source_final_${CUTOVER_TIME}.dump propanel_source_final_${CUTOVER_TIME}.sql > SHA256SUMS
  cat SHA256SUMS
  ```
- **Expected Output**: SHA-256 hashes printed; files verified.
- **Failure Handling**: If SHA256 generation fails, re-verify permissions and disk space.

---

### Command 2.3: Sanitize Any PostgreSQL 17 GUC Parameters in Pre-Rebuild Backup
- **Purpose**: Remove `SET transaction_timeout = 0;` so strict error detection (`--exit-on-error`, `ON_ERROR_STOP=1`) can run without warnings or failures.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (SQL file transformation).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  cd /home/acw/backups
  # Extract SQL text from archive
  /usr/lib/postgresql/16/bin/pg_restore -f raw_pre_rebuild.sql propanel_pre_rebuild_20261113_174621.dump

  # Sanitize PG17 specific parameter
  sed -i '/transaction_timeout/d' raw_pre_rebuild.sql

  # Verify no transaction_timeout parameter remains
  grep -i "transaction_timeout" raw_pre_rebuild.sql || echo "SANITIZED: 0 occurrences found."
  ```
- **Expected Output**:
  ```
  SANITIZED: 0 occurrences found.
  ```
- **Failure Handling**: If `raw_pre_rebuild.sql` still contains `transaction_timeout`, manually inspect line and remove.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 3 GATE: BACKUPS VERIFIED & DUMPS SANITIZED
> Confirm final backups exist and checksums match. **Obtain explicit human approval before recreating target database.**

---

## Phase 3: Target Database Provisioning on PostgreSQL 16 (Port 5433)

### Command 3.1: Recreate Clean `propanel_db` on Port 5433
- **Purpose**: Guarantee an empty, clean database on PostgreSQL 16 for fresh migration application.
- **Machine**: Production VPS as user `postgres`.
- **Affected DB**: Target DB (`propanel_db` on port 5433).
- **Nature**: `Destructive` on target DB (Port 5433 only; port 5432 is untouched).
- **Command**:
  ```bash
  # Terminate any stray connections to port 5433 propanel_db
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE datname = 'propanel_db' AND pid <> pg_backend_pid();"

  # Drop and recreate clean target database
  sudo -u postgres /usr/lib/postgresql/16/bin/dropdb -p 5433 --if-exists propanel_db
  sudo -u postgres /usr/lib/postgresql/16/bin/createdb -p 5433 -O propanel_user -E UTF8 --locale=C propanel_db
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db -c "GRANT ALL PRIVILEGES ON DATABASE propanel_db TO propanel_user;"
  ```
- **Expected Output**:
  ```
  DROP DATABASE
  CREATE DATABASE
  GRANT
  ```
- **Failure Handling**: If role `propanel_user` does not exist on port 5433, create it:
  `sudo -u postgres /usr/lib/postgresql/16/bin/createuser -p 5433 -P propanel_user`

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 4 GATE: TARGET DATABASE INITIALIZED
> Target database `propanel_db` is created fresh on port 5433. **Obtain explicit human approval before applying migrations.**

---

## Phase 4: Apply Clean Initial Migrations on Port 5433

### Command 4.1: Run Django Migrations from Zero on Target DB
- **Purpose**: Establish canonical 55-table schema, 80 foreign keys, and 97 indexes on PostgreSQL 16.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433).
- **Nature**: `Destructive` (DDL schema creation on target DB).
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/venv/bin/activate

  # Set target connection string
  export DATABASE_URL="postgres://propanel_user:DB_PASSWORD_HERE@127.0.0.1:5433/propanel_db"

  # Apply all 31 clean initial migrations
  python manage.py migrate --noinput
  ```
- **Expected Output**:
  ```
  Applying contenttypes.0001_initial... OK
  ...
  Applying core.0001_initial... OK
  ...
  Applying tables.0001_initial... OK
  ...
  Applying saas.0002_saas_data_seed... OK
  ```
- **Failure Handling**: If any migration fails, inspect stack trace. Target DB is empty; resolve error and re-run.

---

### Command 4.2: Verify Zero Pending Migrations & Schema Conformance
- **Purpose**: Verify target database matches the tested architecture standard.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  python manage.py migrate --check
  python backend/scripts/verify_database_schema.py
  ```
- **Expected Output**:
  ```
  Models Checked   : 55
  Tables Verified  : 55
  Columns Verified : 755
  FKs Verified     : 80
  Indexes Verified : 97
  Overall Status   : PASS
  ```
- **Failure Handling**: If schema check fails, abort and investigate column discrepancies.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 5 GATE: SCHEMA ESTABLISHED ON POSTGRESQL 16
> Target database schema is verified. **Obtain explicit human approval before executing data migration.**

---

## Phase 5: High-Throughput Data Migration (ETL)

### Command 5.1: Execute `migrate_legacy_data.py` (Source Port 5432 $\to$ Target Port 5433)
- **Purpose**: Stream and transform all production records into clean schema with sequence re-alignment.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433). Source DB (port 5432) is strictly read-only.
- **Nature**: `Destructive` on target DB (Data insertion).
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/venv/bin/activate

  # Execute migration utility with enforced read-only source session
  python backend/scripts/migrate_legacy_data.py \
      --source-dsn "postgres://postgres:SRC_PASSWORD@127.0.0.1:5432/propanel_db" \
      --target-dsn "postgres://propanel_user:TGT_PASSWORD@127.0.0.1:5433/propanel_db" \
      --batch-size 1000
  ```
- **Expected Output**:
  ```
  ================================================================================
  MIGRATION RECONCILIATION REPORT
  ================================================================================
  Auth Groups                  : 0 rows (PASS_ZERO_ROWS)
  Users                        : 2 rows (PASS)
  User Device Sessions         : 1 rows (PASS)
  User Security PINs           : 2 rows (PASS)
  Activity Logs                : 1 rows (PASS)
  System Metric Snapshots      : 55 rows (PASS)
  Organisations                : 1 rows (PASS)
  Tables                       : 1 rows (PASS)
  --------------------------------------------------------------------------------
  Total Entities Migrated : 63 rows
  Total Migration Errors   : 0
  Overall Status           : PASS
  ================================================================================
  ```
- **Failure Handling**: If errors > 0, do NOT proceed. Investigate error output. Source database is untouched; target DB can be wiped and re-migrated.

---

### Command 5.2: Run Database Health Check on Target Database
- **Purpose**: Verify zero foreign-key orphans, valid sequences, and 100% referential integrity.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  export DATABASE_URL="postgres://propanel_user:TGT_PASSWORD@127.0.0.1:5433/propanel_db"
  python backend/scripts/database_health_check.py
  ```
- **Expected Output**:
  ```
  Status              : HEALTHY
  FK Orphan Checks    : 80
  Sequence Sync Checks: 54
  All health and referential integrity checks passed.
  ```
- **Failure Handling**: If health check returns `UNHEALTHY`, trigger rollback.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 6 GATE: DATA MIGRATION RECONCILED
> All records transferred with 100% fidelity. **Obtain explicit human approval before transferring media.**

---

## Phase 6: Media Asset Synchronization & Verification

### Command 6.1: Capture Pre-Cutover Media Archive
- **Purpose**: Create an immutable backup of existing media before any synchronization.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (Filesystem).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  tar -czvf "/home/acw/backups/media_prod_${CUTOVER_TIME}.tar.gz" -C /home/acw/pro-panel/backend media/
  sha256sum "/home/acw/backups/media_prod_${CUTOVER_TIME}.tar.gz" >> /home/acw/backups/cutover_${CUTOVER_TIME}/SHA256SUMS
  ```
- **Expected Output**: Tarball created and checksum recorded.
- **Failure Handling**: If tarball fails, check disk space.

---

### Command 6.2: Verify All 308 Media Files with SHA-256 Manifest
- **Purpose**: Confirm byte-level integrity for 100% of physical media assets.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (Filesystem).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  sha256sum --check backend/media_manifest.sha256
  ```
- **Expected Output**:
  ```
  media/card_media/1/photo/test.png: OK
  ...
  308 lines of OK
  ```
- **Failure Handling**: If any file fails checksum, re-sync failed file from staging archive before proceeding.

---

### Command 6.3: Enforce Secure Media Directory Permissions
- **Purpose**: Set web server user ownership and permissions.
- **Machine**: Production VPS as user `root` (or `sudo`).
- **Affected DB**: None (Filesystem).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo chown -R www-data:www-data /home/acw/pro-panel/backend/media
  sudo find /home/acw/pro-panel/backend/media -type d -exec chmod 755 {} +
  sudo find /home/acw/pro-panel/backend/media -type f -exec chmod 644 {} +
  ```
- **Expected Output**: Zero output (successful exit 0).
- **Failure Handling**: Verify user `www-data` exists on system.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 7 GATE: MEDIA VERIFIED & HARDENED
> Media files 100% verified. **Obtain explicit human approval before updating configuration and restarting services.**

---

## Phase 7: Application Configuration Update & Service Cutover

### Command 7.1: Update `/home/acw/pro-panel/backend/.env`
- **Purpose**: Point application database connection to PostgreSQL 16 on port 5433.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Application runtime.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  # Backup existing .env
  cp .env .env.pre_cutover_${CUTOVER_TIME}

  # Update database port from 5432 to 5433
  sed -i 's/:5432\//:5433\//g' .env
  sed -i 's/DB_PORT=5432/DB_PORT=5433/g' .env
  sed -i 's/POSTGRES_PORT=5432/POSTGRES_PORT=5433/g' .env

  # Verify change
  grep -E "DATABASE_URL|PORT" .env
  ```
- **Expected Output**: Database URL and port showing `5433`.
- **Failure Handling**: If `.env` is corrupted, restore from `.env.pre_cutover_${CUTOVER_TIME}`.

---

### Command 7.2: Collect Static Files & Clear Redis Cache
- **Purpose**: Ensure static assets are collected and cached database queries are purged.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Redis cache / static files.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/venv/bin/activate
  python manage.py collectstatic --noinput

  # Flush redis application cache safely
  redis-cli FLUSHDB
  ```
- **Expected Output**:
  ```
  ... static files copied ...
  OK
  ```
- **Failure Handling**: If static collection fails, inspect permissions on `static_root`.

---

### Command 7.3: Restart Application Services (Web, Worker, Beat)
- **Purpose**: Bring application daemons online pointing to the new database cluster.
- **Machine**: Production VPS as user `root` (or `sudo`).
- **Affected DB**: None.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo systemctl start propanel-web
  sudo systemctl start propanel-worker
  sudo systemctl start propanel-beat
  sudo systemctl is-active propanel-web propanel-worker propanel-beat
  ```
- **Expected Output**:
  ```
  active
  active
  active
  ```
- **Failure Handling**: If any service fails to start, immediately inspect:
  `journalctl -u propanel-web -n 100 --no-pager`

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 8 GATE: APPLICATION ONLINE ON POSTGRESQL 16
> Services running on port 5433. **Obtain explicit human approval before running smoke tests and restoring public traffic.**

---

## Phase 8: Smoke Testing & Traffic Restoration

### Command 8.1: API Health & Login Verification
- **Purpose**: Verify backend API responds correctly and database connection is operational.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  curl -I http://127.0.0.1:8000/api/health/ || curl -I http://127.0.0.1:8000/
  ```
- **Expected Output**:
  ```
  HTTP/1.1 200 OK ...
  ```
- **Failure Handling**: If HTTP 500 returned, check Gunicorn error logs before opening traffic.

---

### Command 8.2: Deactivate Maintenance Splash & Restore Public Traffic
- **Purpose**: Restore production traffic to `propanel.adarshbhopal.in` and `api.propanel.adarshbhopal.in`.
- **Machine**: Production VPS as user `root` (or `sudo`).
- **Affected DB**: None (Web traffic).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Output**:
  ```
  nginx: configuration file /etc/nginx/nginx.conf test is successful
  ```
- **Failure Handling**: If reload fails, revert to maintenance splash and investigate.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 9 GATE: CUTOVER COMPLETE
> Public traffic active on rebuilt architecture. Announce cutover completion.

---

## Command-by-Command Emergency Rollback Script

If ANY checkpoint fails or an unrecoverable error occurs, execute this exact fast-path rollback:

### Rollback Command R.1: Stop Application Services
```bash
sudo systemctl stop propanel-web propanel-worker propanel-beat
```

### Rollback Command R.2: Revert `.env` to Source Port 5432
```bash
cd /home/acw/pro-panel/backend
sed -i 's/:5433\//:5432\//g' .env
sed -i 's/DB_PORT=5433/DB_PORT=5432/g' .env
sed -i 's/POSTGRES_PORT=5433/POSTGRES_PORT=5432/g' .env
grep -E "DATABASE_URL|PORT" .env
```

### Rollback Command R.3: Restart Services on Legacy Database
```bash
redis-cli FLUSHDB
sudo systemctl start propanel-web propanel-worker propanel-beat
sudo systemctl is-active propanel-web propanel-worker propanel-beat
```

### Rollback Command R.4: Restore Production Nginx Traffic
```bash
sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf
sudo nginx -s reload
```

**Total Rollback Duration**: $< 3\text{ minutes}$. Source database on port 5432 remains completely unharmed.

