import importlib
import os
import sqlite3
from types import SimpleNamespace
from unittest import TestCase

migration_0110 = importlib.import_module('core.migrations.0110_add_client_id_to_idcardtable')
reconcile_idcardtable_client_id = migration_0110.reconcile_idcardtable_client_id


class CursorContextWrapper:
    """Provides a context manager for sqlite3.Cursor."""
    def __init__(self, cursor):
        self.cursor = cursor

    def __enter__(self):
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


def make_sqlite_connection_wrapper(conn):
    """Wraps a sqlite3.Connection into a schema_editor connection interface."""
    return SimpleNamespace(
        cursor=lambda: CursorContextWrapper(conn.cursor()),
        vendor='sqlite',
        introspection=SimpleNamespace(
            table_names=lambda c: [
                r[0] for r in conn.cursor().execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
            ],
            get_table_description=lambda c, t: [
                SimpleNamespace(name=r[1]) for r in conn.cursor().execute(f"PRAGMA table_info({t});").fetchall()
            ]
        )
    )


class Migration0110UnitTests(TestCase):
    """
    Isolated unit tests for core.migrations.0110_add_client_id_to_idcardtable:
    1. Safe backfill of NULL client_id from organisation_id
    2. Safe backfill of NULL client_id from group_id
    3. Fail fast with diagnostics if NULL rows have no valid source
    4. Fail fast with diagnostics if orphan client_id references exist
    5. Fail fast with diagnostics if ambiguous ownership (conflicting organisation_id and group.client_id) exists
    6. Non-overwriting of existing valid client_id
    7. Safe re-running after data remediation (idempotent)
    8. SQLite existing-table path compatibility
    """

    def setUp(self):
        self.conn = sqlite3.connect(':memory:')
        self.cur = self.conn.cursor()
        self.cur.execute("""
            CREATE TABLE core_client (
                id integer PRIMARY KEY AUTOINCREMENT,
                name varchar(255) NOT NULL
            );
        """)
        self.cur.execute("""
            CREATE TABLE core_idcardtable (
                id integer PRIMARY KEY AUTOINCREMENT,
                name varchar(255) NOT NULL,
                table_type varchar(20) NOT NULL DEFAULT 'custom',
                fields text NOT NULL DEFAULT '[]',
                is_active bool NOT NULL DEFAULT 1,
                deleted_by_client bool NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                client_id bigint NULL,
                organisation_id integer NULL,
                group_id integer NULL,
                description text NULL
            );
        """)
        self.cur.execute("INSERT INTO core_client (id, name) VALUES (1, 'Org 1'), (2, 'Org 2');")
        self.conn.commit()
        self.schema_editor = SimpleNamespace(connection=make_sqlite_connection_wrapper(self.conn))

    def tearDown(self):
        self.conn.close()

    def test_null_rows_successfully_backfilled_from_organisation_id(self):
        """NULL client_id is safely backfilled from organisation_id when organisation_id is valid."""
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id, organisation_id)
            VALUES (10, 'Table Org Backfill', datetime('now'), datetime('now'), NULL, 1);
        """)
        self.conn.commit()

        reconcile_idcardtable_client_id(None, self.schema_editor)

        self.cur.execute("SELECT client_id FROM core_idcardtable WHERE id = 10;")
        self.assertEqual(self.cur.fetchone()[0], 1)

    def test_null_rows_successfully_backfilled_from_group_id(self):
        """NULL client_id is safely backfilled from group.client_id when group_id is valid."""
        self.cur.execute("""
            CREATE TABLE core_idcardgroup (
                id integer PRIMARY KEY AUTOINCREMENT,
                name varchar(255) NOT NULL,
                client_id bigint NOT NULL
            );
        """)
        self.cur.execute("INSERT INTO core_idcardgroup (id, name, client_id) VALUES (55, 'Test Group', 2);")
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id, group_id)
            VALUES (20, 'Table Group Backfill', datetime('now'), datetime('now'), NULL, 55);
        """)
        self.conn.commit()

        reconcile_idcardtable_client_id(None, self.schema_editor)

        self.cur.execute("SELECT client_id FROM core_idcardtable WHERE id = 20;")
        self.assertEqual(self.cur.fetchone()[0], 2)

    def test_does_not_overwrite_existing_valid_client_id(self):
        """Existing non-NULL client_id is never overwritten by organisation_id or group_id."""
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id, organisation_id)
            VALUES (30, 'Table Existing Client', datetime('now'), datetime('now'), 1, 2);
        """)
        self.conn.commit()

        reconcile_idcardtable_client_id(None, self.schema_editor)

        self.cur.execute("SELECT client_id FROM core_idcardtable WHERE id = 30;")
        self.assertEqual(self.cur.fetchone()[0], 1)

    def test_null_rows_with_no_valid_source_fails(self):
        """Migration must fail with clear diagnostics if client_id is NULL and no valid source exists."""
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id, organisation_id)
            VALUES (40, 'Table Unassigned', datetime('now'), datetime('now'), NULL, NULL);
        """)
        self.conn.commit()

        with self.assertRaises(RuntimeError) as ctx:
            reconcile_idcardtable_client_id(None, self.schema_editor)

        err = str(ctx.exception)
        self.assertIn("NULL client_id rows", err)
        self.assertIn("Remediation instructions", err)

    def test_orphan_references_fails(self):
        """Migration must fail with clear diagnostics if client_id references a non-existent organisation."""
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id)
            VALUES (50, 'Table Orphan', datetime('now'), datetime('now'), 999999);
        """)
        self.conn.commit()

        with self.assertRaises(RuntimeError) as ctx:
            reconcile_idcardtable_client_id(None, self.schema_editor)

        err = str(ctx.exception)
        self.assertIn("Orphan client_id rows", err)
        self.assertIn("Remediation instructions", err)

    def test_ambiguous_ownership_fails(self):
        """Migration must fail if organisation_id and group.client_id conflict on a NULL client_id row."""
        self.cur.execute("""
            CREATE TABLE core_idcardgroup (
                id integer PRIMARY KEY AUTOINCREMENT,
                name varchar(255) NOT NULL,
                client_id bigint NOT NULL
            );
        """)
        self.cur.execute("INSERT INTO core_idcardgroup (id, name, client_id) VALUES (66, 'Group 66', 2);")
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id, organisation_id, group_id)
            VALUES (60, 'Table Ambiguous', datetime('now'), datetime('now'), NULL, 1, 66);
        """)
        self.conn.commit()

        with self.assertRaises(RuntimeError) as ctx:
            reconcile_idcardtable_client_id(None, self.schema_editor)

        err = str(ctx.exception)
        self.assertIn("Ambiguous organisation ownership", err)

    def test_rerun_after_remediation(self):
        """Migration safely re-runs and succeeds after data remediation."""
        # 1. Create bad data (orphan)
        self.cur.execute("""
            INSERT INTO core_idcardtable (id, name, created_at, updated_at, client_id)
            VALUES (70, 'Table Remediate', datetime('now'), datetime('now'), 888888);
        """)
        self.conn.commit()

        # 2. Must fail initially
        with self.assertRaises(RuntimeError):
            reconcile_idcardtable_client_id(None, self.schema_editor)

        # 3. Remediate data: assign to valid organisation 1
        self.cur.execute("UPDATE core_idcardtable SET client_id = 1 WHERE id = 70;")
        self.conn.commit()

        # 4. Re-run migration: must succeed completely
        reconcile_idcardtable_client_id(None, self.schema_editor)

        # 5. Subsequent run must also succeed (idempotent)
        reconcile_idcardtable_client_id(None, self.schema_editor)

        self.cur.execute("SELECT client_id FROM core_idcardtable WHERE id = 70;")
        self.assertEqual(self.cur.fetchone()[0], 1)

    def test_sqlite_existing_table_path(self):
        """SQLite existing-table path validates cleanly and remains idempotent."""
        reconcile_idcardtable_client_id(None, self.schema_editor)
        reconcile_idcardtable_client_id(None, self.schema_editor)


