# Production-Safe Data Migration Plan & ETL Execution Specification (`DATA_MIGRATION_PLAN.md`)

> [!IMPORTANT]
> This document specifies the architectural design, dependency ordering, execution protocol, and verification safeguards for the Pro-Panel production data migration utility (`backend/scripts/migrate_legacy_data.py`). It governs the migration of all production data from the legacy schema to the clean PostgreSQL 16 schema with zero data loss and zero production downtime risk.

---

## 1. Executive Strategy & Migration Philosophy

Rather than attempting an in-place migration on the existing production database—which carries severe risks of schema corruption, aborted transactions, and dangling foreign keys—the migration strategy follows an **Out-of-Place Blue/Green ETL Architecture**:

```
+------------------------------------+          +------------------------------------+
|       SOURCE DATABASE (BLUE)       |          |       TARGET DATABASE (GREEN)      |
|         Legacy Schema 0110         |          |       Clean Architecture PG16      |
|    Read-Only Snapshot / Restore    |          |     Fresh 0001_initial Migrations  |
+-----------------+------------------+          +------------------+-----------------+
                  |                                                ^
                  | 1. Chunked Stream (Batches of 1,000)           | 3. Parameterized Batch Insert
                  v                                                |    (Foreign Keys Disabled Temporarily
         +--------+------------------------------------------------+--------+
         |      DATA MIGRATION UTILITY (migrate_legacy_data.py)             |
         |  - Topological Dependency Ordering (DAG)                        |
         |  - Column & Permission Renaming Pipeline                        |
         |  - 32-bit to 64-bit Expansion (target_id)                       |
         |  - JSONB Mogrification Normalization                            |
         |  - Primary Key & Timestamp Preservation                         |
         +------------------------------------------------------------------+
                                           |
                                           v 4. Post-Load Sequence Synchronization
                                           v 5. Referential Integrity Orphan Validation
```

### Core Safety Guarantees

1. **Source Immutability**: The source database connection is strictly read-only. No `UPDATE`, `DELETE`, or `ALTER` statements are ever executed against the source.
2. **Deterministic Primary Key Preservation**: Primary key values (`id`) are copied identically. Foreign keys in child tables retain exact relational integrity.
3. **Sequence Synchronization**: Every PostgreSQL sequence is automatically synchronized to `MAX(id) + 1` post-migration to prevent duplicate key violations on subsequent application inserts.
4. **Topological Dependency Execution**: Tables are migrated in strict dependency order (parent entities before child entities).
5. **JSONB Serialization Safety**: Python dictionaries and lists are serialized via `json.dumps()` prior to batch execution, preventing `psycopg2` mogrification adapter exceptions.

---

## 2. Topological Dependency Ordering (DAG)

To guarantee that foreign-key constraints are satisfied at all times, the migration engine processes tables in 9 distinct dependency tiers:

```
Tier 1: Identity Roots (core_user)
         │
         ▼
Tier 2: SaaS & Tenants (saas_saassubscription, organisation_organisation)
         │
         ▼
Tier 3: Tenant Sub-Entities & Auth (organisation_manager, assistants_assistant, accounts_*)
         │
         ▼
Tier 4: Dynamic Tables (tables_table, tables_tableaccess, tables_tablefreeze)
         │
         ▼
Tier 5: ID Cards & Dynamic Records (tables_idcard, tables_collectioncampaign)
         │
         ▼
Tier 6: Media Files (mediafiles_cardmedia, mediafiles_mediabatch, mediafiles_mediaauditlog)
         │
         ▼
Tier 7: Reprints & Workflows (reprint_reprintrequest, tables_datacollectionrecord)
         │
         ▼
Tier 8: Operations & Auditing (operations_bulktransaction, operations_*, core_activitylog)
         │
         ▼
Tier 9: System Telemetry & Tasks (core_systemmetricsnapshot, core_backgroundtask, sessions)
```

### Table Dependency Execution Order

