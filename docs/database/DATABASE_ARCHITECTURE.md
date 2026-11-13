# Pro-Panel Database Architecture Specification (`DATABASE_ARCHITECTURE.md`)

> [!IMPORTANT]
> This document is the authoritative engineering specification for the rebuilt **Pro-Panel** database architecture and Django ORM layer. Every model, table name, column name, foreign key, index, constraint, and backward-compatibility adapter is documented here.

---

## 1. Executive Summary & Architectural Principles

The Pro-Panel database schema and Django migration history were rebuilt from the ground up to permanently eliminate historical migration conflicts, circular cross-app dependencies, `SeparateDatabaseAndState` workarounds, legacy table/column naming mismatches, and 32-bit vs. 64-bit integer inconsistencies.

### Core Architectural Principles

1. **Canonical Domain Ownership (`app_label` Alignment)**:
   - Every Django model resides in and declares the `app_label` of its owning domain app.
   - Removed cross-app `app_label = 'core'` overrides on `Organisation` (now `organisation.Organisation`) and `ReprintRequest` (now `reprint.ReprintRequest`).
2. **Standardized Physical Table Naming (`<app_label>_<model>`)**:
   - Every domain table follows clean, predictable naming aligned with its app:
     - `organisation_organisation` (formerly `core_client`)
     - `organisation_manager` (formerly `organisation_manager`)
     - `tables_table` (formerly `core_idcardtable`)
     - `tables_idcard` (formerly `core_idcard`)
     - `reprint_reprintrequest` (formerly `core_reprintrequest`)
     - `operations_operation`, `operations_operationchange`, `operations_bulktransaction`, `operations_auditevent` (formerly `operations_log`, `operations_change`, `operations_bulk_transaction`, `operations_audit_event`)
     - `assistants_assistant`, `operators_operator`, `mediafiles_cardmedia`
   - `core.User` retains `AUTH_USER_MODEL = 'core.User'` (`core_user`) as the central identity root.
3. **Zero Legacy `db_column` Overrides**:
   - All legacy `db_column` overrides (`client_id`, `deleted_by_client`, `client_type`, `perm_idcard_client_list`, `perm_manage_client_staff`) have been removed so physical PostgreSQL column names match canonical Django field names (`organisation_id`, `deleted_by_manager`, `org_type`, `perm_organisation_list`, `perm_manage_assistants`) 1-to-1.
   - Full Python-level backward compatibility is preserved via `@property` getters/setters, `__init__` keyword translation, and `save(update_fields=...)` normalization.
4. **64-Bit Primary Key & Generic Target ID Consistency**:
   - All models use `BigAutoField` (`bigint` in PostgreSQL) for integer primary keys (except `BackgroundTask` and `BackupTask`, which use `UUIDField`).
   - All generic target ID columns (`ActivityLog.target_id`, `OperationChange.target_id`, `AuditEvent.target_id`) use 64-bit `BigIntegerField` / `PositiveBigIntegerField` to prevent 32-bit integer overflow when referencing `BigAutoField` rows.
5. **Validated Referential Integrity & Indexing**:
   - Every ForeignKey and OneToOneField is backed by a validated PostgreSQL foreign-key constraint (`convalidated = true`) with explicit `on_delete` semantics (`CASCADE` for owned child entities, `SET_NULL` for audit/actor references).
   - Redundant single-column indexes duplicating `unique=True` or composite index prefixes have been removed; PostgreSQL JSONB queries on `tables_idcard.field_data` are accelerated by the `idcard_field_data_gin` GIN index.

---

## 2. Root Cause Analysis of Legacy Schema & Migration Failures

Before this rebuild, the repository contained **182 migration files** across 14 apps with repeated deployment failures. Our Phase A investigation identified five root causes:

