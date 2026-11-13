# Emergency Rollback Runbook & Incident Recovery Protocol (`ROLLBACK_RUNBOOK.md`)

> [!CAUTION]
> This runbook is the definitive recovery protocol in the event of an aborted or failed production cutover. Following this protocol restores operational availability on the existing **`propanel_db` database on PostgreSQL 16 (port 5433)**.
>
> **Fast-path rollback is non-destructive**: because the existing `propanel_db` is accessed strictly in read-only mode during cutover, recovery involves switching application configuration back to `propanel_db`, checking out the pre-cutover code commit, and restarting the backend service. Estimated recovery time is approximately 3–5 minutes based on operational verification (no sub-two-minute SLA is claimed until rehearsed on the target environment).

---

## 1. Rollback Policy, Triggers & Abort Criteria

A rollback must be declared immediately by the Incident Commander or Database Administrator if any of the following abort criteria are met:

1. **ETL Execution Failure**: The data migration utility (`migrate_legacy_data.py`) encounters an unhandled exception or terminates prematurely while loading `propanel_db_v2`.
2. **Data Reconciliation Discrepancy**: Record count or content comparison between `propanel_db` and `propanel_db_v2` reveals unexplained record loss or missing primary keys.
3. **Health Check Failure**: `database_health_check.py` returns `Status: UNHEALTHY`, identifies orphaned foreign-key records, or un-synchronized sequences on `propanel_db_v2`.
4. **Backend Startup Failure**: The application backend fails to start on port 8000 or crashes during startup.
5. **Critical Application Error**: User authentication fails, critical API endpoints return HTTP 500, or data corruption is reported during post-cutover smoke tests.
6. **Hard Cutoff Exceeded**: The maintenance window reaches **T+30 minutes** from initiation without achieving verified cutover.

---

## 2. Fast-Path Rollback Architecture on PostgreSQL 16 (Port 5433)

Because the Pro-Panel cutover utilizes an **Out-of-Place Blue/Green Database Strategy within the PostgreSQL 16 cluster on port 5433**, the original production database (`propanel_db`) is accessed **strictly in read-only mode** throughout the migration (`conn_src.set_session(readonly=True)`).

Consequently, the fast-path rollback does NOT require slow or risky database drops or restores; it is completely non-destructive:

```
+------------------------------------+          +------------------------------------+
|       BLUE DATABASE (SOURCE)       |          |       GREEN DATABASE (TARGET)      |
|    propanel_db (Port 5433, Intact) |          |      propanel_db_v2 (Port 5433)    |
|   31 Tables, 140 Migrations, Pure  |          |       Isolated / Quarantined       |
+-----------------+------------------+          +------------------+-----------------+
                  ▲                                                ▲
                  │                                                │
                  │  [FAST-PATH ROLLBACK: Atomic .env Revert]      │  [QUARANTINED FOR FORENSICS]
                  │  + Code Revert (git checkout baseline)         │  (Never drop immediately)
                  │                                                │
         +--------+------------------------------------------------+--------+
         |               PRO-PANEL APPLICATION RUNTIME                      |
         |         /home/acw/pro-panel/backend/.env (Port 5433)             |
         |         Venv: /home/acw/pro-panel/backend/.venv                  |
         |                     Upstream: 127.0.0.1:8000                     |
         +------------------------------------------------------------------+
```

### Critical Requirement: Application Code & Schema Coupling
The new application codebase (from architectural rebuild commit `04ed567` onwards) contains updated Django model schemas (split tables, removed legacy columns, renamed fields). If the database is switched back to `propanel_db` (which contains the legacy 31-table schema), **the new application code cannot run against the old schema** and will fail with missing column errors.

Therefore, **fast-path rollback requires both**:
1. Reverting application runtime configuration (`DATABASE_URL` in `.env` to `propanel_db`).
2. Reverting application code to the recorded pre-cutover Git commit tag (`git checkout ${PRE_CUTOVER_COMMIT}`).

---

## 3. Fast-Path Rollback Execution Procedure (Non-Destructive)

### Step 1: Halt Application Backend Process on Port 8000

```bash
# 1. Gracefully terminate backend process on port 8000
if systemctl is-active --quiet propanel 2>/dev/null; then
    sudo systemctl stop propanel
fi

PIDS=$(ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
if [ -n "$PIDS" ]; then
    echo "Stopping active process(es) on port 8000: $PIDS"
    kill -TERM $PIDS
    sleep 2
fi

# Verify port 8000 is free
ss -tlpn | grep 8000 || echo "Port 8000 is confirmed free."
```

---

### Step 2: Revert Application Codebase to Pre-Cutover Baseline

Revert application code to the exact pre-cutover commit recorded before the maintenance window:

