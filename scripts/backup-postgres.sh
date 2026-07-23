#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required and must point to a dedicated backup directory}"

if [[ "${BACKUP_DIR}" == "/" ]]; then
  echo "BACKUP_DIR must not be the filesystem root" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR%/}/bpmsoft-quest-${timestamp}.dump"

pg_dump "${DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${backup_file}"

pg_restore --list "${backup_file}" >/dev/null
shasum -a 256 "${backup_file}" > "${backup_file}.sha256"

echo "Verified backup created: ${backup_file}"
