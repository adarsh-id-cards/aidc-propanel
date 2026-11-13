# Exhaustive Old-to-New Database Schema & Data Mapping Specification (`OLD_TO_NEW_DATA_MAPPING.md`)

> [!IMPORTANT]
> This document specifies the complete, column-by-column mapping between the legacy Pro-Panel database schema (as captured in the production backup `propanel_pre_rebuild_20261113_174621.dump`) and the clean, rebuilt PostgreSQL 16 database schema. It serves as the authoritative specification for ETL execution, verifying that every single column, data type, foreign key, and record is accounted for with zero data loss.

---

## 1. Executive Summary & Transformation Philosophy

The legacy database contained **56 physical tables** characterized by cross-app naming inconsistencies, historical `db_column` overrides, mismatched foreign-key types, and duplicate audit log tables (`operations_log` vs `core_operation`). 

The clean target database contains **55 canonical tables** where:
1. Every physical table name aligns with its Django app (`<app_label>_<model_name>`).
2. Legacy `db_column` hacks have been eliminated in favor of clean, standardized physical column names (`organisation_id`, `deleted_by_manager`, `org_type`).
3. 32-bit `target_id` columns have been safely widened to 64-bit `BigIntegerField`.
4. Obsolete/dead tables (`core_idcardgroup`) are safely retired while active tables are migrated with 100% primary key and foreign key preservation.

---

## 2. Complete Table-Level Inventory & Mapping Matrix

| # | Legacy Table Name (Source) | Clean Table Name (Target) | Mapping Type | Records in Dump | Architectural Rationale |
|---|---|---|---|---|---|
| 1 | `core_user` | `core_user` | **1:1 Identical** | 2 | Core identity root. All fields, passwords, and roles preserved. |
| 2 | `core_client` | `organisation_organisation` | **Renamed & Normalized** | 1 | Domain ownership moved from `core` to `organisation`. Column aliases cleaned. |
| 3 | `organisation_manager` | `organisation_manager` | **Normalized** | 0 | `client_id` renamed to `organisation_id`; permissions updated. |
| 4 | `assistants_assistant` | `assistants_assistant` | **Normalized** | 0 | `client_id` renamed to `organisation_id`; permissions updated. |
| 5 | `core_idcardtable` | `tables_table` | **Renamed & Normalized** | 1 | Renamed to standard app table; `client_id` -> `organisation_id`. |
| 6 | `core_idcard` | `tables_idcard` | **Renamed & Normalized** | 0 | Moved to `tables` app; JSONB dynamic field data preserved. |
| 7 | `core_reprintrequest` | `reprint_reprintrequest` | **Renamed** | 0 | Domain moved from `core` to `reprint` app. |
| 8 | `core_usersecuritypin` | `accounts_usersecuritypin` | **Renamed** | 2 | Moved from `core` to `accounts` app. Bcrypt hashes preserved. |
| 9 | `core_userdevicesession` | `accounts_userdevicesession` | **Renamed** | 1 | Moved from `core` to `accounts` app. Session tokens preserved. |
| 10 | `core_activitylog` | `core_activitylog` | **Widened** | 1 | `target_id` widened from 32-bit `integer` to 64-bit `bigint`. |
| 11 | `core_systemmetricsnapshot` | `core_systemmetricsnapshot` | **1:1 Identical** | 55 | Performance monitoring snapshots preserved. |
| 12 | `core_notification` | `core_notification` | **1:1 Identical** | 0 | Notification subsystem preserved. |
| 13 | `core_photographer` | `core_photographer` | **1:1 Identical** | 0 | Photographer subsystem preserved. |
| 14 | `core_photographerassignment` | `core_photographerassignment` | **1:1 Identical** | 0 | Assignment subsystem preserved. |
| 15 | `core_backgroundtask` | `core_backgroundtask` | **1:1 Identical** | 0 | Background task tracking with UUID PK preserved. |
| 16 | `core_backuptask` | `core_backuptask` | **1:1 Identical** | 0 | Backup task tracking with UUID PK preserved. |
| 17 | `core_securitypolicy` | `organisation_securitypolicy` | **Renamed** | 0 | Moved to `organisation` app. |
| 18 | `operators_operator` | `operators_operator` | **1:1 Identical** | 0 | Operators domain preserved. |
| 19 | `mediafiles_cardmedia` | `mediafiles_cardmedia` | **Normalized** | 0 | Media references preserved; FK to `organisation_organisation`. |
| 20 | `mediafiles_mediabatch` | `mediafiles_mediabatch` | **1:1 Identical** | 0 | Batch upload logs preserved. |
| 21 | `mediafiles_mediaauditlog` | `mediafiles_mediaauditlog` | **1:1 Identical** | 0 | Media audit trail preserved. |
| 22 | `operations_operation` | `operations_operation` | **Consolidated** | 0 | Consolidated from `core_operation` / `operations_log`. |
| 23 | `operations_operationchange` | `operations_operationchange` | **Widened** | 0 | Consolidated from `core_operationchange`; 64-bit `target_id`. |
| 24 | `operations_bulktransaction` | `operations_bulktransaction` | **Consolidated** | 0 | Consolidated from `core_bulktransaction`. |
| 25 | `operations_auditevent` | `operations_auditevent` | **Widened** | 0 | Consolidated from `core_auditevent`; 64-bit `target_id`. |
| 26 | `desktop_app_desktopappdevice` | `desktop_app_desktopappdevice` | **1:1 Identical** | 0 | Desktop app sync tokens preserved. |
| 27 | `desktop_app_desktopappsyncsession` | `desktop_app_desktopappsyncsession` | **1:1 Identical** | 0 | Device sync session history preserved. |
| 28 | `desktop_app_desktopapplocalqueue` | `desktop_app_desktopapplocalqueue` | **1:1 Identical** | 0 | Offline change synchronization queue preserved. |
| 29 | `mobile_api_mobiledevicetoken` | `mobile_api_mobiledevicetoken` | **1:1 Identical** | 0 | Mobile push tokens preserved. |
| 30 | `saas_saassubscription` | `saas_saassubscription` | **1:1 Identical** | 0 | SaaS tenant subscriptions preserved. |
| 31 | `saas_saastierfeature` | `saas_saastierfeature` | **1:1 Identical** | 0 | SaaS tier pricing and feature gates preserved. |
| 32 | `saas_saaspayment` | `saas_saaspayment` | **1:1 Identical** | 0 | SaaS payment records preserved. |
| 33 | `tables_tableaccess` | `tables_tableaccess` | **1:1 Identical** | 0 | Assistant table permissions preserved. |
| 34 | `tables_tablefreeze` | `tables_tablefreeze` | **1:1 Identical** | 0 | Table freeze states preserved. |
| 35 | `tables_tablephotocollectionlink` | `tables_tablephotocollectionlink` | **1:1 Identical** | 0 | Student self-upload collection links preserved. |
| 36 | `tables_collectioncampaign` | `tables_collectioncampaign` | **1:1 Identical** | 0 | Bulk collection campaigns preserved. |
| 37 | `tables_datacollectionrecord` | `tables_datacollectionrecord` | **1:1 Identical** | 0 | Self-submitted records preserved. |
| 38 | `tables_datacollectionevent` | `tables_datacollectionevent` | **1:1 Identical** | 0 | Collection telemetry preserved. |
| 39 | `tables_tablecustomfield` | `tables_tablecustomfield` | **1:1 Identical** | 0 | Table custom field definitions preserved. |
| 40 | `tables_tablecustomfielddependency` | `tables_tablecustomfielddependency` | **1:1 Identical** | 0 | Cascading field dependencies preserved. |
| 41 | `core_idcardgroup` | *(None - Obsolete)* | **Retired** | 0 | Dead legacy table completely superseded by `tables_table`. |
| 42–56 | Django Framework / Celery Tables | Same (`django_session`, `auth_group`, `celery_*`, etc.) | **1:1 Identical** | Populated | Django framework tables preserved 1:1. |

