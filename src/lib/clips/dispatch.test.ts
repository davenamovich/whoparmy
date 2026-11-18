import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ATTEMPTS,
  MAX_CLAIMS_PER_TICK,
  buildSitdownArgs,
  claimOrder,
  deskCaption,
  preflight,
  statusFromEngine,
  type DispatchJob,
} from "./dispatch.ts";

const page = { niche: "GTA 6 news", handle: "@gtadaily6", disclosure: "Not affiliated with Rockstar Games" };

function job(over: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: "clip_1",
    sourceUrl: "https://youtu.be/abc",
    clipSeconds: 15,
    hook: null,
    creditWho: "@studio",
    creditUrl: "https://youtu.be/abc",
    attempts: 0,
    ...over,
  };
}

test("args: the engine gets captions mode, the clip and its length", () => {
  const args = buildSitdownArgs(job(), page);
  assert.equal(args.video_style, "captions");
  assert.equal(args.clip, "https://youtu.be/abc");
  assert.equal(args.clip_seconds, 15);
  assert.equal(args.disclosure, page.disclosure);
});

test("args: a credit is passed only when both handle and source exist", () => {
  assert.deepEqual(buildSitdownArgs(job(), page).credit, {
    who: "@studio",
    url: "https://youtu.be/abc",
  });
  assert.equal(buildSitdownArgs(job({ creditUrl: null }), page).credit, undefined);
});

test("args: no hook is sent rather than an empty one — the engine derives it", () => {
  assert.equal("hook" in buildSitdownArgs(job({ hook: null }), page), false);
  assert.equal(buildSitdownArgs(job({ hook: "The hidden car" }), page).hook, "The hidden car");
});

test("preflight: a clip with no credit is blocked before it costs a call", () => {
  const check = preflight(job({ creditWho: null }));
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.code, "NO_CREDIT");
});

test("preflight: an exhausted clip goes to a human, not another retry", () => {
  const check = preflight(job({ attempts: MAX_ATTEMPTS }));
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.code, "ATTEMPTS");
});

test("status: a finished render becomes ready and carries its warnings", () => {
  const s = statusFromEngine({
    status: "done",
    pageUrl: "https://preview/1",
    caption: "Hook line",
    warnings: ["no creator credit"],
  });
  assert.equal(s.status, "ready");
  assert.equal(s.pageUrl, "https://preview/1");
  assert.deepEqual(s.warnings, ["no creator credit"]);
});

test("status: done without a preview is a failure, not a ready row", () => {
  const s = statusFromEngine({ status: "done", pageUrl: null });
  assert.equal(s.status, "failed");
  assert.match(s.error ?? "", /without a preview/);
});

test("status: an unknown answer keeps the row rendering rather than guessing", () => {
  assert.equal(statusFromEngine({ status: "queued" }).status, "rendering");
  assert.equal(statusFromEngine({}).status, "rendering");
});

test("claim: only renderable rows, oldest first, capped per tick", () => {
  const jobs = [
    job({ id: "a", attempts: 0 }),
    job({ id: "b", attempts: MAX_ATTEMPTS }),
    job({ id: "c", attempts: 1 }),
    job({ id: "d", attempts: 0 }),
    job({ id: "e", attempts: 0 }),
    job({ id: "f", attempts: 0 }),
  ];
  const claimed = claimOrder(jobs).map((j) => j.id);
  assert.equal(claimed.includes("b"), false, "an exhausted row must never be claimed");
  assert.equal(claimed.length, MAX_CLAIMS_PER_TICK);
  assert.deepEqual(claimed, ["a", "c", "d"]);
});

test("caption: the desk copy always ends with a credit line", () => {
  assert.equal(deskCaption("Hook line", job()).endsWith("🎬 @studio"), true);
  assert.match(deskCaption(null, job({ creditWho: null })), /credit missing/);
});
