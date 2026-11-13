# Emergency Rollback Runbook & Incident Recovery Protocol (`ROLLBACK_RUNBOOK.md`)

> [!CAUTION]
> This runbook is the definitive recovery procedure in the event of an aborted or failed production cutover. Following this protocol guarantees immediate, lossless restoration of the production service on the legacy PostgreSQL cluster in under 10 minutes.

---

## 1. Rollback Policy, Triggers & Abort Criteria

A rollback must be declared immediately by the Incident Commander if any of the following conditions occur:

1. **ETL Execution Failure**: The data migration utility (`migrate_legacy_data.py`) encounters an unhandled exception or terminates prematurely.
2. **Data Reconciliation Discrepancy**: Record count comparison between source and target reveals unexplained record loss or missing primary keys.
3. **Health Check Failure**: `database_health_check.py` returns `Status: UNHEALTHY`, identifies orphaned foreign-key records, or un-synchronized sequences.
4. **Service Startup Failure**: Application services (`propanel-web` or `propanel-worker`) fail to start or crash within 5 minutes of cutover.
5. **Critical Application Error**: User login fails, critical API endpoints return HTTP 500, or data corruption is reported during post-cutover smoke tests.
6. **Hard Cutoff Exceeded**: The maintenance window reaches **T+35 minutes** without completing verification.

---

## 2. Fast-Path Rollback Architecture

Because the Pro-Panel cutover utilizes an **Out-of-Place Blue/Green Strategy**, the original production database (`propanel_db` on port 5432) is accessed **strictly in read-only mode** throughout the entire migration. 

Consequently, rollback does not require slow, error-prone database restores; it simply requires pointing application services back to port 5432 and restarting them:

```
+------------------------------------+          +------------------------------------+
|       SOURCE DATABASE (BLUE)       |          |       TARGET DATABASE (GREEN)      |
|    PostgreSQL Port 5432 (Intact)   |          |     PostgreSQL 16 Port 5433        |
+-----------------+------------------+          +------------------+-----------------+
                  ▲                                                ▲
                  │                                                │
                  │  [ROLLBACK: Revert DATABASE_URL]               │  [ABORT / QUARANTINE]
                  │  (Instant Fast-Path: < 3 minutes)              │
                  │                                                │
         +--------+------------------------------------------------+--------+
         |               PRO-PANEL APPLICATION RUNTIME                      |
         |         /var/www/propanel/backend/.env (Port 5432)               |
         +------------------------------------------------------------------+
```

---

## 3. Step-by-Step Rollback Execution Procedure

### Step 1: Halt Application Services & Maintain Splash Page

Ensure services are stopped so no writes are made to an indeterminate state:

```bash
# 1. Verify maintenance page is active
sudo ln -sf /etc/nginx/sites-available/propanel_maintenance.conf /etc/nginx/sites-enabled/propanel.conf
sudo nginx -s reload

# 2. Stop application services
sudo systemctl stop propanel-web propanel-worker propanel-beat
```

---

### Step 2: Revert Application Configuration to Port 5432

Revert `DATABASE_URL` in `/var/www/propanel/backend/.env` to point back to the legacy database on port 5432:

```bash
# Revert port 5433 back to 5432 in configuration
sed -i 's/:5433\//:5432\//g' /var/www/propanel/backend/.env

# Verify database connection string
grep "DATABASE_URL" /var/www/propanel/backend/.env
# Expected output: DATABASE_URL=postgres://...:5432/propanel_db
```

---

### Step 3: Verify Integrity of Legacy Database on Port 5432

Verify that the source database remains 100% healthy:

```bash
sudo -u postgres psql -p 5432 -d propanel_db << 'EOF'
SELECT count(*) AS user_count FROM core_user;
SELECT count(*) AS client_count FROM core_client;
SELECT count(*) AS table_count FROM core_idcardtable;
EOF
```

All record counts must match the pre-cutover baseline.

---

### Step 4 (Contingency): Restore from Pre-Cutover Backup

*(Execute ONLY if the legacy database was inadvertently modified or corrupted)*:

```bash
TIMESTAMP="<LATEST_TIMESTAMP>"
BACKUP_DIR="/var/backups/propanel"

# 1. Verify backup file exists and matches SHA-256
cd "${BACKUP_DIR}"
sha256sum --check "SHA256SUMS_${TIMESTAMP}"

# 2. Terminate existing connections to source database
sudo -u postgres psql -p 5432 -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'propanel_db' AND pid <> pg_backend_pid();"

# 3. Drop and recreate clean legacy database
sudo -u postgres dropdb -p 5432 propanel_db
sudo -u postgres createdb -p 5432 -O postgres propanel_db

# 4. Restore database from pre-cutover dump
sudo -u postgres pg_restore -p 5432 -d propanel_db --no-owner --no-privileges "${BACKUP_DIR}/propanel_prod_${TIMESTAMP}.dump"
```

---

### Step 5: Restore Media Directory (If Modified)

```bash
TIMESTAMP="<LATEST_TIMESTAMP>"
BACKUP_DIR="/var/backups/propanel"

# Re-extract untouched media snapshot
sudo tar -xzvf "${BACKUP_DIR}/media_prod_${TIMESTAMP}.tar.gz" -C /var/www/propanel/backend/

# Ensure ownership and permissions
sudo chown -R www-data:www-data /var/www/propanel/backend/media
```

---

### Step 6: Restart Legacy Application Services

```bash
# 1. Restart systemd services
sudo systemctl start propanel-web
sudo systemctl start propanel-worker
sudo systemctl start propanel-beat

# 2. Verify service status
sudo systemctl is-active propanel-web propanel-worker propanel-beat
# Expected: active (all 3)
```

---

### Step 7: Post-Rollback Smoke Testing

1. Access the web interface and verify HTTP 200 response on login page.
2. Log in with administrative credentials.
3. Verify that existing tables, student records, and cards load with complete data fidelity.
4. Verify that media photographs load correctly.

---

### Step 8: Remove Maintenance Page & Resume Traffic

```bash
# Restore live production Nginx configuration
sudo ln -sf /etc/nginx/sites-available/propanel_production.conf /etc/nginx/sites-enabled/propanel.conf
sudo nginx -s reload
```

Notify all stakeholders that the system has been restored to the stable baseline state.

---

## 4. Post-Rollback Quarantine & Investigation

1. **Preserve Target Cluster for Forensics**: Do NOT delete the target database `propanel_db` on port 5433 or migration logs.
2. **Collect Logs**:
   - `journalctl -u propanel-web -n 500 > /var/log/propanel_rollback_web.log`
   - `journalctl -u propanel-worker -n 500 > /var/log/propanel_rollback_worker.log`
   - Target PostgreSQL logs from `/var/log/postgresql/postgresql-16-main.log`.
3. **Conduct Incident Post-Mortem**: Document root cause, failure point, timeline, and corrective actions required before scheduling the next cutover attempt.