| # | Root Cause | Impact in Legacy System | Architectural Resolution |
|---|---|---|---|
| 1 | **Cross-App `app_label = 'core'` Overrides** | `Organisation` (in `organisation/models.py`) and `ReprintRequest` (in `reprint/models.py`) declared `app_label = 'core'`. Consequently, `core` migrations depended on `tables`, `assistants`, `mediafiles`, and `operators`, while those apps depended on `core`. | Assigned `app_label = 'organisation'` to `Organisation` and `app_label = 'reprint'` to `ReprintRequest`. The migration dependency graph is now a strict, acyclic DAG. |
| 2 | **`SeparateDatabaseAndState` State-Only Moves** | 11 migrations (`core.0103`, `0104`, `0108`, `0109`, `0115`, `tables.0001`–`0005`, `assistants.0004`, `mediafiles.0007`) mutated Django state without matching DDL or used raw conditional SQL, causing schema drift between fresh and upgraded databases. | Replaced all 182 historical migrations with deterministic `0001_initial` / `0002_initial` migrations containing zero `SeparateDatabaseAndState` hacks. |
| 3 | **Overlapping Column Migrations (`client_id` vs `organisation_id`)** | `core.0103`, `tables.0001`, and `core.0110` all attempted to create, widen (`integer` -> `bigint`), or add FKs on `core_idcardtable.client_id`, while `dashboard_views.py` ran raw SQL `COALESCE(t.organisation_id, t.client_id)`. | Standardized on `tables_table.organisation_id` (`bigint NOT NULL` FK to `organisation_organisation.id`) and replaced raw SQL in `dashboard_views.py` with Django ORM `.annotate(Count(...))`. |
| 4 | **32-Bit Generic `target_id` Columns** | `ActivityLog.target_id` (`PositiveIntegerField`), `OperationChange.target_id` (`IntegerField`), and `AuditEvent.target_id` (`IntegerField`) were 32-bit `integer` columns while all target tables used 64-bit `BigAutoField` PKs. | Widened `ActivityLog.target_id` to `PositiveBigIntegerField` and `OperationChange.target_id` / `AuditEvent.target_id` to `BigIntegerField`. |
| 5 | **Duplicate Single-Column Indexes** | `DesktopAppDevice`, `CardMedia`, `ReprintRequest`, `Organisation`, and `SystemMetricSnapshot` declared both `db_index=True` (or `unique=True`) and identical single-column `Meta.indexes`. | Removed all redundant duplicate indexes while preserving all composite and query-path indexes. |

---

## 3. Complete Model & Table Inventory (18-Point Specification)

### 3.1 Summary of All 38 Concrete Application Models (+ 5 M2M Tables)

