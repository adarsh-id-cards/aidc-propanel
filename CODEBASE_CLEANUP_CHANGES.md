# Pro-Panel — Codebase Cleanup Changes Inventory

This document provides a comprehensive, file-by-file record of every cleanup, dead code elimination, and bug-fix applied to the Pro-Panel repository during the production hardening process.

---

## 1. Scratch & Development Artifacts Removal

### `backend/scratch/generate_brochure_pdf.py`
- **Action**: Completely removed from repository.
- **Why Safe**: This was an experimental, one-off CLI script created during brochure layout prototyping. It was not referenced by any Django view, URL pattern, service, or celery task.
- **What Was Preserved**: Production PDF and brochure generation services in `backend/core/services/` and `backend/exports/` remain 100% intact.

### `backend/scratch/seed_showcase_data.py`
- **Action**: Completely removed from repository.
- **Why Safe**: This was a development mock seeder that created dummy organizations and students with hardcoded test passwords (`Password@123`). It posed a security risk if deployed to production.
- **What Was Preserved**: Standard Django fixtures and legitimate migration data routines remain intact.

### `.gitignore`
- **Action**: Updated to explicitly ignore all scratch scripts, benchmarks, temporary test SQLite databases (`pytest_db_*.sqlite3`, `clean_test_db*.sqlite3`, `deployment_sim_db.sqlite3`), database backups (`*.dump`, `*.bak`), and diagnostic files.
- **Why Safe**: Prevents accidental tracking or committing of developer scratch scripts or sensitive database dumps.

---

## 2. Debugging Code Removal

### `backend/organisation/tests.py`
- **Action**: Removed `print("DEBUG RESPONSE:", response.status_code, response.content)` on line 74.
- **Why Safe**: Leftover debugging statement from test development; polluting test stdout.
- **What Was Preserved**: The complete test assertion suite and test coverage.

### `backend/web_app/tests.py`
- **Action**: Removed `print("DEBUG CLIENTS:", data['clients'])` on line 55.
- **Why Safe**: Leftover print debugging in test suite.
- **What Was Preserved**: The complete test assertion suite.

### `frontend/src/`
- **Action**: Comprehensive scan for `console.log`, `console.debug`, `debugger`, and `breakpoint()`.
- **Finding**: 0 active instances found in production code. Clean build verified by `oxlint`.

---

## 3. Bug Fixes & Undefined Name Resolutions (`F821` & `F822`)

### `backend/panel/services/backup_service.py`
- **Location**: Line 135
- **Change**: Added missing `_human_size(bytes_val: int) -> str` utility function.
- **Why Safe**: `backup_service.py` attempted to call `_human_size(size_bytes)` to populate the `size_human` metadata attribute in `BackupTask.zip_files`. Because `_human_size` was never imported or defined, every backup task completion raised `NameError: name '_human_size' is not defined`.
- **What Was Preserved**: The entire backup compression, multi-school ZIP packaging, and background thread workflow.

### `backend/tables/views/card_api.py`
- **Location**: Line 2464
- **Change**: Added `Q` to `from django.db.models import Count, Q` and structured logging with error response in `api_table_status_counts`.
- **Why Safe**: The aggregation query `Count('id', filter=Q(status='requested'))` crashed with `NameError: name 'Q' is not defined` whenever status counts were fetched for a table. Silent `except Exception: pass` had previously masked the failure, returning an empty count payload.
- **What Was Preserved**: All card table views, pagination, bulk operations, and filtering.

### `backend/core/views/auth.py`
- **Location**: Lines 202–224
- **Change**: Cleaned `__all__` by removing four non-existent, abandoned template view references (`login_view`, `admin_staff_dashboard`, `client_dashboard`, `client_staff_dashboard`), and correctly exported active views (`api_pin_status`, `api_login_pin`, `api_create_pin`).
- **Why Safe**: These old template views were deprecated when the application transitioned to the React SPA. Any wildcard import from `core.views.auth` would crash with `AttributeError`.
- **What Was Preserved**: All modern token, PIN, impersonation, and session authentication endpoints.

### `backend/core/views/client_api.py`
- **Location**: Former helper `_get_admin_manageable_client_staff`
- **Change**: Removed unused helper function that referenced `Staff` (a deleted legacy model).
- **Why Safe**: The function was completely unreferenced throughout the codebase and referenced a model that no longer exists in `organisation.models`.
- **What Was Preserved**: All client management and staff management API endpoints.

