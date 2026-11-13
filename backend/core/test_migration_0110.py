import importlib
import logging
import os
import sqlite3
import uuid
from types import SimpleNamespace
from unittest import TestCase, mock

logger = logging.getLogger(__name__)

migration_0110 = importlib.import_module('core.migrations.0110_add_client_id_to_idcardtable')
reconcile_idcardtable_client_id = migration_0110.reconcile_idcardtable_client_id

# Environment variables for opt-in PostgreSQL integration tests
OPT_IN_ENV_VAR = 'RUN_PG_MIGRATION_INTEGRATION_TESTS'
REQUIRED_PG_TEST_VARS = ['PG_TEST_HOST', 'PG_TEST_PORT', 'PG_TEST_USER', 'PG_TEST_PASSWORD']
FORBIDDEN_DB_NAMES = {
    'propanel_db', 'cardflow_db', 'propanel', 'cardflow',
    'production', 'prod', 'propanel_production', 'postgres'
}
FORBIDDEN_USERS = {'propanel_user', 'cardflow_user'}


def validate_test_connection_safety(host, port, user, target_db):
    """
    Validate that the connection settings do not target a production database or cluster.
    Raises RuntimeError if unsafe.
    """
    if not target_db or not target_db.startswith('test_'):
        raise RuntimeError(f"Safety violation: Test database name '{target_db}' must begin with 'test_'.")

    if target_db.lower() in FORBIDDEN_DB_NAMES:
        raise RuntimeError(f"Safety violation: Database name '{target_db}' is a protected production database.")

    if user and user.lower() in FORBIDDEN_USERS:
        raise RuntimeError(f"Safety violation: Database user '{user}' matches production user identity.")


def safe_create_test_database(admin_conn, db_name):
    """
    Safely creates a new test database after verifying it does NOT already exist.
    Never terminates connections to pre-existing databases and never drops them.
    Returns db_name on success.
    """
    with admin_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", [db_name])
        if cur.fetchone():
            raise RuntimeError(
                f"Safety violation: Database '{db_name}' already exists. Refusing to touch or overwrite pre-existing database."
            )
        cur.execute(f'CREATE DATABASE "{db_name}";')
    return db_name


def safe_drop_test_database(admin_conn, db_name):
    """
    Safely drops a temporary test database that was created by this test run.
    Guarantees it is a 'test_' prefixed database and not a protected database.
    """
    if not db_name or not db_name.startswith('test_') or db_name.lower() in FORBIDDEN_DB_NAMES:
        raise RuntimeError(f"Safety violation: Refusing to drop database '{db_name}'.")
    with admin_conn.cursor() as cur:
        cur.execute(f'DROP DATABASE "{db_name}";')


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


class Migration0110SafetyGuardTests(TestCase):
    """
    Tests verifying the safety mechanisms of the PostgreSQL integration test suite:
    - Skipped by default unless explicitly opted in.
    - Rejects missing connection parameters without silent fallbacks.
    - Rejects production database names and identities.
    - Never terminates connections or drops a pre-existing database.
    - Never triggers a drop if database creation failed.
    """

    def test_integration_test_skipped_by_default(self):
        """Integration test must be skipped when RUN_PG_MIGRATION_INTEGRATION_TESTS is unset or not '1'."""
        with mock.patch.dict(os.environ, {OPT_IN_ENV_VAR: '0'}, clear=False):
            test_instance = Migration0110PostgresIntegrationTests()
            with self.assertRaises(Exception) as ctx:
                test_instance.test_postgresql_fk_verification_and_replacement()
            # In unittest, skipTest raises a SkipTest exception
            self.assertEqual(ctx.exception.__class__.__name__, 'SkipTest')
            self.assertIn("skipped by default", str(ctx.exception))

    def test_safety_rejects_missing_postgres_credentials(self):
        """Opted-in test must skip cleanly if any required test environment variable is missing."""
        # Enable opt-in flag but omit required variables
        clean_env = {OPT_IN_ENV_VAR: '1'}
        for var in REQUIRED_PG_TEST_VARS:
            clean_env.pop(var, None)

        with mock.patch.dict(os.environ, clean_env, clear=True):
            test_instance = Migration0110PostgresIntegrationTests()
            with self.assertRaises(Exception) as ctx:
                test_instance.test_postgresql_fk_verification_and_replacement()
            self.assertEqual(ctx.exception.__class__.__name__, 'SkipTest')
            self.assertIn("Missing required PostgreSQL test environment variables", str(ctx.exception))

    def test_safety_rejects_forbidden_database_names(self):
        """Safety validator must reject known production database names."""
        for forbidden in FORBIDDEN_DB_NAMES:
            with self.assertRaises(RuntimeError) as ctx:
                validate_test_connection_safety('localhost', 5432, 'test_user', forbidden)
            self.assertIn("Safety violation", str(ctx.exception))

    def test_safety_rejects_non_test_prefix(self):
        """Safety validator must reject databases that do not start with 'test_'."""
        with self.assertRaises(RuntimeError) as ctx:
            validate_test_connection_safety('localhost', 5432, 'test_user', 'my_custom_db')
        self.assertIn("must begin with 'test_'", str(ctx.exception))

    def test_safety_rejects_production_user_identity(self):
        """Safety validator must reject production database user identities."""
        for user in FORBIDDEN_USERS:
            with self.assertRaises(RuntimeError) as ctx:
                validate_test_connection_safety('localhost', 5432, user, 'test_sample_db')
            self.assertIn("matches production user identity", str(ctx.exception))

    def test_never_drops_preexisting_database(self):
        """safe_create_test_database must fail if database already exists, and never drop it."""
        mock_cursor = mock.MagicMock()
        mock_cursor.fetchone.return_value = (1,)  # Database exists!
        mock_conn = mock.MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        with self.assertRaises(RuntimeError) as ctx:
            safe_create_test_database(mock_conn, 'test_existing_database')

        self.assertIn("already exists", str(ctx.exception))
        # Ensure DROP was never executed
        for call in mock_cursor.execute.call_args_list:
            sql = call[0][0].upper()
            self.assertNotIn("DROP DATABASE", sql)
            self.assertNotIn("PG_TERMINATE_BACKEND", sql)

    def test_safe_drop_test_database_rejects_forbidden_or_unprefixed_names(self):
        """safe_drop_test_database must strictly refuse to drop any database not starting with test_."""
        mock_conn = mock.MagicMock()
        with self.assertRaises(RuntimeError):
            safe_drop_test_database(mock_conn, 'propanel_db')
        with self.assertRaises(RuntimeError):
            safe_drop_test_database(mock_conn, 'production')
        with self.assertRaises(RuntimeError):
            safe_drop_test_database(mock_conn, 'postgres')


