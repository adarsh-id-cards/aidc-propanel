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
    1. Does not overwrite non-NULL client_id.
    2. Reports affected row counts separately for organisation_id and group_id.
    3. Fails with clear diagnostic exception if ambiguous ownership is found.
    4. Fails fast with actionable remediation instructions if unresolvable NULLs
       or orphan references remain.
    5. Does not apply NOT NULL or create invalid FK constraints when data is incomplete.
    6. Verifies exact table, schema, source & referenced column mapping, ON DELETE CASCADE,
       and convalidated=true on PostgreSQL.
    7. Fully idempotent and safe to re-run after data remediation.
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

        # 2. Ambiguity check: check if any unassigned row has conflicting candidate sources
        if 'organisation_id' in cols and 'group_id' in cols and 'core_idcardgroup' in tables:
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

        # 3. Safe legacy data backfill (never overwrites existing non-NULL client_id)
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
        if 'group_id' in cols and 'core_idcardgroup' in tables:
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

        # 4. Strict Row Validation Audit
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

        # 5. PostgreSQL-specific Type Widening, FK Verification & NOT NULL Enforcement
        if connection.vendor == 'postgresql':
            # Check column type
            cursor.execute("""
                SELECT data_type FROM information_schema.columns
                WHERE table_name = 'core_idcardtable' AND column_name = 'client_id';
            """)
            col_info = cursor.fetchone()
            if col_info and col_info[0].lower() in ('integer', 'int4'):
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id TYPE bigint;")

            # Precise PostgreSQL foreign-key constraint verification
            # Verify source schema, table, column; target schema, table, column; key cardinality; ON DELETE CASCADE; and convalidated
            cursor.execute("""
                SELECT
                    c.conname,
                    c.confdeltype,
                    c.convalidated
                FROM pg_constraint c
                JOIN pg_class src_t ON c.conrelid = src_t.oid
                JOIN pg_namespace src_ns ON src_t.relnamespace = src_ns.oid
                JOIN pg_class ref_t ON c.confrelid = ref_t.oid
                JOIN pg_namespace ref_ns ON ref_t.relnamespace = ref_ns.oid
                JOIN pg_attribute src_a ON src_a.attrelid = src_t.oid AND src_a.attnum = c.conkey[1]
                JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = c.confkey[1]
                WHERE c.contype = 'f'
                  AND src_ns.nspname = CURRENT_SCHEMA()
                  AND src_t.relname = 'core_idcardtable'
                  AND src_a.attname = 'client_id'
                  AND ref_ns.nspname = CURRENT_SCHEMA()
                  AND ref_t.relname = 'core_client'
                  AND ref_a.attname = 'id'
                  AND array_length(c.conkey, 1) = 1
                  AND array_length(c.confkey, 1) = 1;
            """)
            fks = cursor.fetchall()

            # Find if an exact, validated CASCADE foreign key already exists
            valid_cascade_fk = next((conname for conname, deltype, val in fks if deltype == 'c' and val), None)

            if not valid_cascade_fk:
                # Drop only incorrectly scoped or non-CASCADE FKs that specifically link client_id -> core_client(id)
                for conname, deltype, val in fks:
                    if deltype != 'c' or not val:
                        logger.info("Dropping non-cascade or unvalidated FK '%s' on core_idcardtable.client_id.", conname)
                        cursor.execute(f'ALTER TABLE core_idcardtable DROP CONSTRAINT "{conname}";')

                # Ensure target constraint name is free if it exists on core_idcardtable with wrong definition
                cursor.execute("""
                    SELECT 1 FROM pg_constraint c
                    JOIN pg_class t ON c.conrelid = t.oid
                    JOIN pg_namespace n ON t.relnamespace = n.oid
                    WHERE n.nspname = CURRENT_SCHEMA()
                      AND t.relname = 'core_idcardtable'
                      AND c.conname = 'core_idcardtable_client_id_fk_core_client_id';
                """)
                if cursor.fetchone():
                    cursor.execute('ALTER TABLE core_idcardtable DROP CONSTRAINT "core_idcardtable_client_id_fk_core_client_id";')

                # Add the validated CASCADE FK constraint
                cursor.execute("""
                    ALTER TABLE core_idcardtable
                        ADD CONSTRAINT core_idcardtable_client_id_fk_core_client_id
                        FOREIGN KEY (client_id) REFERENCES core_client(id) ON DELETE CASCADE;
                """)

            # Enforce NOT NULL on PostgreSQL
            cursor.execute("""
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'core_idcardtable' AND column_name = 'client_id';
            """)
            null_res = cursor.fetchone()
            if null_res and null_res[0].upper() == 'YES':
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id SET NOT NULL;")

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
