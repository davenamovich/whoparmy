#!/usr/bin/env node
/**
 * clips-tick — the Railway cron's one job.
 *
 * Railway runs this on a schedule as its own service: it starts, fires one
 * request at the app, prints the dispatcher's summary, and exits. The work
 * itself happens inside the app (POST /api/clips/worker/tick), which is where
 * the queue, the member keys and the engine calls live.
 *
 * Exit codes matter here, because a cron that always exits 0 is a cron nobody
 * notices:
 *   0 — the tick ran and reported ok
 *   1 — the app answered with an error (bad deploy, dead engine, thrown tick)
 *   2 — this service is misconfigured (missing APP_URL or CLIPS_CRON_SECRET)
 */

const url = (process.env.APP_URL || "").replace(/\/+$/, "");
const secret = process.env.CLIPS_CRON_SECRET || "";
const timeoutMs = Number(process.env.CLIPS_TICK_TIMEOUT_MS || 240_000);

if (!url || !secret) {
  console.error(
    "[clips-tick] not configured: set APP_URL (e.g. https://whop.plunderandriffle.com) and CLIPS_CRON_SECRET on this service.",
  );
  process.exit(2);
}
if (!/^https?:\/\//i.test(url)) {
  console.error(`[clips-tick] APP_URL must start with http:// or https:// (got "${url}").`);
  process.exit(2);
}

const started = Date.now();
try {
  const res = await fetch(`${url}/api/clips/worker/tick`, {
    method: "POST",
    headers: { "x-clips-cron": secret },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();

  if (!res.ok) {
    console.error(`[clips-tick] HTTP ${res.status} after ${Date.now() - started}ms: ${body.slice(0, 500)}`);
    // 403 almost always means the secret on this service and the app disagree.
    if (res.status === 403) {
      console.error("[clips-tick] 403: this service's CLIPS_CRON_SECRET does not match the app's.");
    }
    process.exit(1);
  }

  // The app reports per-row failures with ok:false in an otherwise
  // successful response — that is a failed tick for cron purposes.
  let reportedOk = true;
  try {
    reportedOk = JSON.parse(body)?.ok !== false;
  } catch {
    reportedOk = true;
  }
  if (!reportedOk) {
    console.error(`[clips-tick] tick reported failures in ${Date.now() - started}ms: ${body.slice(0, 500)}`);
    process.exit(1);
  }

  console.log(`[clips-tick] ok in ${Date.now() - started}ms: ${body.slice(0, 500)}`);
  process.exit(0);
} catch (err) {
  console.error(`[clips-tick] request failed after ${Date.now() - started}ms: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
