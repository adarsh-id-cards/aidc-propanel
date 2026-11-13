# Generated migration to ensure core_idcardtable has client_id column
# This uses SeparateDatabaseAndState so that the real production DB
# (which already has this column) is not affected, while the test DB
# gets it via the database_operations.

import django.db.models.deletion
from django.db import migrations, models


def add_client_id_column(apps, schema_editor):
    """Ensure core_idcardtable has client_id as bigint with foreign key to core_client."""
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        tables = {t.lower() for t in connection.introspection.table_names(cursor)}
        if 'core_idcardtable' not in tables:
            return
        description = connection.introspection.get_table_description(cursor, 'core_idcardtable')
        cols = {col.name.lower() for col in description}

        if 'client_id' not in cols:
            if connection.vendor == 'postgresql':
                cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN client_id bigint NULL REFERENCES core_client(id) ON DELETE CASCADE")
            else:
                cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN client_id bigint NULL REFERENCES core_client(id) ON DELETE CASCADE")
        elif connection.vendor == 'postgresql':
            cursor.execute("""
                SELECT data_type FROM information_schema.columns
                WHERE table_name = 'core_idcardtable' AND column_name = 'client_id'
            """)
            row = cursor.fetchone()
            if row and row[0].lower() in ('integer', 'int4'):
                cursor.execute("ALTER TABLE core_idcardtable ALTER COLUMN client_id TYPE bigint")

            constraints = connection.introspection.get_constraints(cursor, 'core_idcardtable')
            has_fk = any(
                c.get('foreign_key') == ('core_client', 'id') and 'client_id' in c.get('columns', [])
                for c in constraints.values()
            )
            if not has_fk:
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


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0109_alter_organisation_org_type_and_more'),
        ('tables', '0001_initial_domain_models'),
    ]

    operations = [
        migrations.RunPython(
            add_client_id_column,
            reverse_code=migrations.RunPython.noop,
            atomic=False,
        ),
    ]
