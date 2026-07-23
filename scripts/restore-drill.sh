#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required and must point to a disposable drill database}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file does not exist: ${BACKUP_FILE}" >&2
  exit 1
fi

pg_restore --list "${BACKUP_FILE}" >/dev/null
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="${RESTORE_DATABASE_URL}" \
  "${BACKUP_FILE}"

psql "${RESTORE_DATABASE_URL}" \
  --no-psqlrc \
  --tuples-only \
  --command="SELECT COUNT(*) FROM schema_migrations;"

echo "Restore drill completed against the disposable database."
