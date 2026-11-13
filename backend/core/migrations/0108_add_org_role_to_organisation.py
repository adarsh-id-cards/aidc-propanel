from django.db import migrations, models


def add_org_role_if_not_exists(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        cols = {col.name.lower() for col in connection.introspection.get_table_description(cursor, 'core_client')}
        if 'org_role' not in cols:
            cursor.execute("ALTER TABLE core_client ADD COLUMN org_role varchar(50) DEFAULT 'organisation' NOT NULL")


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0107_alter_notification_target'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='organisation',
                    name='org_role',
                    field=models.CharField(default='organisation', max_length=50, help_text='primary, organisation, or manager'),
                ),
            ],
            database_operations=[
                migrations.RunPython(
                    add_org_role_if_not_exists,
                    reverse_code=migrations.RunPython.noop,
                    atomic=False,
                ),
            ],
        ),
    ]