```bash
cd /home/acw/pro-panel

# Read recorded pre-cutover commit or baseline tag
if [ -f /home/acw/pro-panel/pre_cutover_commit.txt ]; then
    PRE_CUTOVER_COMMIT=$(cat /home/acw/pro-panel/pre_cutover_commit.txt)
else
    PRE_CUTOVER_COMMIT="pre-cutover-baseline"
fi

echo "Reverting codebase to baseline: ${PRE_CUTOVER_COMMIT}"
git checkout "${PRE_CUTOVER_COMMIT}"

# Verify working tree status
git status --porcelain
```

---

### Step 3: Controlled, Atomic `.env` Update Back to `propanel_db` (Port 5433)

> [!IMPORTANT]
> Do NOT use broad regex or `sed` commands that risk corrupting `.env` syntax, stripping query parameters, or leaking credentials into shell logs.
> Use the controlled Python atomic updater below:

```bash
cd /home/acw/pro-panel/backend

# Controlled atomic update: switches database target to propanel_db while preserving all other variables
/home/acw/pro-panel/backend/.venv/bin/python -c "
import re, tempfile, os
from pathlib import Path

env_file = Path('/home/acw/pro-panel/backend/.env')
content = env_file.read_text()

# Replace database name in DATABASE_URL from propanel_db_v2 to propanel_db
new_content = re.sub(
    r'(DATABASE_URL\s*=\s*[\"\']?[^\"\']*/)(propanel_db_v2)([\?\"\'\s]|$)',
    r'\g<1>propanel_db\g<3>',
    content
)
# Update DB_NAME / POSTGRES_DB if explicitly defined
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

# Atomic write
with tempfile.NamedTemporaryFile('w', dir=env_file.parent, delete=False) as tf:
    tf.write(new_content)
    temp_path = tf.name

os.replace(temp_path, env_file)
os.chmod(env_file, 0o600)
print('SUCCESS: .env atomically reverted to propanel_db.')
"

# Sanitize verification: inspect connection target WITHOUT printing credentials
/home/acw/pro-panel/backend/.venv/bin/python -c "
import re
from urllib.parse import urlsplit

for line in open('/home/acw/pro-panel/backend/.env'):
    if re.match(r'^\s*DATABASE_URL\s*=', line):
        val = line.split('=', 1)[1].strip().strip('\"\'')
        u = urlsplit(val)
        masked_netloc = f'{u.username}:***@{u.hostname}:{u.port}' if u.username else u.netloc
        print(f'Active DATABASE_URL target: {u.scheme}://{masked_netloc}{u.path} (Credentials Masked)')
    elif re.match(r'^\s*(?:DB_NAME|POSTGRES_DB)\s*=', line):
        k, v = line.strip().split('=', 1)
        print(f'Active {k.strip()}: {v.strip()}')
"
```

---

### Step 4: Verify Non-Destructive Integrity of `propanel_db` (Port 5433)

Confirm `propanel_db` on port 5433 remained completely untouched:

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db << 'EOF'
SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS applied_migrations FROM django_migrations;
EOF
```
**Expected Output**: Exactly 31 tables, 140 applied migrations.

---

### Step 5: Validate Media Directory & Preserve Existing Ownership

The media directory at `/home/acw/pro-panel/backend/media` is not modified during cutover. Confirm file counts and preserve existing file ownership:

```bash
cd /home/acw/pro-panel/backend

# Detect and preserve current verified ownership (typically acw:acw)
MEDIA_OWNER=$(stat -c '%U:%G' /home/acw/pro-panel/backend/media)
echo "Verified media directory ownership: ${MEDIA_OWNER}"

# Verify file count (308 files)
find media/ -type f | wc -l

# Ensure directory and file permissions without blind chown to www-data
sudo chown -R "${MEDIA_OWNER}" /home/acw/pro-panel/backend/media
sudo find /home/acw/pro-panel/backend/media -type d -exec chmod 755 {} +
sudo find /home/acw/pro-panel/backend/media -type f -exec chmod 644 {} +
```

---

### Step 6: Restart Backend Process Pointing to `propanel_db`

> [!WARNING]
> **DO NOT RUN `redis-cli FLUSHDB`**. 
> Flushing Redis during rollback is strictly prohibited as it destroys user sessions, shared cache keys, and pending worker task queues.

Restart backend process using verified virtual environment `/home/acw/pro-panel/backend/.venv`:

```bash
# Check Django configuration health against reverted propanel_db
cd /home/acw/pro-panel/backend
source /home/acw/pro-panel/backend/.venv/bin/activate
python manage.py check

# Option A: If managed via systemd unit 'propanel'
if [ -f /etc/systemd/system/propanel.service ]; then
    sudo systemctl daemon-reload
    sudo systemctl restart propanel
    sudo systemctl status propanel --no-pager