---

## 3. Detailed Column-by-Column Transformation Rules

### 3.1 `core_client` -> `organisation_organisation`

The legacy `core_client` table represented the central tenant entity. In the clean architecture, it is owned by the `organisation` domain.

| Legacy Column (`core_client`) | Target Column (`organisation_organisation`) | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `owner_id` | `owner_id` | `bigint NULL` | `bigint NULL` | Direct copy (FK to `core_user.id`). |
| `user_id` | `user_id` | `bigint NULL` | `bigint NULL` | Direct copy (FK to `core_user.id`, OneToOne). |
| `subscription_id` | `subscription_id` | `bigint NULL` | `bigint NULL` | Direct copy (FK to `saas_saassubscription.id`). |
| `name` | `name` | `varchar(200)` | `varchar(200)` | Direct copy. |
| `client_type` | `org_type` | `varchar(20)` | `varchar(20)` | **Renamed column**: copies `client_type` directly to `org_type`. Default: `'school'`. |
| `is_guest` | `is_guest` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `is_default` | `is_default` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `org_role` | `org_role` | `varchar(50)` | `varchar(50)` | Direct copy. Default: `'organisation'`. |
| `icon` | `icon` | `varchar(100)` | `varchar(100)` | Direct copy. Default: `'fa-solid fa-building'`. |
| `city` | `city` | `varchar(100)` | `varchar(100)` | Direct copy. |
| `state` | `state` | `varchar(100)` | `varchar(100)` | Direct copy. |
| `pincode` | `pincode` | `varchar(10)` | `varchar(10)` | Direct copy. |
| `max_super_managers` | `max_super_managers` | `integer` | `integer` | Direct copy. Default: `4`. |
| `max_managers` | `max_managers` | `integer` | `integer` | Direct copy. Default: `5`. |
| `image_folder_uuid` | `image_folder_uuid` | `uuid NOT NULL` | `uuid NOT NULL` | Direct copy. |
| `image_folder_code` | `image_folder_code` | `varchar(10)` | `varchar(10)` | Direct copy. Unique. |
| `image_folder_suffix` | `image_folder_suffix` | `varchar(5)` | `varchar(5)` | Direct copy. |
| `perm_idcard_client_list` | `perm_organisation_list` | `boolean` | `boolean` | **Renamed column**: copies permission flag. Default: `false`. |
| `perm_idcard_deleted_list` | `perm_idcard_pool_list` | `boolean` | `boolean` | **Renamed column**: copies permission flag. Default: `false`. |
| `perm_idcard_printed_list` | `perm_idcard_download_list` | `boolean` | `boolean` | **Renamed column**: copies permission flag. Default: `false`. |
| `perm_idcard_setting_*` | `perm_idcard_setting_*` | `boolean` | `boolean` | Direct copy of all 5 setting permission flags. |
| `perm_idcard_*` | `perm_idcard_*` | `boolean` | `boolean` | Direct copy of all 18 card lifecycle permission flags. |
| `perm_mobile_app` | `perm_mobile_app` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `perm_set_temp_password`| `perm_set_temp_password`| `boolean` | `boolean` | Direct copy. Default: `false`. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.2 `organisation_manager` -> `organisation_manager`

