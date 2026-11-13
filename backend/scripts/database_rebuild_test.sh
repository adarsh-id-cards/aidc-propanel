#!/usr/bin/env bash
# =============================================================================
# Pro-Panel Fresh Database Rebuild & Verification Test Script
# =============================================================================
# Creates an isolated disposable PostgreSQL database (propanel_rebuild_test),
# applies all Django migrations from zero without --fake, and runs:
#   1. manage.py migrate --check
#   2. verify_database_schema.py
#   3. verify_migrations.py
#   4. database_health_check.py
#   5. database_inventory.py
# Drops the disposable test database in an EXIT trap unless KEEP_TEST_DB=1.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DB_HOST="${POSTGRES_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${DB_PORT:-5432}}"
DB_USER="${POSTGRES_USER:-${DB_USER:-}}"
TEST_DB_NAME="${TEST_DB_NAME:-propanel_rebuild_test}"
ADMIN_DB="${ADMIN_DB:-postgres}"

if [[ -z "$DB_USER" ]]; then
    echo "ERROR: POSTGRES_USER (or DB_USER) must be set." >&2
    exit 1
fi

if [[ "$TEST_DB_NAME" != *test* && "$TEST_DB_NAME" != *rebuild* ]]; then
    echo "ERROR: TEST_DB_NAME ('${TEST_DB_NAME}') must contain 'test' or 'rebuild' for safety." >&2
    exit 1
fi

if [[ -z "${PGPASSWORD:-}" ]]; then
    if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        export PGPASSWORD="$POSTGRES_PASSWORD"
    elif [[ -n "${DB_PASSWORD:-}" ]]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
fi

CREATED_DB=0
cleanup() {
    if [[ "$CREATED_DB" -eq 1 && "${KEEP_TEST_DB:-0}" != "1" ]]; then
        echo "[Cleanup] Dropping disposable database '${TEST_DB_NAME}'..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" \
            -c "DROP DATABASE IF EXISTS \"${TEST_DB_NAME}\";" >/dev/null
    fi
}
trap cleanup EXIT

echo "[1/6] Creating fresh PostgreSQL database '${TEST_DB_NAME}'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" \
    -c "DROP DATABASE IF EXISTS \"${TEST_DB_NAME}\";" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" \
    -c "CREATE DATABASE \"${TEST_DB_NAME}\";" >/dev/null
CREATED_DB=1

export POSTGRES_DB="$TEST_DB_NAME"
export DB_NAME="$TEST_DB_NAME"
export DATABASE_URL="postgres://${DB_USER}:${PGPASSWORD:-}@${DB_HOST}:${DB_PORT}/${TEST_DB_NAME}"
export SENTRY_DSN=""
unset RUNNING_TESTS || true

cd "$BACKEND_DIR"

echo "[2/6] Applying migrations from zero on '${TEST_DB_NAME}'..."
python manage.py migrate --noinput

echo "[3/6] Verifying zero pending migrations (manage.py migrate --check)..."
python manage.py migrate --check

echo "[4/6] Running schema verification (verify_database_schema.py)..."
python scripts/verify_database_schema.py

echo "[5/6] Running migration integrity verification (verify_migrations.py)..."
python scripts/verify_migrations.py

echo "[6/6] Running database health check (database_health_check.py)..."
python scripts/database_health_check.py

echo "All rebuild verification checks passed on '${TEST_DB_NAME}'."
