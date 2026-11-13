#!/usr/bin/env python
"""
Database Inventory Script for Pro-Panel.

Outputs a comprehensive, secret-free inventory of:
- Database engine & version
- All managed Django models and their physical table names
- Row counts, column counts, PK types, FK counts, and index counts per table
- Foreign key relationship map
- Applied migrations summary per app
"""
import argparse
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("SENTRY_DSN", "")

import django

django.setup()

from django.apps import apps
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder


def collect_inventory():
    vendor = connection.vendor
    is_pg = vendor == "postgresql"

    with connection.cursor() as cursor:
        if is_pg:
            cursor.execute("SELECT version(), current_database(), current_schema()")
            ver, dbname, schema = cursor.fetchone()
        else:
            cursor.execute("SELECT sqlite_version()")
            ver = f"SQLite {cursor.fetchone()[0]}"
            dbname = str(connection.settings_dict.get("NAME", ":memory:"))
            schema = "main"

        existing_tables = set(connection.introspection.table_names(cursor))

        models_inventory = []
        for model in apps.get_models(include_auto_created=True):
            if not model._meta.managed:
                continue
            tname = model._meta.db_table
            exists = tname in existing_tables
            row_count = None
            if exists:
                cursor.execute(f'SELECT COUNT(*) FROM "{tname}"')
                row_count = cursor.fetchone()[0]

            cols = [f.column for f in model._meta.local_concrete_fields]
            fks = [
                {
                    "column": f.column,
                    "target_table": f.related_model._meta.db_table,
                    "target_column": f.target_field.column,
                }
                for f in model._meta.local_concrete_fields
                if f.is_relation and f.many_to_one
            ]
            pk_field = model._meta.pk
            models_inventory.append(
                {
                    "app_label": model._meta.app_label,
                    "model_name": model.__name__,
                    "db_table": tname,
                    "auto_created": bool(model._meta.auto_created),
                    "exists_in_db": exists,
                    "row_count": row_count,
                    "column_count": len(cols),
                    "pk_column": pk_field.column if pk_field else None,
                    "pk_type": pk_field.get_internal_type() if pk_field else None,
                    "fk_count": len(fks),
                    "fks": fks,
                    "declared_indexes": len(model._meta.indexes),
                }
            )

    recorder = MigrationRecorder(connection)
    applied = {}
    if recorder.has_table():
        for app, name in recorder.applied_migrations():
            applied.setdefault(app, []).append(name)
        for app in applied:
            applied[app].sort()

    return {
        "database": {
            "vendor": vendor,
            "version": ver,
            "database_name": dbname,
            "schema": schema,
            "total_physical_tables": len(existing_tables),
        },
        "models": models_inventory,
        "applied_migrations": applied,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate Pro-Panel database inventory.")
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    args = parser.parse_args()

    inv = collect_inventory()
    if args.json:
        print(json.dumps(inv, indent=2))
        return

    db = inv["database"]
    print("=" * 88)
    print("PRO-PANEL DATABASE INVENTORY")
    print("=" * 88)
    print(f"Engine          : {db['vendor']} ({db['version']})")
    print(f"Database Name   : {db['database_name']} (schema: {db['schema']})")
    print(f"Physical Tables : {db['total_physical_tables']}")
    print(f"Managed Models  : {len(inv['models'])}")
    print("-" * 88)
    print(f"{'App.Model':<36} {'Table Name':<34} {'Cols':>4} {'FKs':>4} {'Rows':>7}")
    print("-" * 88)
    for m in inv["models"]:
        label = f"{m['app_label']}.{m['model_name']}"
        rows_str = str(m["row_count"]) if m["row_count"] is not None else "MISSING"
        print(
            f"{label:<36} {m['db_table']:<34} {m['column_count']:>4} {m['fk_count']:>4} {rows_str:>7}"
        )
    print("=" * 88)


if __name__ == "__main__":
    main()

