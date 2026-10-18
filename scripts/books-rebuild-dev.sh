#!/usr/bin/env bash
# Rebuild the books dev DB end to end: restore pre-V11 backup, apply V11+,
# import all UFCU statements, link to expense rows.
set -euo pipefail
cd "$(dirname "$0")/.."
export DB_HOST="${DB_HOST:-192.168.64.1}" DB_NAME="${DEV_DB:-ookkee_books_dev}" DB_USER=postgres DB_PASSWORD=postgres LC_ALL=C
DEV_DB="$DB_NAME" scripts/reset-books-dev.sh | tail -1
( cd backend && go build -o /tmp/ookkee-books ./cmd/books )
/tmp/ookkee-books import-statements data/books/ufcu/*/*.pdf | grep -c "^ok" | sed 's/^/statement periods imported: /'
/tmp/ookkee-books link "UFCU business" | grep -v "^  orphan"
/tmp/ookkee-books link "UFCU business savings"
/tmp/ookkee-books import-invoices data/books/harvest_invoices.csv
/tmp/ookkee-books match-invoices
