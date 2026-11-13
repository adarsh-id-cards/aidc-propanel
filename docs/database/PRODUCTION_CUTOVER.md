# Production Cutover Runbook & Operational Protocol (`PRODUCTION_CUTOVER.md`)

> [!CAUTION]
> **HUMAN APPROVAL REQUIRED**: This document is an operational runbook for the production cutover on the Pro-Panel VPS. No commands documented herein may be executed against live production systems without explicit written human authorization.

---

## 1. Cutover Overview, Scope & Schedule

This runbook specifies the precise sequence of operations required to migrate **Pro-Panel** on the production VPS from the legacy PostgreSQL database to the rebuilt, certified **PostgreSQL 16 database running on port 5433**.

### Operational Parameters

| Parameter | Specification |
|---|---|
| **Target Host** | Pro-Panel Production VPS (Ubuntu Linux) |
| **Source Database** | `propanel_db` on PostgreSQL (port `5432`) |
| **Target Database** | `propanel_db` on PostgreSQL 16.15 (port `5433`) |
| **Scheduled Window** | Off-Peak Window (Estimated: 02:00 – 02:45 IST) |
| **Estimated Downtime** | 15–25 minutes (Read/Write maintenance mode) |
| **Hard Abort Cutoff** | 35 minutes from maintenance initiation |
| **Git Baseline Commit** | Certified Phase G Architecture Commit |

---

## 2. Pre-Cutover Preparation (T-24 Hours to T-1 Hour)

### 2.1 Server Capacity & Resource Pre-Flight

Execute on the production VPS:

```bash
# 1. Verify available disk space (minimum 25 GB free required)
df -h /var /var/lib/postgresql

# 2. Verify PostgreSQL 16 is active on port 5433
ss -tlpn | grep 5433
# Expected output: LISTEN ... 127.0.0.1:5433

# 3. Test PostgreSQL 16 administrative connection
sudo -u postgres psql -p 5433 -c "SELECT version();"
# Expected output: PostgreSQL 16.x ...

# 4. Verify Python environment and dependencies
cd /var/www/propanel/backend
source /var/www/propanel/venv/bin/activate
python -c "import django, psycopg; print('Django:', django.__version__, '| Psycopg:', psycopg.__version__)"
```

### 2.2 Provision Target Database on PostgreSQL 16

```bash
sudo -u postgres psql -p 5433 << 'EOF'
CREATE DATABASE propanel_db WITH OWNER postgres ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE propanel_db TO postgres;
EOF
```

---

## 3. Maintenance Window Execution Protocol

```
+---------------------------------------------------------------------------------+
| T-00:00  [Phase 1] Enable Maintenance Mode & Stop Application Services          |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:03  [Phase 2] Capture Immutable Production Backups (DB & Media)            |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:08  [Phase 3] Apply Clean Initial Migrations (0001_initial) on PG16       |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:13  [Phase 4] Execute High-Throughput Data Migration (ETL)                |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:18  [Phase 5] Synchronize Sequences & Execute Health Checks               |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:22  [Phase 6] Synchronize Media Files & Verify Cryptographic Hashes       |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:25  [Phase 7] Update Configuration, Restart Services & Run Smoke Tests    |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| T+00:30  [Phase 8] Deactivate Maintenance Mode & Open Traffic                   |
+---------------------------------------------------------------------------------+
```

---

## 4. Step-by-Step Command Execution Runbook

### Phase 1: Enable Maintenance Mode & Stop Services (T-00:00)

```bash
# 1. Enable Nginx Maintenance Splash
sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf
sudo nginx -s reload

# 2. Stop application web and Celery worker daemons
sudo systemctl stop propanel-web
sudo systemctl stop propanel-worker
sudo systemctl stop propanel-beat

# 3. Verify services are stopped
sudo systemctl is-active propanel-web propanel-worker propanel-beat
# Expected: inactive / failed
```

---

### Phase 2: Capture Immutable Production Backups (T+00:03)

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/propanel"
sudo mkdir -p "${BACKUP_DIR}"

