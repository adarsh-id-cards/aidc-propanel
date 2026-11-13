import importlib
import ipaddress
import logging
import os
import re
import sqlite3
import sys
import uuid
from types import SimpleNamespace
from unittest import TestCase, mock

logger = logging.getLogger(__name__)

migration_0110 = importlib.import_module('core.migrations.0110_add_client_id_to_idcardtable')
reconcile_idcardtable_client_id = migration_0110.reconcile_idcardtable_client_id

# Environment variables for opt-in PostgreSQL integration tests
OPT_IN_ENV_VAR = 'RUN_PG_MIGRATION_INTEGRATION_TESTS'
REQUIRED_PG_TEST_VARS = [
    'PG_TEST_HOST',
    'PG_TEST_PORT',
    'PG_TEST_USER',
    'PG_TEST_PASSWORD',
    'PG_TEST_ADMIN_DB'
]
ALLOWLIST_PG_TEST_VARS = [
    'PG_TEST_ALLOWED_HOSTS',
    'PG_TEST_ALLOWED_PORTS'
]
FORBIDDEN_DB_NAMES = {
    'propanel_db', 'cardflow_db', 'propanel', 'cardflow',
    'production', 'prod', 'propanel_production', 'postgres',
    'template1', 'template0'
}
FORBIDDEN_USERS = {'propanel_user', 'cardflow_user'}


def normalize_host(host_str):
    """
    Normalizes a hostname or IP address.
    Rejects empty, whitespace-only, or malformed host strings.
    """
    if host_str is None or not isinstance(host_str, str):
        raise ValueError("Host must be a non-empty string.")
    cleaned = host_str.strip().lower()
    if not cleaned:
        raise ValueError("Host cannot be empty or whitespace.")

    # Check for IPv6 addresses enclosed in brackets e.g. [::1]
    if cleaned.startswith('[') and cleaned.endswith(']'):
        cleaned = cleaned[1:-1].strip()

    # Reject whitespace or illegal characters in hostnames
    if any(c in cleaned for c in (' ', '\t', '\n', '\r', '/', '\\', '@', '?', '#')):
        raise ValueError(f"Malformed host string: '{host_str}'.")

    # If it contains colon, check if it's a valid IPv6 address
    if ':' in cleaned:
        try:
            ip = ipaddress.ip_address(cleaned)
            return str(ip)
        except ValueError:
            raise ValueError(f"Malformed host string with colon: '{host_str}'. Host cannot include port or invalid IPv6.")

    # Try parsing as IPv4
    try:
        ip = ipaddress.ip_address(cleaned)
        return str(ip)
    except ValueError:
        pass

    # Hostname syntax check (RFC 1123)
    hostname_regex = re.compile(r'^(?!-)[a-z0-9-_]{1,63}(?<!-)(\.(?!-)[a-z0-9-_]{1,63}(?<!-))*$')
    if not hostname_regex.match(cleaned):
        raise ValueError(f"Malformed hostname: '{host_str}'.")

    return cleaned


def normalize_port(port_val):
    """
    Normalizes and validates a port number.
    Must be an integer in 1..65535.
    Rejects non-integer, <= 0, > 65535, boolean, or malformed strings.
    """
    if port_val is None:
        raise ValueError("Port cannot be None.")
    if isinstance(port_val, bool):
        raise ValueError("Port cannot be a boolean.")
    if isinstance(port_val, str):
        cleaned = port_val.strip()
        if not cleaned:
            raise ValueError("Port string cannot be empty.")
        if not cleaned.isdigit():
            raise ValueError(f"Malformed port '{port_val}': must be digits.")
        port_num = int(cleaned)
    elif isinstance(port_val, int):
        port_num = port_val
    else:
        raise ValueError(f"Invalid port type '{type(port_val).__name__}'.")

    if port_num < 1 or port_num > 65535:
        raise ValueError(f"Port '{port_num}' out of valid range (1-65535).")
    return port_num


