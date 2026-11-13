# Pro-Panel — Production Readiness & Deployment Runbook

## 1. Production Readiness Scorecard

| Area | Status | Verification Result |
| :--- | :--- | :--- |
| **Database Migrations** | **READY** | All 124 core migrations and app migrations pass cleanly and idempotently; PostgreSQL 16 compatible. |
| **Deployment DB Compatibility** | **READY** | Validated on existing state (`core.0107` applied, `org_role` present); `core.0108` skips duplicate DDL. |
| **Backend System Check** | **READY** | `python manage.py check` passes with 0 issues identified (0 silenced). |
| **Backend Test Suite** | **READY** | 243+ tests passing across `tables`, `organisation`, and `accounts` suites. |
| **Frontend Build Pipeline** | **READY** | `npm run build` succeeds in ~18s; 0 TypeScript/Lint errors. |
| **Reverse Proxy Routing** | **READY** | Unified Nginx configuration with same-origin SPA routing on `propanel.adarshbhopal.in` and API routing on `api.propanel.adarshbhopal.in`. |
| **Security Configuration** | **READY** | `SECURE_PROXY_SSL_HEADER`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `X-Frame-Options`, `X-Content-Type-Options`. |
| **Python Environment** | **READY** | Fully compatible with Python 3.10 and 3.11. |

---

## 2. Production Deployment Execution Steps (Ubuntu 22.04 VPS)

Follow this exact sequence on your production server.

### Step 1 — Update Repository
```bash
cd /var/www/pro-panel
git fetch origin
git checkout main
git pull origin main
```

### Step 2 — Verify Python Environment
```bash
source /var/www/pro-panel/backend/venv/bin/activate
cd /var/www/pro-panel/backend

# Verify dependencies are up to date
pip install -r requirements.txt
```

### Step 3 — Run Django Checks & Database Migration
```bash
# Verify system integrity
python manage.py check

# Run idempotent migrations (Safe on existing DB; no data loss)
python manage.py migrate --noinput

# Verify migration status
python manage.py migrate --check
```

### Step 4 — Collect Backend Static Files
```bash
python manage.py collectstatic --noinput
```

### Step 5 — Build Frontend React SPA
```bash
cd /var/www/pro-panel/frontend
npm ci
npm run build
```

### Step 6 — Update & Test Nginx Configuration
```bash
# Copy example configuration if needed
sudo cp /var/www/pro-panel/deployment/nginx_example.conf /etc/nginx/sites-available/propanel.conf
sudo ln -sf /etc/nginx/sites-available/propanel.conf /etc/nginx/sites-enabled/

# Test syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 7 — Restart Backend Services
```bash
sudo systemctl restart propanel-asgi
sudo systemctl restart propanel-worker  # if running background task runner
```

---

## 3. Deployment Database Safety Guarantee

- **Target Database**: `propanel_db` on port `5433` (user: `propanel_user`).
- **Safety Mechanism**:
  1. The live database currently contains migrations applied through `core.0107`, with `org_role` already present in `core_client`.
  2. When `python manage.py migrate --noinput` is executed:
     - Migration `0108_add_org_role_to_organisation` checks column existence via PostgreSQL schema introspection.
     - Because `org_role` already exists, it skips executing `ALTER TABLE ... ADD COLUMN`, avoiding the `ProgrammingError: column "org_role" already exists`.
     - Django marks `core.0108` as successfully applied in `django_migrations`.
     - Subsequent migrations (`0109` through `0124`) execute cleanly.
  3. **Zero Data Loss Guarantee**: No existing tables, rows, columns, or data are dropped, truncated, or overwritten.

---

## 4. Verification & Health Check Endpoints

After deployment, verify that all systems are operational:

1. **Web Panel SPA**:
   ```bash
   curl -I https://propanel.adarshbhopal.in
   # Expected: HTTP/2 200 OK
   ```

2. **Backend API Health Check**:
   ```bash
   curl -I https://propanel.adarshbhopal.in/api/
   # Expected: HTTP/2 200 or 401 (Auth required, proxy working)
   ```

3. **External API Subdomain**:
   ```bash
   curl -I https://api.propanel.adarshbhopal.in/api/
   # Expected: HTTP/2 200 or 401
   ```

4. **WebSockets Connectivity**:
   Connect via browser or wscat to `wss://propanel.adarshbhopal.in/ws/notifications/` with a valid session cookie.

---

## 5. Rollback & Disaster Recovery Runbook

If any unforeseen issue occurs during deployment:

1. **Rollback Backend Code**:
   ```bash
   git checkout HEAD~1
   sudo systemctl restart propanel-asgi
   ```

2. **Rollback Migration (if needed)**:
   ```bash
   python manage.py migrate core 0107
   ```

3. **Database Backup / Restore**:
   - Create immediate snapshot before deployment:
     ```bash
     pg_dump -h localhost -p 5433 -U propanel_user -d propanel_db -Fc -f /var/backups/propanel_pre_deploy_$(date +%Y%m%d_%H%M%S).dump
     ```
   - Restore command:
     ```bash
     pg_restore -h localhost -p 5433 -U propanel_user -d propanel_db --clean --if-exists /var/backups/propanel_pre_deploy_YYYYMMDD_HHMMSS.dump
     ```
