#!/usr/bin/env bash
# PROTOTYPE (#344): drops and recreates a scratch database, then starts a local
# PgBouncer in transaction mode on :6544 as a stand-in for Supabase's pooler.
set -euo pipefail
DB=prototype_wipe_me_ba_344
HERE="$(cd "$(dirname "$0")/.." && pwd)"
psql -q -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/scripts/schema.sql"
if [ "${1:-full}" = lean ]; then
  psql -q -d "$DB" -c "alter table profiles drop column image" -c "alter table organizations drop column logo, drop column metadata"
fi
mkdir -p /tmp/pgb-344
cat > /tmp/pgb-344/pgbouncer.ini <<INI
[databases]
$DB = host=localhost port=5432 dbname=$DB
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6544
auth_type = trust
auth_file = /tmp/pgb-344/users.txt
pool_mode = transaction
max_prepared_statements = 0
default_pool_size = 8
logfile = /tmp/pgb-344/pgbouncer.log
pidfile = /tmp/pgb-344/pgbouncer.pid
INI
echo "\"$USER\" \"\"" > /tmp/pgb-344/users.txt
if [ -f /tmp/pgb-344/pgbouncer.pid ] && kill -0 "$(cat /tmp/pgb-344/pgbouncer.pid)" 2>/dev/null; then
  kill "$(cat /tmp/pgb-344/pgbouncer.pid)"; sleep 0.5
fi
/opt/homebrew/opt/pgbouncer/bin/pgbouncer -d /tmp/pgb-344/pgbouncer.ini
echo "reset $DB; pgbouncer (transaction mode) on 127.0.0.1:6544"
