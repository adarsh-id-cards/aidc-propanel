# Pro-Panel — Comprehensive Technical Audit Report

## 1. Executive Summary

- **Project Name**: Pro-Panel (Standalone Enterprise Tenant Edition)
- **Architecture**: Decoupled Monorepo (Django 5.2 ASGI Backend + React 19 Vite SPA Frontend)
- **Deployment Target**: Ubuntu 22.04 LTS VPS, PostgreSQL 16 (Port 5433, Database: `propanel_db`, User: `propanel_user`), Python 3.10+, Daphne/Uvicorn ASGI, Redis, Nginx Reverse Proxy
- **Domains**:
  - Web Frontend (SPA) & Primary Application: `https://propanel.adarshbhopal.in`
  - Backend API Subdomain (Mobile App / Desktop App / Webhooks): `https://api.propanel.adarshbhopal.in`
- **Audit Scope**: Full repository codebase audit across Backend Django, Frontend React, PostgreSQL Migrations, DevOps/Deployment infrastructure, Security posture, and Test automation.

---

## 2. Critical Migration & Database Vulnerabilities (Issues A, B, C)

### Issue A: PostgreSQL Strict Boolean Defaults (`bool DEFAULT 0`)
- **Location**: `backend/core/migrations/0103_initial_domain_models.py`
- **Root Cause**: The migration contained 26 raw SQL `ALTER TABLE core_client ADD COLUMN ... bool DEFAULT 0` statements. While SQLite treats booleans as integers (`0` / `1`), PostgreSQL strictly distinguishes integers from booleans. Running `DEFAULT 0` on PostgreSQL 16 triggers:
  ```text
  ERROR: column "is_guest" is of type boolean but default expression is of type integer
  HINT: You will need to rewrite or cast the expression.
  ```
- **Severity**: High (Deployment Blocker on fresh installs).
- **Remediation**: All 26 column definitions updated to `bool DEFAULT FALSE`, which is fully standard, cross-database compliant across both PostgreSQL and modern SQLite.

### Issue B: Silent Exception Handling Swallowing SQL Errors
- **Location**: `backend/core/migrations/0103_initial_domain_models.py` and `backend/tables/migrations/0001_initial_domain_models.py`
- **Root Cause**: Migration scripts wrapped raw SQL executions in:
  ```python
  try:
      cursor.execute(sql)
  except Exception:
      pass
  ```
  In PostgreSQL, executing an invalid SQL statement inside a transaction immediately transitions the entire transaction into an aborted state (`psycopg2.errors.InFailedSqlTransaction`). Swallowing the exception causes subsequent schema introspection and migration logging to fail catastrophically.
- **Severity**: Critical.
- **Remediation**: Removed all silent exception swallowing. Added explicit schema introspection (`connection.introspection.get_table_description(...)`) with case-insensitive column matching (`col.name.lower()`) prior to executing DDL operations.

### Issue C: Duplicate Column Failure on `core.0108_add_org_role_to_organisation`
- **Location**: `backend/core/migrations/0108_add_org_role_to_organisation.py` (interfacing with `0103_initial_domain_models.py`)
- **Context on Production Database**:
  - The live deployment database at `propanel_db` had previously executed `core.0103` (which added `org_role` to `core_client`).
  - When migration `core.0108` executed `AddField(model_name='organisation', name='org_role')`, Django generated `ALTER TABLE core_client ADD COLUMN org_role ...`.
  - PostgreSQL failed with:
    ```text
    django.db.utils.ProgrammingError: column "org_role" of relation "core_client" already exists
    ```
- **Architectural Solution**:
  1. Removed `org_role` from `0103`'s `column_defs` so that fresh databases don't introduce a collision.
  2. Converted `0108_add_org_role_to_organisation.py` to use `migrations.SeparateDatabaseAndState`:
     - **State Operations**: Keeps `AddField(model_name='organisation', name='org_role', ...)` so Django model state properly registers the field.
     - **Database Operations**: Executes an idempotent Python function `add_org_role_if_not_exists`:
       ```python
       cols = {col.name.lower() for col in connection.introspection.get_table_description(cursor, 'core_client')}
       if 'org_role' not in cols:
           cursor.execute("ALTER TABLE core_client ADD COLUMN org_role varchar(50) DEFAULT 'organisation' NOT NULL")
       ```
  - **Result**: On the existing deployment server (where `core.0107` has applied and `org_role` already exists), `0108` detects the column, skips duplicate SQL execution, updates Django migration state, and proceeds cleanly without data loss. On brand-new installs, `0108` safely adds the column.

