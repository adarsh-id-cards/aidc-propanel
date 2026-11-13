#!/usr/bin/env bash
# =============================================================================
# Pro-Panel PostgreSQL Database Restore Script
# =============================================================================
# Restores a custom-format PostgreSQL dump (.dump) into a target database
# after verifying archive integrity via pg_restore --list.
# Requires explicit confirmation (--confirm) to prevent accidental overwrites.
# =============================================================================
set -euo pipefail

DUMP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"

DB_HOST="${POSTGRES_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${DB_PORT:-5432}}"
DB_NAME="${POSTGRES_DB:-${DB_NAME:-}}"
DB_USER="${POSTGRES_USER:-${DB_USER:-}}"

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
    echo "Usage: POSTGRES_DB=<target_db> POSTGRES_USER=<user> $0 <path_to_dump_file> --confirm" >&2
    exit 1
fi

if [[ "$CONFIRM_FLAG" != "--confirm" ]]; then
    echo "ERROR: Restore requires explicit '--confirm' argument as second parameter." >&2
    exit 1
fi

if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
    echo "ERROR: POSTGRES_DB (or DB_NAME) and POSTGRES_USER (or DB_USER) environment variables must be set." >&2
    exit 1
fi

if [[ -z "${PGPASSWORD:-}" ]]; then
    if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        export PGPASSWORD="$POSTGRES_PASSWORD"
    elif [[ -n "${DB_PASSWORD:-}" ]]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
fi

echo "[1/3] Validating dump archive TOC before restore..."
TOC_COUNT="$(pg_restore --list "$DUMP_FILE" | grep -v '^;' | wc -l | tr -d ' ')"
if [[ "$TOC_COUNT" -le 0 ]]; then
    echo "ERROR: Dump file failed pg_restore --list validation." >&2
    exit 1
fi
echo "  Verified ${TOC_COUNT} TOC entries in archive."

echo "[2/3] Restoring archive into '${DB_NAME}' on ${DB_HOST}:${DB_PORT}..."
pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    "$DUMP_FILE"

echo "[3/3] Running post-restore health check..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python "${SCRIPT_DIR}/database_health_check.py"

echo "Restore completed and verified."
