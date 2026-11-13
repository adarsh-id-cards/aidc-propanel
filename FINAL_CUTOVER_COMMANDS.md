# Production Cutover Command Execution Runbook — Pro-Panel

> [!CAUTION]
> **MANDATORY HUMAN CONTROL POLICY**:
> 1. No command in this document may be executed automatically or without explicit human authorization.
> 2. Every command must be executed sequentially on the **target production VPS (`103.49.131.169`)**.
> 3. Do NOT proceed past any checkpoint gate without verifying expected output.
> 4. If any abort criteria are met, halt immediately and trigger the **Fast-Path Rollback Procedure** (Section 9).
> 5. **Source database `propanel_db` on PostgreSQL 16 (port 5433) is 100% read-only and preserved as the immutable rollback anchor.**

---

## Operational Architecture Summary

| Property | Value |
|---|---|
| **Production VPS** | `103.49.131.169` (Ubuntu 22.04.1 LTS) |
| **SSH User** | `acw` |
| **Project Root** | `/home/acw/pro-panel` |
| **Backend Directory** | `/home/acw/pro-panel/backend` |
| **Backend Virtualenv** | `/home/acw/pro-panel/backend/.venv` |
| **Backend Environment** | `/home/acw/pro-panel/backend/.env` |
| **Application Runtime**| **Django ASGI (`config.asgi:application`) + UvicornWorker** |
| **Gunicorn Config** | `backend/config/gunicorn.conf.py` (`worker_class = uvicorn.workers.UvicornWorker`) |
| **Application Bind** | `127.0.0.1:8000` (Reconciled with Nginx upstream `django_backend`) |
| **PostgreSQL 14** | Port 5432 (Contains only default `postgres` DB — UNUSED) |
| **PostgreSQL 16** | Port 5433 (`/usr/lib/postgresql/16/bin/`) |
| **Source DB (Blue)** | `propanel_db` (Port 5433, owner: `propanel_user`, 31 tables, 140 migrations) — **READ-ONLY** |
| **Target DB (Green)** | `propanel_db_v2` (Port 5433, owner: `propanel_user`, 55 tables, 31 clean migrations) — **WRITE TARGET** |
| **Web Upstream** | `http://127.0.0.1:8000` |
| **Nginx Config** | `/etc/nginx` (Reverse proxy for `propanel.adarshbhopal.in` & `api.propanel.adarshbhopal.in`) |
| **Estimated Downtime**| 15–20 minutes |
| **Hard Abort Cutoff** | 30 minutes from maintenance start |

---

## Phase 0: Pre-Flight Environment & Host Verification (T-60 to T-15 Mins)

### Command 0.1: Verify SSH Session & VPS Host Identity
- **Purpose**: Ensure the operator is connected to the genuine production VPS and operating as user `acw`.
- **Machine**: Production VPS (`103.49.131.169`).
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  whoami
  hostname -I | awk '{print $1}'
  uname -a
  ```
- **Expected Output**:
  ```
  acw
  103.49.131.169
  Linux ... x86_64 ...
  ```
- **Failure Handling**: If IP does NOT match `103.49.131.169`, disconnect immediately.

---

### Command 0.2: Verify PostgreSQL 16 Cluster & Existing `propanel_db`
- **Purpose**: Verify PostgreSQL 16 is active on port 5433 and inspect existing `propanel_db`.
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

### Command 0.3: Inspect Active Process Bound to Port 8000 via `sudo ss`
- **Purpose**: Reliably identify the exact PID and process name currently serving the backend API on port 8000.
- **Machine**: Production VPS as user `acw` (with `sudo`).
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  sudo ss -tlpn 'sport = :8000'
  ps aux | grep -E "gunicorn|uvicorn|manage.py" | grep -v grep || true
  systemctl list-units --type=service | grep -i propanel || true
  ```
- **Expected Output**: Reliably discovers PID and user binding port 8000. Record PID for shutdown.
- **Failure Handling**: If port 8000 is not running, investigate Nginx error log (`/var/log/nginx/error.log`).

---

