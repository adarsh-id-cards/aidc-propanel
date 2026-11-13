# Generated migration to ensure core_idcardtable has client_id column,
# correct data type (bigint), verified foreign key to core_client(id),
# and reconciled nullability with the Django model.

import logging
from django.db import migrations

logger = logging.getLogger(__name__)


def reconcile_idcardtable_client_id(apps, schema_editor):
    """
    Ensure core_idcardtable.client_id is bigint, backed by an exact ON DELETE CASCADE
    foreign key to core_client(id), and reconciled to NOT NULL if no NULLs or orphans exist.
    Safe for both clean DBs and VPS databases (with legacy columns or partial states).
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
            cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN client_id bigint NULL REFERENCES core_client(id) ON DELETE CASCADE")
            cols.add('client_id')

        # 2. Safe legacy data backfill (only where client_id is NULL)
        if 'organisation_id' in cols:
            cursor.execute("""
                UPDATE core_idcardtable
                SET client_id = organisation_id
                WHERE client_id IS NULL AND organisation_id IS NOT NULL
            """)

        if 'group_id' in cols and 'core_idcardgroup' in tables:
            cursor.execute("""
                UPDATE core_idcardtable
                SET client_id = (
                    SELECT client_id FROM core_idcardgroup
                    WHERE core_idcardgroup.id = core_idcardtable.group_id
                )
                WHERE client_id IS NULL
            """)

        # 3. Row validation (counting NULLs and orphans)
        cursor.execute("SELECT COUNT(*) FROM core_idcardtable WHERE client_id IS NULL")
        null_count = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM core_idcardtable
            WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM core_client)
        """)
        orphan_count = cursor.fetchone()[0]

        logger.info(
            "core_idcardtable data audit: %d rows with client_id NULL, %d orphan rows referencing non-existent core_client.",
            null_count,
            orphan_count,
        )

        # 4. PostgreSQL-specific type widening, FK verification, and NOT NULL reconciliation
        if connection.vendor == 'postgresql':
            # Check and widen data type if needed
            cursor.execute("""
                SELECT data_type FROM information_schema.columns
                WHERE table_name = 'core_idcardtable' AND column_name = 'client_id'
            """)
            col_info = cursor.fetchone()
            if col_info and col_info[0].lower() in ('integer', 'int4'):
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id TYPE bigint")

            # Check existing Foreign Key constraints with full definition verification
            # Verify table='core_idcardtable', col='client_id', ref_table='core_client', ref_col='id'
            cursor.execute("""
                SELECT
                    c.conname,
                    c.confdeltype
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_class rt ON c.confrelid = rt.oid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = ANY(c.confkey)
                WHERE c.contype = 'f'
                  AND t.relname = 'core_idcardtable'
                  AND a.attname = 'client_id'
                  AND rt.relname = 'core_client'
                  AND ra.attname = 'id'
            """)
            existing_fks = cursor.fetchall()

            has_valid_cascade_fk = any(deltype == 'c' for _, deltype in existing_fks)

            if not has_valid_cascade_fk:
                if orphan_count > 0:
                    logger.warning(
                        "Cannot add Foreign Key constraint on core_idcardtable.client_id because %d orphan rows exist.",
                        orphan_count,
                    )
                else:
                    # Drop any non-cascade FKs on client_id -> core_client(id)
                    for conname, deltype in existing_fks:
                        if deltype != 'c':
                            cursor.execute(f'ALTER TABLE core_idcardtable DROP CONSTRAINT "{conname}"')

                    # Add exact FK constraint
                    cursor.execute("""
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM pg_constraint WHERE conname = 'core_idcardtable_client_id_fk_core_client_id'
                            ) THEN
                                ALTER TABLE core_idcardtable
                                    ADD CONSTRAINT core_idcardtable_client_id_fk_core_client_id
                                    FOREIGN KEY (client_id) REFERENCES core_client(id) ON DELETE CASCADE;
                            END IF;
                        END $$;
                    """)

            # 5. Enforce NOT NULL if and only if no NULLs or orphans exist
            if null_count == 0 and orphan_count == 0:
                cursor.execute("""
                    SELECT is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'core_idcardtable' AND column_name = 'client_id'
                """)
                null_res = cursor.fetchone()
                if null_res and null_res[0].upper() == 'YES':
                    cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id SET NOT NULL")
            else:
                logger.warning(
                    "NOT NULL constraint NOT applied to core_idcardtable.client_id: null_count=%d, orphan_count=%d. "
                    "Existing records must be resolved safely before enforcing NOT NULL.",
                    null_count,
                    orphan_count,
                )


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
