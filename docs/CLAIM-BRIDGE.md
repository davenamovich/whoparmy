# Static-Page Claim Bridge — win token spec

**Problem.** The game surfaces that live on static pages (the pr-board,
the static doors game) have no accounts and no balances. A player can
win there, but there is nothing to pay the win *into*.

**Answer.** A win travels as a **signed claim token**. The player
carries it to Whoparmy (`/claim`), signs in with Whop, and redeems it
there — the win pays free generations into their member balance.
Implementation: `src/lib/claims.ts`, `src/app/api/claims/*`,
`src/app/claim/page.tsx`.

## Token format

```
W1.<base64url(payload JSON)>.<base64url(HMAC-SHA256(payload segment, SECRET))>
```

Payload:

| field   | type   | meaning                                             |
| ------- | ------ | --------------------------------------------------- |
| `v`     | number | format version — always `1`                         |
| `amt`   | number | free generations the win pays (integer, 1–100,000)  |
| `nonce` | string | one-time id, ≥8 chars (use 24 hex chars)            |
| `exp`   | number | expiry, unix **seconds** (default: mint + 30 days)  |
| `src`   | string | where the win happened, ≤40 chars (e.g. `doors-static`) |

Example payload: `{"v":1,"amt":115,"nonce":"9f2c…","exp":1795…,"src":"doors-static"}`

## Rules

- **The secret never ships to a browser.** `CLAIM_BRIDGE_SECRET`
  (≥16 chars, use 32+) lives only on servers: Whoparmy verifies with
  it; the minter signs with it. A static page must call *its own
  backend* to mint — if the game has no backend, the operator mint
  route below issues tokens by hand.
- **Single-use.** Whoparmy records each redeemed `nonce`
  (`ClaimRedemption.nonce` unique). A token pays exactly once, to
  exactly one member, ever — replay, sharing and double-claims all
  fail with "already been claimed".
- **Expiry is enforced at redemption** (30 days by default). An
  expired token never pays.
- **Redemption needs a real session.** The anonymous fallback account
  cannot claim (401) — a win must land in the winner's own account.

## How a game hands over the win

Link the player to the claim page with the token in the URL:

```
https://whop.plunderandriffle.com/claim?code=<TOKEN>
```

The page pre-fills the code. If the player isn't signed in, they're
prompted to sign in with Whop first and to re-open the same link
afterwards (the OAuth callback lands on the home page).

Showing the raw token as copyable text also works — the claim page
accepts a paste.

## Minting

Game backend (any language):

```js
const payload = { v: 1, amt, nonce: crypto.randomBytes(12).toString("hex"),
                  exp: Math.floor(Date.now() / 1000) + 30 * 86400, src: "doors-static" };
const segment = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.CLAIM_BRIDGE_SECRET)
  .update(segment).digest("base64url");
const token = `W1.${segment}.${sig}`;
```

Operator by hand (designated Whop login, e.g. a make-good or a test):

```
POST /api/claims/mint        { "amount": 115, "source": "doors-static", "ttlSeconds": 2592000 }
→ 201 { token, claimUrl, amount, source }
```

## Redemption API

```
POST /api/claims/redeem      { "token": "W1.…" }   (member session cookie)
→ 200 { ok: true, amount, source, newBalance }
→ 400 { error }  — invalid / expired / already claimed
→ 401 { error, needsSignIn: true } — anonymous fallback session
→ 503 { error }  — CLAIM_BRIDGE_SECRET not set on this deployment
```

## Setup

Set `CLAIM_BRIDGE_SECRET` on the Whoparmy Railway service and on
every minting backend (same value, both sides — a mismatch fails
signature checks and the claim page reports an invalid code).
