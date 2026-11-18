#!/usr/bin/env bash
# Site gate check — proves the gate at HTTP level against a temp DB.
#
# Phase A (no AppSetting row → gate defaults OFF):
#   A1 anonymous / is served (200)
#   A2 anonymous /admin is 404 (dashboard protects itself, gate or not)
# Phase B (AppSetting site:gate="on", fresh server so the gate cache
# starts empty):
#   B1 anonymous / redirects to /gate
#   B2 anonymous /muse-week (deep link) redirects to /gate
#   B3 /gate serves the closed page with a Whop sign-in and leaks no
#      member content strings
#   B4 a non-operator member session redirects to /gate
#   B5 a designated-operator session passes (200 on /)
#   B6 the operator session reaches /admin (200, dashboard title)
#   B7 /api/* is NOT gated (bridge account answers, no /gate redirect)
#
# Usage: bash scripts/site-gate-check/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
GATE_DB_PATH=/tmp/site-gate.db
export DATABASE_URL="file:${GATE_DB_PATH}"
GATE_SS_PART="gate-check"
export SESSION_SECRET="${GATE_SS_PART}-test-secret"
export OPERATOR_WHOP_USERNAMES="gateop"
export PRISMA_QUERY_ENGINE_LIBRARY="$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
export PRISMA_SCHEMA_ENGINE_BINARY="$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
export CHECKPOINT_DISABLE=1
PORT=3102
BASE="http://127.0.0.1:$PORT"
PASS=0; FAIL=0
APP_PID=""

check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS $1"; PASS=$((PASS+1)); else echo "FAIL $1 (expected [$2] got [$3])"; FAIL=$((FAIL+1)); fi
}
start_app() {
  npx next start -p $PORT >/tmp/site-gate-server.log 2>&1 &
  APP_PID=$!
  for i in $(seq 1 30); do curl -s -o /dev/null "$BASE/gate" && break; sleep 2; done
}
stop_app() {
  kill $APP_PID 2>/dev/null || true
  # npx spawns a next-server child that outlives the wrapper kill —
  # without this, Phase B would silently talk to the Phase A server
  # (the exact stale-server trap the bridge E2E harness documents).
  pkill -f "next-server" 2>/dev/null || true
  wait $APP_PID 2>/dev/null || true
  sleep 1
}
trap 'stop_app' EXIT

pkill -f "next-server" 2>/dev/null || true
sleep 1
rm -f /tmp/site-gate.db /tmp/site-gate.db-journal /tmp/site-gate.db-wal /tmp/site-gate.db-shm
npx prisma generate >/dev/null
npx prisma db push --skip-generate >/dev/null
node scripts/site-gate-check/seed-gate.mjs
npx next build >/dev/null

# ─── Phase A: gate row absent → OFF ───
start_app
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "A1 anon / served with gate off" "200" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check "A2 anon /admin is 404 with gate off" "404" "$CODE"
stop_app

# ─── Phase B: gate ON ───
GATE_ON=1 node scripts/site-gate-check/seed-gate.mjs
start_app
LOC=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE/")
check "B1 anon / redirects to /gate" "307 $BASE/gate" "$LOC"
LOC=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE/muse-week")
check "B2 anon /muse-week redirects to /gate" "307 $BASE/gate" "$LOC"
BODY=$(curl -s "$BASE/gate")
echo "$BODY" | grep -q "Whoparmy is closed for now" && R=yes || R=no
check "B3a gate page shows closed notice" "yes" "$R"
echo "$BODY" | grep -q "/api/auth/whop" && R=yes || R=no
check "B3b gate page has Whop sign-in" "yes" "$R"
echo "$BODY" | grep -qE "War Room|Mint code|bridge code" && R=leak || R=clean
check "B3c gate page leaks no member content" "clean" "$R"
MEMBER=$(E2E_UID=gate-member node scripts/muse-bridge-e2e/mint-session.mjs)
HDR_MEMBER="Cookie: pr_session=${MEMBER}"
LOC=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -H "$HDR_MEMBER" "$BASE/")
check "B4 member session redirects to /gate" "307 $BASE/gate" "$LOC"
OP=$(E2E_UID=gate-op node scripts/muse-bridge-e2e/mint-session.mjs)
HDR_OP="Cookie: pr_session=${OP}"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$HDR_OP" "$BASE/")
check "B5 operator session passes to /" "200" "$CODE"
BODY=$(curl -s -H "$HDR_OP" "$BASE/admin")
echo "$BODY" | grep -q "Whoparmy Admin" && R=yes || R=no
check "B6 operator reaches /admin" "yes" "$R"
OUT=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE/api/bridge/account")
case "$OUT" in *"/gate"*) R=gated;; *) R=open;; esac
check "B7 /api/bridge/account not gated" "open" "$R"
stop_app

echo "── site gate: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