def parse_allowed_hosts(allowed_hosts_str):
    """
    Parses comma-separated allowed hosts.
    Rejects empty, whitespace-only, or malformed entries.
    Returns a set of normalized host strings.
    """
    if not allowed_hosts_str or not isinstance(allowed_hosts_str, str) or not allowed_hosts_str.strip():
        raise ValueError("PG_TEST_ALLOWED_HOSTS must be a non-empty comma-separated string.")
    entries = allowed_hosts_str.split(',')
    allowed = set()
    for entry in entries:
        raw = entry.strip()
        if not raw:
            raise ValueError(f"Malformed allowed hosts: empty entry in '{allowed_hosts_str}'.")
        allowed.add(normalize_host(raw))
    return allowed


def parse_allowed_ports(allowed_ports_str):
    """
    Parses comma-separated allowed ports.
    Rejects empty, whitespace-only, or malformed entries.
    Returns a set of integer port numbers.
    """
    if not allowed_ports_str or not isinstance(allowed_ports_str, str) or not allowed_ports_str.strip():
        raise ValueError("PG_TEST_ALLOWED_PORTS must be a non-empty comma-separated string.")
    entries = allowed_ports_str.split(',')
    allowed = set()
    for entry in entries:
        raw = entry.strip()
        if not raw:
            raise ValueError(f"Malformed allowed ports: empty entry in '{allowed_ports_str}'.")
        allowed.add(normalize_port(raw))
    return allowed


def validate_database_name_safety(db_name, role="Database"):
    """
    Validates that a database name satisfies strict test-only naming policies.
    - Must be a non-empty string.
    - Must begin with 'test_'.
    - Must not match any forbidden production database name.
    - Must not contain invalid or unsafe characters.
    """
    if not db_name or not isinstance(db_name, str):
        raise RuntimeError(f"Safety violation: {role} name must be a non-empty string.")

    cleaned = db_name.strip().lower()
    if not cleaned:
        raise RuntimeError(f"Safety violation: {role} name cannot be empty or whitespace.")

    if cleaned in FORBIDDEN_DB_NAMES:
        raise RuntimeError(f"Safety violation: {role} name '{db_name}' is a protected production database.")

    if not cleaned.startswith('test_'):
        raise RuntimeError(f"Safety violation: {role} name '{db_name}' must begin with 'test_'.")

    if not re.match(r'^[a-z0-9_]+$', cleaned):
        raise RuntimeError(f"Safety violation: {role} name '{db_name}' contains invalid characters.")

    return cleaned


def validate_admin_db_safety(admin_db):
    """
    Validates that the admin database satisfies the explicit test-only naming policy.
    Rejects protected production database names (postgres, propanel_db, etc.)
    and requires the 'test_' prefix.
    """
    return validate_database_name_safety(admin_db, role="Admin database")


