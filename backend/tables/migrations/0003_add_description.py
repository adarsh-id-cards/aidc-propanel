from django.db import migrations, models


def add_description_if_not_exists(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        cols = {col.name.lower() for col in connection.introspection.get_table_description(cursor, 'core_idcardtable')}
        if 'description' not in cols:
            cursor.execute("ALTER TABLE core_idcardtable ADD COLUMN description text NULL")


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0002_rename_tables_idca_table_i_6bbdc1_idx_core_idcard_table_i_85127c_idx_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='table',
                    name='description',
                    field=models.TextField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunPython(
                    add_description_if_not_exists,
                    reverse_code=migrations.RunPython.noop,
                    atomic=False,
                ),
            ],
        ),
    ]