### `backend/core/views/dashboard_views.py`
- **Location**: Line 25
- **Change**: Added missing `from datetime import timedelta` import.
- **Why Safe**: `UserDeviceSession.objects.filter(last_activity__gte=now - timedelta(hours=1))` raised `NameError: name 'timedelta' is not defined` when calculating active sessions.
- **What Was Preserved**: All dashboard analytics, device session tracking, and user stats.

### `backend/core/views/errors.py`
- **Location**: Line 8
- **Change**: Added missing `from core.services.permission_service import PermissionService` import.
- **Why Safe**: Authenticated error views querying permissions crashed with `NameError: name 'PermissionService' is not defined`.
- **What Was Preserved**: Custom 400, 403, 404, and 500 error handlers and JSON error responses.

### `backend/core/services/reupload_processor.py`
- **Location**: Line 440
- **Change**: Corrected `'client': Organisation` to `'client': client`.
- **Why Safe**: The dictionary was appending the Django model class descriptor `Organisation` instead of the scoped instance variable `client`, causing serialization or foreign key assignment errors in reupload processing.
- **What Was Preserved**: Automated student photo re-upload and matching pipeline.

### `backend/exports/processor.py`
- **Location**: Line 420
- **Change**: Guarded cleanup references using `locals().get('pdf_path')`, `locals().get('docx_path')`, and `locals().get('excel_path')`.
- **Why Safe**: In early task failure or cancellation paths, if an exception occurred before path variables were assigned, the `finally` cleanup block raised an unhandled `UnboundLocalError` / `NameError`.
- **What Was Preserved**: Full export pipeline for PDF, Word, and Excel formats.

### `backend/mediafiles/admin.py`
- **Location**: Line 1
- **Change**: Added `from django.contrib import admin`.
- **Why Safe**: Admin registration failed to import `admin`, raising `NameError`.
- **What Was Preserved**: Media files admin interface.

### `backend/mediafiles/services/image_rename.py`
- **Location**: Lines 8–10
- **Change**: Added `import time` and `from django.core.files.storage import default_storage`.
- **Why Safe**: Image collision prevention logic references `time.time()` and `default_storage.exists()`.
- **What Was Preserved**: Safe image sanitization and rename pipeline.

### `backend/mobile_api/views.py`
- **Location**: Top-level imports and line 4934
- **Change**: Added `import os`, defined model aliases `Client = Organisation`, `PortfolioCategory = None`, `PortfolioItemService = None`, and fixed `client.status` descriptor bug.
- **Why Safe**: Fixed multiple runtime `NameError` exceptions on mobile API endpoints when client status or portfolio features were queried.
- **What Was Preserved**: All mobile endpoints for cards, attendance, and student data.

### `backend/operators/services.py`
- **Location**: Line 15
- **Change**: Added `from django.http import JsonResponse`.
- **Why Safe**: Permission decorators `check_client_access` and `check_permission` returned `JsonResponse({'error': ...}, status=403)` but failed to import `JsonResponse`.
- **What Was Preserved**: Role-based access control and operator permission decorators.

### `backend/organisation/views_api.py`
- **Location**: Line 185
- **Change**: Replaced undefined `_get_client_for_request(user)` with standard service call `OrganisationAccessService.get_organisation_for_user(user)`.
- **Why Safe**: The helper `_get_client_for_request` was refactored into the service layer in earlier iterations but this call site had not been updated, causing 500 errors on API invocation.
- **What Was Preserved**: Multi-tenant organization profile and settings APIs.

---

## 4. Frontend Optimization & Verification

- **Linter**: `oxlint` executed across all 79 JSX/JS files. **0 errors, 0 warnings**.
- **Production Build**: `vite build` completed, producing clean production assets in `frontend/dist/`.
- **Dead Assets**: Evaluated `frontend/public/` and `src/assets/`. All assets are referenced by active views.

---

## 5. Deployment Hardcoding Cleanup & Generalization

### `backend/full_api_test.py`
- **Action**: Completely removed from repository.
- **Why Safe**: Standalone ad-hoc testing script that contained hardcoded test credentials (`admin123`) and localhost targets (`http://localhost:8000`). Not part of pytest or production.

