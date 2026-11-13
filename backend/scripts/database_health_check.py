#!/usr/bin/env python
"""
Database Health Check Script for Pro-Panel.

Performs non-destructive runtime health and referential integrity checks:
1. Database connectivity and query latency check.
2. Pending migrations check.
3. Foreign key constraint validation status (PostgreSQL convalidated=true).
4. Orphan record scan across all ForeignKey relations.
5. Sequence synchronization check on PostgreSQL (sequence >= MAX(id)).
6. Invalid index check on PostgreSQL (pg_index.indisvalid = true).
"""
import argparse
import json
import os
import sys
import time
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
from django.db.migrations.executor import MigrationExecutor


def run_health_check():
    issues = []
    metrics = {}

    # 1. Connectivity & latency
    t0 = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    metrics["ping_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    metrics["vendor"] = connection.vendor

    # 2. Pending migrations
    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    metrics["pending_migrations"] = len(plan)
    if plan:
        issues.append(
            f"Database has {len(plan)} unapplied migration(s): {[f'{m.app_label}.{m.name}' for m, _ in plan]}"
        )

    is_pg = connection.vendor == "postgresql"

    with connection.cursor() as cursor:
        # 3. Unvalidated FK constraints & 6. Invalid indexes on PostgreSQL
        if is_pg:
            cursor.execute(
                """
                SELECT conname, conrelid::regclass::text
                FROM pg_constraint
                JOIN pg_class cls ON cls.oid = conrelid
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                WHERE contype = 'f'
                  AND ns.nspname = current_schema()
                  AND NOT convalidated
                """
            )
            unval = cursor.fetchall()
            if unval:
                for cname, tbl in unval:
                    issues.append(f"Unvalidated FK constraint '{cname}' on table '{tbl}'.")

            cursor.execute(
                """
                SELECT c.relname AS index_name, t.relname AS table_name
                FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                JOIN pg_class t ON t.oid = i.indrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = current_schema()
                  AND NOT i.indisvalid
                """
            )
            invalid_idxs = cursor.fetchall()
            for idx_name, tbl_name in invalid_idxs:
                issues.append(f"Invalid index '{idx_name}' on table '{tbl_name}'.")

        # 4. Orphan record scan across all managed models
        orphan_checks = 0
        for model in apps.get_models(include_auto_created=True):
            if not model._meta.managed:
                continue
            src_table = model._meta.db_table
            for field in model._meta.local_concrete_fields:
                if field.is_relation and field.many_to_one:
                    src_col = field.column
                    tgt_table = field.related_model._meta.db_table
                    tgt_col = field.target_field.column
                    cursor.execute(
                        f"""
                        SELECT COUNT(*)
                        FROM "{src_table}" s
                        LEFT JOIN "{tgt_table}" t ON s."{src_col}" = t."{tgt_col}"
                        WHERE s."{src_col}" IS NOT NULL
                          AND t."{tgt_col}" IS NULL
                        """
                    )
                    orphan_count = cursor.fetchone()[0]
                    orphan_checks += 1
                    if orphan_count > 0:
                        issues.append(
                            f"Orphan FK rows: {src_table}.{src_col} -> {tgt_table}.{tgt_col} has {orphan_count} orphan row(s)."
                        )
        metrics["fk_orphan_checks_run"] = orphan_checks

        # 5. Sequence sync check on PostgreSQL
        if is_pg:
            seq_checks = 0
            for model in apps.get_models(include_auto_created=True):
                if not model._meta.managed:
                    continue
                pk = model._meta.pk
                if pk and pk.get_internal_type() in ("BigAutoField", "AutoField"):
                    tname = model._meta.db_table
                    col = pk.column
                    cursor.execute(
                        "SELECT pg_get_serial_sequence(%s, %s)", [f'"{tname}"', col]
                    )
                    row = cursor.fetchone()
                    seq_name = row[0] if row else None
                    if seq_name:
                        seq_checks += 1
                        cursor.execute(f'SELECT COALESCE(MAX("{col}"), 0) FROM "{tname}"')
                        max_id = cursor.fetchone()[0]
                        cursor.execute(f"SELECT last_value, is_called FROM {seq_name}")
                        last_val, is_called = cursor.fetchone()
                        effective_next = last_val + 1 if is_called else last_val
                        if max_id >= effective_next:
                            issues.append(
                                f"Out-of-sync sequence {seq_name} on {tname}.{col}: max_id={max_id}, next_seq={effective_next}."
                            )
            metrics["sequence_checks_run"] = seq_checks

    return {
        "status": "HEALTHY" if not issues else "UNHEALTHY",
        "metrics": metrics,
        "issues": issues,
    }


def main():
    parser = argparse.ArgumentParser(description="Run Pro-Panel database health check.")
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    args = parser.parse_args()

    result = run_health_check()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("=" * 72)
        print("PRO-PANEL DATABASE HEALTH CHECK")
        print("=" * 72)
        print(f"Status              : {result['status']}")
        print(f"Database Vendor     : {result['metrics']['vendor']}")
        print(f"Ping Latency        : {result['metrics']['ping_ms']} ms")
        print(f"Pending Migrations  : {result['metrics']['pending_migrations']}")
        print(f"FK Orphan Checks    : {result['metrics']['fk_orphan_checks_run']}")
        if "sequence_checks_run" in result["metrics"]:
            print(f"Sequence Sync Checks: {result['metrics']['sequence_checks_run']}")
        print("-" * 72)
        if result["issues"]:
            print(f"ISSUES FOUND ({len(result['issues'])}):")
            for issue in result["issues"]:
                print(f"  - {issue}")
        else:
            print("All health and referential integrity checks passed.")
        print("=" * 72)

    sys.exit(0 if result["status"] == "HEALTHY" else 1)


if __name__ == "__main__":
    main()