def validate_test_connection_safety(
    host,
    port,
    user,
    target_db,
    admin_db=None,
    allowed_hosts_str=None,
    allowed_ports_str=None
):
    """
    Validate that the connection settings do not target a production database or cluster,
    and strictly match approved test hosts, ports, and test database naming policies.
    Raises RuntimeError if unsafe.
    """
    # 1. Validate target database name
    validate_database_name_safety(target_db, role="Target test database")

    # 2. Validate admin database name if provided
    if admin_db is not None:
        validate_database_name_safety(admin_db, role="Admin database")

    # 3. Validate user identity
    if user and user.lower() in FORBIDDEN_USERS:
        raise RuntimeError(f"Safety violation: Database user '{user}' matches production user identity.")

    # 4. Validate target host format
    try:
        norm_host = normalize_host(host)
    except ValueError as e:
        raise RuntimeError(f"Safety violation: Malformed host '{host}': {e}") from e

    # 5. Validate target port format
    try:
        norm_port = normalize_port(port)
    except ValueError as e:
        raise RuntimeError(f"Safety violation: Malformed port '{port}': {e}") from e

    # 6. Check host allowlist
    if allowed_hosts_str is None:
        allowed_hosts_str = os.getenv('PG_TEST_ALLOWED_HOSTS')
    if not allowed_hosts_str or not allowed_hosts_str.strip():
        raise RuntimeError("Safety violation: PG_TEST_ALLOWED_HOSTS is required but not set or empty.")

    try:
        approved_hosts = parse_allowed_hosts(allowed_hosts_str)
    except ValueError as e:
        raise RuntimeError(f"Safety violation: Invalid PG_TEST_ALLOWED_HOSTS: {e}") from e

    if norm_host not in approved_hosts:
        raise RuntimeError(
            f"Safety violation: Target host '{host}' ({norm_host}) is not in approved test hosts: {sorted(approved_hosts)}."
        )

    # 7. Check port allowlist
    if allowed_ports_str is None:
        allowed_ports_str = os.getenv('PG_TEST_ALLOWED_PORTS')
    if not allowed_ports_str or not allowed_ports_str.strip():
        raise RuntimeError("Safety violation: PG_TEST_ALLOWED_PORTS is required but not set or empty.")

    try:
        approved_ports = parse_allowed_ports(allowed_ports_str)
    except ValueError as e:
        raise RuntimeError(f"Safety violation: Invalid PG_TEST_ALLOWED_PORTS: {e}") from e

    if norm_port not in approved_ports:
        raise RuntimeError(
            f"Safety violation: Target port '{port}' ({norm_port}) is not in approved test ports: {sorted(approved_ports)}."
        )

    return norm_host, norm_port


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