else
    # Option B: Direct verified Gunicorn startup
    nohup /home/acw/pro-panel/backend/.venv/bin/gunicorn config.wsgi:application \
        --bind 127.0.0.1:8000 \
        --workers 3 \
        --timeout 120 \
        --access-logfile /home/acw/pro-panel/backend/gunicorn_access.log \
        --error-logfile /home/acw/pro-panel/backend/gunicorn_error.log \
        --daemon
fi

# Verify process is listening on port 8000
sleep 2
ss -tlpn | grep 8000
```

---

### Step 7: Post-Rollback Smoke Testing

Verify backend responds correctly against original `propanel_db`:

```bash
# 1. Health endpoint check
curl -I http://127.0.0.1:8000/api/health/ || curl -I http://127.0.0.1:8000/

# 2. Verify admin login endpoint
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/admin/login/
# Expected: 200
```

---

### Step 8: Safe Nginx Traffic Restoration

> [!IMPORTANT]
> Verify existing Nginx sites before linking configuration files. Never link unverified files.

```bash
# 1. Inspect actual Nginx site configurations
ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/

# 2. Verify configuration syntax before reloading
sudo nginx -t

# 3. Reload Nginx to route live traffic back to backend on port 8000
sudo systemctl reload nginx
```

Notify all stakeholders that the system has been restored to the stable baseline state.

---

## 4. Post-Rollback Quarantine & Forensic Analysis

1. **Preserve Target Database for Root-Cause Analysis**:
   Do **NOT** drop `propanel_db_v2` immediately. Keep it isolated on port 5433 to inspect failed tables or constraints:
   ```bash
   sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db_v2 -c "\dt"
   ```
2. **Collect Incident Diagnostics**:
   - Application errors: `/home/acw/pro-panel/backend/gunicorn_error.log`
   - Web server errors: `/var/log/nginx/error.log`
   - Database server logs: `/var/log/postgresql/postgresql-16-main.log`
3. **Conduct Incident Post-Mortem**: Document root cause, failure point, and required fixes before scheduling another cutover attempt.

---

## 5. Disaster Recovery & Destructive Backup Restoration (Emergency Only)

> [!CAUTION]
> **DESTRUCTIVE RESTORATION SECTION — OPERATOR AUTHORIZATION REQUIRED**
> Execute this section **ONLY IF** the original database `propanel_db` was inadvertently corrupted or dropped during an aborted cutover.
> This procedure permanently terminates active database connections, drops `propanel_db`, and recreates it from a verified pre-cutover backup dump.

### Disaster Recovery Prerequisites:
- Explicit written approval from the Incident Commander.
- Pre-cutover backup file exists and matches SHA-256 hash.

```bash
TIMESTAMP="<CUTOVER_TIMESTAMP>"
BACKUP_DIR="/home/acw/backups/cutover_${TIMESTAMP}"

# 1. Verify backup file exists and matches SHA-256
cd "${BACKUP_DIR}"
sha256sum --check SHA256SUMS

# 2. Terminate all active connections to propanel_db on port 5433
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'propanel_db' AND pid <> pg_backend_pid();"

# 3. Drop and recreate clean propanel_db in PostgreSQL 16 cluster
sudo -u postgres /usr/lib/postgresql/16/bin/dropdb -p 5433 propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/createdb -p 5433 -O propanel_user -E UTF8 --locale=C propanel_db

# 4. Restore database with strict error detection enabled
sudo -u postgres /usr/lib/postgresql/16/bin/pg_restore \
    -p 5433 \
    -d propanel_db \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    "${BACKUP_DIR}/propanel_db_pre_cutover_${TIMESTAMP}.dump"

# 5. Emergency Media Extraction (Only if media directory was corrupted)
tar -xzvf "${BACKUP_DIR}/media_pre_cutover_${TIMESTAMP}.tar.gz" -C /home/acw/pro-panel/backend/
MEDIA_OWNER=$(stat -c '%U:%G' /home/acw/pro-panel/backend/media)
sudo chown -R "${MEDIA_OWNER}" /home/acw/pro-panel/backend/media
```

---

## 6. Process Management & Systemd Service Configuration

If no systemd service is currently registered on the VPS, use this validated service unit template:

### File: `/etc/systemd/system/propanel.service`
```ini
[Unit]
Description=Pro-Panel Django Gunicorn Application
After=network.target postgresql.service

[Service]
Type=notify
User=acw
Group=acw
WorkingDirectory=/home/acw/pro-panel/backend
Environment="PATH=/home/acw/pro-panel/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/home/acw/pro-panel/backend/.env
ExecStart=/home/acw/pro-panel/backend/.venv/bin/gunicorn config.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile /home/acw/pro-panel/backend/gunicorn_access.log \
    --error-logfile /home/acw/pro-panel/backend/gunicorn_error.log
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=30
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

### Installation Commands:
```bash
sudo systemctl daemon-reload
sudo systemctl enable propanel
sudo systemctl start propanel
sudo systemctl status propanel --no-pager
```