### Command 0.4: Verify Virtualenv & Python Environment
- **Purpose**: Verify the canonical virtual environment at `/home/acw/pro-panel/backend/.venv`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  test -f /home/acw/pro-panel/backend/.venv/bin/activate && echo "VENV: OK"
  /home/acw/pro-panel/backend/.venv/bin/python --version
  /home/acw/pro-panel/backend/.venv/bin/python -c "import django, psycopg, channels, uvicorn; print('Django:', django.__version__, '| Channels:', channels.__version__, '| Uvicorn:', uvicorn.__version__)"
  ```
- **Expected Output**:
  ```
  VENV: OK
  Python 3.10... or 3.11...
  Django: 5.x | Channels: 4.x | Uvicorn: 0.38...
  ```
- **Failure Handling**: If dependencies are missing, stop and resolve before continuing.

---

### Command 0.5: Inspect Nginx Configuration & Enabled Sites
- **Purpose**: Inspect existing Nginx configuration paths without making assumptions about site file names.
- **Machine**: Production VPS as user `acw` / `root`.
- **Affected DB**: None.
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/
  grep -rn "server_name.*propanel" /etc/nginx/sites-enabled/
  grep -rn "proxy_pass" /etc/nginx/sites-enabled/
  sudo nginx -t
  ```
- **Expected Output**: Confirms upstream points to `127.0.0.1:8000`; `syntax is ok`.
- **Failure Handling**: Do NOT proceed with symlinking unverified files if site names differ.

---

### Command 0.6: Ensure Old Baseline Commit & Dependencies Remain Available
- **Purpose**: Record and snapshot the exact pre-cutover Git commit hash and virtual environment to guarantee 100% offline rollback recovery.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None.
- **Nature**: `State-Change` (Local backup creation).
- **Command**:
  ```bash
  cd /home/acw/pro-panel
  # 1. Record baseline Git commit
  PRE_CUTOVER_COMMIT=$(git rev-parse HEAD)
  echo "${PRE_CUTOVER_COMMIT}" > /home/acw/pro-panel/pre_cutover_commit.txt
  git tag -f pre-cutover-baseline "${PRE_CUTOVER_COMMIT}"
  echo "Recorded pre-cutover commit: ${PRE_CUTOVER_COMMIT}"

  # 2. Snapshot pre-cutover Python package inventory
  /home/acw/pro-panel/backend/.venv/bin/pip freeze > /home/acw/pro-panel/backend/pre_cutover_requirements.txt

  # 3. Snapshot pre-cutover virtualenv for offline instant recovery
  if [ ! -d /home/acw/pro-panel/backend/.venv_pre_cutover ]; then
      echo "Creating offline snapshot of .venv..."
      cp -r /home/acw/pro-panel/backend/.venv /home/acw/pro-panel/backend/.venv_pre_cutover
  fi

  # 4. Fetch new architecture commits
  git fetch origin main
  git log -1 --format="Target Commit: %H | Date: %cd | Subject: %s" origin/main
  ```
- **Expected Output**: Baseline commit tagged, `.venv_pre_cutover` snapshot stored, target commit `6ed4ef3` (or latest) fetched.

---

### Command 0.7: Verify Baseline Backup File & SHA-256 Checksum
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
- **Failure Handling**: If hash does not match, re-copy the backup from staging before proceeding.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 1 GATE: PRE-FLIGHT AUDIT COMPLETE
> Verify commands 0.1 through 0.7 succeeded. **Obtain explicit human approval before proceeding to stop services.**

---

## Phase 1: Service Shutdown & Maintenance Mode (T-00:00)

### Command 1.1: Enable Nginx Maintenance Splash
- **Purpose**: Gracefully inform users that planned maintenance is in progress and reject new write traffic.
- **Machine**: Production VPS as user `root` (or with `sudo`).
- **Affected DB**: None (Web traffic).
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  # Check if a dedicated maintenance config exists before linking
  if [ -f /etc/nginx/sites-available/propanel_maintenance.conf ]; then
      sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf
  else
      echo "NOTICE: Proceeding with direct backend stop."
  fi
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Output**: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.
- **Failure Handling**: If reload fails, revert link and test again.

---