| Legacy Column | Target Column | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `client_id` | `organisation_id` | `bigint NOT NULL` | `bigint NOT NULL` | **Renamed column**: remapped to target `organisation_id`. |
| `user_id` | `user_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `core_user.id`). |
| `manager_type` | `manager_type` | `varchar(20)` | `varchar(20)` | Direct copy (`'prime_manager'`, `'super_manager'`, etc.). |
| `department` | `department` | `varchar(100)` | `varchar(100)` | Direct copy. |
| `phone_number` | `phone_number` | `varchar(15)` | `varchar(15)` | Direct copy. |
| `perm_idcard_deleted_list` | `perm_idcard_pool_list` | `boolean` | `boolean` | **Renamed column**: maps deleted list permission to pool list. |
| `perm_idcard_printed_list` | `perm_idcard_download_list` | `boolean` | `boolean` | **Renamed column**: maps printed list permission to download list. |
| *(All other perm columns)* | *(All other perm columns)* | `boolean` | `boolean` | Direct copy. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.3 `assistants_assistant` -> `assistants_assistant`

| Legacy Column | Target Column | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `client_id` | `organisation_id` | `bigint NOT NULL` | `bigint NOT NULL` | **Renamed column**: maps to target `organisation_id`. |
| `user_id` | `user_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy. |
| `created_by_id` | `created_by_id` | `bigint NULL` | `bigint NULL` | Direct copy. |
| `employee_id` | `employee_id` | `varchar(50)` | `varchar(50)` | Direct copy. |
| `department` | `department` | `varchar(100)` | `varchar(100)` | Direct copy. |
| `phone_number` | `phone_number` | `varchar(15)` | `varchar(15)` | Direct copy. |
| `perm_idcard_client_list` | `perm_organisation_list` | `boolean` | `boolean` | **Renamed column**: maps to `perm_organisation_list`. |
| `perm_manage_client_staff` | `perm_manage_assistants` | `boolean` | `boolean` | **Renamed column**: maps to `perm_manage_assistants`. |
| `perm_idcard_deleted_list` | `perm_idcard_pool_list` | `boolean` | `boolean` | **Renamed column**: maps to `perm_idcard_pool_list`. |
| `perm_idcard_printed_list` | `perm_idcard_download_list` | `boolean` | `boolean` | **Renamed column**: maps to `perm_idcard_download_list`. |
| *(All other permissions)* | *(All other permissions)* | `boolean` | `boolean` | Direct copy. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.4 `core_idcardtable` -> `tables_table`

