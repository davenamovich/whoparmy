import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CAP_PER_DAY,
  CHALLENGES,
  CODE_PHRASE_SHA256,
  POOL_CAP_PER_DAY,
  awardFor,
  challengeById,
  isValidHandle,
  normalizeAnswer,
  publicChallenge,
  sha256Hex,
  utcDay,
  verifyAnswer,
} from "./agentgame-logic.ts";

describe("agent game challenge config", () => {
  it("ships four challenges with rising rewards inside the caps", () => {
    assert.equal(CHALLENGES.length, 4);
    assert.deepEqual(CHALLENGES.map((c) => c.rewardGens), [1, 2, 3, 3]);
    assert.ok(CHALLENGES.every((c) => c.maxAttempts >= 5 && c.maxAttempts <= 10));
    assert.ok(CHALLENGES.every((c) => /^[0-9a-f]{64}$/.test(c.answerSha256)));
    assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, 4);
    // One agent sweeping every challenge in a day stays under the agent cap.
    const total = CHALLENGES.reduce((s, c) => s + c.rewardGens, 0);
    assert.ok(total <= AGENT_CAP_PER_DAY, `sweep pays ${total} > agent cap`);
    assert.ok(POOL_CAP_PER_DAY === 100);
  });

  it("public challenge view never exposes answer hashes", () => {
    for (const c of CHALLENGES) {
      const pub = publicChallenge(c) as unknown as Record<string, unknown>;
      assert.ok(!("answerSha256" in pub), `${c.id} leaks its hash`);
    }
    // The one deliberate exception is exported separately, for the manifest.
    assert.equal(CODE_PHRASE_SHA256, challengeById("website-that-lies")!.answerSha256);
  });
});

describe("answer normalization and verification", () => {
  it("normalizes case and whitespace", () => {
    assert.equal(normalizeAnswer("hidden-signal", "  the machine   pays its students "), "THE MACHINE PAYS ITS STUDENTS");
    assert.equal(normalizeAnswer("satoshi-trail", "genesis signal machine memes"), "GENESIS-SIGNAL-MACHINE-MEMES");
    assert.equal(normalizeAnswer("human-paradox", "5710 - 1000"), "5710-1000");
  });

  it("verifies correct answers and rejects wrong ones without an oracle", () => {
    const signal = challengeById("hidden-signal")!;
    assert.equal(verifyAnswer(signal, "the machine pays its students"), true);
    assert.equal(verifyAnswer(signal, "THE MACHINE PAYS ITS STUDENT"), false);
    assert.equal(verifyAnswer(signal, ""), false);
    assert.equal(verifyAnswer(signal, 42), false);
    const trail = challengeById("satoshi-trail")!;
    assert.equal(verifyAnswer(trail, "GENESIS-SIGNAL-MACHINE-MEMES"), true);
    assert.equal(verifyAnswer(trail, "genesis signal machine memes"), true);
    assert.equal(verifyAnswer(trail, "GENESIS-MACHINE-SIGNAL-MEMES"), false);
    const paradox = challengeById("human-paradox")!;
    assert.equal(verifyAnswer(paradox, "5710-1000"), true);
    assert.equal(verifyAnswer(paradox, "1444-300"), false);
    const lies = challengeById("website-that-lies")!;
    assert.equal(verifyAnswer(lies, "quiet satoshi"), true);
    assert.equal(verifyAnswer(lies, "ORANGE LEDGER"), false);
  });

  it("hashes deterministically", () => {
    assert.equal(sha256Hex("QUIET SATOSHI"), CODE_PHRASE_SHA256);
  });
});

describe("pool and agent caps", () => {
  it("pays in full when both caps allow", () => {
    assert.deepEqual(awardFor({ rewardGens: 3, poolUsedToday: 90, agentUsedToday: 5 }), { gens: 3, reason: "paid" });
  });
  it("blocks on the global pool first", () => {
    assert.deepEqual(awardFor({ rewardGens: 3, poolUsedToday: 98, agentUsedToday: 0 }), { gens: 0, reason: "pool_exhausted" });
  });
  it("blocks on the per-agent cap", () => {
    assert.deepEqual(awardFor({ rewardGens: 3, poolUsedToday: 0, agentUsedToday: 9 }), { gens: 0, reason: "agent_cap_reached" });
  });
  it("uses UTC day keys", () => {
    assert.equal(utcDay(new Date("2026-11-20T07:59:00Z")), "2026-11-20");
  });
});

describe("handles", () => {
  it("accepts agent-style handles and rejects junk", () => {
    assert.equal(isValidHandle("agent_042"), true);
    assert.equal(isValidHandle("scout-7"), true);
    assert.equal(isValidHandle("ab"), false);
    assert.equal(isValidHandle("Has Spaces"), false);
    assert.equal(isValidHandle("-lead"), false);
    assert.equal(isValidHandle("x".repeat(25)), false);
    assert.equal(isValidHandle(42), false);
  });
});
