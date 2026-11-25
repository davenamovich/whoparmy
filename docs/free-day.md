# Free Day (F1)

Schedule `POST /api/internal/free-day/flip` at midnight with `America/New_York` as the external scheduler timezone. Set `FREE_DAY_CRON_SECRET` on the app and send it in the `x-free-day-cron` header. Town and Free-Day reads also materialize the day on demand. A missed day is not backfilled. `FreeDay` and `FreeDayClaim` are the real event ledgers projected into the Town ticker.

The house account uses `HOUSE_BIND_USER_ID` or the existing operator Whop identity fallback. The built-in P&R Content Engine uses its public replication kit and requires a configured house account with an existing house agent to back its Marketplace sale. A public house listing needs a published kit, Skillsync URL, or public build prompt to fulfill a kit claim.

- Muse bearer `GET /api/bridge/free-day/today`: returns the ET date, Space and mode, or `null`.
- Muse bearer `POST /api/bridge/free-day/claim`: send `{"date":"YYYY-MM-DD"}` from the read to guard against claiming after the flip. `KIT` uses the existing Marketplace kit endpoint; `CREDIT` returns the rotator slot credit ID and expiry; `VISIT` returns only a Handout visit and its expiry.
- The existing paid rotator `GET` lists unspent credits. Its `POST` accepts `{creditId, date, partner}` to place one with the member’s saved link and no payment intent. The credit expires at midnight ET seven calendar days after the featured day started.
- A seller’s Muse can set `handoutOptIn: true` or `false` on either Marketplace submit/resubmit payload. Omitting the field preserves the existing value. `GET /api/apps/public/{slug}` with a Muse bearer checks a booked Handout and returns `handout.canUse` and `handout.endsAt` while the feature is active.

Member Spaces have no shared visitor queue or write-back integration in this repo. The Handout ledger and eligibility check do not grant access to the seller’s private jobs, credentials, or data. Existing outputs are not modified.