class Migration0110PostgresIntegrationTests(TestCase):
    """
    Opt-in PostgreSQL integration tests for:
    - Exact foreign key catalog verification
    - Non-CASCADE FK detection and replacement with validated CASCADE FK
    - Idempotency when valid CASCADE FK already exists
    - Final bigint NOT NULL schema consistency

    Safety guarantees:
    - Explicit opt-in via RUN_PG_MIGRATION_INTEGRATION_TESTS=1.
    - Requires explicit PG_TEST_HOST, PG_TEST_PORT, PG_TEST_USER, PG_TEST_PASSWORD.
    - Never uses hardcoded fallbacks or defaults to localhost/5432.
    - Generates a random unique temporary database name: test_mig0110_<uuid>.
    - Verifies database does not already exist; never terminates connections or drops pre-existing databases.
    - Tracks created database and only drops that exact database in a finally block.
    """

    def test_postgresql_fk_verification_and_replacement(self):
        # 1. Check opt-in flag
        if os.getenv(OPT_IN_ENV_VAR) != '1':
            self.skipTest(
                f"PostgreSQL integration test is skipped by default. "
                f"Set {OPT_IN_ENV_VAR}=1 and provide {', '.join(REQUIRED_PG_TEST_VARS)} to enable."
            )

        # 2. Require explicit test-only PostgreSQL connection settings
        missing_vars = [var for var in REQUIRED_PG_TEST_VARS if not os.getenv(var)]
        if missing_vars:
            self.skipTest(
                f"Missing required PostgreSQL test environment variables: {', '.join(missing_vars)}. "
                f"No default credentials or host fallbacks are permitted."
            )

        try:
            import psycopg2
        except ImportError:
            self.skipTest("psycopg2 not installed")

        pg_host = os.environ['PG_TEST_HOST']
        pg_port = int(os.environ['PG_TEST_PORT'])
        pg_user = os.environ['PG_TEST_USER']
        pg_pass = os.environ['PG_TEST_PASSWORD']
        pg_admin_db = os.getenv('PG_TEST_ADMIN_DB', 'postgres')

        # 3. Generate unique temporary database name
        test_db = f"test_mig0110_{uuid.uuid4().hex[:12]}"

        # 4. Verify safety against production targets
        validate_test_connection_safety(pg_host, pg_port, pg_user, test_db)

        admin_conn = None
        test_conn = None
        created_db_name = None

        try:
            # Connect to admin database
            admin_conn = psycopg2.connect(
                dbname=pg_admin_db,
                user=pg_user,
                password=pg_pass,
                host=pg_host,
                port=pg_port
            )
            admin_conn.autocommit = True

            # Safely create unique test database without touching pre-existing databases
            safe_create_test_database(admin_conn, test_db)
            created_db_name = test_db

            # Connect to the newly created test database
            test_conn = psycopg2.connect(
                dbname=created_db_name,
                user=pg_user,
                password=pg_pass,
                host=pg_host,
                port=pg_port
            )
            test_conn.autocommit = True
            cur = test_conn.cursor()

            # Create tables with non-CASCADE FK (ON DELETE RESTRICT)
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
                    cursor=lambda: test_conn.cursor(),
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

        finally:
            if test_conn and not test_conn.closed:
                try:
                    test_conn.close()
                except Exception:
                    pass

            # Only drop the database if this exact test run created it
            if created_db_name and admin_conn and not admin_conn.closed:
                try:
                    safe_drop_test_database(admin_conn, created_db_name)
                except Exception as cleanup_err:
                    logger.warning("Failed to clean up test database '%s': %s", created_db_name, cleanup_err)

            if admin_conn and not admin_conn.closed:
                try:
                    admin_conn.close()
                except Exception:
                    pass
