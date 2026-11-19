import { test } from "node:test";
import assert from "node:assert/strict";

import { canExport, exportMessage, mp4State, tokenIsUsable } from "./export.ts";

const approved = { status: "approved", pageUrl: "https://preview/1", mp4Url: null };

test("export: an approved clip with a preview may export", () => {
  assert.deepEqual(canExport(approved), { ok: true });
});

test("export: nothing below approved can export", () => {
  for (const status of ["draft", "queued", "rendering", "ready", "blocked", "failed"]) {
    const r = canExport({ ...approved, status });
    assert.equal(r.ok, false, status);
  }
});

test("export: approved without a preview is refused — there is nothing to render", () => {
  const r = canExport({ ...approved, pageUrl: null });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /no preview/i);
});

test("export: a second export is refused, not silently re-rendered", () => {
  assert.equal(canExport({ ...approved, mp4Url: "https://cdn/a.mp4" }).ok, false);
  assert.equal(canExport({ ...approved, status: "exporting" }).ok, false);
});

test("token: spent, expired and missing tokens are all unusable", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  assert.equal(tokenIsUsable(null, now), false);
  assert.equal(tokenIsUsable({ expiresAt: new Date("2026-11-20T00:00:00Z") }, now), true);
  assert.equal(tokenIsUsable({ expiresAt: new Date("2026-11-18T00:00:00Z") }, now), false);
  assert.equal(
    tokenIsUsable({ expiresAt: new Date("2026-11-20T00:00:00Z"), usedAt: new Date("2026-11-19T00:00:00Z") }, now),
    false,
  );
});

test("mp4: a url means exported, whatever else the engine says", () => {
  assert.deepEqual(mp4State({ status: "queued", mp4Url: "https://cdn/a.mp4" }), {
    status: "exported",
    url: "https://cdn/a.mp4",
  });
  assert.deepEqual(mp4State({ status: "done", mp4_url: "https://cdn/b.mp4" }), {
    status: "exported",
    url: "https://cdn/b.mp4",
  });
});

test("mp4: done without a link is a failure, not a silent wait", () => {
  const s = mp4State({ status: "done" });
  assert.equal(s.status, "failed");
  assert.match(s.error ?? "", /without an MP4/);
});

test("mp4: an unknown answer keeps exporting rather than guessing", () => {
  assert.equal(mp4State({ status: "running" }).status, "exporting");
  assert.equal(mp4State({}).status, "exporting");
});

test("copy: the started message does not claim a file that is not there yet", () => {
  const started = exportMessage("started");
  assert.match(started, /Rendering/);
  // "when the file is ready" is fine — claiming the link exists is not.
  assert.doesNotMatch(started, /link is on the card|is ready to download|Done/i);
  assert.match(exportMessage("exported"), /Done/);
});