# 1. Full PostgreSQL Custom Dump
sudo -u postgres pg_dump -p 5432 -F c -b -v -f "${BACKUP_DIR}/propanel_prod_${TIMESTAMP}.dump" propanel_db

# 2. Plain Text SQL Dump (for emergency fallback)
sudo -u postgres pg_dump -p 5432 -F p -v -f "${BACKUP_DIR}/propanel_prod_${TIMESTAMP}.sql" propanel_db

# 3. Full Media Archive
tar -czvf "${BACKUP_DIR}/media_prod_${TIMESTAMP}.tar.gz" -C /var/www/propanel/backend media/

# 4. Generate SHA-256 Checksums
cd "${BACKUP_DIR}"
sha256sum "propanel_prod_${TIMESTAMP}.dump" "media_prod_${TIMESTAMP}.tar.gz" > "${BACKUP_DIR}/SHA256SUMS_${TIMESTAMP}"
cat "${BACKUP_DIR}/SHA256SUMS_${TIMESTAMP}"
```

---

### Phase 3: Apply Clean Initial Migrations on PostgreSQL 16 (T+00:08)

```bash
cd /var/www/propanel/backend
source /var/www/propanel/venv/bin/activate

# Point DATABASE_URL to PostgreSQL 16 (Port 5433)
export DATABASE_URL="postgres://postgres:SECURE_PASSWORD@127.0.0.1:5433/propanel_db"

# Apply all 31 clean migrations from zero
python manage.py migrate --noinput

# Verify zero pending migrations
python manage.py migrate --check
```

---

### Phase 4: Execute High-Throughput Data Migration (T+00:13)

```bash
# Run migration utility from source (port 5432) to target (port 5433)
python backend/scripts/migrate_legacy_data.py \
    --source-dsn "postgres://postgres:SECURE_PASSWORD@127.0.0.1:5432/propanel_db" \
    --target-dsn "postgres://postgres:SECURE_PASSWORD@127.0.0.1:5433/propanel_db" \
    --batch-size 1000
```

---

### Phase 5: Synchronize Sequences & Automated Health Checks (T+00:18)

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

### Phase 6: Synchronize Media Files (T+00:22)

```bash
# Synchronize media with checksum verification
rsync -avz --checksum /var/www/propanel/backend/media/ /var/www/propanel/backend/media/

# Ensure web server ownership
sudo chown -R www-data:www-data /var/www/propanel/backend/media
sudo find /var/www/propanel/backend/media -type d -exec chmod 755 {} +
sudo find /var/www/propanel/backend/media -type f -exec chmod 644 {} +
```

---

### Phase 7: Application Configuration Update & Service Restart (T+00:25)

```bash
# 1. Update /var/www/propanel/backend/.env to port 5433
sed -i 's/:5432\//:5433\//g' /var/www/propanel/backend/.env

# 2. Collect static files and clear cache
python manage.py collectstatic --noinput
python manage.py clear_cache || true

# 3. Restart application services
sudo systemctl start propanel-web
sudo systemctl start propanel-worker
sudo systemctl start propanel-beat

# 4. Verify systemd status
sudo systemctl status propanel-web --no-pager
sudo systemctl status propanel-worker --no-pager
```

---

### Phase 8: Smoke Testing & Traffic Restoration (T+00:30)

1. Verify HTTP 200 response on `/health/` or `/api/health/`.
2. Verify Admin login at `/admin/login/` and Prime Manager dashboard access.
3. Test ID Card search query (confirming GIN index `@>` performance).
4. **Restore Public Traffic**:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf
   sudo nginx -s reload
   ```
5. Announce maintenance window concluded.

---

## 5. Go / No-Go Decision Framework

| Condition | Action |
|---|---|
| All migrations applied, ETL reconciled 100%, health checks return `HEALTHY` within 25 minutes | **GO**: Proceed to service restart and traffic opening. |
| Any ETL table reconciliation fails or data loss detected | **NO-GO**: Trigger `docs/database/ROLLBACK_RUNBOOK.md` immediately. |
| Cutover time exceeds 35 minutes | **NO-GO**: Hard cutoff reached; trigger immediate rollback. |

