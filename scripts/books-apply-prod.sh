#!/usr/bin/env bash
# books-apply-prod.sh — bring a LIVE Ookkee database up to the Books layer.
#
#   1. fresh pg_dump backup of the target DB (refuses to continue without it)
#   2. apply db/migrations V11.. with scripts/apply-migration.sh (Flyway-compatible)
#   3. import UFCU statements, link to expense rows, import + match Harvest invoices
#   4. print the checks and the equity rollforward
#
# Usage:  DB_NAME=ookkee scripts/books-apply-prod.sh
# Env:    DB_HOST (192.168.64.1) DB_PORT (5432) DB_USER (postgres) DB_PASSWORD (postgres)
#         CONFIRM=yes  required when DB_NAME=ookkee
set -euo pipefail
cd "$(dirname "$0")/.."
export DB_HOST="${DB_HOST:-192.168.64.1}" DB_PORT="${DB_PORT:-5432}" DB_USER="${DB_USER:-postgres}" DB_PASSWORD="${DB_PASSWORD:-postgres}" LC_ALL=C
: "${DB_NAME:?set DB_NAME}"
export PGPASSWORD="$DB_PASSWORD"
P=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -X -v ON_ERROR_STOP=1)

if [ "$DB_NAME" = "ookkee" ] && [ "${CONFIRM:-}" != "yes" ]; then
  echo "refusing to touch the live database without CONFIRM=yes" >&2; exit 2
fi

stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
dump="backups/${DB_NAME}-pre-books-${stamp}.dump"
echo "== backup -> $dump"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$dump"
listing=$(pg_restore --list "$dump")
grep -qE "TABLE DATA public expense " <<<"$listing" || { echo "backup looks empty; aborting" >&2; exit 1; }
echo "   $(du -h "$dump" | cut -f1), $("${P[@]}" -tA -c 'select count(*) from expense') expense rows"

echo "== migrations"
for f in $(ls db/migrations/V*.sql | sort -V); do
  v="${f##*/V}"; v="${v%%__*}"
  [ "$v" -ge 11 ] && DB_NAME="$DB_NAME" scripts/apply-migration.sh "$f"
done

echo "== build"
( cd backend && go build -o /tmp/ookkee-books ./cmd/books )

echo "== statements"
/tmp/ookkee-books import-statements data/books/ufcu/*/*.pdf | grep -c "^ok" | sed 's/^/   periods: /'
echo "== link"
/tmp/ookkee-books link "UFCU business" | grep -v "^  orphan"
/tmp/ookkee-books link "UFCU business savings" | grep -v "^  orphan"
echo "== invoices"
/tmp/ookkee-books import-invoices data/books/harvest_invoices.csv
/tmp/ookkee-books match-invoices | head -1

echo "== checks"
"${P[@]}" -c "select year, check_name, problems from v_books_checks order by 1,2"
echo "== equity rollforward"
"${P[@]}" -c "select * from v_equity_rollforward"
echo "done. backup: $dump"
