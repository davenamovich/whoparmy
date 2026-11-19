# Clipper deploy runbook

Everything the code needs, in the order to do it. Written so someone can finish
this without re-deriving it from the source.

Branch: `feat/clipping-app` on `davenamovich/whoparmy`. 18 commits, 92 tests.
Nothing is on `main`.

## Services

| Service | What it is | Env it needs |
|---|---|---|
| **whoparmy** (existing) | the app: auth, queue, review desk, credits | its existing vars + `CLIPS_CRON_SECRET`, `MNEMOS_URL`, `MNEMOS_KEY` |
| **whoparmy cron** (new) | runs `node scripts/clips-tick.mjs` on a schedule | `APP_URL`, `CLIPS_CRON_SECRET` only |
| **mnemos-bridge** (existing) | HTTP face on the shared mnemos store | `MNEMOS_BRIDGE_TOKEN`, `MNEMOS_DB_PATH`, volume at `/data` |
| **Agent37 renderer** (per member) | the render worker the engine routes to | provisioned by the engine |

## Environment variables

| Name | Where | What |
|---|---|---|
| `CLIPS_CRON_SECRET` | **app and cron — identical** | auth for `POST /api/clips/worker/tick`. A mismatch is a 403 that looks like "nothing to do". |
| `APP_URL` | cron only | e.g. `https://whop.plunderandriffle.com` |
| `MNEMOS_URL` | app | `https://<mnemos-bridge-host>/mcp` |
| `MNEMOS_KEY` | app | the bridge's `MNEMOS_BRIDGE_TOKEN`. Never commit it, never paste it in chat. |

The app already has `DATABASE_URL`, `WHOP_APP_ID`, `WHOP_API_KEY`,
`WHOP_WEBHOOK_SECRET` and `WHOP_BRIDGE_KEY`; the Clipper adds nothing to that set.

## Order

1. **Merge `feat/clipping-app` → `main`** and let it deploy. The schema change is
   additive (new tables, one nullable column), but run `prisma db push` if the
   deploy does not.
2. **Set the app's env**: `CLIPS_CRON_SECRET` (generate 32+ chars), `MNEMOS_URL`,
   `MNEMOS_KEY`.
3. **Create the cron service**, same repo, start command
   `node scripts/clips-tick.mjs`, schedule `*/5 * * * *`, the two vars above, no
   database, no public domain. Details in `docs/clips-cron.md`.
4. **Verify the bridge** with `curl https://<bridge-host>/health` — unauthenticated
   and content-free by design. It should report configured + store present.
5. **Fire one clip** end to end (below).

## Verify it actually works

```
1. /clips            → create a page (name, handle, niche)
2. paste one link    → "" | @creator https://<their own post>""
3. wait ≤5 min       → the cron claims it; the row goes queued → rendering → ready
4. /clips            → Preview opens on a phone; warnings listed
5. Approve           → mints a one-time export token (24h, hashed)
6. Export            → request_mp4 on the member's key → exporting → exported + link
```

If step 3 stalls: check the cron log (`0` vs `1` vs `2`), then whether the row is
`blocked` for a missing credit — a clip with no creator credit never renders, by
design.

## Memory scopes (read this before touching mnemos)

The bridge defaults **both** scope headers to Dave:
`X-Mnemos-Person: user`, `X-Mnemos-Project: global`. A request that omits them
does not fail — it writes into Dave's own memory.

`lib/clips/memory.ts` sets both on every call via `scopeHeaders()`:

| Ours | Person | Project |
|---|---|---|
| a page | `member-<userId>` | `whoparmy:page:<pageId>` |
| army, all bots | `member-<userId>` | `whoparmy:army` |
| army, one bot | `member-<userId>` | `whoparmy:army:bot:<botId>` |

Never `user`. There is a test for that, because this is the one bug that would
be invisible until a member's taste showed up in Dave's briefs.

## Render topology (as of 2026-11-18)

`RECORD_API_URL` now points at an **Agent37** instance, so the Railway render
worker is redundant:

- members with their own Agent37 renderer instance bill to their own wallet;
- everyone else falls to the house instance;
- with no worker at all, the engine renders in-process (ffmpeg + pinned Chromium
  are in `bot/Dockerfile`).

Before removing the Railway worker: set `RECORD_LOCAL_FALLBACK=1`, then delete
the per-member BYOK `railway` rows still pointing at it — stale pointers fail
first and fall back second, which makes every render slower with no visible
cause.

## Rollback

Every piece is additive. Revert the merge (tables stay, harmless), or drop the
cron service; the app keeps working with the Clipper simply not draining. No
existing route or table was modified except `plans.ts` gaining `monthlyClips`
and `ClipJob` gaining `mp4JobId`.
