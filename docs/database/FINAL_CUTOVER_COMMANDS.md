# Final Production Cutover Commands — Pro-Panel

> [!CAUTION]
> **HUMAN AUTHORIZATION REQUIRED**: Do NOT execute these commands against the live production environment without explicit human authorization. Every command is classified by machine, target database, operational risk (Read-Only vs Destructive), expected output, and failure handling procedure.
>
> **VERIFIED VPS ARCHITECTURE**:
> - **PostgreSQL 14 (Port 5432)**: Default cluster containing only `postgres` DB. Unused by Pro-Panel.
> - **PostgreSQL 16 (Port 5433)**: Dedicated production cluster.
> - **Source Database (Blue)**: `propanel_db` on Port 5433 (Preserved untouched as rollback anchor).
> - **Target Database (Green)**: `propanel_db_v2` on Port 5433 (Clean schema target).
> - **Web Upstream**: Nginx reverse proxy targeting `http://127.0.0.1:8000`.

---

## Command Execution Taxonomy

| Dimension | Classifications |
|---|---|
| **Executing Machine** | `Production VPS (103.49.131.169)` |
| **Executing User** | `acw` (Application deployer) or `postgres` (DB Admin) or `root` (Systemd/Nginx) |
| **Affected Database** | `None` / `Source DB (propanel_db on port 5433)` / `Target DB (propanel_db_v2 on port 5433)` / `Filesystem` |
| **Nature** | `Read-Only` (Zero data risk) or `State-Change` (Service/config) or `Destructive` (Target DB write) |
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
[CHECKPOINT 2] Stop Backend Process on Port 8000 & Maintenance Splash ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 3] Capture Final Snapshot of propanel_db (Port 5433)       ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 4] Create Fresh Target Database propanel_db_v2            ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 5] Apply Clean 0001_initial Migrations on propanel_db_v2   ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 6] Execute ETL (propanel_db ──> propanel_db_v2 on 5433)   ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 7] Synchronize & Verify Media Assets (SHA-256)            ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 8] Point .env to propanel_db_v2 & Restart Backend (8000)  ──> [HUMAN APPROVAL]
     │
     ▼
[CHECKPOINT 9] Smoke Testing & Production Traffic Restoration         ──> [HUMAN APPROVAL]
     │
     ▼
   [DONE]
```

---

## Phase 0: Pre-Flight Audit & Environment Verification (Read-Only)

### Command 0.1: Verify VPS Host Identity & Environment
- **Purpose**: Verify the operator is connected to the correct production server as user `acw`.
- **Machine**: Production VPS (`103.49.131.169`) as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  hostname -I && uname -a && whoami && pwd
  ```
- **Expected Output**:
  ```
  103.49.131.169 ... Linux ... x86_64 ... acw ... /home/acw/pro-panel
  ```
- **Failure Handling**: If IP does NOT match `103.49.131.169`, disconnect immediately.

---

