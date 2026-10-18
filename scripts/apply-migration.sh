#!/usr/bin/env bash
# apply-migration.sh — apply one Flyway migration file with plain psql and record
# it in flyway_schema_history with the checksum Flyway itself would compute, so a
# later real Flyway run validates cleanly. For environments without the Flyway
# container (e.g. the sandbox talking to the host DB).
#
# Usage: DB_HOST=.. DB_NAME=.. DB_USER=.. DB_PASSWORD=.. scripts/apply-migration.sh db/migrations/V11__Books_ledger.sql
set -euo pipefail
f="${1:?migration file}"
base="$(basename "$f")"
ver="${base#V}"; ver="${ver%%__*}"
desc="${base#*__}"; desc="${desc%.sql}"; desc="${desc//_/ }"
: "${DB_HOST:=localhost}" "${DB_PORT:=5432}" "${DB_NAME:=ookkee}" "${DB_USER:=postgres}" "${DB_PASSWORD:=postgres}"
export PGPASSWORD="$DB_PASSWORD"
P=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -X -v ON_ERROR_STOP=1 -q)

checksum=$(python3 - "$f" <<'PY'
import sys, zlib
data = open(sys.argv[1],'rb').read()
if data.startswith(b'\xef\xbb\xbf'): data = data[3:]
text = data.decode('utf-8').replace('\r\n','\n').replace('\r','\n')
lines = text.split('\n')
if text.endswith('\n'): lines = lines[:-1]
crc = 0
for line in lines: crc = zlib.crc32(line.encode('utf-8'), crc)
v = crc & 0xffffffff
print(v - (1<<32) if v >= (1<<31) else v)
PY
)

if "${P[@]}" -tA -c "select 1 from flyway_schema_history where version='$ver'" | grep -q 1; then
  echo "V$ver already applied on $DB_NAME"; exit 0
fi
start=$(date +%s%3N)
{ echo "BEGIN;"; cat "$f"; echo "COMMIT;"; } | timeout 300 "${P[@]}" -f -
ms=$(( $(date +%s%3N) - start ))
"${P[@]}" -c "insert into flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  values ((select coalesce(max(installed_rank),0)+1 from flyway_schema_history), '$ver', '$desc', 'SQL', '$base', $checksum, '$DB_USER', now(), $ms, true)"
echo "applied V$ver ($desc) on $DB_NAME in ${ms}ms, checksum $checksum"
