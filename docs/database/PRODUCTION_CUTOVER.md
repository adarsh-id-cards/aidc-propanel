# Production Cutover Runbook & Operational Protocol (`PRODUCTION_CUTOVER.md`)

> [!CAUTION]
> **HUMAN APPROVAL REQUIRED**: This document is an operational runbook for the production cutover on the Pro-Panel VPS. No commands documented herein may be executed against live production systems without explicit written human authorization.

---

## 1. Cutover Overview, Scope & Verified Environment

This runbook specifies the precise sequence of operations required to migrate **Pro-Panel** on the production VPS (`103.49.131.169`) using a genuine **Blue/Green database deployment on PostgreSQL 16 (port 5433)**.

### Operational Parameters

| Parameter | Specification |
|---|---|
| **Target Host** | Pro-Panel Production VPS (`103.49.131.169`) |
| **Operating System** | Ubuntu 22.04.1 LTS (x86_64) |
| **SSH User** | `acw` |
| **Project Root** | `/home/acw/pro-panel` |
| **Backend Directory** | `/home/acw/pro-panel/backend` |
| **Backend Virtualenv** | `/home/acw/pro-panel/backend/.venv` |
| **Backend Environment**| `/home/acw/pro-panel/backend/.env` |
| **Application Runtime**| **Django ASGI (`config.asgi:application`) + UvicornWorker** |
| **Gunicorn Config** | `backend/config/gunicorn.conf.py` (`worker_class = uvicorn.workers.UvicornWorker`) |
| **Application Bind** | `127.0.0.1:8000` (Reconciled with Nginx upstream `django_backend`) |
| **Frontend Directory** | `/home/acw/pro-panel/frontend/dist` |
| **Web Upstream** | `http://127.0.0.1:8000` (Reverse proxied by Nginx) |
| **PostgreSQL 14** | Port 5432 (Contains only default `postgres` DB — unused) |
| **PostgreSQL 16** | Port 5433 (Production cluster `/etc/postgresql/16/main`) |
| **Source Database (Blue)**| `propanel_db` on PostgreSQL 16 (port 5433, owner: `propanel_user`) — **READ-ONLY** |
| **Target Database (Green)**| `propanel_db_v2` on PostgreSQL 16 (port 5433, owner: `propanel_user`) — **WRITE TARGET** |
| **Scheduled Window** | Off-Peak Window (Estimated: 02:00 – 02:30 IST) |
| **Estimated Downtime** | 15–20 minutes (Read/Write maintenance mode) |
| **Hard Abort Cutoff** | 30 minutes from maintenance initiation |
| **Git Baseline Commit** | Certified Clean Architecture Commit (`6ed4ef3` or latest) |

---

## 2. Pre-Cutover Preparation (T-24 Hours to T-1 Hour)

### 2.1 Server Capacity & Resource Pre-Flight

Execute on the production VPS as user `acw`:

```bash
# 1. Verify available disk space (minimum 15 GB free required)
df -h /home /var/lib/postgresql

# 2. Verify PostgreSQL 16 is active on port 5433
ss -tlpn | grep 5433
# Expected output: LISTEN ... 127.0.0.1:5433

# 3. Test PostgreSQL 16 administrative connection to existing propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db -c "
SELECT version();
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';
"
# Expected output: PostgreSQL 16.x ... table_count: 31

# 4. Verify Python virtual environment and ASGI dependencies
cd /home/acw/pro-panel/backend
source /home/acw/pro-panel/backend/.venv/bin/activate
python -c "import django, psycopg, channels, uvicorn; print('Django:', django.__version__, '| Channels:', channels.__version__, '| Uvicorn:', uvicorn.__version__)"

# 5. Ensure old baseline commit and dependencies remain available for offline rollback
cd /home/acw/pro-panel
PRE_CUTOVER_COMMIT=$(git rev-parse HEAD)
echo "${PRE_CUTOVER_COMMIT}" > /home/acw/pro-panel/pre_cutover_commit.txt
git tag -f pre-cutover-baseline "${PRE_CUTOVER_COMMIT}"
echo "Recorded baseline commit: ${PRE_CUTOVER_COMMIT}"

/home/acw/pro-panel/backend/.venv/bin/pip freeze > /home/acw/pro-panel/backend/pre_cutover_requirements.txt

if [ ! -d /home/acw/pro-panel/backend/.venv_pre_cutover ]; then
    echo "Creating offline snapshot of .venv..."
    cp -r /home/acw/pro-panel/backend/.venv /home/acw/pro-panel/backend/.venv_pre_cutover
fi
```