### Command 0.2: Verify PostgreSQL 16.15 Cluster Status & Existing `propanel_db`
- **Purpose**: Verify PostgreSQL 16 is listening on port 5433 and inspect existing `propanel_db`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Source DB (`propanel_db` on port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  ss -tlpn | grep 5433
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db -c "
  SELECT version();
  SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';
  SELECT count(*) AS applied_migrations FROM django_migrations;
  "
  ```
- **Expected Output**:
  ```
  LISTEN ... 127.0.0.1:5433 ...
  PostgreSQL 16.15 (Ubuntu 16.15-...) ...
  public_tables: 31
  applied_migrations: 140
  ```
- **Failure Handling**: If port 5433 is not listening, verify cluster: `sudo systemctl status postgresql@16-main`. If database `propanel_db` is missing, abort.

---

### Command 0.3: Inspect Active Process Bound to Port 8000
- **Purpose**: Identify the exact PID and process name currently serving the backend API on port 8000.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  ss -tlpn | grep 8000
  ps aux | grep -E "gunicorn|runserver|manage.py" | grep -v grep || true
  systemctl list-units --type=service | grep -i propanel || true
  ```
- **Expected Output**: Identifies whether Gunicorn is running standalone, under supervisor, or under a systemd unit. Record PID for shutdown.
- **Failure Handling**: If port 8000 is not running, investigate Nginx error log (`/var/log/nginx/error.log`).

---

### Command 0.4: Verify Git Commit on VPS Repository
- **Purpose**: Confirm `/home/acw/pro-panel` matches the certified Git commit `04ed567`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel
  git fetch origin main
  git log -1 --format="Commit: %H | Date: %cd | Subject: %s" origin/main
  git status --porcelain
  ```
- **Expected Output**: Shows commit `04ed567...`; working directory clean.
- **Failure Handling**: If dirty, stash changes. To align with tested commit: `git reset --hard origin/main`.

---

### Command 0.5: Verify Baseline Backup File & SHA-256 Checksum
- **Purpose**: Confirm verified pre-rebuild backup is accessible on VPS with identical SHA-256 checksum.
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
- **Failure Handling**: If hash does not match, re-copy the backup from staging/source machine before proceeding.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 1 GATE: PRE-FLIGHT AUDIT COMPLETE
> Verify commands 0.1 through 0.5 succeeded. **Obtain explicit human approval before proceeding to stop services.**

---

## Phase 1: Service Shutdown & Maintenance Splash

### Command 1.1: Enable Nginx Maintenance Splash Page
- **Purpose**: Gracefully inform users that planned maintenance is in progress and reject new write traffic.
- **Machine**: Production VPS as user `root` (or with `sudo`).
- **Affected DB**: None (Web traffic).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf || true
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Output**:
  ```
  nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
  nginx: configuration file /etc/nginx/nginx.conf test is successful
  ```
- **Failure Handling**: If maintenance conf is not present, create a simple maintenance block or proceed carefully after stopping backend.

---

### Command 1.2: Stop Backend Process Bound to Port 8000
- **Purpose**: Stop backend application processes to prevent database modifications during cutover.
- **Machine**: Production VPS as user `acw` / `root`.
- **Affected DB**: None.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  # Check if a systemd unit exists
  if systemctl is-active --quiet propanel 2>/dev/null; then
      sudo systemctl stop propanel
  fi

  # Gracefully terminate any remaining Gunicorn / Django process on port 8000
  PIDS=$(ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
  if [ -n "$PIDS" ]; then
      echo "Stopping PID(s): $PIDS"
      kill -TERM $PIDS
      sleep 2
  fi

  # Verify port 8000 is free
  ss -tlpn | grep 8000 || echo "Port 8000 is FREE."
  ```
- **Expected Output**:
  ```
  Port 8000 is FREE.
  ```
- **Failure Handling**: If port 8000 remains bound, run `kill -9 $PIDS`.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 2 GATE: SERVICES STOPPED & MAINTENANCE ACTIVE
> Confirm port 8000 is free and no application writes can occur. **Obtain explicit human approval before capturing final backup.**

---

## Phase 2: Final Production Snapshot from PostgreSQL 16 (Port 5433)

### Command 2.1: Capture Native PostgreSQL 16 Backup of Existing `propanel_db`
- **Purpose**: Capture an immutable snapshot of existing production database directly from port 5433 using PG16 tools.
- **Machine**: Production VPS as user `postgres`.
- **Affected DB**: Source DB (`propanel_db` on port 5433).
- **Nature**: `Read-Only` on source DB.
- **Command**:
  ```bash
  CUTOVER_TIME=$(date +%Y%m%d_%H%M%S)
  sudo mkdir -p /home/acw/backups/cutover_${CUTOVER_TIME}
  sudo chown -R postgres:postgres /home/acw/backups/cutover_${CUTOVER_TIME}

  # Native PostgreSQL 16 dump — zero cross-version GUC incompatibilities
  sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
      -h 127.0.0.1 -p 5433 -U postgres -F c -b -v \
      -f "/home/acw/backups/cutover_${CUTOVER_TIME}/propanel_db_pre_cutover_${CUTOVER_TIME}.dump" \
      propanel_db

  sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
      -h 127.0.0.1 -p 5433 -U postgres -F p \
      -f "/home/acw/backups/cutover_${CUTOVER_TIME}/propanel_db_pre_cutover_${CUTOVER_TIME}.sql" \
      propanel_db

  cd "/home/acw/backups/cutover_${CUTOVER_TIME}"
  sha256sum propanel_db_pre_cutover_${CUTOVER_TIME}.dump propanel_db_pre_cutover_${CUTOVER_TIME}.sql > SHA256SUMS
  cat SHA256SUMS
  ```
- **Expected Output**: Verbose TOC summary completing with exit code `0`; SHA-256 hashes printed.
- **Failure Handling**: If dump fails, investigate disk space (`df -h`). Services are stopped; source database is completely safe.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 3 GATE: BACKUP CAPTURED & CHECKSUM VERIFIED
> Confirm final backup exists on port 5433. **Obtain explicit human approval before creating target database propanel_db_v2.**

---

## Phase 3: Target Database Provisioning on PostgreSQL 16 (`propanel_db_v2`)

### Command 3.1: Create Clean Target Database `propanel_db_v2` on Port 5433
- **Purpose**: Provision an empty target database within PostgreSQL 16 cluster, keeping `propanel_db` completely untouched.
- **Machine**: Production VPS as user `postgres`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Destructive` on `propanel_db_v2` ONLY. `propanel_db` is untouched.
- **Command**:
  ```bash
  # Terminate any stray connections to propanel_db_v2 (if exists from rehearsal)
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE datname = 'propanel_db_v2' AND pid <> pg_backend_pid();"

  # Drop if exists and recreate clean propanel_db_v2
  sudo -u postgres /usr/lib/postgresql/16/bin/dropdb -p 5433 --if-exists propanel_db_v2
  sudo -u postgres /usr/lib/postgresql/16/bin/createdb -p 5433 -O propanel_user -E UTF8 --locale=C propanel_db_v2
  sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db_v2 -c "GRANT ALL PRIVILEGES ON DATABASE propanel_db_v2 TO propanel_user;"
  ```
- **Expected Output**:
  ```
  DROP DATABASE (or notices)
  CREATE DATABASE
  GRANT
  ```
- **Failure Handling**: Verify owner is `propanel_user`.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 4 GATE: TARGET DATABASE PROVISIONED
> Target database `propanel_db_v2` created fresh; `propanel_db` remains 100% untouched. **Obtain explicit human approval before applying migrations.**

---

## Phase 4: Apply Clean Initial Migrations on `propanel_db_v2`

### Command 4.1: Run Django Migrations from Zero on `propanel_db_v2`
- **Purpose**: Establish canonical 55-table schema, 80 foreign keys, and 97 indexes on `propanel_db_v2`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Destructive` (DDL creation on target DB only).
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/venv/bin/activate

  # Read existing DB credentials from .env
  DB_PASS=$(grep -E "^(DB_PASSWORD|POSTGRES_PASSWORD)=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

  # Configure target database connection
  export DATABASE_URL="postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db_v2"

  # Apply all 31 clean initial migrations
  python manage.py migrate --noinput
  ```
- **Expected Output**: All 31 initial migrations applied cleanly (`... OK`).
- **Failure Handling**: If migration fails, inspect error. `propanel_db_v2` is disposable.

---

### Command 4.2: Verify Zero Pending Migrations & Schema Conformance on `propanel_db_v2`
- **Purpose**: Confirm schema matches the verified architectural standard.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
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
- **Failure Handling**: If schema check fails, abort and investigate.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 5 GATE: SCHEMA ESTABLISHED ON TARGET DB
> Target database schema verified. **Obtain explicit human approval before executing data migration.**

---

## Phase 5: High-Throughput Data Migration (`propanel_db` $\to$ `propanel_db_v2`)

### Command 5.1: Execute `migrate_legacy_data.py` on PostgreSQL 16 (Port 5433)
- **Purpose**: Stream and transform all production records from `propanel_db` into `propanel_db_v2` with sequence re-alignment.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2`). Source DB (`propanel_db`) is strictly read-only.
- **Nature**: `Destructive` on target DB (Data insertion).
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/venv/bin/activate

  DB_PASS=$(grep -E "^(DB_PASSWORD|POSTGRES_PASSWORD)=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

  # Source DSN points to propanel_db; Target DSN points to propanel_db_v2 (both on 5433)
  python backend/scripts/migrate_legacy_data.py \
      --source-dsn "postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db" \
      --target-dsn "postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db_v2" \
      --batch-size 1000
  ```
- **Expected Output**: Structured reconciliation report showing 100% row matching, zero errors, status: `PASS`.
- **Failure Handling**: If errors > 0, do NOT proceed. Source database `propanel_db` is untouched; target DB can be wiped and re-migrated.

---

### Command 5.2: Run Database Health Check on `propanel_db_v2`
- **Purpose**: Verify zero foreign-key orphans, valid sequences, and 100% referential integrity.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  export DATABASE_URL="postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db_v2"
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
> All records transferred with 100% fidelity. **Obtain explicit human approval before verifying media.**

---

## Phase 6: Media Asset Inventory & Verification

### Command 6.1: Capture Pre-Cutover Media Archive
- **Purpose**: Create an immutable backup of existing media before any changes.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (Filesystem).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  tar -czvf "/home/acw/backups/cutover_${CUTOVER_TIME}/media_pre_cutover_${CUTOVER_TIME}.tar.gz" -C /home/acw/pro-panel/backend media/
  sha256sum "/home/acw/backups/cutover_${CUTOVER_TIME}/media_pre_cutover_${CUTOVER_TIME}.tar.gz" >> /home/acw/backups/cutover_${CUTOVER_TIME}/SHA256SUMS
  ```
- **Expected Output**: Archive created and checksum recorded.
- **Failure Handling**: If archive fails, verify disk space.

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
- **Expected Output**: All 308 lines report `OK`.
- **Failure Handling**: If any file fails checksum, re-sync from backup archive.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 7 GATE: MEDIA VERIFIED
> Media assets verified 100%. **Obtain explicit human approval before switching configuration to propanel_db_v2.**

---

## Phase 7: Application Configuration Update & Service Cutover

### Command 7.1: Update `/home/acw/pro-panel/backend/.env` to `propanel_db_v2`
- **Purpose**: Point application database connection to `propanel_db_v2` on port 5433.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Application runtime.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  cp .env .env.pre_cutover_${CUTOVER_TIME}

  # Update database name from propanel_db to propanel_db_v2
  sed -i 's/\/propanel_db$/\/propanel_db_v2/g' .env
  sed -i 's/\/propanel_db"/ \/propanel_db_v2"/g' .env
  sed -i "s/\/propanel_db'/ \/propanel_db_v2'/g" .env
  sed -i 's/DB_NAME=propanel_db/DB_NAME=propanel_db_v2/g' .env
  sed -i 's/POSTGRES_DB=propanel_db/POSTGRES_DB=propanel_db_v2/g' .env

  # Verify .env changes
  grep -E "DATABASE_URL|DB_NAME|POSTGRES_DB" .env
  ```
- **Expected Output**: Shows database name is `propanel_db_v2` and port remains `5433`.
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

  # Clear redis cache safely
  redis-cli FLUSHDB || true
  ```
- **Expected Output**: Static files collected; Redis reports `OK`.
- **Failure Handling**: Inspect static permissions if failed.

---

### Command 7.3: Start / Restart Backend Application Process on Port 8000
- **Purpose**: Bring backend application online pointing to `propanel_db_v2`.
- **Machine**: Production VPS as user `acw` / `root`.
- **Affected DB**: None.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  # Option A: If managed via systemd unit 'propanel'
  if [ -f /etc/systemd/system/propanel.service ]; then
      sudo systemctl daemon-reload
      sudo systemctl restart propanel
      sudo systemctl status propanel --no-pager
  else
      # Option B: Safe background launch with Gunicorn
      cd /home/acw/pro-panel/backend
      source /home/acw/pro-panel/venv/bin/activate
      nohup gunicorn config.wsgi:application \
          --bind 127.0.0.1:8000 \
          --workers 3 \
          --timeout 120 \
          --access-logfile /home/acw/pro-panel/backend/gunicorn_access.log \
          --error-logfile /home/acw/pro-panel/backend/gunicorn_error.log \
          --daemon
  fi

  # Verify port 8000 is listening
  sleep 2
  ss -tlpn | grep 8000
  ```
- **Expected Output**:
  ```
  LISTEN ... 127.0.0.1:8000 ...
  ```
- **Failure Handling**: Inspect `/home/acw/pro-panel/backend/gunicorn_error.log`.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 8 GATE: APPLICATION ONLINE ON TARGET DB
> Backend listening on port 8000. **Obtain explicit human approval before running smoke tests and restoring traffic.**

---

## Phase 8: Smoke Testing & Traffic Restoration

### Command 8.1: API Health Verification
- **Purpose**: Verify backend responds with HTTP 200 and can query `propanel_db_v2`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  curl -I http://127.0.0.1:8000/api/health/ || curl -I http://127.0.0.1:8000/
  ```
- **Expected Output**:
  ```
  HTTP/1.1 200 OK ...
  ```
- **Failure Handling**: Check Gunicorn error log if 500 error returned.

---

### Command 8.2: Deactivate Maintenance Splash & Restore Public Traffic
- **Purpose**: Open live traffic to `propanel.adarshbhopal.in` and `api.propanel.adarshbhopal.in`.
- **Machine**: Production VPS as user `root` (or `sudo`).
- **Affected DB**: None (Web traffic).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf || true
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
> Live traffic running on `propanel_db_v2`. `propanel_db` preserved intact. Announce cutover completion.

---

## Command-by-Command Emergency Rollback Script

If ANY checkpoint fails or an unrecoverable error occurs, execute this exact fast-path rollback to restore original `propanel_db`:

### Rollback Command R.1: Stop Backend Process on Port 8000
```bash
if systemctl is-active --quiet propanel 2>/dev/null; then
    sudo systemctl stop propanel
fi
PIDS=$(ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
[ -n "$PIDS" ] && kill -TERM $PIDS
```

### Rollback Command R.2: Revert `.env` to Original `propanel_db` (Port 5433)
```bash
cd /home/acw/pro-panel/backend
sed -i 's/\/propanel_db_v2$/\/propanel_db/g' .env
sed -i 's/\/propanel_db_v2"/ \/propanel_db"/g' .env
sed -i "s/\/propanel_db_v2'/ \/propanel_db'/g" .env
sed -i 's/DB_NAME=propanel_db_v2/DB_NAME=propanel_db/g' .env
sed -i 's/POSTGRES_DB=propanel_db_v2/POSTGRES_DB=propanel_db/g' .env
grep -E "DATABASE_URL|DB_NAME" .env
```

### Rollback Command R.3: Restart Backend Process Pointing to `propanel_db`
```bash
redis-cli FLUSHDB || true
if [ -f /etc/systemd/system/propanel.service ]; then
    sudo systemctl restart propanel
else
    cd /home/acw/pro-panel/backend
    source /home/acw/pro-panel/venv/bin/activate
    nohup gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120 --daemon
fi
sleep 2
ss -tlpn | grep 8000
```

### Rollback Command R.4: Restore Production Nginx Traffic
```bash
sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf || true
sudo nginx -s reload
```

**Total Rollback Duration**: $< 2\text{ minutes}$. Source database `propanel_db` on port 5433 is completely untouched.