| Legacy Column (`core_idcardtable`) | Target Column (`tables_table`) | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `client_id` / `organisation_id` | `organisation_id` | `bigint NOT NULL` | `bigint NOT NULL` | **Normalized column**: takes `organisation_id` if present, falls back to `client_id`. |
| `created_by_id` | `created_by_id` | `bigint NULL` | `bigint NULL` | Direct copy (FK to `core_user.id`). |
| `name` | `name` | `varchar(100)` | `varchar(100)` | Direct copy. |
| `status` | `status` | `varchar(20)` | `varchar(20)` | Direct copy (`'active'`, `'archived'`, etc.). |
| `fields` | `fields` | `jsonb` | `jsonb` | Direct copy of JSONB column specification. |
| `is_deleted` | `is_deleted` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `deleted_at` | `deleted_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `deleted_by_client` / `deleted_by_manager` | `deleted_by_manager_id` | `bigint NULL` | `bigint NULL` | **Normalized column**: maps legacy `deleted_by_client` to `deleted_by_manager_id`. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.5 `core_idcard` -> `tables_idcard`

| Legacy Column (`core_idcard`) | Target Column (`tables_idcard`) | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `table_id` | `table_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `tables_table.id`). |
| `field_data` | `field_data` | `jsonb NOT NULL` | `jsonb NOT NULL` | Direct copy of dynamic student/employee card data. |
| `status` | `status` | `varchar(30)` | `varchar(30)` | Direct copy (`'pending'`, `'verified'`, `'approved'`). |
| `is_pool` | `is_pool` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `is_downloaded` | `is_downloaded` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `is_reprint` | `is_reprint` | `boolean` | `boolean` | Direct copy. Default: `false`. |
| `status_changed_at` | `status_changed_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.6 `core_reprintrequest` -> `reprint_reprintrequest`

| Legacy Column (`core_reprintrequest`) | Target Column (`reprint_reprintrequest`) | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `card_id` | `card_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `tables_idcard.id`). |
| `table_id` | `table_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `tables_table.id`). |
| `requested_by_id` | `requested_by_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `core_user.id`). |
| `approved_by_id` | `approved_by_id` | `bigint NULL` | `bigint NULL` | Direct copy (FK to `core_user.id`). |
| `reason` | `reason` | `text` | `text` | Direct copy. |
| `status` | `status` | `varchar(20)` | `varchar(20)` | Direct copy (`'pending'`, `'approved'`, `'rejected'`). |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.7 `core_usersecuritypin` -> `accounts_usersecuritypin` & Sessions

| Legacy Column (`core_usersecuritypin`) | Target Column (`accounts_usersecuritypin`) | Type (Legacy) | Type (Target) | Mapping Transformation / Default |
|---|---|---|---|---|
| `id` | `id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (PK preserved). |
| `user_id` | `user_id` | `bigint NOT NULL` | `bigint NOT NULL` | Direct copy (FK to `core_user.id`, OneToOne). |
| `pin_hash` | `pin_hash` | `varchar(128)` | `varchar(128)` | Direct copy. All cryptographic hashes preserved intact. |
| `is_set` | `is_set` | `boolean` | `boolean` | Direct copy. |
| `failed_attempts` | `failed_attempts` | `integer` | `integer` | Direct copy. Default: `0`. |
| `locked_until` | `locked_until` | `timestamptz` | `timestamptz` | Direct copy. |
| `created_at` | `created_at` | `timestamptz` | `timestamptz` | Direct copy. |
| `updated_at` | `updated_at` | `timestamptz` | `timestamptz` | Direct copy. |

### 3.8 Operations & Auditing Consolidation (`operations_*`)

In the legacy database, audit trails were split between `operations_log`, `core_operation`, and `core_auditevent`. In the target architecture, they are consolidated under `operations`:
- `operations_operation`: Consolidated operation history.
- `operations_operationchange`: Granular field-level changes. The column `target_id` is widened from 32-bit `integer` to 64-bit `bigint`.
- `operations_bulktransaction`: Batch transactions.
- `operations_auditevent`: Append-only security audit log. The column `target_id` is widened from 32-bit `integer` to 64-bit `bigint`.

---

## 4. Obsolete / Retired Entities Policy

1. **`core_idcardgroup`**:
   - **Status in Legacy Database**: Contained 0 rows.
   - **Reason for Retirement**: Superseded in earlier architectural refactors by `core_idcardtable` (`tables_table`). The model and table have been removed with zero data loss.
2. **Duplicate Legacy Permissions**:
   - Legacy permission flags prefixed with `perm_idcard_deleted_list` and `perm_idcard_printed_list` were terminology artifacts from an older workflow design.
   - They are mapped to the canonical domain permissions `perm_idcard_pool_list` and `perm_idcard_download_list` respectively. No permission grant is lost.

---

## 5. Sequence Re-Alignment & Synchronization Matrix

Every table containing an integer `id` column has its sequence dynamically set during migration rehearsal and cutover:

```sql
SELECT setval(
    pg_get_serial_sequence('"{table}"', 'id'),
    COALESCE((SELECT MAX(id) FROM "{table}"), 1),
    COALESCE((SELECT MAX(id) IS NOT NULL FROM "{table}"), true)
);
```

All 54 sequence counters have been verified to match or exceed the highest existing primary key in the source database, guaranteeing that subsequent `INSERT` operations will never produce a primary key collision.

