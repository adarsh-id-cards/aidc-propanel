#!/usr/bin/env bash
# =============================================================================
# Pro-Panel PostgreSQL Database Backup & Verification Script
# =============================================================================
# Creates a custom-format PostgreSQL backup (.dump), verifies TOC integrity
# via pg_restore --list, computes SHA-256 checksum, and writes a JSON manifest.
# Never prints passwords or secrets to stdout/stderr.
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/propanel}"
DB_HOST="${POSTGRES_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${POSTGRES_PORT:-${DB_PORT:-5432}}"
DB_NAME="${POSTGRES_DB:-${DB_NAME:-}}"
DB_USER="${POSTGRES_USER:-${DB_USER:-}}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

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

mkdir -p "$BACKUP_DIR"

DUMP_FILE="${BACKUP_DIR}/propanel_${DB_NAME}_${TIMESTAMP}.dump"
MANIFEST_FILE="${BACKUP_DIR}/propanel_${DB_NAME}_${TIMESTAMP}.manifest.json"

echo "[1/4] Creating custom-format PostgreSQL dump for database '${DB_NAME}'..."
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --format=custom \
    --blobs \
    --no-owner \
    --no-privileges \
    --file="$DUMP_FILE" \
    "$DB_NAME"

if [[ ! -s "$DUMP_FILE" ]]; then
    echo "ERROR: Backup file is missing or zero bytes: $DUMP_FILE" >&2
    exit 1
fi

FILE_SIZE="$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")"
SHA256="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"

echo "[2/4] Verifying archive Table of Contents via pg_restore --list..."
TOC_COUNT="$(pg_restore --list "$DUMP_FILE" | grep -v '^;' | wc -l | tr -d ' ')"
if [[ "$TOC_COUNT" -le 0 ]]; then
    echo "ERROR: Archive TOC verification failed (0 catalog items)." >&2
    exit 1
fi

echo "[3/4] Writing backup manifest to ${MANIFEST_FILE}..."
cat > "$MANIFEST_FILE" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "database_name": "${DB_NAME}",
  "database_host": "${DB_HOST}",
  "database_port": "${DB_PORT}",
  "dump_file": "${DUMP_FILE}",
  "file_size_bytes": ${FILE_SIZE},
  "sha256": "${SHA256}",
  "toc_entries": ${TOC_COUNT}
}
EOF

echo "[4/4] Backup completed and verified."
echo "  File       : ${DUMP_FILE}"
echo "  Size       : ${FILE_SIZE} bytes"
echo "  SHA-256    : ${SHA256}"
echo "  TOC Items  : ${TOC_COUNT}"
