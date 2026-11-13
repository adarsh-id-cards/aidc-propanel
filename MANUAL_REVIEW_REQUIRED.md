# Pro-Panel — Manual Review Required & Architectural Advisory

This document highlights architectural patterns, legacy considerations, large assets, and prospective deprecations that were preserved for safety and require stakeholder or team review before taking further action.

---

## 1. High-Resolution Branding Asset in Repository Root

- **Location**: `pro panel logo.png` (6.5 MB) in project root.
- **Why Identified**: 6.5 MB PNG image stored in the Git repository root.
- **Risk of Removal**: Removing it from git might lose the source high-resolution graphic if it is not archived elsewhere.
- **Recommendation**:
  - Keep this file tracked in Git or move to an internal `assets/` / Google Drive design archive.
  - For web and mobile delivery, **never** serve this 6.5 MB file directly. The production frontend is already configured to serve the compressed 20 KB version located at `frontend/public/propanel_logo.png`.

---

## 2. Background Task Execution: Daemon Threads vs. Celery Workers

- **Location**: `backend/panel/services/backup_service.py` and `backend/exports/services.py`
- **Why Identified**: Several long-running tasks (such as client ZIP backups and large export jobs) launch asynchronous work via Python's standard `threading.Thread(daemon=True)`.
- **Current Behavior**:
  - Works reliably on a single-instance VPS deployment where the web worker remains alive.
  - Lightweight: Does not strictly require a separate Celery worker daemon or Redis broker running to perform backups.
- **Risk / Scalability Limitation**:
  - If Gunicorn/Uvicorn worker processes are restarted (e.g. during deployment or due to `max-requests` recycling), running background threads will be terminated mid-operation.
  - Does not scale across multiple web nodes.
- **Recommended Action**:
  - For single VPS deployment: Safe to continue using thread-based execution. Ensure Gunicorn timeout is sufficient or use a persistent worker.
  - For multi-instance high-availability production: Transition `start_backup` to Celery tasks registered in `backend/panel/tasks.py`.

---

## 3. Mobile API & Legacy App Routing

- **Location**: `backend/mobile_api/`
- **Why Identified**: Extensive API endpoints (over 5,000 lines) supporting mobile client apps (attendance, ID cards, QR scanning).
- **Current Status**: All static analysis issues and runtime name errors have been fixed. Endpoints are functional.
- **Recommended Action**:
  - If mobile applications are actively used in the field, keep `mobile_api` mounted.
  - If mobile client apps are not currently in production, consider gating these routes behind an API feature flag in `config/settings.py` (`ENABLE_MOBILE_API = True`).

---

## 4. Multi-Tenant Role Delegation Modules (`assistants` & `operators`)

- **Location**: `backend/assistants/` and `backend/operators/`
- **Why Identified**: Modular apps handling delegation:
  - `assistants`: School / organization staff delegated by managers.
  - `operators`: Print shop floor technicians handling card production batches.
- **Current Status**: Fully integrated with Django permissions, audit logging, and tenant isolation.
- **Recommended Action**: Retain as core production features. Ensure tenant security rules in `PermissionService` are audited periodically when adding new sub-roles.

---

## 5. PostgreSQL Migration History Maintenance

- **Location**: `backend/*/migrations/`
- **Why Identified**: Historical migrations contain past schema transitions (e.g., migration `0103_initial_domain_models` and `0108_add_org_role_to_organisation`).
- **Critical Warning**:
  - **Never squashing or deleting historical migrations on an active production database.**
  - The live PostgreSQL 16 database tracks executed migrations in the `django_migrations` table.
- **Recommended Action**:
  - Leave existing migrations untouched.
  - Any future schema adjustments must strictly use new, forward-only Django migrations (`python manage.py makemigrations`).
