import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketByEtDay, generatedAvatar, hashSeed, lastEtDays, sparkPath, timeAgo } from "./agent-visual.ts";

describe("generatedAvatar", () => {
  it("is deterministic per seed and differs across seeds", () => {
    assert.deepEqual(generatedAvatar("barry", "Barry"), generatedAvatar("barry", "Barry"));
    assert.notEqual(generatedAvatar("barry", "Barry").background, generatedAvatar("nova", "Nova").background);
  });

  it("mirrors the 5×5 pattern left to right", () => {
    const { cells } = generatedAvatar("mirror-check", "M");
    assert.equal(cells.length, 25);
    for (let row = 0; row < 5; row++) {
      assert.equal(cells[row * 5], cells[row * 5 + 4]);
      assert.equal(cells[row * 5 + 1], cells[row * 5 + 3]);
    }
  });

  it("uses the uppercased first letter, ? for blank names", () => {
    assert.equal(generatedAvatar("x", "nova").initial, "N");
    assert.equal(generatedAvatar("x", "  ").initial, "?");
  });

  it("hashSeed is a stable unsigned 32-bit value", () => {
    assert.equal(hashSeed("abc"), hashSeed("abc"));
    assert.ok(hashSeed("abc") >= 0 && hashSeed("abc") <= 0xffffffff);
  });
});

describe("sparkPath", () => {
  it("draws a flat baseline for empty and all-zero series", () => {
    assert.equal(sparkPath([], 100, 20), "M2,18 L98,18");
    assert.equal(sparkPath([0, 0, 0], 100, 20), "M2.0,18.0 L50.0,18.0 L98.0,18.0");
  });

  it("puts the max at the top and zero at the bottom", () => {
    assert.equal(sparkPath([0, 10], 100, 20), "M2.0,18.0 L98.0,2.0");
  });
});

describe("ET day bucketing", () => {
  it("returns 7 ordered days ending today (ET)", () => {
    const days = lastEtDays(new Date("2026-11-21T15:00:00Z"));
    assert.equal(days.length, 7);
    assert.equal(days[0], "2026-11-15");
    assert.equal(days[6], "2026-11-21");
  });

  it("buckets by the ET calendar day, not UTC", () => {
    const days = ["2026-11-20", "2026-11-21"];
    // 03:00 UTC on the 21st is still the evening of the 20th in New York.
    const counts = bucketByEtDay(
      [new Date("2026-11-21T03:00:00Z"), new Date("2026-11-21T16:00:00Z"), new Date("2026-11-01T12:00:00Z")],
      days,
    );
    assert.deepEqual(counts, [1, 1]);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  it("labels recent, minutes, hours and days", () => {
    assert.equal(timeAgo(new Date("2026-11-21T11:59:30Z"), now), "just now");
    assert.equal(timeAgo(new Date("2026-11-21T11:56:00Z"), now), "4m ago");
    assert.equal(timeAgo(new Date("2026-11-21T09:00:00Z"), now), "3h ago");
    assert.equal(timeAgo(new Date("2026-11-19T12:00:00Z"), now), "2d ago");
  });
});