class Migration0110PostgresIntegrationTests(TestCase):
    """
    Direct PostgreSQL integration tests for:
    - Exact foreign key catalog verification
    - Non-CASCADE FK detection and replacement with validated CASCADE FK
    - Idempotency when valid CASCADE FK already exists
    - Final bigint NOT NULL schema consistency
    """

    def test_postgresql_fk_verification_and_replacement(self):
        try:
            import psycopg2
        except ImportError:
            self.skipTest("psycopg2 not installed")

        pg_user = os.getenv('POSTGRES_USER', 'postgres')
        pg_pass = os.getenv('POSTGRES_PASSWORD', 'Roshan@1510')
        pg_host = os.getenv('POSTGRES_HOST', 'localhost')
        pg_port = os.getenv('POSTGRES_PORT', '5432')

        try:
            conn = psycopg2.connect(
                dbname='postgres',
                user=pg_user,
                password=pg_pass,
                host=pg_host,
                port=pg_port
            )
        except Exception as e:
            self.skipTest(f"PostgreSQL not reachable: {e}")

        conn.autocommit = True
        cur = conn.cursor()

        test_db = 'test_pg_fk_audit'
        cur.execute(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{test_db}' AND pid <> pg_backend_pid();")
        cur.execute(f"DROP DATABASE IF EXISTS {test_db};")
        cur.execute(f"CREATE DATABASE {test_db};")
        cur.close()
        conn.close()

        # Connect to test_db
        conn = psycopg2.connect(
            dbname=test_db,
            user=pg_user,
            password=pg_pass,
            host=pg_host,
            port=pg_port
        )
        conn.autocommit = True
        cur = conn.cursor()

        # 1. Create tables with non-CASCADE FK (ON DELETE RESTRICT)
        cur.execute("""
            CREATE TABLE core_client (
                id bigserial PRIMARY KEY,
                name varchar(255) NOT NULL
            );
            CREATE TABLE core_idcardtable (
                id bigserial PRIMARY KEY,
                name varchar(255) NOT NULL,
                client_id integer NULL,
                organisation_id integer NULL
            );
            INSERT INTO core_client (id, name) VALUES (1, 'Test Org');
            INSERT INTO core_idcardtable (id, name, client_id) VALUES (10, 'Card Table 1', 1);

            -- Add NON-CASCADE FK (ON DELETE RESTRICT)
            ALTER TABLE core_idcardtable
                ADD CONSTRAINT test_non_cascade_fk
                FOREIGN KEY (client_id) REFERENCES core_client(id) ON DELETE RESTRICT;
        """)

        # Verify initial constraint is RESTRICT ('r')
        cur.execute("""
            SELECT c.conname, c.confdeltype
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'core_idcardtable' AND c.contype = 'f';
        """)
        fks_before = cur.fetchall()
        self.assertEqual(len(fks_before), 1)
        self.assertEqual(fks_before[0][1], 'r')  # 'r' = RESTRICT

        # Create schema editor mock pointing to this postgres connection
        pg_schema_editor = SimpleNamespace(
            connection=SimpleNamespace(
                cursor=lambda: conn.cursor(),
                vendor='postgresql',
                introspection=SimpleNamespace(
                    table_names=lambda c: ['core_idcardtable', 'core_client'],
                    get_table_description=lambda c, t: [
                        SimpleNamespace(name='id'),
                        SimpleNamespace(name='name'),
                        SimpleNamespace(name='client_id'),
                        SimpleNamespace(name='organisation_id'),
                    ]
                )
            )
        )

        # Run reconciliation
        reconcile_idcardtable_client_id(None, pg_schema_editor)

        # Verify:
        # 1. Non-CASCADE FK was dropped and replaced by CASCADE FK ('c')
        # 2. convalidated is True
        # 3. client_id data_type is bigint
        # 4. is_nullable is NO
        cur.execute("""
            SELECT
                c.conname,
                c.confdeltype,
                c.convalidated,
                src_a.attname AS src_col,
                ref_t.relname AS ref_table,
                ref_a.attname AS ref_col
            FROM pg_constraint c
            JOIN pg_class src_t ON c.conrelid = src_t.oid
            JOIN pg_class ref_t ON c.confrelid = ref_t.oid
            JOIN pg_attribute src_a ON src_a.attrelid = src_t.oid AND src_a.attnum = c.conkey[1]
            JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = c.confkey[1]
            WHERE c.contype = 'f' AND src_t.relname = 'core_idcardtable';
        """)
        fks_after = cur.fetchall()
        self.assertEqual(len(fks_after), 1)
        conname, confdeltype, convalidated, src_col, ref_table, ref_col = fks_after[0]
        self.assertEqual(confdeltype, 'c')
        self.assertTrue(convalidated)
        self.assertEqual(src_col, 'client_id')
        self.assertEqual(ref_table, 'core_client')
        self.assertEqual(ref_col, 'id')

        # Check column type & nullability
        cur.execute("""
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'core_idcardtable' AND column_name = 'client_id';
        """)
        data_type, is_nullable = cur.fetchone()
        self.assertEqual(data_type.lower(), 'bigint')
        self.assertEqual(is_nullable.upper(), 'NO')

        # Run again to ensure repeated execution is safe (idempotent)
        reconcile_idcardtable_client_id(None, pg_schema_editor)

        cur.close()
        conn.close()

        # Drop temporary database
        conn = psycopg2.connect(dbname='postgres', user=pg_user, password=pg_pass, host=pg_host, port=pg_port)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(f"DROP DATABASE IF EXISTS {test_db};")
        cur.close()
        conn.close()
