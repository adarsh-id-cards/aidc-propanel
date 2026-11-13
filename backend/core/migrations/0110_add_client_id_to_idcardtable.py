# Generated migration to ensure core_idcardtable has client_id column,
# correct data type (bigint), verified foreign key to core_client(id),
# and reconciled nullability with the Django model.

import logging
from django.db import migrations

logger = logging.getLogger(__name__)


def reconcile_idcardtable_client_id(apps, schema_editor):
    """
    Ensure core_idcardtable.client_id is bigint, backed by an exact validated
    ON DELETE CASCADE foreign key to core_client(id), and reconciled to NOT NULL.

    Safety guarantees:
    1. Schema-specific introspection: All PostgreSQL column type, nullability,
       and constraint checks are strictly scoped to CURRENT_SCHEMA.
    2. Composite FK detection and safe reconciliation: Detects all single-column
       and composite foreign keys on core_idcardtable involving client_id via attribute
       number array matching (= ANY(c.conkey)). Fails immediately with constraint
       definition if a composite FK cannot safely be reconciled automatically.
    3. Safe FK drop before type widening: Inspects and drops incompatible or non-CASCADE
       foreign keys before attempting integer-to-bigint alteration, preserving valid CASCADE
       FKs when type-compatible.
    4. Safe legacy table/column checks: Verifies both table existence and required
       'client_id' column on core_idcardgroup before joining or querying.
    5. Independent complete post-creation FK verification: Confirms source schema/table,
       source column ('client_id'), referenced schema/table ('core_client'), referenced
       column ('id'), single-column mapping, ON DELETE CASCADE ('c'), and convalidated=true,
       emitting detailed diagnostics if any criteria fail.
    6. Preserves existing non-NULL client IDs: Never overwrites valid ownership values
       or silently assigns an arbitrary organisation.
    7. Strict audits: Audits NULL and orphan rows before enforcing NOT NULL or creating FKs.
    8. Reconciles deleted_by_manager / deleted_by_client column mapping safely without
       data loss even when both columns coexist.
    9. Idempotent and safe to retry after partial failure (atomic=False).
    """
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        tables = {t.lower() for t in connection.introspection.table_names(cursor)}
        if 'core_idcardtable' not in tables:
            return

        description = connection.introspection.get_table_description(cursor, 'core_idcardtable')
        cols = {col.name.lower() for col in description}

        # 1. Ensure client_id column exists
        if 'client_id' not in cols:
            cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN client_id bigint NULL;")
            cols.add('client_id')

        # 2. Reconcile deleted_by_manager / deleted_by_client mapping without data loss
        # The Django model maps Table.deleted_by_manager to db_column='deleted_by_client'.
        if 'deleted_by_client' not in cols:
            if 'deleted_by_manager' in cols:
                logger.info("Renaming core_idcardtable.deleted_by_manager to deleted_by_client.")
                cursor.execute("ALTER TABLE core_idcardtable RENAME COLUMN deleted_by_manager TO deleted_by_client;")
                cols.remove('deleted_by_manager')
                cols.add('deleted_by_client')
            else:
                logger.info("Adding core_idcardtable.deleted_by_client column.")
                if connection.vendor == 'postgresql':
                    cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN deleted_by_client bool NOT NULL DEFAULT FALSE;")
                else:
                    cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN deleted_by_client bool NOT NULL DEFAULT 0;")
                cols.add('deleted_by_client')

        # 3. Check legacy group source table and client_id column existence
        group_table_exists = 'core_idcardgroup' in tables
        group_has_client_id = False
        if group_table_exists:
            group_desc = connection.introspection.get_table_description(cursor, 'core_idcardgroup')
            group_cols = {c.name.lower() for c in group_desc}
            group_has_client_id = 'client_id' in group_cols
            if not group_has_client_id:
                logger.warning(
                    "Legacy table 'core_idcardgroup' exists but lacks 'client_id' column (found cols: %s). "
                    "Skipping group_id fallback backfill.",
                    sorted(group_cols)
                )

        # 4. Ambiguity check: check if any unassigned row has conflicting candidate sources
        if 'organisation_id' in cols and 'group_id' in cols and group_table_exists and group_has_client_id:
            cursor.execute("""
                SELECT t.id, t.name, t.organisation_id, g.client_id
                FROM core_idcardtable t
                JOIN core_idcardgroup g ON g.id = t.group_id
                WHERE t.client_id IS NULL
                  AND t.organisation_id IS NOT NULL
                  AND g.client_id IS NOT NULL
                  AND t.organisation_id <> g.client_id;
            """)
            ambiguous_rows = cursor.fetchall()
            if ambiguous_rows:
                sample_details = ", ".join(
                    f"[Table ID {r[0]} '{r[1]}': organisation_id={r[2]} vs group.client_id={r[3]}]"
                    for r in ambiguous_rows[:5]
                )
                raise RuntimeError(
                    f"Ambiguous organisation ownership in core_idcardtable: {len(ambiguous_rows)} row(s) have "
                    f"conflicting organisation_id and group.client_id sources.\n"
                    f"Sample conflicts: {sample_details}\n"
                    f"Remediation: Resolve ownership explicitly before migrating:\n"
                    f"  UPDATE core_idcardtable SET client_id = <correct_org_id> WHERE id = <table_id>;"
                )

        # 5. Safe legacy data backfill (never overwrites existing non-NULL client_id)
        org_backfill_count = 0
        if 'organisation_id' in cols:
            cursor.execute("""
                UPDATE core_idcardtable
                SET client_id = organisation_id
                WHERE client_id IS NULL
                  AND organisation_id IS NOT NULL
                  AND organisation_id IN (SELECT id FROM core_client);
            """)
            org_backfill_count = cursor.rowcount

        group_backfill_count = 0
        if 'group_id' in cols and group_table_exists and group_has_client_id:
            cursor.execute("""
                UPDATE core_idcardtable
                SET client_id = (
                    SELECT g.client_id FROM core_idcardgroup g WHERE g.id = core_idcardtable.group_id
                )
                WHERE client_id IS NULL
                  AND group_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM core_idcardgroup g
                      JOIN core_client c ON c.id = g.client_id
                      WHERE g.id = core_idcardtable.group_id
                  );
            """)
            group_backfill_count = cursor.rowcount

        logger.info(
            "core_idcardtable backfill: %d rows backfilled from organisation_id, %d rows backfilled from group_id.",
            org_backfill_count,
            group_backfill_count,
        )

        # 6. Strict Row Validation Audit
        cursor.execute("SELECT COUNT(*) FROM core_idcardtable WHERE client_id IS NULL;")
        null_count = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM core_idcardtable
            WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM core_client);
        """)
        orphan_count = cursor.fetchone()[0]

        if null_count > 0 or orphan_count > 0:
            cursor.execute("""
                SELECT id, name
                FROM core_idcardtable
                WHERE client_id IS NULL
                ORDER BY id
                LIMIT 5;
            """)
            null_samples = cursor.fetchall()

            cursor.execute("""
                SELECT id, name, client_id
                FROM core_idcardtable
                WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM core_client)
                ORDER BY id
                LIMIT 5;
            """)
            orphan_samples = cursor.fetchall()

            null_diag = f"NULL client_id rows ({null_count} total, sample IDs: {[r[0] for r in null_samples]})" if null_count > 0 else ""
            orphan_diag = f"Orphan client_id rows ({orphan_count} total, sample: {orphan_samples})" if orphan_count > 0 else ""
            diag_summary = "; ".join(filter(None, [null_diag, orphan_diag]))

            raise RuntimeError(
                f"core_idcardtable schema reconciliation failed: {diag_summary}.\n"
                f"Cannot enforce NOT NULL or Foreign Key constraints with invalid data.\n"
                f"Remediation instructions:\n"
                f"1. For NULL rows: Identify the owning organisation and update client_id:\n"
                f"   UPDATE core_idcardtable SET client_id = <valid_org_id> WHERE id IN (...);\n"
                f"2. For orphan rows: Either create the missing core_client record or reassign:\n"
                f"   UPDATE core_idcardtable SET client_id = <valid_org_id> WHERE id IN (...);\n"
                f"3. After remediation, re-run 'python manage.py migrate'.\n"
                f"Note: Existing records were NOT deleted or silently altered."
            )

        # 7. PostgreSQL-specific FK reconciliation, Type Widening & NOT NULL Enforcement
        if connection.vendor == 'postgresql':
            cursor.execute("SELECT CURRENT_SCHEMA;")
            current_schema = cursor.fetchone()[0]

            # Introspect attnum for client_id on core_idcardtable strictly within CURRENT_SCHEMA
            cursor.execute("""
                SELECT a.attnum
                FROM pg_attribute a
                JOIN pg_class t ON a.attrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE n.nspname = CURRENT_SCHEMA
                  AND t.relname = 'core_idcardtable'
                  AND a.attname = 'client_id'
                  AND a.attnum > 0
                  AND NOT a.attisdropped;
            """)
            client_id_attnum_row = cursor.fetchone()
            if not client_id_attnum_row:
                raise RuntimeError(
                    "Schema introspection error: column 'client_id' on 'core_idcardtable' not found in pg_attribute."
                )
            client_id_attnum = client_id_attnum_row[0]

            # Detect ALL foreign-key constraints on core_idcardtable whose source-column array includes client_id
            cursor.execute("""
                SELECT
                    c.conname,
                    c.confdeltype,
                    c.convalidated,
                    array_length(c.conkey, 1) AS src_col_count,
                    array_length(c.confkey, 1) AS ref_col_count,
                    ref_ns.nspname AS ref_schema,
                    ref_t.relname AS ref_table,
                    ref_a.attname AS ref_col,
                    pg_get_constraintdef(c.oid) AS condef
                FROM pg_constraint c
                JOIN pg_class src_t ON c.conrelid = src_t.oid
                JOIN pg_namespace src_ns ON src_t.relnamespace = src_ns.oid
                LEFT JOIN pg_class ref_t ON c.confrelid = ref_t.oid
                LEFT JOIN pg_namespace ref_ns ON ref_t.relnamespace = ref_ns.oid
                LEFT JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = c.confkey[1]
                WHERE c.contype = 'f'
                  AND src_ns.nspname = CURRENT_SCHEMA
                  AND src_t.relname = 'core_idcardtable'
                  AND %s = ANY(c.conkey);
            """, [client_id_attnum])
            existing_fks = cursor.fetchall()

            # Fail immediately before altering column if any composite foreign key involves client_id
            for fk in existing_fks:
                conname, _, _, src_col_count, _, _, _, _, condef = fk
                if src_col_count is not None and src_col_count > 1:
                    raise RuntimeError(
                        f"Cannot automatically reconcile composite foreign key '{conname}' involving client_id on core_idcardtable: {condef}.\n"
                        f"Remediation: Safely resolve or drop this composite constraint manually before running migrations."
                    )

            # Inspect current column type and nullability scoped strictly to CURRENT_SCHEMA
            cursor.execute("""
                SELECT data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = CURRENT_SCHEMA
                  AND table_name = 'core_idcardtable'
                  AND column_name = 'client_id';
            """)
            col_info = cursor.fetchone()
            current_type = col_info[0].lower() if col_info else None
            is_nullable = col_info[1].upper() if col_info else None

            # Identify if an exact, valid CASCADE FK to core_client(id) already exists and is type-compatible
            exact_cascade_fk = None
            if current_type not in ('integer', 'int4'):
                for fk in existing_fks:
                    conname, confdeltype, convalidated, src_col_count, ref_col_count, ref_schema, ref_table, ref_col, condef = fk
                    if (src_col_count == 1 and ref_col_count == 1
                            and ref_schema == current_schema
                            and ref_table == 'core_client'
                            and ref_col == 'id'
                            and confdeltype == 'c'
                            and convalidated):
                        exact_cascade_fk = conname
                        break

            # Step A: Drop incompatible, non-CASCADE, or unvalidated FKs before type alteration
            for fk in existing_fks:
                conname = fk[0]
                if conname != exact_cascade_fk:
                    logger.info("Dropping incompatible FK constraint '%s' on core_idcardtable.client_id prior to reconciliation.", conname)
                    cursor.execute(f'ALTER TABLE core_idcardtable DROP CONSTRAINT "{conname}";')

            # Ensure target constraint name is not taken by an outdated constraint
            cursor.execute("""
                SELECT c.conname FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE n.nspname = CURRENT_SCHEMA
                  AND t.relname = 'core_idcardtable'
                  AND c.conname = 'core_idcardtable_client_id_fk_core_client_id';
            """)
            if cursor.fetchone() and not exact_cascade_fk:
                cursor.execute('ALTER TABLE core_idcardtable DROP CONSTRAINT "core_idcardtable_client_id_fk_core_client_id";')

            # Step B: Alter column type to bigint if currently integer
            if current_type in ('integer', 'int4'):
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id TYPE bigint;")
                logger.info("Widened core_idcardtable.client_id from %s to bigint.", current_type)

            # Step C: Create verified CASCADE FK if not already present
            if not exact_cascade_fk:
                cursor.execute("""
                    ALTER TABLE core_idcardtable
                        ADD CONSTRAINT core_idcardtable_client_id_fk_core_client_id
                        FOREIGN KEY (client_id) REFERENCES core_client(id) ON DELETE CASCADE;
                """)
                logger.info("Created ON DELETE CASCADE FK constraint on core_idcardtable.client_id -> core_client(id).")

            # Step D: Complete independent post-creation verification against all criteria
            cursor.execute("""
                SELECT
                    c.conname,
                    src_ns.nspname AS src_schema,
                    src_t.relname AS src_table,
                    src_a.attname AS src_col,
                    array_length(c.conkey, 1) AS src_col_count,
                    ref_ns.nspname AS ref_schema,
                    ref_t.relname AS ref_table,
                    ref_a.attname AS ref_col,
                    array_length(c.confkey, 1) AS ref_col_count,
                    c.confdeltype,
                    c.convalidated
                FROM pg_constraint c
                JOIN pg_class src_t ON c.conrelid = src_t.oid
                JOIN pg_namespace src_ns ON src_t.relnamespace = src_ns.oid
                LEFT JOIN pg_class ref_t ON c.confrelid = ref_t.oid
                LEFT JOIN pg_namespace ref_ns ON ref_t.relnamespace = ref_ns.oid
                LEFT JOIN pg_attribute src_a ON src_a.attrelid = src_t.oid AND src_a.attnum = c.conkey[1]
                LEFT JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = c.confkey[1]
                WHERE c.contype = 'f'
                  AND src_ns.nspname = CURRENT_SCHEMA
                  AND src_t.relname = 'core_idcardtable'
                  AND %s = ANY(c.conkey);
            """, [client_id_attnum])
            verified_fks = cursor.fetchall()

            if not verified_fks:
                raise RuntimeError(
                    "Foreign key verification failed: no foreign key constraint found on "
                    "core_idcardtable.client_id in CURRENT_SCHEMA."
                )

            valid_fk_found = False
            diagnostic_failures = []

            for row in verified_fks:
                (conname, src_schema, src_table, src_col, src_col_count,
                 ref_schema, ref_table, ref_col, ref_col_count, confdeltype, convalidated) = row

                missing_conditions = []
                if src_schema != current_schema:
                    missing_conditions.append(f"source schema '{src_schema}' != '{current_schema}'")
                if src_table != 'core_idcardtable':
                    missing_conditions.append(f"source table '{src_table}' != 'core_idcardtable'")
                if src_col != 'client_id' or src_col_count != 1:
                    missing_conditions.append(f"source column '{src_col}' (count {src_col_count}) != 'client_id' (count 1)")
                if ref_schema != current_schema:
                    missing_conditions.append(f"referenced schema '{ref_schema}' != '{current_schema}'")
                if ref_table != 'core_client':
                    missing_conditions.append(f"referenced table '{ref_table}' != 'core_client'")
                if ref_col != 'id' or ref_col_count != 1:
                    missing_conditions.append(f"referenced column '{ref_col}' (count {ref_col_count}) != 'id' (count 1)")
                if confdeltype != 'c':
                    missing_conditions.append(f"confdeltype '{confdeltype}' != 'c' (CASCADE)")
                if not convalidated:
                    missing_conditions.append(f"convalidated is {convalidated} (expected True)")

                if not missing_conditions:
                    valid_fk_found = True
                    logger.info("Foreign key constraint '%s' verified successfully in pg_catalog.", conname)
                    break
                else:
                    diagnostic_failures.append(f"Constraint '{conname}': {', '.join(missing_conditions)}")

            if not valid_fk_found:
                diagnostics_str = "; ".join(diagnostic_failures)
                raise RuntimeError(
                    f"Foreign key verification failed: no constraint met all required catalog criteria on "
                    f"core_idcardtable.client_id -> core_client(id) [ON DELETE CASCADE, validated].\n"
                    f"Diagnostics: {diagnostics_str}"
                )

            # Step E: Enforce NOT NULL on PostgreSQL
            if is_nullable == 'YES':
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id SET NOT NULL;")
                logger.info("Enforced NOT NULL on core_idcardtable.client_id.")

        logger.info("core_idcardtable.client_id schema reconciliation successfully completed.")


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0109_alter_organisation_org_type_and_more'),
        ('tables', '0001_initial_domain_models'),
    ]

    operations = [
        migrations.RunPython(
            reconcile_idcardtable_client_id,
            reverse_code=migrations.RunPython.noop,
            atomic=False,
        ),
    ]
