#!/usr/bin/env bash
# Recreate ookkee_books_dev from the pre-V11 backup and apply migrations >= V11.
set -euo pipefail
: "${DB_HOST:=192.168.64.1}" "${DB_USER:=postgres}" "${DB_PASSWORD:=postgres}" "${DEV_DB:=ookkee_books_dev}"
export PGPASSWORD="$DB_PASSWORD" LC_ALL=C
dump="${1:-$(ls -t backups/*.dump | head -1)}"
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -X -q -c "drop database if exists $DEV_DB" -c "create database $DEV_DB template template0"
pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DEV_DB" --no-owner "$dump"
for f in $(ls db/migrations/V*.sql | sort -V); do
  v="${f##*/V}"; v="${v%%__*}"
  [ "$v" -ge 11 ] && DB_HOST="$DB_HOST" DB_NAME="$DEV_DB" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" scripts/apply-migration.sh "$f"
done
echo "$DEV_DB reset from $dump"
