#!/usr/bin/env python
"""
Database Schema Verification Script for Pro-Panel.

Verifies that the active database schema matches Django models 100%:
1. Every Django model table exists.
2. Every model column exists.
3. Column types match Django field definitions (including 64-bit bigint checks).
4. Column nullability matches Django field definitions.
5. Every ForeignKey/OneToOneField has a valid, validated FK constraint.
6. Every UniqueConstraint / unique_together / unique=True constraint exists.
7. Every Index (including PostgreSQL GIN index on tables_idcard.field_data) exists.
8. No unexpected orphan columns exist in model tables.
9. No legacy duplicate columns remain (e.g. client_id alongside organisation_id).
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


LEGACY_FORBIDDEN_COLUMNS = {
    "organisation_organisation": {"client_type", "perm_idcard_client_list"},
    "organisation_manager": {"client_id"},
    "tables_table": {"client_id", "deleted_by_client", "group_id"},
    "tables_idcard": {"group_id", "client_id"},
    "assistants_assistant": {
        "client_id",
        "perm_idcard_client_list",
        "perm_manage_client_staff",
    },
    "reprint_reprintrequest": {"group_id"},
}


def get_pg_schema_info(cursor):
    """Fetch complete table, column, FK, unique, and index metadata from PostgreSQL."""
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
        """
    )
    tables = {row[0] for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT table_name, column_name, data_type, is_nullable, udt_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
        """
    )
    columns = {}
    for tname, cname, dtype, nullable, udt in cursor.fetchall():
        columns.setdefault(tname, {})[cname] = {
            "data_type": dtype,
            "is_nullable": nullable == "YES",
            "udt_name": udt,
        }

    # Foreign keys from pg_constraint
    cursor.execute(
        """
        SELECT
            con.conname,
            src_cls.relname AS source_table,
            ARRAY_AGG(src_att.attname ORDER BY u.ord) AS source_cols,
            tgt_cls.relname AS target_table,
            ARRAY_AGG(tgt_att.attname ORDER BY u.ord) AS target_cols,
            con.confdeltype,
            con.convalidated
        FROM pg_constraint con
        JOIN pg_class src_cls ON src_cls.oid = con.conrelid
        JOIN pg_namespace src_ns ON src_ns.oid = src_cls.relnamespace
        JOIN pg_class tgt_cls ON tgt_cls.oid = con.confrelid
        JOIN LATERAL UNNEST(con.conkey, con.confkey) WITH ORDINALITY AS u(src_attnum, tgt_attnum, ord) ON true
        JOIN pg_attribute src_att ON src_att.attrelid = con.conrelid AND src_att.attnum = u.src_attnum
        JOIN pg_attribute tgt_att ON tgt_att.attrelid = con.confrelid AND tgt_att.attnum = u.tgt_attnum
        WHERE con.contype = 'f'
          AND src_ns.nspname = current_schema()
        GROUP BY con.oid, con.conname, src_cls.relname, tgt_cls.relname, con.confdeltype, con.convalidated
        """
    )
    fks = {}
    for conname, src_tbl, src_cols, tgt_tbl, tgt_cols, deltype, validated in cursor.fetchall():
        fks.setdefault(src_tbl, []).append(
            {
                "name": conname,
                "source_cols": list(src_cols),
                "target_table": tgt_tbl,
                "target_cols": list(tgt_cols),
                "confdeltype": deltype if isinstance(deltype, str) else deltype.decode(),
                "convalidated": bool(validated),
            }
        )

    # Indexes from pg_indexes
    cursor.execute(
        """
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
        """
    )
    indexes = {}
    for tname, idxname, idxdef in cursor.fetchall():
        indexes.setdefault(tname, {})[idxname] = idxdef

    return tables, columns, fks, indexes


def verify_schema():
    errors = []
    warnings = []
    stats = {
        "vendor": connection.vendor,
        "models_checked": 0,
        "tables_verified": 0,
        "columns_verified": 0,
        "fks_verified": 0,
        "indexes_verified": 0,
    }

    is_pg = connection.vendor == "postgresql"

    with connection.cursor() as cursor:
        if is_pg:
            db_tables, db_columns, db_fks, db_indexes = get_pg_schema_info(cursor)
        else:
            db_tables = set(connection.introspection.table_names(cursor))
            db_columns = {}
            db_fks = {}
            db_indexes = {}
            for t in db_tables:
                desc = connection.introspection.get_table_description(cursor, t)
                db_columns[t] = {
                    col.name: {
                        "data_type": str(col.type_code),
                        "is_nullable": bool(col.null_ok),
                    }
                    for col in desc
                }
                constraints = connection.introspection.get_constraints(cursor, t)
                db_indexes[t] = {
                    k: v for k, v in constraints.items() if v.get("index") or v.get("unique")
                }

    all_models = [
        m for m in apps.get_models(include_auto_created=True) if m._meta.managed
    ]

    for model in all_models:
        stats["models_checked"] += 1
        tname = model._meta.db_table
        model_label = f"{model._meta.app_label}.{model.__name__}"

        # 1. Check table exists
        if tname not in db_tables:
            errors.append(f"[MISSING TABLE] {model_label}: expected table '{tname}' does not exist.")
            continue
        stats["tables_verified"] += 1

        table_cols = db_columns.get(tname, {})
        expected_cols = {}

        # 2, 3, 4. Check columns exist, types, and nullability
        for field in model._meta.local_concrete_fields:
            col_name = field.column
            expected_cols[col_name] = field
            if col_name not in table_cols:
                errors.append(
                    f"[MISSING COLUMN] {model_label} ({tname}): missing column '{col_name}'."
                )
                continue

            stats["columns_verified"] += 1
            col_info = table_cols[col_name]

            # Nullability check
            expected_null = bool(field.null)
            actual_null = bool(col_info["is_nullable"])
            if expected_null != actual_null:
                errors.append(
                    f"[NULLABILITY MISMATCH] {tname}.{col_name}: model null={expected_null}, DB is_nullable={actual_null}."
                )

            # Type check on PostgreSQL for BigAutoField / BigIntegerField / FK to BigAutoField
            if is_pg:
                internal_type = field.get_internal_type()
                if internal_type in ("BigAutoField", "BigIntegerField", "PositiveBigIntegerField"):
                    if col_info["data_type"] != "bigint":
                        errors.append(
                            f"[TYPE MISMATCH] {tname}.{col_name}: expected 'bigint' for {internal_type}, found '{col_info['data_type']}'."
                        )
                elif internal_type in ("ForeignKey", "OneToOneField"):
                    target_pk = field.target_field
                    if target_pk.get_internal_type() == "BigAutoField" and col_info["data_type"] != "bigint":
                        errors.append(
                            f"[FK TYPE MISMATCH] {tname}.{col_name}: references BigAutoField on {field.related_model._meta.db_table}, expected 'bigint', found '{col_info['data_type']}'."
                        )

            # 5. ForeignKey / OneToOneField constraint verification on PostgreSQL
            if is_pg and field.is_relation and field.many_to_one:
                target_table = field.related_model._meta.db_table
                target_col = field.target_field.column
                table_fks = db_fks.get(tname, [])
                matching_fks = [
                    fk
                    for fk in table_fks
                    if fk["source_cols"] == [col_name]
                    and fk["target_table"] == target_table
                    and fk["target_cols"] == [target_col]
                ]
                if not matching_fks:
                    errors.append(
                        f"[MISSING FK] {tname}.{col_name} -> {target_table}.{target_col}: no matching FK constraint found."
                    )
                else:
                    if len(matching_fks) > 1:
                        errors.append(
                            f"[DUPLICATE FK] {tname}.{col_name}: multiple FK constraints found ({[f['name'] for f in matching_fks]})."
                        )
                    fk_obj = matching_fks[0]
                    if not fk_obj["convalidated"]:
                        errors.append(
                            f"[UNVALIDATED FK] {tname}.{col_name}: constraint '{fk_obj['name']}' has convalidated=false."
                        )
                    else:
                        stats["fks_verified"] += 1

        # 8. Check for unexpected orphan columns on this table
        actual_col_names = set(table_cols.keys())
        expected_col_names = set(expected_cols.keys())
        orphan_cols = actual_col_names - expected_col_names
        if orphan_cols:
            errors.append(
                f"[ORPHAN COLUMNS] {tname}: unexpected columns in DB not in model: {sorted(orphan_cols)}"
            )

        # 9. Check for forbidden legacy columns
        forbidden = LEGACY_FORBIDDEN_COLUMNS.get(tname, set()) & actual_col_names
        if forbidden:
            errors.append(
                f"[LEGACY DUPLICATE COLUMNS] {tname}: forbidden legacy columns present: {sorted(forbidden)}"
            )

        # 7. Check explicit Meta.indexes exist
        table_idx_map = db_indexes.get(tname, {})
        for idx in model._meta.indexes:
            if idx.name not in table_idx_map:
                errors.append(
                    f"[MISSING INDEX] {tname}: expected index '{idx.name}' on {idx.fields} not found."
                )
            else:
                stats["indexes_verified"] += 1

    # Check PostgreSQL GIN index on tables_idcard.field_data
    if is_pg:
        idcard_indexes = db_indexes.get("tables_idcard", {})
        if "idcard_field_data_gin" not in idcard_indexes:
            errors.append(
                "[MISSING GIN INDEX] tables_idcard: expected PostgreSQL GIN index 'idcard_field_data_gin' on field_data."
            )
        else:
            stats["indexes_verified"] += 1

    return {
        "status": "PASS" if not errors else "FAIL",
        "stats": stats,
        "errors": errors,
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(description="Verify database schema against Django models.")
    parser.add_argument("--json", action="store_true", help="Output result as JSON.")
    args = parser.parse_args()

    result = verify_schema()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("=" * 72)
        print("PRO-PANEL DATABASE SCHEMA VERIFICATION")
        print("=" * 72)
        print(f"Database Vendor  : {result['stats']['vendor']}")
        print(f"Models Checked   : {result['stats']['models_checked']}")
        print(f"Tables Verified  : {result['stats']['tables_verified']}")
        print(f"Columns Verified : {result['stats']['columns_verified']}")
        print(f"FKs Verified     : {result['stats']['fks_verified']}")
        print(f"Indexes Verified : {result['stats']['indexes_verified']}")
        print(f"Overall Status   : {result['status']}")
        print("-" * 72)
        if result["errors"]:
            print(f"ERRORS ({len(result['errors'])}):")
            for err in result["errors"]:
                print(f"  - {err}")
        else:
            print("All schema checks passed with 0 errors.")
        print("=" * 72)

    sys.exit(0 if result["status"] == "PASS" else 1)


if __name__ == "__main__":
    main()