def perform_test_cleanup(admin_conn, test_conn, created_db_name, test_failed=False):
    """
    Safely tears down test and admin connections and drops the temporary test database.
    Guarantees:
    - Cleanup only attempts to drop created_db_name if it was successfully recorded.
    - Never uses DROP DATABASE IF EXISTS or terminates connections.
    - Both test_conn and admin_conn are closed even if dropping the database fails.
    - Emits clear errors with database name and exception details to logger and stderr.
    - Does not let cleanup exception mask an existing test failure.
    """
    cleanup_errors = []

    if test_conn is not None:
        try:
            if hasattr(test_conn, 'closed') and not test_conn.closed:
                test_conn.close()
            elif hasattr(test_conn, 'close'):
                test_conn.close()
        except Exception as close_err:
            msg = f"Error closing test connection: {close_err}"
            logger.error(msg)
            cleanup_errors.append(msg)

    if created_db_name and admin_conn is not None:
        try:
            safe_drop_test_database(admin_conn, created_db_name)
        except Exception as drop_err:
            msg = f"CLEANUP ERROR: Failed to drop test database '{created_db_name}': {drop_err}"
            logger.error(msg)
            sys.stderr.write(f"\n{msg}\n")
            cleanup_errors.append(msg)

    if admin_conn is not None:
        try:
            if hasattr(admin_conn, 'closed') and not admin_conn.closed:
                admin_conn.close()
            elif hasattr(admin_conn, 'close'):
                admin_conn.close()
        except Exception as close_err:
            msg = f"Error closing admin connection: {close_err}"
            logger.error(msg)
            cleanup_errors.append(msg)

    if cleanup_errors and not test_failed:
        raise RuntimeError("; ".join(cleanup_errors))


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
    - Requires all 5 connection parameters (including PG_TEST_ADMIN_DB without fallbacks).
    - Requires explicit allowlist variables (PG_TEST_ALLOWED_HOSTS, PG_TEST_ALLOWED_PORTS).
    - Rejects production database names for both target_db and admin_db before any connection.
    - Requires admin_db to follow explicit test-only naming policy (test_ prefix).
    - Rejects production user identities and unapproved targets.
    - Rejects malformed host and port entries.
    - Enforces test-server isolation before making any connection attempt.
    - Safe cleanup closes both connections and reports failures without hiding test errors.
    - Never terminates connections or drops a pre-existing database.
    - Never triggers a drop if database creation failed.
    """

    def test_integration_test_skipped_by_default(self):
        """Integration test must be skipped when RUN_PG_MIGRATION_INTEGRATION_TESTS is unset or not '1'."""
        with mock.patch.dict(os.environ, {OPT_IN_ENV_VAR: '0'}, clear=False):
            test_instance = Migration0110PostgresIntegrationTests()
            with self.assertRaises(Exception) as ctx:
                test_instance.test_postgresql_fk_verification_and_replacement()
            self.assertEqual(ctx.exception.__class__.__name__, 'SkipTest')
            self.assertIn("skipped by default", str(ctx.exception))

    def test_missing_pg_test_admin_db_causes_skip_before_connection(self):
        """Missing PG_TEST_ADMIN_DB causes a skip before any PostgreSQL connection."""
        clean_env = {
            OPT_IN_ENV_VAR: '1',
            'PG_TEST_HOST': '127.0.0.1',
            'PG_TEST_PORT': '5432',
            'PG_TEST_USER': 'test_user',
            'PG_TEST_PASSWORD': 'dummy_password',
            # PG_TEST_ADMIN_DB is omitted!
            'PG_TEST_ALLOWED_HOSTS': '127.0.0.1',
            'PG_TEST_ALLOWED_PORTS': '5432',
        }
        with mock.patch.dict(os.environ, clean_env, clear=True):
            test_instance = Migration0110PostgresIntegrationTests()
            with mock.patch('psycopg2.connect', side_effect=AssertionError("Should not connect!")) as mock_connect:
                with self.assertRaises(Exception) as ctx:
                    test_instance.test_postgresql_fk_verification_and_replacement()
                self.assertEqual(ctx.exception.__class__.__name__, 'SkipTest')
                self.assertIn("PG_TEST_ADMIN_DB", str(ctx.exception))
                mock_connect.assert_not_called()

    def test_missing_allowlist_variables_causes_skip_before_connection(self):
        """Missing allowlist variables cause a skip before any PostgreSQL connection."""
        clean_env = {
            OPT_IN_ENV_VAR: '1',
            'PG_TEST_HOST': '127.0.0.1',
            'PG_TEST_PORT': '5432',
            'PG_TEST_USER': 'test_user',
            'PG_TEST_PASSWORD': 'dummy_password',
            'PG_TEST_ADMIN_DB': 'test_admin_db',
            # PG_TEST_ALLOWED_HOSTS and PG_TEST_ALLOWED_PORTS are omitted!
        }
        with mock.patch.dict(os.environ, clean_env, clear=True):
            test_instance = Migration0110PostgresIntegrationTests()
            with mock.patch('psycopg2.connect', side_effect=AssertionError("Should not connect!")) as mock_connect:
                with self.assertRaises(Exception) as ctx:
                    test_instance.test_postgresql_fk_verification_and_replacement()
                self.assertEqual(ctx.exception.__class__.__name__, 'SkipTest')
                self.assertIn("allowlist", str(ctx.exception).lower())
                mock_connect.assert_not_called()

    def test_approved_host_and_port_pass_validation(self):
        """An approved host and port pass validation."""
        allowed_hosts = '127.0.0.1, test-pg.internal'
        allowed_ports = '5432, 5433'
        # IP address match
        validate_test_connection_safety(
            '127.0.0.1', 5432, 'safe_tester', 'test_mig0110_abc',
            admin_db='test_admin_db',
            allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
        )
        # Hostname match with different approved port
        validate_test_connection_safety(
            'test-pg.internal', 5433, 'safe_tester', 'test_mig0110_abc',
            admin_db='test_admin_db',
            allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
        )

    def test_host_not_in_allowlist_is_rejected(self):
        """A host not in the allowlist is rejected."""
        allowed_hosts = '10.0.0.5'
        allowed_ports = '5432'
        with self.assertRaises(RuntimeError) as ctx:
            validate_test_connection_safety(
                '127.0.0.1', 5432, 'safe_tester', 'test_mig0110_abc',
                admin_db='test_admin_db',
                allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
            )
        self.assertIn("not in approved test hosts", str(ctx.exception))

    def test_port_not_in_allowlist_is_rejected(self):
        """A port not in the allowlist is rejected."""
        allowed_hosts = '127.0.0.1'
        allowed_ports = '5433'
        with self.assertRaises(RuntimeError) as ctx:
            validate_test_connection_safety(
                '127.0.0.1', 5432, 'safe_tester', 'test_mig0110_abc',
                admin_db='test_admin_db',
                allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
            )
        self.assertIn("not in approved test ports", str(ctx.exception))

    def test_malformed_host_and_port_entries_are_rejected(self):
        """Malformed host and port entries are rejected."""
        valid_hosts = '127.0.0.1'
        valid_ports = '5432'

        # Malformed target host
        for bad_host in ['', '   ', 'host with space', 'host/path', 'host:5432']:
            with self.assertRaises(RuntimeError):
                validate_test_connection_safety(
                    bad_host, 5432, 'safe_tester', 'test_sample',
                    admin_db='test_admin_db',
                    allowed_hosts_str=valid_hosts, allowed_ports_str=valid_ports
                )

        # Malformed target port
        for bad_port in ['abc', '', -1, 0, 65536, 99999, None, True]:
            with self.assertRaises(RuntimeError):
                validate_test_connection_safety(
                    '127.0.0.1', bad_port, 'safe_tester', 'test_sample',
                    admin_db='test_admin_db',
                    allowed_hosts_str=valid_hosts, allowed_ports_str=valid_ports
                )

        # Malformed allowlist entries
        with self.assertRaises(RuntimeError):
            validate_test_connection_safety(
                '127.0.0.1', 5432, 'safe_tester', 'test_sample',
                admin_db='test_admin_db',
                allowed_hosts_str='127.0.0.1,,10.0.0.1', allowed_ports_str=valid_ports
            )
        with self.assertRaises(RuntimeError):
            validate_test_connection_safety(
                '127.0.0.1', 5432, 'safe_tester', 'test_sample',
                admin_db='test_admin_db',
                allowed_hosts_str=valid_hosts, allowed_ports_str='5432, invalid_port'
            )

    def test_production_postgresql_connection_settings_rejected(self):
        """Production PostgreSQL connection settings are not accepted unless explicitly approved under the isolated test-server policy."""
        allowed_hosts = '127.0.0.1'
        allowed_ports = '5432'

        # Production database names are rejected even if host and port are allowlisted
        for forbidden_db in FORBIDDEN_DB_NAMES:
            with self.assertRaises(RuntimeError) as ctx:
                validate_test_connection_safety(
                    '127.0.0.1', 5432, 'safe_tester', forbidden_db,
                    admin_db='test_admin_db',
                    allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
                )
            self.assertIn("Safety violation", str(ctx.exception))

        # Production user identities are rejected even if host and port are allowlisted
        for forbidden_user in FORBIDDEN_USERS:
            with self.assertRaises(RuntimeError) as ctx:
                validate_test_connection_safety(
                    '127.0.0.1', 5432, forbidden_user, 'test_sample',
                    admin_db='test_admin_db',
                    allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
                )
            self.assertIn("matches production user identity", str(ctx.exception))

        # A host with 'test' in its name is NOT automatically approved without being in the allowlist
        with self.assertRaises(RuntimeError) as ctx:
            validate_test_connection_safety(
                'test-production-mirror.corp', 5432, 'safe_tester', 'test_sample',
                admin_db='test_admin_db',
                allowed_hosts_str=allowed_hosts, allowed_ports_str=allowed_ports
            )
        self.assertIn("not in approved test hosts", str(ctx.exception))

    def test_production_admin_db_rejected_before_connect(self):
        """Production or unapproved admin database names are rejected before psycopg2.connect() is called."""
        forbidden_admin_dbs = [
            'postgres', 'propanel_db', 'cardflow_db', 'production',
            'prod', 'template1', 'template0', 'unprefixed_admin'
        ]
        for bad_admin_db in forbidden_admin_dbs:
            clean_env = {
                OPT_IN_ENV_VAR: '1',
                'PG_TEST_HOST': '127.0.0.1',
                'PG_TEST_PORT': '5432',
                'PG_TEST_USER': 'safe_tester',
                'PG_TEST_PASSWORD': 'dummy_password',
                'PG_TEST_ADMIN_DB': bad_admin_db,
                'PG_TEST_ALLOWED_HOSTS': '127.0.0.1',
                'PG_TEST_ALLOWED_PORTS': '5432',
            }
            with mock.patch.dict(os.environ, clean_env, clear=True):
                test_instance = Migration0110PostgresIntegrationTests()
                with mock.patch('psycopg2.connect', side_effect=AssertionError("psycopg2.connect should not be called!")) as mock_conn:
                    with self.assertRaises(RuntimeError) as ctx:
                        test_instance.test_postgresql_fk_verification_and_replacement()
                    self.assertIn("Safety violation: Admin database name", str(ctx.exception))
                    mock_conn.assert_not_called()

    def test_valid_dedicated_test_admin_db_accepted(self):
        """Valid dedicated test admin databases (with test_ prefix and valid characters) pass validation."""
        valid_admin_dbs = ['test_admin_db', 'test_postgres_admin', 'test_mig_admin']
        for valid_db in valid_admin_dbs:
            # Standalone validator
            result = validate_admin_db_safety(valid_db)
            self.assertEqual(result, valid_db)

            # Combined connection safety validator
            norm_host, norm_port = validate_test_connection_safety(
                host='127.0.0.1',
                port=5432,
                user='safe_tester',
                target_db='test_sample_db',
                admin_db=valid_db,
                allowed_hosts_str='127.0.0.1',
                allowed_ports_str='5432'
            )
            self.assertEqual(norm_host, '127.0.0.1')
            self.assertEqual(norm_port, 5432)

    def test_admin_db_naming_policy_enforcement(self):
        """Admin database naming policy strictly enforces non-empty, test_ prefix, and valid characters."""
        invalid_admin_dbs = [
            '', '   ', None, 'postgres', 'propanel_db', 'cardflow_db',
            'production', 'admin_db', 'test-invalid-char!', 'test admin with spaces'
        ]
        for invalid_db in invalid_admin_dbs:
            with self.assertRaises(RuntimeError) as ctx:
                validate_admin_db_safety(invalid_db)
            self.assertIn("Safety violation: Admin database name", str(ctx.exception))

    def test_no_database_connection_attempted_when_validation_fails(self):
        """No database connection is attempted when safety validation fails."""
        clean_env = {
            OPT_IN_ENV_VAR: '1',
            'PG_TEST_HOST': 'unapproved-host.local',
            'PG_TEST_PORT': '5432',
            'PG_TEST_USER': 'test_user',
            'PG_TEST_PASSWORD': 'dummy_password',
            'PG_TEST_ADMIN_DB': 'test_admin_db',
            'PG_TEST_ALLOWED_HOSTS': '127.0.0.1',
            'PG_TEST_ALLOWED_PORTS': '5432',
        }
        with mock.patch.dict(os.environ, clean_env, clear=True):
            test_instance = Migration0110PostgresIntegrationTests()
            with mock.patch('psycopg2.connect', side_effect=AssertionError("psycopg2.connect called when validation should fail!")) as mock_connect:
                with self.assertRaises(RuntimeError) as ctx:
                    test_instance.test_postgresql_fk_verification_and_replacement()
                self.assertIn("not in approved test hosts", str(ctx.exception))
                mock_connect.assert_not_called()

    def test_cleanup_failure_is_reported_and_both_connections_still_closed(self):
        """Cleanup failure is reported, both connections are still closed, and test failure is not masked."""
        mock_admin_conn = mock.MagicMock()
        mock_admin_conn.closed = False
        mock_test_conn = mock.MagicMock()
        mock_test_conn.closed = False

        # When test passed, drop failure raises RuntimeError and closes both connections
        with mock.patch('core.test_migration_0110.safe_drop_test_database', side_effect=Exception("Disk full on DROP")):
            with self.assertRaises(RuntimeError) as ctx:
                perform_test_cleanup(mock_admin_conn, mock_test_conn, 'test_cleanup_db', test_failed=False)
            self.assertIn("CLEANUP ERROR", str(ctx.exception))
            self.assertIn("test_cleanup_db", str(ctx.exception))
            self.assertIn("Disk full on DROP", str(ctx.exception))
            mock_test_conn.close.assert_called_once()
            mock_admin_conn.close.assert_called_once()

        # When test itself failed (test_failed=True), cleanup failure is logged but NOT re-raised, preserving original error
        mock_admin_conn.reset_mock()
        mock_admin_conn.closed = False
        mock_test_conn.reset_mock()
        mock_test_conn.closed = False

        with mock.patch('core.test_migration_0110.safe_drop_test_database', side_effect=Exception("Disk full on DROP")):
            perform_test_cleanup(mock_admin_conn, mock_test_conn, 'test_cleanup_db', test_failed=True)
            mock_test_conn.close.assert_called_once()
            mock_admin_conn.close.assert_called_once()

    def test_database_never_dropped_when_create_database_fails(self):
        """A database is never dropped if safe_create_test_database fails."""
        mock_admin_conn = mock.MagicMock()
        mock_admin_conn.closed = False
        mock_cursor = mock.MagicMock()
        mock_cursor.fetchone.return_value = None  # DB does not exist yet
        mock_cursor.execute.side_effect = [None, RuntimeError("CREATE DATABASE permission denied")]
        mock_admin_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Creation fails
        with self.assertRaises(RuntimeError):
            safe_create_test_database(mock_admin_conn, 'test_failing_db')

        # Since creation failed, created_db_name remains None in caller lifecycle
        created_db_name = None
        mock_test_conn = None

        with mock.patch('core.test_migration_0110.safe_drop_test_database') as mock_drop:
            perform_test_cleanup(mock_admin_conn, mock_test_conn, created_db_name, test_failed=True)
            mock_drop.assert_not_called()

    def test_safety_rejects_missing_postgres_credentials(self):
        """Opted-in test must skip cleanly if any required test environment variable is missing."""
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
                validate_test_connection_safety(
                    '127.0.0.1', 5432, 'test_user', forbidden,
                    admin_db='test_admin_db',
                    allowed_hosts_str='127.0.0.1', allowed_ports_str='5432'
                )
            self.assertIn("Safety violation", str(ctx.exception))

    def test_safety_rejects_non_test_prefix(self):
        """Safety validator must reject databases that do not start with 'test_'."""
        with self.assertRaises(RuntimeError) as ctx:
            validate_test_connection_safety(
                '127.0.0.1', 5432, 'test_user', 'my_custom_db',
                admin_db='test_admin_db',
                allowed_hosts_str='127.0.0.1', allowed_ports_str='5432'
            )
        self.assertIn("must begin with 'test_'", str(ctx.exception))

    def test_safety_rejects_production_user_identity(self):
        """Safety validator must reject production database user identities."""
        for user in FORBIDDEN_USERS:
            with self.assertRaises(RuntimeError) as ctx:
                validate_test_connection_safety(
                    '127.0.0.1', 5432, user, 'test_sample_db',
                    admin_db='test_admin_db',
                    allowed_hosts_str='127.0.0.1', allowed_ports_str='5432'
                )
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
    - Requires all 5 explicit variables: PG_TEST_HOST, PG_TEST_PORT, PG_TEST_USER, PG_TEST_PASSWORD, PG_TEST_ADMIN_DB.
    - Requires explicit allowlist variables: PG_TEST_ALLOWED_HOSTS, PG_TEST_ALLOWED_PORTS.
    - Never uses hardcoded fallbacks or defaults (e.g. no default 'postgres' admin db, no default localhost/5432).
    - Requires admin database to have test_ prefix and not match protected production database names.
    - Generates a random unique temporary database name: test_mig0110_<uuid>.
    - Verifies database does not already exist; never terminates connections or drops pre-existing databases.
    - Validates target host, port, user, target_db, and admin_db against approved allowlist BEFORE any connection.
    - Both admin and target connections use the identical validated host, port, and credentials.
    - Tracks created database and only drops that exact database in a finally block.
    - Safe cleanup closes both connections even if drop fails, reporting clear errors without hiding test failures.
    """

    def test_postgresql_fk_verification_and_replacement(self):
        # 1. Check opt-in flag
        if os.getenv(OPT_IN_ENV_VAR) != '1':
            self.skipTest(
                f"PostgreSQL integration test is skipped by default. "
                f"Set {OPT_IN_ENV_VAR}=1 and provide {', '.join(REQUIRED_PG_TEST_VARS + ALLOWLIST_PG_TEST_VARS)} to enable."
            )

        # 2. Require all 5 explicit test-only PostgreSQL connection settings
        missing_vars = [var for var in REQUIRED_PG_TEST_VARS if not os.getenv(var)]
        if missing_vars:
            self.skipTest(
                f"Missing required PostgreSQL test environment variables: {', '.join(missing_vars)}. "
                f"No default credentials, admin db, or host fallbacks are permitted."
            )

        # 3. Require explicit allowlist variables
        missing_allowlist = [var for var in ALLOWLIST_PG_TEST_VARS if not os.getenv(var)]
        if missing_allowlist:
            self.skipTest(
                f"Missing required PostgreSQL allowlist environment variables: {', '.join(missing_allowlist)}. "
                f"Approved test hosts and ports must be explicitly allowlisted."
            )

        try:
            import psycopg2
        except ImportError:
            self.skipTest("psycopg2 not installed")

        pg_host = os.environ['PG_TEST_HOST']
        pg_port = os.environ['PG_TEST_PORT']
        pg_user = os.environ['PG_TEST_USER']
        pg_pass = os.environ['PG_TEST_PASSWORD']
        pg_admin_db = os.environ['PG_TEST_ADMIN_DB']

        # 4. Generate unique temporary database name
        test_db = f"test_mig0110_{uuid.uuid4().hex[:12]}"

        # 5. Verify safety of host, port, user, target_db, AND admin_db BEFORE opening any connection
        norm_host, norm_port = validate_test_connection_safety(
            host=pg_host,
            port=pg_port,
            user=pg_user,
            target_db=test_db,
            admin_db=pg_admin_db
        )

        admin_conn = None
        test_conn = None
        created_db_name = None
        test_failed = False

        try:
            # Connect to admin database using validated host, port, user, and admin_db
            admin_conn = psycopg2.connect(
                dbname=pg_admin_db,
                user=pg_user,
                password=pg_pass,
                host=norm_host,
                port=norm_port
            )
            admin_conn.autocommit = True

            # Safely create unique test database without touching pre-existing databases
            safe_create_test_database(admin_conn, test_db)
            created_db_name = test_db

            # Connect to the newly created test database using the exact same validated host, port, user
            test_conn = psycopg2.connect(
                dbname=created_db_name,
                user=pg_user,
                password=pg_pass,
                host=norm_host,
                port=norm_port
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

        except Exception:
            test_failed = True
            raise
        finally:
            perform_test_cleanup(admin_conn, test_conn, created_db_name, test_failed=test_failed)
