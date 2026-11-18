# Running the clip dispatcher on Railway

The Clipper's queue is drained by `POST /api/clips/worker/tick`. That endpoint
does the work — polling renders, claiming queued rows, calling the engine on each
member's key. Railway's job is only to **call it on a schedule**, because a
`setInterval` inside the web service dies with the container and Railway sleeps
idle services.

One cron service, one request, one exit code.

## The service

Same repository as the app. In Railway:

1. **New service** → *Deploy from the same repo* (`whoparmy`).
2. **Settings → Deploy → Start Command**
   ```
   node scripts/clips-tick.mjs
   ```
   (This replaces the web server's start command for this service only.)
3. **Settings → Deploy → Cron Schedule**
   ```
   */5 * * * *
   ```
   Every five minutes. Railway runs the start command on that schedule and
   expects the process to exit — the script does, with a meaningful code.
4. **Variables on this service**
   ```
   APP_URL=https://whop.plunderandriffle.com
   CLIPS_CRON_SECRET=<the same value the app has>
   ```
5. **Do not** attach a database or public domain to this service. It has no
   business talking to Postgres or the internet's front door; it calls the app
   over HTTPS and exits.

Leave the web service exactly as it is. Never put a cron schedule on it — a cron
on the web service restarts the app instead of running a job.

## What the exit codes mean

| Code | Meaning | Where to look |
|---|---|---|
| `0` | tick ran, summary printed | nothing to do |
| `1` | the app answered an error | the app's logs for that timestamp |
| `2` | this service is misconfigured | `APP_URL` / `CLIPS_CRON_SECRET` missing or malformed |

A `403` in the cron log means **the two services disagree about
`CLIPS_CRON_SECRET`**. The script prints that in words rather than leaving a bare
status code, because a silent 403 looks exactly like "nothing to do".

## Throughput

The tick claims up to **3** rows and polls up to **10** per run. At five minutes
that is up to 36 clips an hour — far more than one page needs, and deliberately
bounded so a backlog cannot turn into a burst of engine calls and a surprise bill
on a member's Agent37 wallet.

If a page ever needs more, raise `MAX_CLAIMS_PER_TICK` in
`src/lib/clips/dispatch.ts` — not the schedule frequency. More ticks means more
polls (cheap); bigger claims means more renders (money).

## Alternative: GitHub Actions

The repo already runs Actions, so a scheduled workflow works without touching
Railway:

```yaml
on:
  schedule: [{ cron: "*/5 * * * *" }]
  workflow_dispatch:
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "$APP_URL/api/clips/worker/tick" \
            -H "x-clips-cron: $CLIPS_CRON_SECRET" -o - | head -c 500
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CLIPS_CRON_SECRET: ${{ secrets.CLIPS_CRON_SECRET }}
```

GitHub's minimum is also five minutes, and scheduled workflows are disabled after
60 days of repository inactivity — worth knowing before choosing it as the only
scheduler.

## If the queue is not draining

In order: is the cron service running at all (`railway logs` on it)? Does the app
answer `200` to a manual `curl` with the header? Are rows actually in `queued`
state, or blocked at preflight for a missing credit (the desk shows
`blocked` with the reason)? A row with no creator credit never renders — by
design, since a render without a credit produces something the desk refuses.
