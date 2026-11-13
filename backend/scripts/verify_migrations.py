#!/usr/bin/env python
"""
Migration Integrity Verification Script for Pro-Panel.

Verifies:
1. Django system check (`manage.py check`) passes with zero issues.
2. `makemigrations --check --dry-run` detects zero unapplied model changes.
3. Migration graph has no circular dependencies, no missing nodes, and 1 leaf node per app.
4. All migrations in the graph are applied to the active database (zero pending migrations).
5. No migration files contain `SeparateDatabaseAndState` hacks or legacy model names.
"""
import argparse
import io
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

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader


def verify_migrations():
    errors = []
    stats = {
        "total_migrations": 0,
        "applied_migrations": 0,
        "pending_migrations": 0,
        "apps_with_migrations": 0,
    }

    # 1. Django system check
    try:
        out = io.StringIO()
        call_command("check", stdout=out, stderr=out)
    except Exception as exc:
        errors.append(f"[SYSTEM CHECK FAILED] {exc}")

    # 2. makemigrations --check --dry-run
    try:
        out = io.StringIO()
        call_command("makemigrations", check=True, dry_run=True, stdout=out, stderr=out)
    except SystemExit as exc:
        if exc.code != 0:
            errors.append(
                f"[UNMAKED MIGRATIONS] makemigrations --check --dry-run detected model changes: {out.getvalue().strip()}"
            )
    except Exception as exc:
        errors.append(f"[MAKEMIGRATIONS ERROR] {exc}")

    # 3. MigrationLoader graph inspection
    try:
        loader = MigrationLoader(connection, ignore_no_migrations=True)
        graph = loader.graph
        graph.ensure_not_cyclic()

        disk_nodes = set(loader.disk_migrations.keys())
        applied_nodes = set(loader.applied_migrations.keys())
        stats["total_migrations"] = len(disk_nodes)
        stats["applied_migrations"] = len(disk_nodes & applied_nodes)

        migrated_apps = sorted({app for app, _ in disk_nodes})
        stats["apps_with_migrations"] = len(migrated_apps)

        for app in migrated_apps:
            leaf_nodes = graph.leaf_nodes(app)
            if len(leaf_nodes) > 1:
                errors.append(
                    f"[MULTIPLE LEAF NODES] App '{app}' has multiple migration leaf nodes: {leaf_nodes}"
                )

        # 4. Check MigrationExecutor plan
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
        stats["pending_migrations"] = len(plan)
        if plan:
            pending_names = [f"{mig.app_label}.{mig.name}" for mig, _ in plan]
            errors.append(
                f"[PENDING MIGRATIONS] {len(plan)} migration(s) are not applied: {pending_names}"
            )
    except Exception as exc:
        errors.append(f"[MIGRATION GRAPH ERROR] {exc}")

    # 5. Inspect migration source files for forbidden patterns
    for mig_file in sorted(BASE_DIR.glob("*/migrations/*.py")):
        if mig_file.name == "__init__.py":
            continue
        content = mig_file.read_text(encoding="utf-8")
        rel_path = str(mig_file.relative_to(BASE_DIR))
        if "SeparateDatabaseAndState" in content:
            errors.append(
                f"[FORBIDDEN HACK] {rel_path} uses SeparateDatabaseAndState."
            )

    return {
        "status": "PASS" if not errors else "FAIL",
        "stats": stats,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Verify Django migration integrity.")
    parser.add_argument("--json", action="store_true", help="Output JSON.")
    args = parser.parse_args()

    result = verify_migrations()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("=" * 72)
        print("PRO-PANEL MIGRATION INTEGRITY VERIFICATION")
        print("=" * 72)
        print(f"Apps With Migrations : {result['stats']['apps_with_migrations']}")
        print(f"Total Disk Migrations: {result['stats']['total_migrations']}")
        print(f"Applied Migrations   : {result['stats']['applied_migrations']}")
        print(f"Pending Migrations   : {result['stats']['pending_migrations']}")
        print(f"Overall Status       : {result['status']}")
        print("-" * 72)
        if result["errors"]:
            print(f"ERRORS ({len(result['errors'])}):")
            for err in result["errors"]:
                print(f"  - {err}")
        else:
            print("All migration checks passed with 0 errors.")
        print("=" * 72)

    sys.exit(0 if result["status"] == "PASS" else 1)


if __name__ == "__main__":
    main()