### 2.2 Provision Target Database `propanel_db_v2` on PostgreSQL 16

The existing `propanel_db` is **never touched or dropped**. A separate clean database is provisioned:

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 << 'EOF'
DROP DATABASE IF EXISTS propanel_db_v2;
CREATE DATABASE propanel_db_v2 WITH OWNER propanel_user ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE propanel_db_v2 TO propanel_user;
EOF
```

---

## 3. Maintenance Window Execution Protocol

```
+---------------------------------------------------------------------------------+
| T-00:00  [Phase 1] Enable Maintenance Mode & Stop Backend Process (Port 8000)   |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:03  [Phase 2] Capture Immutable Native PostgreSQL 16 Backup of propanel_db|
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:07  [Phase 3] Apply Clean Initial Migrations (0001_initial) on             |
|                    propanel_db_v2 (Port 5433)                                   |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:11  [Phase 4] Execute High-Throughput Data Migration (ETL)                |
|                    propanel_db ──> propanel_db_v2 (Both on Port 5433)           |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:15  [Phase 5] Synchronize Sequences & Execute Health Checks               |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:18  [Phase 6] Verify Media Assets (Non-Destructive Inspection)             |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:20  [Phase 7] Update .env to propanel_db_v2, Restart ASGI Backend on 8000  |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:25  [Phase 8] Smoke Testing, Deactivate Maintenance Splash & Open Traffic  |
+---------------------------------------------------------------------------------+
```

---

## 4. Step-by-Step Command Execution Runbook

### Phase 1: Enable Maintenance Mode & Stop Services (T-00:00)

```bash
# 1. Enable Nginx Maintenance Mode (verify site configuration before linking)
ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/
if [ -f /etc/nginx/sites-available/propanel_maintenance.conf ]; then
    sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf
fi
sudo nginx -t && sudo systemctl reload nginx

# 2. Stop application backend process bound to port 8000
if systemctl is-active --quiet propanel 2>/dev/null; then
    sudo systemctl stop propanel
fi