### Associated Vulnerabilities Discovered in `tables` Migrations
- **`tables.0001_initial_domain_models.py`**:
  - Contained SQLite-specific raw SQL `CREATE TABLE IF NOT EXISTS core_idcardtable` with `AUTOINCREMENT`, `datetime`, and `DEFAULT 0`.
  - Added database engine vendor branching: emits standard PostgreSQL DDL (`bigserial`, `jsonb`, `DEFAULT FALSE`, `timestamp with time zone`) when `connection.vendor == 'postgresql'`, preserving SQLite fallback for local test harnesses.
  - Replaced silent `try ... except pass` with case-insensitive column introspection.
- **`tables.0003_add_description.py`**:
  - Added `description` to `Table` via `AddField`. Because `core_idcardtable` already included `description` from initial table creation, PostgreSQL would fail on duplicate column addition.
  - Converted to `SeparateDatabaseAndState` with `add_description_if_not_exists` column introspection.
- **`core.0110_add_client_id_to_idcardtable.py`**:
  - Contained raw SQLite `PRAGMA table_info(core_idcardtable)`. Replaced with universal Django database introspection (`connection.introspection.get_table_description`).

---

## 3. Backend Architecture Audit

### Python Compatibility (3.10 vs 3.11)
- Verified all backend code under `backend/` for syntax compatibility with Python 3.10 (target server version).
- Verified zero instances of Python 3.11-only features (`ExceptionGroup`, `except*`, `typing.Self`, or `enum.StrEnum`). All modules run cleanly on Python 3.10 and 3.11.

### Authentication, Authorization & Session Management
- **Session Architecture**: Cookie-based authentication with `accounts.middleware.DeviceSessionMiddleware` tracking active devices.
- **SameSite Cookie Configuration**:
  - Configured `SESSION_COOKIE_SAMESITE` and `CSRF_COOKIE_SAMESITE` to dynamically read from environment variables (`os.getenv(..., 'Lax')`).
  - Set `SESSION_COOKIE_SECURE = True` and `CSRF_COOKIE_SECURE = True` for production HTTPS.
- **Reverse Proxy SSL Termination**:
  - `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` is enabled outside `DEBUG` checks to guarantee that CSRF validation succeeds when behind Nginx SSL termination.
- **Tenant Isolation**:
  - Role-based permissions enforced at model, view, and middleware levels (`PermissionValidationMiddleware`).
  - Assistants and Operators are strictly constrained to their assigned organisations and tables.

---

## 4. Frontend Architecture Audit

### Build System & Dependency Resolution
- **Node & NPM**: Verified on Node 20+ / NPM 11. Updated `engines.node` specification in `frontend/package.json` to `>=20.19.0`.
- **Peer Dependency Compatibility**:
  - Resolved Vite 8 peer conflict by updating `@vitejs/plugin-react` to `^6.0.3`.
  - Restored essential UI dependencies: `axios`, `cmdk`, `framer-motion`, `recharts`, `sonner`, `react-loading-skeleton`.
- **Build Performance**:
  - `npm run build` completes cleanly in under 20 seconds.
  - Chunk splitting generates distinct view chunks (`PrimeAdminDashboardView`, `ManagePanelView`, `FixImagesView`, `DataCollectionView`, `StudentDataPortal`).

---

## 5. Deployment & Nginx Routing Architecture

### Same-Origin Relative API Strategy
To eliminate third-party cookie blocking (Safari ITP, Chrome Privacy Sandbox) and cross-origin CORS preflight latency:
1. **Frontend Server Block (`propanel.adarshbhopal.in`)**:
   - Serves React SPA root from `/var/www/pro-panel/frontend/dist` with `try_files $uri $uri/ /index.html`.
   - Reverse-proxies `/api/`, `/auth/`, `/app/`, `/admin/`, `/roshan-pro-admin/`, `/ws/`, `/media/` directly to upstream `django_backend` (127.0.0.1:8000).
   - All browser requests from the SPA are relative same-origin calls (`/api/...`), completely avoiding cross-origin issues.
2. **API Subdomain Server Block (`api.propanel.adarshbhopal.in`)**:
   - Reverse-proxies all requests directly to `django_backend`.
   - Serves external API consumers: Desktop App, Mobile Flutter App, and webhooks.

---

## 6. Audit Conclusion & Next Steps
- The database migrations are fully reconciled, idempotent, and validated on both clean databases and simulated deployment states.
- The project is ready for zero-downtime deployment execution.
