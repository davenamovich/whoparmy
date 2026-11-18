#!/usr/bin/env bash
# Muse bridge E2E — the real flow, end to end, against a mock bot.
#
# Builds the app, pushes the schema to a temp SQLite DB, seeds a member
# (whopId user_e2e12345, plan CREATOR) + a brand, starts a mock P&R bot
# (Whop bridge key endpoint + MCP, 1000-credit balance that demo_pack
# drains at 115), starts the app, and drives the whole journey:
# account → code → exchange (single-use) → MCP tools/list (allowlist)
# → free tools → publish refused → 7 packs settle at exactly 805 →
# 8th refused pre-spend → revoke kills the token — plus the clips
# lane: the same Starter member mints a clips code on their own
# balance, runs create_sitdown at 25, and scope isolation is proven
# both ways (clips token refused create_demo_pack; week token
# refused create_sitdown). 63 checks.
#
# Usage: bash scripts/muse-bridge-e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK=/tmp/bridge-e2e
mkdir -p "$WORK"
export DATABASE_URL="file:/tmp/bridge-e2e.db"
export WHOP_BRIDGE_KEY="test-bridge-key"
export BOT_BRIDGE_BASE_URL="http://127.0.0.1:4100"
export SESSION_SECRET="e2e-session-secret"
export PRISMA_QUERY_ENGINE_LIBRARY="$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
export PRISMA_SCHEMA_ENGINE_BINARY="$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
export CHECKPOINT_DISABLE=1

# A previous run's next-server can survive its trap (npx spawns a child
# that outlives the parent kill) and would hold the deleted DB file —
# clear stale servers and SQLite sidecar files before rebuilding.
pkill -f "next-server" 2>/dev/null || true
pkill -f "mock-bot.mjs" 2>/dev/null || true
sleep 1
rm -f /tmp/bridge-e2e.db /tmp/bridge-e2e.db-journal /tmp/bridge-e2e.db-wal /tmp/bridge-e2e.db-shm
npx prisma generate >/dev/null
npx prisma db push --skip-generate >/dev/null
node scripts/muse-bridge-e2e/seed.mjs
npx next build >/dev/null

node scripts/muse-bridge-e2e/mock-bot.mjs & MOCK_PID=$!
npx next start -p 3100 & APP_PID=$!
trap 'kill $MOCK_PID $APP_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3100/muse-week && break; sleep 2; done

COOKIE=$(node scripts/muse-bridge-e2e/mint-session.mjs)
STARTER=$(E2E_UID=e2e-starter node scripts/muse-bridge-e2e/mint-session.mjs)
SESSION_COOKIE="$COOKIE" STARTER_COOKIE="$STARTER" node scripts/muse-bridge-e2e/drive.mjs