| # | Django App | Model Name | Physical Table (`db_table`) | Primary Key | Tenant / Owner Scope |
|---|---|---|---|---|---|
| 1 | `core` | `User` | `core_user` | `id` (`BigAutoField`) | Global / `subscription_id` (`SET_NULL`) |
| 2 | `core` | `SystemSettings` | `core_systemsettings` | `id` (`BigAutoField`) | Global singleton settings |
| 3 | `core` | `ExportTemplate` | `core_exporttemplate` | `id` (`BigAutoField`) | Global export templates |
| 4 | `core` | `ActivityLog` | `core_activitylog` | `id` (`BigAutoField`) | Actor (`user_id`, `SET_NULL`) |
| 5 | `core` | `EmailLog` | `core_emaillog` | `id` (`BigAutoField`) | Global email audit log |
| 6 | `core` | `BackgroundTask` | `core_backgroundtask` | `id` (`UUIDField`) | User (`user_id`, `CASCADE`) |
| 7 | `core` | `BackupTask` | `core_backuptask` | `id` (`UUIDField`) | Actor (`created_by_id`, `SET_NULL`) |
| 8 | `core` | `Notification` | `core_notification` | `id` (`BigAutoField`) | Global / targeted (`created_by_id`, `SET_NULL`) |
| 9 | `core` | `NotificationRead` | `core_notificationread` | `id` (`BigAutoField`) | `notification_id` + `user_id` (`CASCADE`) |
| 10 | `core` | `ClientMessage` | `core_clientmessage` | `id` (`BigAutoField`) | `client_id` -> `organisation_organisation` (`CASCADE`) |
| 11 | `core` | `ClientPresenceSession` | `core_clientpresencesession` | `id` (`BigAutoField`) | `client_id` -> `organisation_organisation` (`CASCADE`) |
| 12 | `core` | `Photographer` | `core_photographer` | `id` (`BigAutoField`) | OneToOne `user_id` (`CASCADE`) |
| 13 | `core` | `PhotographerAssignment` | `core_photographerassignment` | `id` (`BigAutoField`) | `photographer_id` + `client_id` (`CASCADE`) |
| 14 | `core` | `SystemMetricSnapshot` | `core_systemmetricsnapshot` | `id` (`BigAutoField`) | Global telemetry time-series |
| 15 | `accounts` | `UserDeviceSession` | `accounts_userdevicesession` | `id` (`BigAutoField`) | `user_id` (`CASCADE`) |
| 16 | `accounts` | `UserSecurityPin` | `accounts_usersecuritypin` | `id` (`BigAutoField`) | OneToOne `user_id` (`CASCADE`) |
| 17 | `saas` | `SaaSSubscription` | `saas_saassubscription` | `id` (`BigAutoField`) | Root SaaS tenant subscription |
| 18 | `saas` | `SaaSCardTopupRequest` | `saas_saascardtopuprequest` | `id` (`BigAutoField`) | `subscription_id` (`CASCADE`) |
| 19 | `saas` | `SaaSAddonRequest` | `saas_saasaddonrequest` | `id` (`BigAutoField`) | `subscription_id` (`CASCADE`) |
| 20 | `saas` | `SaaSPayment` | `saas_saaspayment` | `id` (`BigAutoField`) | `subscription_id` (`CASCADE`) |
| 21 | `saas` | `SaaSLead` | `saas_saaslead` | `id` (`BigAutoField`) | `converted_subscription_id` (`SET_NULL`) |
| 22 | `saas` | `SaaSTierFeature` | `saas_saastierfeature` | `id` (`BigAutoField`) | Global tier catalog (`tier` unique) |
| 23 | `saas` | `SaaSPlatformLog` | `saas_saasplatformlog` | `id` (`BigAutoField`) | `subscription_id` (`SET_NULL`) |
| 24 | `organisation` | `Organisation` | `organisation_organisation` | `id` (`BigAutoField`) | `subscription_id` (`SET_NULL`), `owner_id` (`SET_NULL`) |
| 25 | `organisation` | `OrganisationManager` | `organisation_manager` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), OneToOne `user_id` (`CASCADE`) |
| 26 | `assistants` | `Assistant` | `assistants_assistant` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), OneToOne `user_id` (`CASCADE`) |
| 27 | `operators` | `Operator` | `operators_operator` | `id` (`BigAutoField`) | OneToOne `user_id` (`CASCADE`) + M2M `assigned_organisations` |
| 28 | `tables` | `Table` | `tables_table` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`, `NOT NULL`) |
| 29 | `tables` | `IDCard` | `tables_idcard` | `id` (`BigAutoField`) | `table_id` (`CASCADE`, `NOT NULL`) |
| 30 | `tables` | `TableAccess` | `tables_tableaccess` | `id` (`BigAutoField`) | `table_id` + `manager_id` (`CASCADE`) |
| 31 | `tables` | `CollectionCampaign` | `tables_collectioncampaign` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), `table_id` (`SET_NULL`) |
| 32 | `tables` | `TablePhotoCollectionLink` | `tables_photocollectionlink` | `id` (`BigAutoField`) | OneToOne `table_id` (`CASCADE`) |
| 33 | `tables` | `DataCollectionRecord` | `tables_datacollectionrecord` | `id` (`BigAutoField`) | `table_id` (`CASCADE`), `campaign_id` (`CASCADE`) |
| 34 | `tables` | `DataCollectionEvent` | `tables_datacollectionevent` | `id` (`BigAutoField`) | `record_id` (`CASCADE`) |
| 35 | `tables` | `TableFreeze` | `tables_tablefreeze` | `id` (`BigAutoField`) | `table_id` (`CASCADE`) |
| 36 | `mediafiles` | `CardMedia` | `mediafiles_cardmedia` | `id` (`BigAutoField`) | OneToOne `card_id` (`CASCADE`), `client_id` (`CASCADE`) |
| 37 | `reprint` | `ReprintRequest` | `reprint_reprintrequest` | `id` (`BigAutoField`) | `card_id` (`CASCADE`), `table_id` (`CASCADE`) |
| 38 | `operations` | `Operation` | `operations_operation` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), `target_table_id` (`SET_NULL`) |
| 39 | `operations` | `OperationChange` | `operations_operationchange` | `id` (`BigAutoField`) | `operation_id` (`CASCADE`) |
| 40 | `operations` | `BulkTransaction` | `operations_bulktransaction` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), `table_id` (`SET_NULL`) |
| 41 | `operations` | `AuditEvent` | `operations_auditevent` | `id` (`BigAutoField`) | `organisation_id` (`CASCADE`), `bulk_transaction_id` (`SET_NULL`) |
| 42 | `mobile_api` | `MobileDeviceToken` | `mobile_device_tokens` | `id` (`BigAutoField`) | `user_id` (`CASCADE`) |
| 43 | `desktop_app` | `DesktopAppDevice` | `desktop_app_desktopappdevice` | `id` (`BigAutoField`) | `user_id` (`CASCADE`), `revoked_by_id` (`SET_NULL`) |
| 44 | `stats` | `StatsSnapshot` | `stats_statssnapshot` | `id` (`BigAutoField`) | Global daily statistics (`date` unique) |
| 45 | `stats` | `ServerLoadAlert` | `stats_serverloadalert` | `id` (`BigAutoField`) | Global server load alert log |

### 3.2 Auto-Created Many-to-Many Join Tables

| Join Table (`db_table`) | Source Model & Field | Source FK Column | Target FK Column |
|---|---|---|---|
| `core_user_groups` | `core.User.groups` | `user_id` -> `core_user.id` | `group_id` -> `auth_group.id` |
| `core_user_user_permissions` | `core.User.user_permissions` | `user_id` -> `core_user.id` | `permission_id` -> `auth_permission.id` |
| `core_notification_target_users` | `core.Notification.target_users` | `notification_id` -> `core_notification.id` | `user_id` -> `core_user.id` |
| `assistants_assistant_assigned_groups` | `assistants.Assistant.assigned_groups` | `assistant_id` -> `assistants_assistant.id` | `table_id` -> `tables_table.id` |
| `operators_operator_assigned_organisations` | `operators.Operator.assigned_organisations` | `operator_id` -> `operators_operator.id` | `organisation_id` -> `organisation_organisation.id` |

---

## 4. Detailed Domain Specifications

### 4.1 Organisation & Manager Domain (`organisation`)
- **`Organisation` (`organisation_organisation`)**:
  - **Primary Key**: `id` (`bigint NOT NULL`).
  - **Unique Fields**: `code_number` (`varchar(20)`), `user_id` (`bigint NULL`, OneToOne to `core_user`).
  - **Foreign Keys**:
    - `user_id` -> `core_user.id` (`ON DELETE CASCADE`, `null=True`)
    - `owner_id` -> `core_user.id` (`ON DELETE SET NULL`, `null=True`)
    - `subscription_id` -> `saas_saassubscription.id` (`ON DELETE SET NULL`, `null=True`)
  - **Indexes**: `org_status_created_desc_idx` (`status`, `-created_at`), `org_created_at_idx` (`created_at`), `org_sub_status_idx` (`subscription`, `status`), `org_sub_time_idx` (`subscription`, `-created_at`), `org_owner_status_idx` (`owner`, `status`).
  - **Backward Compatibility**: `client_type` property aliases `org_type`; `perm_idcard_client_list` property aliases `perm_organisation_list`; `core.models.Client` aliases `Organisation`.

- **`OrganisationManager` (`organisation_manager`)**:
  - **Primary Key**: `id` (`bigint NOT NULL`).
  - **Foreign Keys**:
    - `organisation_id` -> `organisation_organisation.id` (`ON DELETE CASCADE`, `NOT NULL`)
    - `user_id` -> `core_user.id` (`ON DELETE CASCADE`, `UNIQUE`, `NOT NULL`)
  - **Indexes**: `organisatio_organis_a48fdb_idx` (`organisation`, `manager_type`), `organisatio_manager_4ca438_idx` (`manager_type`, `is_active`), `orgmgr_org_act_idx` (`organisation`, `is_active`), `orgmgr_org_typ_act_idx` (`organisation`, `manager_type`, `is_active`).
  - **Backward Compatibility**: `client` and `client_id` properties and `__init__` kwargs alias `organisation` and `organisation_id`.

### 4.2 Tables, ID Cards & Public Collection Domain (`tables`)
- **`Table` (`tables_table`)**:
  - **Primary Key**: `id` (`bigint NOT NULL`).
  - **Foreign Keys**:
    - `organisation_id` -> `organisation_organisation.id` (`ON DELETE CASCADE`, `NOT NULL`).
  - **Columns**: `name` (`varchar(100)`), `fields` (`jsonb`), `is_active` (`boolean`), `deleted_by_manager` (`boolean`), `deleted_at` (`timestamptz NULL`), `public_LINK_enabled` (`boolean`), `created_at`, `updated_at`.
  - **Indexes**: `tbl_org_active_idx` (`organisation`, `is_active`), `tbl_is_active_idx` (`is_active`), `tbl_created_at_idx` (`created_at`), `tbl_org_del_act_idx` (`organisation`, `deleted_by_manager`, `is_active`), `tbl_del_act_idx` (`deleted_by_manager`, `is_active`).
  - **Backward Compatibility**: `client`, `client_id`, and `deleted_by_client` properties and `__init__`/`save(update_fields)` adapters map cleanly to `organisation`, `organisation_id`, and `deleted_by_manager`.

- **`IDCard` (`tables_idcard`)**:
  - **Primary Key**: `id` (`bigint NOT NULL`).
  - **Foreign Keys**:
    - `table_id` -> `tables_table.id` (`ON DELETE CASCADE`, `NOT NULL`).
  - **Indexes**:
    - Composite B-Tree indexes for keyset pagination and status filtering: `tbl_status_id_desc`, `tbl_st_chg_id_idx`, `tbl_st_dld_id_idx`, `tbl_st_del_id_idx`, `tables_idca_table_i_6bbdc1_idx`, `tables_idca_status_cd73b4_idx`, `tables_idca_table_i_6d11fc_idx`.
    - PostgreSQL GIN index: `idcard_field_data_gin` on `field_data` (`USING GIN ("field_data")`).
  - **Backward Compatibility**: `group` and `group_id` properties and `__init__` kwargs map to `table` and `table_id`.

- **`DataCollectionRecord` (`tables_datacollectionrecord`)**:
  - **Unique Constraints**:
    - `unique_table_idempotency_key` on `(table, idempotency_key)` where both are `NOT NULL`.
    - `unique_campaign_idempotency_key` on `(campaign, idempotency_key)` where both are `NOT NULL`.

- **`TableAccess` (`tables_tableaccess`) & `TableFreeze` (`tables_tablefreeze`)**:
  - `unique_table_manager_access` on `(table, manager)`.
  - `unique_table_status_freeze` on `(table, status)`.

### 4.3 Operations, Bulk Transactions & Audit Events (`operations`)
- **`Operation` (`operations_operation`)**: Tracks undoable/redoable user operations scoped to `organisation_id` (`CASCADE`) and `target_table_id` (`SET_NULL`).
- **`OperationChange` (`operations_operationchange`)**: Stores field-level before/after snapshots per `Operation` with 64-bit `target_id` (`BigIntegerField`).
- **`BulkTransaction` (`operations_bulktransaction`)**: Groups bulk card mutations for single-click undo with `organisation_id` (`CASCADE`) and `table_id` (`SET_NULL`).
- **`AuditEvent` (`operations_auditevent`)**: Immutable audit trail with 64-bit `target_id` (`BigIntegerField`), `organisation_id` (`CASCADE`), and `bulk_transaction_id` (`SET_NULL`).

---

## 5. Multi-Tenant Isolation Architecture

1. **Subscription-Level Isolation (`SaaSSubscription`)**:
   - Every `Organisation` and client `User` links to a `SaaSSubscription` (`subscription_id`).
   - Card creation and approval workflows check subscription quota and active status via `SubscriptionService`.
2. **Organisation-Level Isolation (`Organisation`)**:
   - All operational entities (`Table`, `IDCard`, `OrganisationManager`, `Assistant`, `CardMedia`, `CollectionCampaign`, `Operation`, `BulkTransaction`, `AuditEvent`, `ClientMessage`, `ClientPresenceSession`, `PhotographerAssignment`) are strictly scoped to an `Organisation`.
   - `PermissionService` verifies that managers (`OrganisationManager`), assistants (`Assistant`), photographers (`PhotographerAssignment`), and operators (`Operator.assigned_organisations`) can only query or mutate records belonging to their authorized `organisation_id`s.
3. **Table-Level Isolation (`TableAccess` & `Assistant.assigned_groups`)**:
   - Sub-managers and assistants can be further restricted to specific `Table` instances within their `Organisation`.