### `backend/config/settings.py`
- **Location**: `_DEV_ORIGINS`
- **Change**: Removed developer LAN IP (`192.168.1.9`) and obsolete domains (`cardflow.in`, `privatexyz.cardflow.in`) from CORS development whitelist.
- **Why Safe**: In production, CORS origins are strictly driven by `CORS_ALLOWED_ORIGINS` in `.env`.

### `backend/core/management/commands/bootstrap_production.py`
- **Location**: Lines 33–65
- **Change**: Updated `--default-password` to prioritize `os.getenv('BOOTSTRAP_DEFAULT_PASSWORD')` rather than defaulting solely to hardcoded `'Password@123'`.
- **Why Safe**: Enables secure, environment-driven account provisioning without committing plain-text passwords.

### `backend/core/views/admin_page_views.py`
- **Location**: Line 172
- **Change**: Updated `_build_personal_guide_text` to dynamically resolve `PANEL_URL` or `SITE_URL` from settings instead of hardcoding `https://panel.adarshbhopal.in/`.
- **Why Safe**: Ensures personal guide download reflects the actual tenant domain where Pro Panel is deployed.

### `backend/core/views/banners_api.py`
- **Location**: Lines 8–105
- **Change**: Replaced hardcoded `https://cardflow.in/*` target URLs with dynamically resolved URLs using `CATALOG_WEBSITE_URL` or `SITE_URL`.
- **Why Safe**: Allows production deployments to point banner links to their own store, catalog, or relative path.

### `backend/mobile_api/views.py`
- **Location**: Lines 5231–5236
- **Change**: Prioritized `os.getenv('LANDING_WEBSITE_URL')` for resolving the public media and website URL before falling back to domain matching.
- **Why Safe**: Guarantees that any custom landing website domain set in production `.env` is immediately honored.

### `frontend/src/components/saas/TenantDetailsDrawer.jsx`
- **Location**: Lines 1330–1365
- **Change**: Replaced hardcoded `https://{subscription.slug}.cardflow.io` with dynamic URL resolution using `import.meta.env.VITE_TENANT_BASE_DOMAIN || window.location.host`.
- **Why Safe**: Allows multi-tenant subdomain previews to reflect the current deployment host or configured tenant domain.

### `frontend/.env.example`
- **Action**: Added documentation for `VITE_TENANT_BASE_DOMAIN` and updated the production API endpoint example.

---

## 6. PostgreSQL Migration Harmonization & VPS Schema Alignment

### `backend/core/migrations/0103_initial_domain_models.py`
- **Location**: Line 15 and lines 50–57
- **Change**:
  - Changed `user_id integer` to `user_id bigint NULL REFERENCES core_user(id)` to match the `bigint` type of `core_user.id`.
  - Changed `client_id integer` to `client_id bigint NULL REFERENCES core_client(id) ON DELETE CASCADE`.
  - Removed redundant attempt to add unused `organisation_id` column.
- **Why Safe**: Eliminates PostgreSQL type mismatch errors between `core_client.user_id` and `core_user.id`.

### `backend/tables/migrations/0001_initial_domain_models.py`
- **Location**: Lines 7–85
- **Change**:
  - Raw DDL for `core_idcardtable` now creates `client_id bigint NOT NULL REFERENCES core_client(id) ON DELETE CASCADE` without introducing an unused `organisation_id` relationship column.
  - Aligned model state definition for `deleted_by_manager` by adding `db_column='deleted_by_client'`, harmonizing Django state with the physical database column.
  - For existing databases, added idempotent type widening (`ALTER COLUMN client_id TYPE bigint`) and foreign key constraint creation (`core_idcardtable_client_id_fk_core_client_id`) on PostgreSQL.
- **Why Safe**: Matches Django model relationships exactly while providing safe forward migration on existing databases without dropping tables or columns.

### `backend/core/migrations/0110_add_client_id_to_idcardtable.py`
- **Location**: Lines 10–55
- **Change**:
  - Corrected integer/bigint mismatch by altering `client_id` to `bigint` on PostgreSQL if it was integer.
  - Ensured idempotent foreign key constraint creation to `core_client(id) ON DELETE CASCADE`.
  - Removed addition of unused `organisation_id` column.
- **Why Safe**: Fully eliminates conflicts with `tables.0001` and guarantees final DB schema and Django migration state agreement.

### `backend/core/migrations/0108_add_org_role_to_organisation.py`
- **Status**: Retained idempotent column existence check (`if 'org_role' not in cols:`) using `SeparateDatabaseAndState` with `atomic=False`.