# 3. Reliable PID discovery using sudo ss
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
    
    REMAINING=$(sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
    if [ -n "$REMAINING" ]; then
        sudo kill -9 $REMAINING 2>/dev/null || true
        sleep 1
    fi
fi

# 4. Strictly verify port 8000 is free before continuing
if sudo ss -tlpn 'sport = :8000' -H 2>/dev/null | grep -q '8000'; then
    echo "FATAL ERROR: Port 8000 is STILL bound! Aborting." >&2
    exit 1
else
    echo "VERIFIED: Port 8000 is completely stopped."
fi
```

---

### Phase 2: Capture Immutable Production Backups from Port 5433 (T+00:03)

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/acw/backups/cutover_${TIMESTAMP}"
sudo mkdir -p "${BACKUP_DIR}"
sudo chown -R postgres:postgres "${BACKUP_DIR}"

# 1. Full PostgreSQL 16 Custom Dump of propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
    -h 127.0.0.1 -p 5433 -U postgres -F c -b -v \
    -f "${BACKUP_DIR}/propanel_db_pre_cutover_${TIMESTAMP}.dump" propanel_db

# 2. Plain Text SQL Dump (for emergency fallback)
sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump \
    -h 127.0.0.1 -p 5433 -U postgres -F p \
    -f "${BACKUP_DIR}/propanel_db_pre_cutover_${TIMESTAMP}.sql" propanel_db

# 3. Media Directory Archive
tar -czvf "${BACKUP_DIR}/media_pre_cutover_${TIMESTAMP}.tar.gz" -C /home/acw/pro-panel/backend media/

# 4. Generate SHA-256 Checksums
cd "${BACKUP_DIR}"
sha256sum "propanel_db_pre_cutover_${TIMESTAMP}.dump" "media_pre_cutover_${TIMESTAMP}.tar.gz" > "${BACKUP_DIR}/SHA256SUMS"
cat "${BACKUP_DIR}/SHA256SUMS"
```

---

### Phase 3: Apply Clean Initial Migrations on `propanel_db_v2` (T+00:07)

```bash
cd /home/acw/pro-panel/backend
source /home/acw/pro-panel/backend/.venv/bin/activate

# Extract DB password from .env
DB_PASS=$(grep -E "^(DB_PASSWORD|POSTGRES_PASSWORD)=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

# Target DATABASE_URL pointing to propanel_db_v2 on Port 5433
export DATABASE_URL="postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db_v2"

# Apply all 31 clean migrations from zero
python manage.py migrate --noinput

# Verify zero pending migrations
python manage.py migrate --check
```

---

### Phase 4: Execute High-Throughput Data Migration (T+00:11)

```bash
# Run migration utility from source (propanel_db) to target (propanel_db_v2) on Port 5433
# Source database propanel_db is enforced READ-ONLY at engine level
python backend/scripts/migrate_legacy_data.py \
    --source-dsn "postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db" \
    --target-dsn "postgres://propanel_user:${DB_PASS}@127.0.0.1:5433/propanel_db_v2" \
    --batch-size 1000
```

---

### Phase 5: Synchronize Sequences & Automated Health Checks (T+00:15)

```bash
# 1. Run comprehensive schema verification
python backend/scripts/verify_database_schema.py

# Expected Output:
# Models Checked   : 55
# Tables Verified  : 55
# Columns Verified : 755
# FKs Verified     : 80
# Indexes Verified : 97
# Overall Status   : PASS

# 2. Run database health and orphan check
python backend/scripts/database_health_check.py

# Expected Output:
# Status              : HEALTHY
# Pending Migrations  : 0
# FK Orphan Checks    : 80
# Sequence Sync Checks: 54
```

---

### Phase 6: Verify Media Assets (T+00:18)

```bash
cd /home/acw/pro-panel/backend
# Validate all 308 media files against cryptographic SHA-256 manifest
sha256sum --check backend/media_manifest.sha256

# Non-destructive inspection of media directory (no recursive mutation)
echo "=== Media Directory Inspection ==="
ls -ld /home/acw/pro-panel/backend/media
MEDIA_OWNER=$(stat -c '%U:%G' /home/acw/pro-panel/backend/media)
MEDIA_PERMS=$(stat -c '%a' /home/acw/pro-panel/backend/media)
echo "Media ownership: ${MEDIA_OWNER} (Mode: ${MEDIA_PERMS})"
```

---

### Phase 7: Application Configuration Update & Service Start (T+00:20)

```bash
cd /home/acw/pro-panel/backend
# 1. Backup .env
cp .env .env.pre_cutover_${TIMESTAMP}

# 2. Controlled atomic update of .env to propanel_db_v2
/home/acw/pro-panel/backend/.venv/bin/python -c "
import re, tempfile, os
from pathlib import Path

env_file = Path('/home/acw/pro-panel/backend/.env')
content = env_file.read_text()

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

# 3. Collect static files (DO NOT FLUSH REDIS)
python manage.py collectstatic --noinput

# 4. Start ASGI backend on port 8000 using UvicornWorker
if [ -f /etc/systemd/system/propanel.service ]; then
    sudo systemctl restart propanel
else
    source /home/acw/pro-panel/backend/.venv/bin/activate
    nohup /home/acw/pro-panel/backend/.venv/bin/gunicorn \
        -c config/gunicorn.conf.py \
        --bind 127.0.0.1:8000 \
        config.asgi:application \
        --daemon
fi

# 5. Verify backend is active
sleep 2
sudo ss -tlpn 'sport = :8000'
```

---

### Phase 8: Smoke Testing & Traffic Restoration (T+00:25)

1. Verify HTTP 200 response on `http://127.0.0.1:8000/api/health/`.
2. Verify Admin login at `/admin/login/` and Prime Manager dashboard access.
3. Test ID Card search query (confirming GIN index `@>` performance).
4. **Restore Public Traffic**:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
5. Announce maintenance window concluded.

---

## 5. Go / No-Go Decision Framework

| Condition | Action |
|---|---|
| All migrations applied to `propanel_db_v2`, ETL reconciled 100%, health checks return `HEALTHY` within 20 minutes | **GO**: Proceed to service restart and traffic opening. |
| Any ETL table reconciliation fails or data loss detected | **NO-GO**: Trigger `ROLLBACK_RUNBOOK.md` immediately. |
| Cutover time exceeds 30 minutes | **NO-GO**: Hard cutoff reached; trigger immediate rollback to `propanel_db`. |