| Execution Tier | Source Table | Target Table | Foreign Key Dependencies |
|---|---|---|---|
| **Tier 1** | `core_user` | `core_user` | *None (Identity Root)* |
| **Tier 2** | `saas_saassubscription` | `saas_saassubscription` | *None* |
| **Tier 2** | `core_client` | `organisation_organisation` | `core_user`, `saas_saassubscription` |
| **Tier 2** | `saas_saastierfeature` | `saas_saastierfeature` | `saas_saassubscription` |
| **Tier 3** | `organisation_manager` | `organisation_manager` | `organisation_organisation`, `core_user` |
| **Tier 3** | `assistants_assistant` | `assistants_assistant` | `organisation_organisation`, `core_user` |
| **Tier 3** | `core_usersecuritypin` | `accounts_usersecuritypin` | `core_user` |
| **Tier 3** | `core_userdevicesession` | `accounts_userdevicesession` | `core_user` |
| **Tier 3** | `core_securitypolicy` | `organisation_securitypolicy` | `organisation_organisation` |
| **Tier 4** | `core_idcardtable` | `tables_table` | `organisation_organisation`, `core_user` |
| **Tier 4** | `tables_tableaccess` | `tables_tableaccess` | `tables_table`, `assistants_assistant` |
| **Tier 4** | `tables_tablefreeze` | `tables_tablefreeze` | `tables_table` |
| **Tier 5** | `core_idcard` | `tables_idcard` | `tables_table` |
| **Tier 5** | `tables_collectioncampaign` | `tables_collectioncampaign` | `tables_table` |
| **Tier 5** | `tables_tablephotocollectionlink` | `tables_tablephotocollectionlink` | `tables_table` |
| **Tier 6** | `mediafiles_cardmedia` | `mediafiles_cardmedia` | `tables_idcard`, `tables_table`, `organisation_organisation` |
| **Tier 6** | `mediafiles_mediabatch` | `mediafiles_mediabatch` | `organisation_organisation` |
| **Tier 6** | `mediafiles_mediaauditlog` | `mediafiles_mediaauditlog` | `mediafiles_cardmedia` |
| **Tier 7** | `core_reprintrequest` | `reprint_reprintrequest` | `tables_idcard`, `tables_table`, `core_user` |
| **Tier 7** | `tables_datacollectionrecord` | `tables_datacollectionrecord` | `tables_table` |
| **Tier 8** | `operations_bulktransaction` | `operations_bulktransaction` | `organisation_organisation`, `tables_table`, `core_user` |
| **Tier 8** | `core_operation` / `operations_log` | `operations_operation` | `organisation_organisation`, `tables_table`, `core_user` |
| **Tier 8** | `core_operationchange` | `operations_operationchange` | `operations_operation` |
| **Tier 8** | `core_auditevent` | `operations_auditevent` | `organisation_organisation`, `core_user` |
| **Tier 8** | `core_activitylog` | `core_activitylog` | `core_user` |
| **Tier 9** | `core_systemmetricsnapshot` | `core_systemmetricsnapshot` | *None* |
| **Tier 9** | `core_backgroundtask` | `core_backgroundtask` | *None* |
| **Tier 9** | `core_backuptask` | `core_backuptask` | *None* |
| **Tier 9** | `django_session` | `django_session` | *None* |

---

## 3. Extraction, Transformation, and Ingestion Engine

The migration utility `backend/scripts/migrate_legacy_data.py` executes in three pipelined phases:

### 3.1 Streaming Extraction

Data is extracted using server-side cursors in batches of 1,000 rows to ensure negligible memory overhead even with hundreds of thousands of ID card records:

```python
source_cur.execute(f"SELECT * FROM \"{source_table}\" ORDER BY id ASC")
while True:
    rows = source_cur.fetchmany(1000)
    if not rows:
        break
    # Process batch...
```

### 3.2 Dynamic In-Memory Transformation

Each row is transformed through the column transformation registry:
- **Column Aliasing**: Source field names mapped to target field names (`client_type` -> `org_type`, `client_id` -> `organisation_id`).
- **Permission Normalization**: Maps deprecated permission flags to modern naming (`perm_idcard_deleted_list` -> `perm_idcard_pool_list`, `perm_idcard_printed_list` -> `perm_idcard_download_list`).
- **Type Adaptation**: Converts Python `dict` and `list` instances into JSON strings via `json.dumps(val)` for PostgreSQL `JSONB` columns (`fields`, `field_data`, `metadata`).
- **64-Bit Integer Casting**: Safely handles large target IDs for auditing.

### 3.3 High-Throughput Batch Ingestion

Rows are loaded using `psycopg2.extras.execute_batch`:

```python
insert_sql = f"""
    INSERT INTO "{target_table}" ({col_list})
    VALUES ({val_placeholders})
    ON CONFLICT (id) DO NOTHING;
"""
execute_batch(target_cur, insert_sql, batch_params, page_size=1000)
```

---

## 4. Sequence Re-Alignment & Synchronization

Once all table data is loaded, `backend/scripts/migrate_legacy_data.py` executes sequence re-alignment across all 54 identity/serial columns:

```sql
SELECT setval(
    pg_get_serial_sequence('"{table}"', 'id'),
    COALESCE((SELECT MAX(id) FROM "{table}"), 1),
    COALESCE((SELECT MAX(id) IS NOT NULL FROM "{table}"), true)
);
```

This guarantees that:
1. `currval` reflects the highest restored ID.
2. The next `INSERT` will generate `MAX(id) + 1`.
3. No duplicate primary key exceptions can occur during regular application operations.

---

## 5. Post-Migration Verification & Health Auditing

Following ingestion, two automated validation tools run:

1. **`backend/scripts/database_health_check.py`**:
   - Executes 80 foreign-key orphan queries to verify referential integrity.
   - Verifies 54 sequence counters.
   - Validates that 0 invalid indexes exist.
2. **`backend/scripts/verify_database_schema.py`**:
   - Inspects 55 models, 55 tables, 755 columns, 80 foreign keys, and 97 indexes.
   - Verifies 0 schema discrepancies.

---

## 6. CLI Usage & Execution Protocol

### Dry-Run Verification (Non-Destructive)

```bash
python backend/scripts/migrate_legacy_data.py \
    --source-dsn "postgres://propanel_user:PASSWORD@127.0.0.1:5433/propanel_db" \
    --target-dsn "postgres://propanel_user:PASSWORD@127.0.0.1:5433/propanel_db_v2" \
    --dry-run
```

### Production Migration Execution

```bash
python backend/scripts/migrate_legacy_data.py \
    --source-dsn "postgres://propanel_user:PASSWORD@127.0.0.1:5433/propanel_db" \
    --target-dsn "postgres://propanel_user:PASSWORD@127.0.0.1:5433/propanel_db_v2" \
    --batch-size 1000
```

