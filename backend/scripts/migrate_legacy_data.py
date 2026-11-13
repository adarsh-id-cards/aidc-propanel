#!/usr/bin/env python
"""
Production-Safe Data Migration Utility for Pro-Panel.

Migrates data from a legacy schema (or pre-rebuild backup) into the clean rebuilt schema:
1. Supports both historical VPS table names (core_client, core_idcardtable, core_idcard,
   core_reprintrequest, operations_log) and intermediate names (core_operation, etc.).
2. Maps all renamed columns and handles legacy defaults cleanly.
3. Migrates tables in strict topological dependency order with transaction safety.
4. Preserves primary keys, timestamps, JSON payloads, and referential integrity.
5. Updates and synchronizes all PostgreSQL sequences to MAX(id) upon completion.
6. Emits a structured reconciliation report comparing source rows vs migrated rows.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor, execute_batch

# Topological entity migration sequence: (source_candidates, target_table, column_transforms)
MIGRATION_PIPELINE = [
    # 1. Base auth & groups
    {
        "name": "Auth Groups",
        "sources": ["auth_group"],
        "target": "auth_group",
    },
    {
        "name": "Auth Group Permissions",
        "sources": ["auth_group_permissions"],
        "target": "auth_group_permissions",
    },
    # 2. SaaS Subscriptions & Tiers
    {
        "name": "SaaS Tier Features",
        "sources": ["saas_saastierfeature"],
        "target": "saas_saastierfeature",
    },
    {
        "name": "SaaS Subscriptions",
        "sources": ["saas_saassubscription"],
        "target": "saas_saassubscription",
    },
    {
        "name": "SaaS Leads",
        "sources": ["saas_saaslead"],
        "target": "saas_saaslead",
    },
    # 3. Users & Auth
    {
        "name": "Users",
        "sources": ["core_user"],
        "target": "core_user",
    },
    {
        "name": "User Groups",
        "sources": ["core_user_groups"],
        "target": "core_user_groups",
    },
    {
        "name": "User Permissions",
        "sources": ["core_user_user_permissions"],
        "target": "core_user_user_permissions",
    },
    # 4. User Accounts & Devices
    {
        "name": "User Device Sessions",
        "sources": ["accounts_userdevicesession"],
        "target": "accounts_userdevicesession",
    },
    {
        "name": "User Security PINs",
        "sources": ["accounts_usersecuritypin"],
        "target": "accounts_usersecuritypin",
    },
    {
        "name": "Desktop App Devices",
        "sources": ["desktop_app_desktopappdevice"],
        "target": "desktop_app_desktopappdevice",
    },
    {
        "name": "Mobile Device Tokens",
        "sources": ["mobile_device_tokens"],
        "target": "mobile_device_tokens",
    },
    # 5. Core System Entities
    {
        "name": "System Settings",
        "sources": ["core_systemsettings"],
        "target": "core_systemsettings",
    },
    {
        "name": "Export Templates",
        "sources": ["core_exporttemplate"],
        "target": "core_exporttemplate",
    },
    {
        "name": "Email Logs",
        "sources": ["core_emaillog"],
        "target": "core_emaillog",
    },
    {
        "name": "Activity Logs",
        "sources": ["core_activitylog"],
        "target": "core_activitylog",
    },
    {
        "name": "Background Tasks",
        "sources": ["core_backgroundtask"],
        "target": "core_backgroundtask",
    },
    {
        "name": "Backup Tasks",
        "sources": ["core_backuptask"],
        "target": "core_backuptask",
    },
    {
        "name": "System Metric Snapshots",
        "sources": ["core_systemmetricsnapshot"],
        "target": "core_systemmetricsnapshot",
    },
    # 6. SaaS Operational Records
    {
        "name": "SaaS Payments",
        "sources": ["saas_saaspayment"],
        "target": "saas_saaspayment",
    },
    {
        "name": "SaaS Card Top-up Requests",
        "sources": ["saas_saascardtopuprequest"],
        "target": "saas_saascardtopuprequest",
    },
    {
        "name": "SaaS Add-on Requests",
        "sources": ["saas_saasaddonrequest"],
        "target": "saas_saasaddonrequest",
    },
    {
        "name": "SaaS Platform Logs",
        "sources": ["saas_saasplatformlog"],
        "target": "saas_saasplatformlog",
    },
    # 7. Organisations (handling core_client or organisation_organisation)
    {
        "name": "Organisations",
        "sources": ["organisation_organisation", "core_client"],
        "target": "organisation_organisation",
        "column_map": {
            "client_type": "org_type",
            "perm_idcard_deleted_list": "perm_idcard_pool_list",
            "perm_idcard_printed_list": "perm_idcard_download_list",
            "perm_idcard_client_list": "perm_organisation_list",
        },
    },
    # 8. Notifications & Messages
    {
        "name": "Notifications",
        "sources": ["core_notification"],
        "target": "core_notification",
    },
    {
        "name": "Notification Target Users",
        "sources": ["core_notification_target_users"],
        "target": "core_notification_target_users",
    },
    {
        "name": "Notification Reads",
        "sources": ["core_notificationread"],
        "target": "core_notificationread",
    },
    {
        "name": "Client Messages",
        "sources": ["core_clientmessage"],
        "target": "core_clientmessage",
        "column_map": {
            "organisation_id": "client_id",
        },
    },
    {
        "name": "Client Presence Sessions",
        "sources": ["core_clientpresencesession"],
        "target": "core_clientpresencesession",
        "column_map": {
            "organisation_id": "client_id",
        },
    },
    # 9. Organisation Managers
    {
        "name": "Organisation Managers",
        "sources": ["organisation_manager"],
        "target": "organisation_manager",
        "column_map": {
            "client_id": "organisation_id",
            "perm_idcard_deleted_list": "perm_idcard_pool_list",
            "perm_idcard_printed_list": "perm_idcard_download_list",
        },
    },
    # 10. Photographers
    {
        "name": "Photographers",
        "sources": ["core_photographer"],
        "target": "core_photographer",
    },
    {
        "name": "Photographer Assignments",
        "sources": ["core_photographerassignment"],
        "target": "core_photographerassignment",
        "column_map": {
            "organisation_id": "client_id",
        },
    },
    # 11. Tables (handling tables_table or core_idcardtable)
    {
        "name": "Tables",
        "sources": ["tables_table", "core_idcardtable"],
        "target": "tables_table",
        "column_map": {
            "client_id": "organisation_id",
            "deleted_by_client": "deleted_by_manager",
        },
    },
    {
        "name": "Table Access Grants",
        "sources": ["tables_tableaccess"],
        "target": "tables_tableaccess",
    },
    {
        "name": "Table Freezes",
        "sources": ["tables_tablefreeze"],
        "target": "tables_tablefreeze",
    },
    {
        "name": "Collection Campaigns",
        "sources": ["tables_collectioncampaign"],
        "target": "tables_collectioncampaign",
    },
    {
        "name": "Photo Collection Links",
        "sources": ["tables_photocollectionlink"],
        "target": "tables_photocollectionlink",
    },
    # 12. ID Cards (handling tables_idcard or core_idcard)
    {
        "name": "ID Cards",
        "sources": ["tables_idcard", "core_idcard"],
        "target": "tables_idcard",
    },
    {
        "name": "Data Collection Records",
        "sources": ["tables_datacollectionrecord"],
        "target": "tables_datacollectionrecord",
    },
    {
        "name": "Data Collection Events",
        "sources": ["tables_datacollectionevent"],
        "target": "tables_datacollectionevent",
    },
    # 13. Media & Reprints
    {
        "name": "Card Media",
        "sources": ["mediafiles_cardmedia"],
        "target": "mediafiles_cardmedia",
    },
    {
        "name": "Reprint Requests",
        "sources": ["reprint_reprintrequest", "core_reprintrequest"],
        "target": "reprint_reprintrequest",
    },
    # 14. Operations & Auditing
    {
        "name": "Operations",
        "sources": ["operations_operation", "core_operation", "operations_log"],
        "target": "operations_operation",
    },
    {
        "name": "Operation Changes",
        "sources": ["operations_operationchange", "core_operationchange", "operations_change"],
        "target": "operations_operationchange",
    },
    {
        "name": "Bulk Transactions",
        "sources": ["operations_bulktransaction", "core_bulktransaction", "operations_bulk_transaction"],
        "target": "operations_bulktransaction",
    },
    {
        "name": "Audit Events",
        "sources": ["operations_auditevent", "core_auditevent", "operations_audit_event"],
        "target": "operations_auditevent",
    },
    # 15. Staff (Assistants & Operators)
    {
        "name": "Assistants",
        "sources": ["assistants_assistant"],
        "target": "assistants_assistant",
        "column_map": {
            "client_id": "organisation_id",
            "perm_idcard_client_list": "perm_organisation_list",
            "perm_manage_client_staff": "perm_manage_assistants",
            "perm_idcard_deleted_list": "perm_idcard_pool_list",
            "perm_idcard_printed_list": "perm_idcard_download_list",
        },
    },
    {
        "name": "Assistant Assigned Groups",
        "sources": ["assistants_assistant_assigned_groups"],
        "target": "assistants_assistant_assigned_groups",
    },
    {
        "name": "Operators",
        "sources": ["operators_operator"],
        "target": "operators_operator",
        "column_map": {
            "perm_organisation_list": "perm_idcard_client_list",
            "perm_idcard_deleted_list": "perm_idcard_pool_list",
            "perm_idcard_printed_list": "perm_idcard_download_list",
        },
    },
    {
        "name": "Operator Assigned Organisations",
        "sources": ["operators_operator_assigned_organisations"],
        "target": "operators_operator_assigned_organisations",
    },
    # 16. Statistics
    {
        "name": "Stats Snapshots",
        "sources": ["stats_statssnapshot"],
        "target": "stats_statssnapshot",
    },
    {
        "name": "Server Load Alerts",
        "sources": ["stats_serverloadalert"],
        "target": "stats_serverloadalert",
    },
]


def migrate_database(source_dsn, target_dsn, batch_size=500):
    start_time = time.time()
    conn_src = psycopg2.connect(source_dsn)
    conn_src.set_session(readonly=True)
    conn_tgt = psycopg2.connect(target_dsn)
    conn_tgt.autocommit = False

    reconciliation = []
    errors = []

    try:
        with conn_src.cursor(cursor_factory=RealDictCursor) as cur_src, conn_tgt.cursor() as cur_tgt:
            # Discover existing tables in source and target
            cur_src.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
            src_tables = {row["table_name"] for row in cur_src.fetchall()}

            cur_tgt.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
            tgt_tables = {row[0] for row in cur_tgt.fetchall()}

            for step in MIGRATION_PIPELINE:
                step_name = step["name"]
                target_table = step["target"]
                col_map = step.get("column_map", {})

                # Find which source table exists
                source_table = None
                for src in step["sources"]:
                    if src in src_tables:
                        source_table = src
                        break

                if not source_table:
                    reconciliation.append(
                        {
                            "entity": step_name,
                            "source_table": "NONE",
                            "target_table": target_table,
                            "source_rows": 0,
                            "migrated_rows": 0,
                            "status": "SKIPPED_NO_SOURCE",
                        }
                    )
                    continue

                if target_table not in tgt_tables:
                    errors.append(
                        f"Target table '{target_table}' for '{step_name}' does not exist in target database."
                    )
                    continue

                # Query target column definitions
                cur_tgt.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                    """,
                    (target_table,),
                )
                target_columns = {row[0] for row in cur_tgt.fetchall()}

                # Count rows in source
                cur_src.execute(f'SELECT COUNT(*) AS cnt FROM "{source_table}"')
                src_row_count = cur_src.fetchone()["cnt"]

                if src_row_count == 0:
                    reconciliation.append(
                        {
                            "entity": step_name,
                            "source_table": source_table,
                            "target_table": target_table,
                            "source_rows": 0,
                            "migrated_rows": 0,
                            "status": "PASS_ZERO_ROWS",
                        }
                    )
                    continue

                # Fetch rows from source
                cur_src.execute(f'SELECT * FROM "{source_table}" ORDER BY 1')
                rows = cur_src.fetchall()

                # Process columns and insert into target
                sample_row = rows[0]
                valid_tgt_cols = []
                col_sources = {}

                for src_col, val in sample_row.items():
                    mapped_tgt_col = col_map.get(src_col, src_col)
                    if mapped_tgt_col in target_columns:
                        valid_tgt_cols.append(mapped_tgt_col)
                        col_sources[mapped_tgt_col] = src_col

                col_clause = ", ".join(f'"{c}"' for c in valid_tgt_cols)
                placeholders = ", ".join("%s" for _ in valid_tgt_cols)
                insert_sql = (
                    f'INSERT INTO "{target_table}" ({col_clause}) '
                    f"VALUES ({placeholders}) "
                    f"ON CONFLICT DO NOTHING"
                )

                batch_data = []
                for r in rows:
                    tuple_val = []
                    for c in valid_tgt_cols:
                        val = r[col_sources[c]]
                        if isinstance(val, (dict, list)):
                            val = json.dumps(val)
                        tuple_val.append(val)
                    batch_data.append(tuple(tuple_val))

                execute_batch(cur_tgt, insert_sql, batch_data, page_size=batch_size)

                # Check migrated rows
                cur_tgt.execute(f'SELECT COUNT(*) FROM "{target_table}"')
                tgt_row_count = cur_tgt.fetchone()[0]

                reconciliation.append(
                    {
                        "entity": step_name,
                        "source_table": source_table,
                        "target_table": target_table,
                        "source_rows": src_row_count,
                        "migrated_rows": tgt_row_count,
                        "status": "PASS" if tgt_row_count >= src_row_count else "WARNING_ROW_MISMATCH",
                    }
                )

            # Synchronize all PostgreSQL sequences in target
            cur_tgt.execute(
                """
                SELECT c.relname, a.attname
                FROM pg_class c
                JOIN pg_attribute a ON a.attrelid = c.oid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                  AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL
                """
            )
            seq_pairs = cur_tgt.fetchall()
            synced_sequences = 0
            for tname, colname in seq_pairs:
                cur_tgt.execute(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('"{tname}"', '{colname}'),
                        COALESCE((SELECT MAX("{colname}") FROM "{tname}"), 1),
                        (SELECT COUNT(*) FROM "{tname}") > 0
                    )
                    """
                )
                synced_sequences += 1

            conn_tgt.commit()
    except Exception as exc:
        conn_tgt.rollback()
        errors.append(f"Migration failed and was rolled back: {exc}")
        raise
    finally:
        conn_src.close()
        conn_tgt.close()

    elapsed = round(time.time() - start_time, 2)
    return {
        "status": "PASS" if not errors else "FAIL",
        "elapsed_seconds": elapsed,
        "reconciliation": reconciliation,
        "synced_sequences": synced_sequences if 'synced_sequences' in locals() else 0,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Migrate legacy Pro-Panel database to clean schema.")
    parser.add_argument("--source-dsn", required=True, help="PostgreSQL connection string for legacy source DB.")
    parser.add_argument("--target-dsn", required=True, help="PostgreSQL connection string for clean target DB.")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format.")
    args = parser.parse_args()

    res = migrate_database(args.source_dsn, args.target_dsn)
    if args.json:
        print(json.dumps(res, indent=2))
        return

    print("=" * 88)
    print("PRO-PANEL DATA MIGRATION RECONCILIATION REPORT")
    print("=" * 88)
    print(f"Status           : {res['status']}")
    print(f"Elapsed Time     : {res['elapsed_seconds']} seconds")
    print(f"Sequences Synced : {res['synced_sequences']}")
    print("-" * 88)
    print(f"{'Logical Entity':<28} {'Source Table':<28} {'Target Table':<28} {'Src':>4} {'Tgt':>4}")
    print("-" * 88)
    for r in res["reconciliation"]:
        if r["source_rows"] > 0 or r["migrated_rows"] > 0:
            print(
                f"{r['entity']:<28} {r['source_table']:<28} {r['target_table']:<28} {r['source_rows']:>4} {r['migrated_rows']:>4}"
            )
    print("=" * 88)
    if res["errors"]:
        print(f"ERRORS ({len(res['errors'])}):")
        for err in res["errors"]:
            print(f"  - {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