### Command 1.2: Stop Backend Process Bound to Port 8000 & Verify Port is Free
- **Purpose**: Stop backend application processes and strictly verify port 8000 is free before continuing.
- **Machine**: Production VPS as user `acw` (with `sudo`).
- **Affected DB**: None.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  # 1. Stop systemd service if active
  if systemctl is-active --quiet propanel 2>/dev/null; then
      sudo systemctl stop propanel
  fi

  # 2. Reliable PID discovery using sudo ss
  PIDS=$(sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
  if [ -n "$PIDS" ]; then
      echo "Stopping PID(s): $PIDS"
      sudo kill -TERM $PIDS 2>/dev/null || true
      
      # Wait up to 10 seconds for graceful termination
      for i in $(seq 1 10); do
          if ! sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | grep -q '8000'; then
              break
          fi
          sleep 1
      done
      
      # Force kill if still bound
      REMAINING=$(sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
      if [ -n "$REMAINING" ]; then
          echo "Sending SIGKILL to PID(s): $REMAINING"
          sudo kill -9 $REMAINING 2>/dev/null || true
          sleep 1
      fi
  fi

  # 3. Strictly verify port 8000 is free before continuing
  if sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | grep -q '8000'; then
      echo "FATAL ERROR: Port 8000 is STILL bound! Aborting." >&2
      sudo ss -tlpn 'sport = :8000' >&2
      exit 1
  else
      echo "VERIFIED: Port 8000 is completely FREE."
  fi
  ```
- **Expected Output**: `VERIFIED: Port 8000 is completely FREE.`
- **Failure Handling**: If port 8000 remains bound, abort cutover.

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

### Command 4.1: Update Codebase & Run Django Migrations from Zero on `propanel_db_v2`
- **Purpose**: Switch to tested architecture commit and establish canonical 55-table schema on `propanel_db_v2`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Destructive` (DDL creation on target DB only).
- **Command**:
  ```bash
  cd /home/acw/pro-panel
  # Checkout the certified commit
  git checkout origin/main

  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/backend/.venv/bin/activate

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
  source /home/acw/pro-panel/backend/.venv/bin/activate

  DB_PASS=$(grep -E "^(DB_PASSWORD|POSTGRES_PASSWORD)=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

  # Source DSN points to propanel_db; Target DSN points to propanel_db_v2 (both on port 5433)
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

## Phase 6: Media Asset Inventory & Non-Destructive Inspection

### Command 6.1: Capture Pre-Cutover Media Archive & Inspect Existing Ownership
- **Purpose**: Create an immutable backup of existing media and inspect directory permissions without recursive modification.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: None (Filesystem).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  tar -czvf "/home/acw/backups/cutover_${CUTOVER_TIME}/media_pre_cutover_${CUTOVER_TIME}.tar.gz" -C /home/acw/pro-panel/backend media/
  sha256sum "/home/acw/backups/cutover_${CUTOVER_TIME}/media_pre_cutover_${CUTOVER_TIME}.tar.gz" >> /home/acw/backups/cutover_${CUTOVER_TIME}/SHA256SUMS

  echo "=== Media Directory Inspection ==="
  ls -ld /home/acw/pro-panel/backend/media
  MEDIA_OWNER=$(stat -c '%U:%G' /home/acw/pro-panel/backend/media)
  MEDIA_PERMS=$(stat -c '%a' /home/acw/pro-panel/backend/media)
  echo "Existing media directory ownership: ${MEDIA_OWNER} (Mode: ${MEDIA_PERMS})"
  ```
- **Expected Output**: Archive created, checksum recorded, ownership verified (e.g. `acw:acw`, mode `755`).
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

## Phase 7: Application Configuration Update & ASGI Service Cutover

### Command 7.1: Controlled Atomic Update of `/home/acw/pro-panel/backend/.env`
- **Purpose**: Atomically update database connection to `propanel_db_v2` while preserving all other variables and masking credentials.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Application runtime.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  cp .env .env.pre_cutover_${CUTOVER_TIME}

  # Controlled atomic update
  /home/acw/pro-panel/backend/.venv/bin/python -c "
  import re, tempfile, os
  from pathlib import Path

  env_file = Path('/home/acw/pro-panel/backend/.env')
  content = env_file.read_text()

  # Replace database name in DATABASE_URL
  new_content = re.sub(
      r'(DATABASE_URL\s*=\s*[\"\']?[^\"\']*/)(propanel_db)([\?\"\'\s]|$)',
      r'\g<1>propanel_db_v2\g<3>',
      content
  )
  new_content = re.sub(
      r'^(DB_NAME\s*=\s*[\"\']?)propanel_db([\"\']?)',
      r'\g<1>propanel_db_v2\g<2>',
      new_content,
      flags=re.MULTILINE
  )
  new_content = re.sub(
      r'^(POSTGRES_DB\s*=\s*[\"\']?)propanel_db([\"\']?)',
      r'\g<1>propanel_db_v2\g<2>',
      new_content,
      flags=re.MULTILINE
  )

  with tempfile.NamedTemporaryFile('w', dir=env_file.parent, delete=False) as tf:
      tf.write(new_content)
      temp_path = tf.name

  os.replace(temp_path, env_file)
  os.chmod(env_file, 0o600)
  print('SUCCESS: .env atomically updated to propanel_db_v2.')
  "

  # Verify connection targets WITHOUT exposing passwords
  /home/acw/pro-panel/backend/.venv/bin/python -c "
  import re
  from urllib.parse import urlsplit

  for line in open('/home/acw/pro-panel/backend/.env'):
      if re.match(r'^\s*DATABASE_URL\s*=', line):
          val = line.split('=', 1)[1].strip().strip('\"\'')
          u = urlsplit(val)
          masked_netloc = f'{u.username}:***@{u.hostname}:{u.port}' if u.username else u.netloc
          print(f'Verified DATABASE_URL: {u.scheme}://{masked_netloc}{u.path}')
      elif re.match(r'^\s*(?:DB_NAME|POSTGRES_DB)\s*=', line):
          k, v = line.strip().split('=', 1)
          print(f'Verified {k.strip()}: {v.strip()}')
  "
  ```
- **Expected Output**: Shows database name is `propanel_db_v2` and port remains `5433` with credentials safely masked.
- **Failure Handling**: If `.env` is corrupted, restore from `.env.pre_cutover_${CUTOVER_TIME}`.

---

### Command 7.2: Collect Static Files
- **Purpose**: Ensure static assets are collected. (Flushing Redis is strictly prohibited).
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Static files.
- **Nature**: `State-Change`.
- **Command**:
  ```bash
  cd /home/acw/pro-panel/backend
  source /home/acw/pro-panel/backend/.venv/bin/activate
  python manage.py collectstatic --noinput
  ```
- **Expected Output**: Static files collected.
- **Failure Handling**: Inspect static permissions if failed.

---

### Command 7.3: Start ASGI Application Process on `127.0.0.1:8000`
- **Purpose**: Bring backend application online pointing to `propanel_db_v2` using Django ASGI (`config.asgi:application`), UvicornWorker, and reconciled `127.0.0.1:8000` bind.
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
      # Option B: Direct verified Gunicorn ASGI launch with UvicornWorker
      cd /home/acw/pro-panel/backend
      source /home/acw/pro-panel/backend/.venv/bin/activate
      nohup /home/acw/pro-panel/backend/.venv/bin/gunicorn \
          -c config/gunicorn.conf.py \
          --bind 127.0.0.1:8000 \
          config.asgi:application \
          --daemon
  fi

  # Verify process is actively listening on port 8000
  sleep 2
  sudo ss -tlpn 'sport = :8000'
  ```
- **Expected Output**:
  ```
  LISTEN ... 127.0.0.1:8000 ... users:(("gunicorn",pid=...,fd=...))
  ```
- **Failure Handling**: Inspect `/home/acw/pro-panel/backend/gunicorn_error.log`.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 8 GATE: APPLICATION ONLINE ON TARGET DB
> Backend listening on port 8000. **Obtain explicit human approval before running smoke tests and restoring traffic.**

---

## Phase 8: Smoke Testing & Traffic Restoration

### Command 8.1: API Health & WebSocket Verification
- **Purpose**: Verify backend responds with HTTP 200 and can query `propanel_db_v2`.
- **Machine**: Production VPS as user `acw`.
- **Affected DB**: Target DB (`propanel_db_v2` on port 5433).
- **Nature**: `Read-Only`.
- **Command**:
  ```bash
  curl -I http://127.0.0.1:8000/api/health/ || curl -I http://127.0.0.1:8000/
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/admin/login/
  ```
- **Expected Output**:
  ```
  HTTP/1.1 200 OK ...
  200
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
  # Check syntax before reloading
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Output**: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.
- **Failure Handling**: If reload fails, investigate `/var/log/nginx/error.log`.

---

> [!IMPORTANT]
> ### 🛑 CHECKPOINT 9 GATE: CUTOVER COMPLETE
> Live traffic running on `propanel_db_v2`. `propanel_db` preserved intact. Announce cutover completion.

---

## Phase 9: Command-by-Command Fast-Path Rollback Script

If ANY checkpoint fails or an unrecoverable error occurs, execute this exact, non-destructive fast-path rollback:

### Rollback Command R.1: Stop Backend Process on Port 8000 & Verify Port is Free
```bash
if systemctl is-active --quiet propanel 2>/dev/null; then
    sudo systemctl stop propanel
fi
PIDS=$(sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
if [ -n "$PIDS" ]; then
    sudo kill -TERM $PIDS 2>/dev/null || true
    sleep 2
    REMAINING=$(sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
    [ -n "$REMAINING" ] && sudo kill -9 $REMAINING 2>/dev/null || true
fi

# Verify port 8000 is free before continuing
if sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | grep -q '8000'; then
    echo "ERROR: Port 8000 is still bound!" >&2
    exit 1
fi
```

### Rollback Command R.2: Revert Codebase & Dependencies to Pre-Cutover Baseline
```bash
cd /home/acw/pro-panel
if [ -f /home/acw/pro-panel/pre_cutover_commit.txt ]; then
    PRE_CUTOVER_COMMIT=$(cat /home/acw/pro-panel/pre_cutover_commit.txt)
else
    PRE_CUTOVER_COMMIT="pre-cutover-baseline"
fi
git checkout "${PRE_CUTOVER_COMMIT}"

if [ -d /home/acw/pro-panel/backend/.venv_pre_cutover ]; then
    rsync -a --delete /home/acw/pro-panel/backend/.venv_pre_cutover/ /home/acw/pro-panel/backend/.venv/
fi
```

### Rollback Command R.3: Revert `.env` to Original `propanel_db` (Port 5433)
```bash
cd /home/acw/pro-panel/backend
/home/acw/pro-panel/backend/.venv/bin/python -c "
import re, tempfile, os
from pathlib import Path

env_file = Path('/home/acw/pro-panel/backend/.env')
content = env_file.read_text()

new_content = re.sub(
    r'(DATABASE_URL\s*=\s*[\"\']?[^\"\']*/)(propanel_db_v2)([\?\"\'\s]|$)',
    r'\g<1>propanel_db\g<3>',
    content
)
new_content = re.sub(
    r'^(DB_NAME\s*=\s*[\"\']?)propanel_db_v2([\"\']?)',
    r'\g<1>propanel_db\g<2>',
    new_content,
    flags=re.MULTILINE
)
new_content = re.sub(
    r'^(POSTGRES_DB\s*=\s*[\"\']?)propanel_db_v2([\"\']?)',
    r'\g<1>propanel_db\g<2>',
    new_content,
    flags=re.MULTILINE
)

with tempfile.NamedTemporaryFile('w', dir=env_file.parent, delete=False) as tf:
    tf.write(new_content)
    temp_path = tf.name

os.replace(temp_path, env_file)
os.chmod(env_file, 0o600)
print('SUCCESS: .env atomically reverted to propanel_db.')
"
```

### Rollback Command R.4: Verify Integrity of Untouched `propanel_db`
```bash
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db -c "
SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS applied_migrations FROM django_migrations;
"
# Expected: 31 tables, 140 migrations
```

### Rollback Command R.5: Restart ASGI Backend Process Pointing to `propanel_db`
```bash
# Note: DO NOT run redis-cli FLUSHDB
cd /home/acw/pro-panel/backend
source /home/acw/pro-panel/backend/.venv/bin/activate
python manage.py check

if [ -f /etc/systemd/system/propanel.service ]; then
    sudo systemctl restart propanel
else
    nohup /home/acw/pro-panel/backend/.venv/bin/gunicorn \
        -c config/gunicorn.conf.py \
        --bind 127.0.0.1:8000 \
        config.asgi:application \
        --daemon
fi
sleep 2
sudo ss -tlpn 'sport = :8000'
```

### Rollback Command R.6: Restore Production Nginx Traffic
```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Estimated Rollback Duration**: ~3–5 minutes. Source database `propanel_db` on port 5433 is completely untouched.
