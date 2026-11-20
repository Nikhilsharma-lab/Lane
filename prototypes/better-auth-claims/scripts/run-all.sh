#!/usr/bin/env bash
# PROTOTYPE (#344). Runs every check and writes results/*.log. Needs local
# Postgres (as $USER) and Homebrew PgBouncer. Takes about two minutes.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p results
bash scripts/reset-db.sh >/dev/null && npx tsx checks/claims.ts > results/claims.log 2>&1
bash scripts/reset-db.sh >/dev/null && PROTO_ROLE_GUARD=off npx tsx checks/owner-hole.ts > results/owner-hole.log 2>&1
: > results/google-image.log
for combo in "full keep off" "full undefined off" "full null off" "full keep on" "lean keep off" "lean undefined off" "lean null off"; do
  set -- $combo
  bash scripts/reset-db.sh "$1" >/dev/null
  PROTO_SCHEMA=$1 PROTO_GOOGLE_IMAGE=$2 PROTO_IMAGE_HOOK=$3 npx tsx checks/google-image.ts 2>&1 | grep -v "^\s*at " >> results/google-image.log
done
: > results/signin-server-cost.log
for m in on off; do bash scripts/reset-db.sh >/dev/null; PROTO_CAPTCHA=$m npx tsx checks/signin-server-cost.ts >> results/signin-server-cost.log 2>&1; done
bash scripts/reset-db.sh >/dev/null && npx tsx scripts/seed-walk.ts >/dev/null
PROTO_NEXT=1 PROTO_IMAGE_HOOK=on npx next build >/dev/null 2>&1
PROTO_NEXT=1 PROTO_IMAGE_HOOK=on npx next start -p 3344 > /tmp/proto-344-next.log 2>&1 &
SERVER=$!; sleep 4
npx tsx checks/browser-walk.ts > results/browser-walk.log 2>&1
npx tsx checks/turnstile-headed.ts > results/turnstile-headed.log 2>&1
kill $SERVER
grep -h "^CONFIRMED\|^REFUTED\|^FINDING\|^MEASURED" results/*.log | cut -c1-9 | sort | uniq -c
