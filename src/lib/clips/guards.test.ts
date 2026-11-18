// Run: npm test  (node --test, native TS — no build step, no runner to install)
//
// One test per editorial gate, plus the intake bounds that stop a batch
// from becoming a credit fire. If someone edits the skill and not this
// file, these fail before anything reaches a page.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertApproved,
  assertCredit,
  assertDisclosure,
  assertNotTakedown,
  clipSeconds,
  dedupeBatch,
  isPublicSource,
  ClipGuardError,
  MAX_BATCH,
  PLACEHOLDER_CREDIT,
} from "./guards.ts";

const source = "https://www.youtube.com/watch?v=abc123";

// ─── Gate 4: public material only ───────────────────────────────────

test("gate 4: youtube, x, tiktok and instagram pass", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://x.com/creator/status/1",
    "https://www.tiktok.com/@creator/video/1",
    "https://www.instagram.com/reel/abc/",
  ]) {
    assert.equal(isPublicSource(url).kind, "platform", url);
  }
});

test("gate 4: a direct media file is allowed from any host", () => {
  assert.equal(isPublicSource("https://cdn.example.com/clips/hit.mp4").kind, "media");
  assert.equal(isPublicSource("https://files.example.org/a/b.m4a").kind, "media");
});

test("gate 4: localhost, private ranges and .onion are refused", () => {
  for (const url of [
    "https://localhost/clip.mp4",
    "https://127.0.0.1/clip.mp4",
    "https://10.1.2.3/clip.mp4",
    "https://192.168.4.4/clip.mp4",
    "https://172.20.0.9/clip.mp4",
    "https://printer.local/clip.mp4",
    "https://abc.onion/clip.mp4",
  ]) {
    assert.throws(() => isPublicSource(url), ClipGuardError, url);
  }
});

test("gate 4: leak hosts are refused, with a reason a person can read", () => {
  assert.throws(
    () => isPublicSource("https://gofile.io/d/whatever"),
    (err: unknown) =>
      err instanceof ClipGuardError &&
      err.code === "LEAK_SOURCE" &&
      /leaked or pirated/.test(err.hint),
  );
});

test("gate 4: signed or expiring links are refused", () => {
  assert.throws(
    () => isPublicSource("https://cdn.example.com/hit.mp4?X-Amz-Signature=deadbeef&X-Amz-Expires=60"),
    (err: unknown) => err instanceof ClipGuardError && err.code === "EXPIRING_LINK",
  );
});

test("gate 4: a random page that is not a clip and not media is refused", () => {
  assert.throws(
    () => isPublicSource("https://example.com/about"),
    (err: unknown) => err instanceof ClipGuardError && err.code === "UNKNOWN_HOST",
  );
});

test("gate 4: plain http is refused", () => {
  assert.throws(
    () => isPublicSource("http://www.youtube.com/watch?v=abc"),
    (err: unknown) => err instanceof ClipGuardError && err.code === "NOT_PUBLIC",
  );
});

// ─── Gate 2: credit before posting ──────────────────────────────────

test("gate 2: a real handle plus its source passes", () => {
  assert.deepEqual(
    assertCredit({ creditWho: "@clipmaster", creditUrl: source, sourceUrl: source }),
    { who: "@clipmaster", url: source },
  );
});

test("gate 2: the engine placeholder is a hard failure, not a warning", () => {
  assert.throws(
    () => assertCredit({ creditWho: PLACEHOLDER_CREDIT, creditUrl: source, sourceUrl: source }),
    (err: unknown) => err instanceof ClipGuardError && err.code === "PLACEHOLDER_CREDIT",
  );
});

test("gate 2: a missing handle or missing source fails", () => {
  assert.throws(() => assertCredit({ sourceUrl: source }), ClipGuardError);
  assert.throws(
    () => assertCredit({ creditWho: "@someone", sourceUrl: source }),
    (err: unknown) => err instanceof ClipGuardError && err.code === "NO_CREDIT",
  );
});

test("gate 2: a credit pointing at a different platform fails", () => {
  assert.throws(
    () =>
      assertCredit({
        creditWho: "@someone",
        creditUrl: "https://www.tiktok.com/@someone/video/9",
        sourceUrl: source,
      }),
    (err: unknown) => err instanceof ClipGuardError && err.code === "CREDIT_MISMATCH",
  );
});

// ─── Gates 1 + 3: preview, then an explicit yes ─────────────────────

test("gate 3: export is refused unless the human approved it", () => {
  for (const status of ["draft", "queued", "rendering", "ready", "exported", "failed", "blocked"] as const) {
    assert.throws(
      () => assertApproved({ status, pageUrl: "https://preview/1" }),
      (err: unknown) => err instanceof ClipGuardError && err.code === "NOT_APPROVED",
      status,
    );
  }
});

test("gate 1: approved but without a preview still cannot export", () => {
  assert.throws(
    () => assertApproved({ status: "approved", pageUrl: null }),
    (err: unknown) => err instanceof ClipGuardError && err.code === "NOT_APPROVED",
  );
});

test("gates 1+3: approved with a preview passes", () => {
  assert.doesNotThrow(() => assertApproved({ status: "approved", pageUrl: "https://preview/1" }));
});

// ─── Takedown memory ────────────────────────────────────────────────

test("takedown: a blocked creator is refused regardless of case or @", () => {
  assert.throws(
    () => assertNotTakedown("@ClipMaster", [{ creator: "clipmaster" }]),
    (err: unknown) => err instanceof ClipGuardError && err.code === "CREATOR_BLOCKED",
  );
  assert.doesNotThrow(() => assertNotTakedown("@other", [{ creator: "clipmaster" }]));
});

// ─── Disclosure ─────────────────────────────────────────────────────

test("disclosure: a fan page's line must appear in the copy", () => {
  const page = { disclosure: "Not affiliated with Rockstar Games" };
  assert.doesNotThrow(() =>
    assertDisclosure(page, "Great clip.\nNot affiliated with Rockstar Games"),
  );
  assert.throws(
    () => assertDisclosure(page, "Great clip."),
    (err: unknown) => err instanceof ClipGuardError && err.code === "NO_DISCLOSURE",
  );
  // A page with no disclosure line has nothing to enforce.
  assert.doesNotThrow(() => assertDisclosure({ disclosure: null }, "Great clip."));
});

// ─── Intake bounds (the burn guard) ─────────────────────────────────

test("duration: defaults to 15s, accepts 3–30, refuses outside", () => {
  assert.equal(clipSeconds(undefined), 15);
  assert.equal(clipSeconds("20"), 20);
  assert.equal(clipSeconds(3), 3);
  assert.equal(clipSeconds(30), 30);
  assert.throws(() => clipSeconds(2), ClipGuardError);
  assert.throws(() => clipSeconds(31), ClipGuardError);
  assert.throws(() => clipSeconds("banana"), ClipGuardError);
});

test("batch: 25 links is the ceiling, and duplicates collapse", () => {
  assert.throws(
    () => dedupeBatch(Array.from({ length: MAX_BATCH + 1 }, (_, i) => `https://youtu.be/${i}`)),
    (err: unknown) => err instanceof ClipGuardError && err.code === "BATCH_TOO_LARGE",
  );
  assert.deepEqual(dedupeBatch(["https://youtu.be/a", " https://youtu.be/a ", "https://youtu.be/b"]), [
    "https://youtu.be/a",
    "https://youtu.be/b",
  ]);
});
