#!/usr/bin/env bash
# Whop webhook self-test — signs a membership.updated event exactly per the
# Standard Webhooks spec, the same algorithm Whop's servers use (verified
# against @whop/sdk unwrapWebhook: HMAC key = literal bytes of the ws_ secret).
#
# Usage:
#   bash scripts/whop-webhook-selftest.sh [base_url] [whop_user_id] [status]
# Defaults: http://localhost:3000  demo-whop-user  active
#
# Reads WHOP_WEBHOOK_SECRET from the environment or .env, and
# WHOP_PRODUCT_ID_PRO (default prod_test_pro) for the tier mapping.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
WHOP_USER="${2:-demo-whop-user}"
STATUS="${3:-active}"

cd "$(dirname "$0")/.."

SECRET="${WHOP_WEBHOOK_SECRET:-}"
if [ -z "$SECRET" ]; then
  SECRET=$(rg '^WHOP_WEBHOOK_SECRET=' .env | head -1 | cut -d= -f2-)
fi
if [ -z "$SECRET" ]; then
  echo "No WHOP_WEBHOOK_SECRET found (env or .env)" >&2
  exit 1
fi

PRODUCT_ID="${WHOP_PRODUCT_ID_PRO:-prod_test_pro}"
WEBHOOK_ID="msg_selftest_$(date +%s)_$RANDOM"
TIMESTAMP=$(date +%s)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

BODY=$(printf '{"id":"%s","type":"membership.updated","api_version":"v1","timestamp":"%s","data":{"id":"mem_selftest","user_id":"%s","product_id":"%s","variant_id":"var_selftest","status":"%s","metadata":{"source":"selftest"}}}' \
  "$WEBHOOK_ID" "$NOW_ISO" "$WHOP_USER" "$PRODUCT_ID" "$STATUS")

SIGNED="${WEBHOOK_ID}.${TIMESTAMP}.${BODY}"
SIG=$(printf '%s' "$SIGNED" | openssl dgst -sha256 -hmac "$SECRET" -binary | openssl base64 -A)

echo "→ POST $BASE/api/whop/webhook  (status=$STATUS user=$WHOP_USER product=$PRODUCT_ID)"
curl -s -X POST "$BASE/api/whop/webhook" \
  -H "content-type: application/json" \
  -H "webhook-id: $WEBHOOK_ID" \
  -H "webhook-timestamp: $TIMESTAMP" \
  -H "webhook-signature: v1,$SIG" \
  -d "$BODY"
echo
