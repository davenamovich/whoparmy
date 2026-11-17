# Whop Integration — Setup Guide

This guide connects **P&R Global Content Factory** to Whop using only official
integration surfaces (docs.whop.com). No mock endpoints, no fabricated APIs.

## What is wired

| Capability | Implementation | Whop surface |
| --- | --- | --- |
| Log in with Whop | `/api/auth/whop` → `/api/auth/whop/callback` | OAuth 2.1 + PKCE (`https://api.whop.com/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`) |
| Session | HMAC-signed httpOnly cookie (`pr_session`) issued by our callback | Our own cookie — Whop access tokens expire in 1h and are never persisted |
| Live plan updates | `/api/whop/webhook` (signature-verified, idempotent by `webhook-id`) | Standard Webhooks spec via `@whop/sdk` `unwrapWebhook`; events `membership.activated`, `membership.updated`, `payment.succeeded`, `payment.failed` |
| Entitlement verification | `POST /api/whop/sync-entitlements` | `GET /api/v1/users/{id}/access/{resource_id}` (`access_level: customer \| admin \| no_access`) |
| Subscriptions | Pricing cards open Whop-hosted checkout links | Dashboard → Checkout links; fulfillment via `payment.succeeded` webhook — never from the browser |
| Usage limits | `src/lib/plans.ts` + `/api/generate` 402 guards | Local entitlement engine (monthly items, formats, languages per tier) |

## 1. Create the OAuth app

1. Go to <https://whop.com/dashboard/developer> → create/select your app.
2. In the **OAuth** section add the exact-match redirect URI:
   `https://YOUR-DOMAIN/api/auth/whop/callback`
3. Copy the `client_id` (`app_...`) → `WHOP_APP_ID`.
   (Optional safety net: set `WHOP_REDIRECT_URI` to the same URL; otherwise the
   callback derives it from the request origin.)
4. Scopes: `openid profile email` (already what we request).

## 2. Server API key (entitlement checks)

- Developer Dashboard → API keys → copy → `WHOP_API_KEY`. Server-side only —
  it is never exposed to the client and never included in any response.
- Test in sandbox first: set `WHOP_API_ENV=sandbox` and use keys from
  <https://sandbox.whop.com/dashboard/developer> (no real money). Production
  keys live at <https://whop.com/dashboard/developer>. The two share no
  accounts, keys, products, or webhooks.

## 3. Webhook (live plan updates)

1. Dashboard → Developer → **Create webhook** → URL
   `https://YOUR-DOMAIN/api/whop/webhook`
2. Subscribe to events: `membership.activated`, `membership.updated`,
   `payment.succeeded`, `payment.failed`.
3. Copy the signing secret (`ws_...`) → `WHOP_WEBHOOK_SECRET`.
   - Whop rejects localhost targets — use ngrok / Cloudflare Tunnel locally
     (docs.whop.com/developer/guides/webhooks).
4. The handler verifies the HMAC signature before anything else, stores every
   `webhook-id` (`WebhookEvent` table) for hard idempotency, and maps the
   membership's `product_id`/`variant_id` to a plan tier via the env config
   below. If delivery order matters (upgrades), it re-derives the plan from
   the live access-check API when `WHOP_API_KEY` is set.

## 4. Products per plan tier

Create a Whop product for each tier (Creator $19, Pro $49, Agency $99) and map:

```
WHOP_PRODUCT_ID_CREATOR=prod_xxx   # also matches membership.product_id
WHOP_PRODUCT_ID_PRO=prod_xxx
WHOP_PRODUCT_ID_AGENCY=prod_xxx
# optional variant-level matching (membership.variant_id):
WHOP_PLAN_ID_CREATOR=plan_xxx
WHOP_PLAN_ID_PRO=plan_xxx
WHOP_PLAN_ID_AGENCY=plan_xxx
```

Memberships matching no configured id are recorded but never change
entitlements — nothing is hardcoded.

## 5. Checkout links

Dashboard → **Checkout links** → create a recurring checkout per tier and for
the Meme Army upsells, then set:

```
WHOP_CHECKOUT_URL_CREATOR=https://whop.com/checkout/...
WHOP_CHECKOUT_URL_PRO=...
WHOP_CHECKOUT_URL_AGENCY=...
WHOP_CHECKOUT_URL_ARMY_CUSTOM=...
WHOP_CHECKOUT_URL_ARMY_AGENCY=...
```

Until a link is set, the pricing card shows an honest "Checkout not
configured" state — buttons never pretend.

## 6. Session secret

`SESSION_SECRET` — any long random string. Required in production (the dev
fallback derives a stable local secret).

## 7. Muse bridge connector (member's own Muse → MCP, their credits)

Powers /muse-week and `POST /api/bridge/mcp`. Two sides must agree:

- **This app (Railway, whopparmy service):** `WHOP_BRIDGE_KEY` — the shared
  bridge key, set as a server variable. It must match the bot's
  `WHOP_BRIDGE_KEY` exactly. Never expose it to the browser.
- **The bot (bot.plunderandriffle.com host):** `WHOP_BRIDGE_KEY` (same
  value), `WHOP_BRIDGE_KEY_SECRET` (a different, longer secret the bot
  derives member keys from — bot-only, never set here), and the plan
  allowances `WHOP_FREE_CREDITS` / `WHOP_CREATOR_CREDITS` /
  `WHOP_PRO_CREDITS`. Unset allowances grant 0 credits; a missing bot-side
  config answers 503 and /muse-week shows "not configured" honestly.
- Optional: `BOT_BRIDGE_BASE_URL` overrides the bot base
  (default https://bot.plunderandriffle.com).

Until `WHOP_BRIDGE_KEY` is set on this app, /api/bridge/* answers
503 NOT_CONFIGURED and nothing spends.

## Local self-test (no Whop account needed)

The repo ships a dev webhook secret so you can exercise the full signature →
idempotency → plan-mapping pipeline locally:

```bash
WHOP_PRODUCT_ID_PRO=prod_test_pro \
WHOP_WEBHOOK_SECRET=$(grep WHOP_WEBHOOK_SECRET .env | cut -d= -f2) \
bash scripts/whop-webhook-selftest.sh http://localhost:3000 demo-whop-user
```

The script signs a `membership.updated` event exactly per the Standard
Webhooks spec (HMAC-SHA256 over `{id}.{timestamp}.{body}`, `v1,` base64) —
the same algorithm Whop's servers use.

## File map

- `src/lib/whop.ts` — config, OAuth helpers, access check, webhook unwrap
- `src/lib/session.ts` — session/PKCE cookie handling
- `src/lib/auth.ts` — authorization anchor (`getWhopUser`, `upsertWhopUser`)
- `src/app/api/auth/whop/*` — authorize, callback, logout, session state
- `src/app/api/whop/*` — webhook, sync-entitlements, public status
- `src/lib/plans.ts` — tier entitlements consumed by `/api/generate` guards
