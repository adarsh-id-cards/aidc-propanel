# Emergency Rollback Runbook & Incident Recovery Protocol (`ROLLBACK_RUNBOOK.md`)

> [!CAUTION]
> This runbook is the definitive recovery procedure in the event of an aborted or failed production cutover. Following this protocol restores 100% operational availability on the existing **`propanel_db` database on PostgreSQL 16 (port 5433)** in under 2 minutes with zero data loss.

---

## 1. Rollback Policy, Triggers & Abort Criteria

A rollback must be declared immediately by the Incident Commander if any of the following conditions occur:

1. **ETL Execution Failure**: The data migration utility (`migrate_legacy_data.py`) encounters an unhandled exception or terminates prematurely while loading `propanel_db_v2`.
2. **Data Reconciliation Discrepancy**: Record count or content comparison between `propanel_db` and `propanel_db_v2` reveals unexplained record loss or missing primary keys.
3. **Health Check Failure**: `database_health_check.py` returns `Status: UNHEALTHY`, identifies orphaned foreign-key records, or un-synchronized sequences on `propanel_db_v2`.
4. **Backend Startup Failure**: The application backend fails to start on port 8000 or crashes during startup.
5. **Critical Application Error**: User login fails, critical API endpoints return HTTP 500, or data corruption is reported during post-cutover smoke tests.
6. **Hard Cutoff Exceeded**: The maintenance window reaches **T+30 minutes** without completing verification.

---

## 2. Fast-Path Rollback Architecture on PostgreSQL 16 (Port 5433)

Because the Pro-Panel cutover utilizes a **Genuine Blue/Green Database Strategy within PostgreSQL 16**, the original production database (`propanel_db` on port 5433) is accessed **strictly in read-only mode** throughout the entire migration. 

Consequently, rollback does not require slow, error-prone database restores; it simply requires pointing the application back to `propanel_db` on port 5433:

```
+------------------------------------+          +------------------------------------+
|       BLUE DATABASE (SOURCE)       |          |       GREEN DATABASE (TARGET)      |
|    propanel_db (Port 5433, Intact) |          |      propanel_db_v2 (Port 5433)    |
+-----------------+------------------+          +------------------+-----------------+
                  ▲                                                ▲
                  │                                                │
                  │  [FAST-PATH ROLLBACK: Revert DATABASE_URL]     │  [ABORT / QUARANTINE]
                  │  (Instant Recovery: < 2 minutes)               │
                  │                                                │
         +--------+------------------------------------------------+--------+
         |               PRO-PANEL APPLICATION RUNTIME                      |
         |         /home/acw/pro-panel/backend/.env (Port 5433)             |
         |                     Upstream: 127.0.0.1:8000                     |
         +------------------------------------------------------------------+
```

---

## 3. Step-by-Step Rollback Execution Procedure

### Step 1: Halt Backend Process on Port 8000 & Maintain Splash Page

```bash
# 1. Verify maintenance page is active
sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf || true
sudo nginx -s reload

# 2. Stop application backend process bound to port 8000
if systemctl is-active --quiet propanel 2>/dev/null; then
    sudo systemctl stop propanel
fi
PIDS=$(ss -tlpn 'sport = :8000' -H 2>/dev/null | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' | sort -u)
[ -n "$PIDS" ] && kill -TERM $PIDS
```

---

### Step 2: Revert Application Configuration to `propanel_db`

Revert `DATABASE_URL` in `/home/acw/pro-panel/backend/.env` to point back to original `propanel_db` on port 5433:

```bash
cd /home/acw/pro-panel/backend

# Revert database name back to propanel_db
sed -i 's/\/propanel_db_v2$/\/propanel_db/g' .env
sed -i 's/\/propanel_db_v2"/ \/propanel_db"/g' .env
sed -i "s/\/propanel_db_v2'/ \/propanel_db'/g" .env
sed -i 's/DB_NAME=propanel_db_v2/DB_NAME=propanel_db/g' .env
sed -i 's/POSTGRES_DB=propanel_db_v2/POSTGRES_DB=propanel_db/g' .env

# Verify database connection string
grep -E "DATABASE_URL|DB_NAME" .env
# Expected: .../propanel_db on port 5433
```

---

### Step 3: Verify Integrity of Original `propanel_db` on Port 5433

Verify that `propanel_db` remains 100% healthy:

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -d propanel_db << 'EOF'
SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS applied_migrations FROM django_migrations;
EOF
```

Expected: 31 tables, 140 migrations.

---

### Step 4 (Contingency): Restore from Pre-Cutover Backup

*(Execute ONLY if the original database was inadvertently modified or corrupted)*:

```bash
TIMESTAMP="<CUTOVER_TIMESTAMP>"
BACKUP_DIR="/home/acw/backups/cutover_${TIMESTAMP}"

# 1. Verify backup file exists and matches SHA-256
cd "${BACKUP_DIR}"
sha256sum --check SHA256SUMS

# 2. Terminate existing connections to propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/psql -p 5433 -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'propanel_db' AND pid <> pg_backend_pid();"

# 3. Drop and recreate clean propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/dropdb -p 5433 propanel_db
sudo -u postgres /usr/lib/postgresql/16/bin/createdb -p 5433 -O propanel_user -E UTF8 --locale=C propanel_db

# 4. Restore database from native PostgreSQL 16 dump
sudo -u postgres /usr/lib/postgresql/16/bin/pg_restore -p 5433 -d propanel_db --no-owner --no-privileges "${BACKUP_DIR}/propanel_db_pre_cutover_${TIMESTAMP}.dump"
```

---

### Step 5: Restore Media Directory (If Modified)

```bash
TIMESTAMP="<CUTOVER_TIMESTAMP>"
BACKUP_DIR="/home/acw/backups/cutover_${TIMESTAMP}"

# Re-extract untouched media snapshot
tar -xzvf "${BACKUP_DIR}/media_pre_cutover_${TIMESTAMP}.tar.gz" -C /home/acw/pro-panel/backend/

# Ensure ownership and permissions
sudo chown -R www-data:www-data /home/acw/pro-panel/backend/media
```

---

### Step 6: Restart Backend Process Pointing to `propanel_db`

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

---

### Step 7: Post-Rollback Smoke Testing

1. Verify HTTP 200 on `http://127.0.0.1:8000/api/health/`.
2. Verify Admin login at `/admin/login/`.
3. Verify existing tables and cards load correctly from `propanel_db`.

---

### Step 8: Remove Maintenance Page & Resume Traffic

```bash
sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf || true
sudo nginx -s reload
```

Notify all stakeholders that the system has been restored to the stable baseline state.

---

## 4. Post-Rollback Quarantine & Investigation

1. **Preserve Target Database for Forensics**: Do NOT drop `propanel_db_v2` immediately; preserve it for troubleshooting.
2. **Collect Logs**:
   - `/home/acw/pro-panel/backend/gunicorn_error.log`
   - `/var/log/nginx/error.log`
   - Target PostgreSQL logs from `/var/log/postgresql/postgresql-16-main.log`.
3. **Conduct Incident Post-Mortem**: Document root cause, failure point, timeline, and corrective actions required before scheduling the next cutover attempt.
