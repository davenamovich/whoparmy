import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOP_FILTER_POLICY,
  isAgentWorking,
  pickSequential,
  pickWeighted,
  scoreHop,
  type HopHistory,
} from "./rotator-v2-core.ts";

const cleanHistory = (): HopHistory => ({
  minutesSinceLastCountedSameIpLink: null,
  ipHopsInVelocityWindow: 0,
  ipRefererlessHopsInWindow: 0,
  rateCounts: {
    ipMinute: 0,
    ipDay: 0,
    userMinute: 0,
    userDay: 0,
    agentMinute: 0,
    agentDay: 0,
    poolMinute: 0,
    poolDay: 0,
  },
});

const input = (
  history: HopHistory,
  extra: Partial<Parameters<typeof scoreHop>[0]> = {},
) => ({
  ua: "Mozilla/5.0",
  hasIp: true,
  hasReferer: true,
  hasUser: true,
  hasAgent: true,
  history,
  ...extra,
});

describe("hop filtering", () => {
  it("filters bot and empty user agents", () => {
    assert.deepEqual(
      scoreHop(input(cleanHistory(), { ua: "Googlebot" })),
      { filtered: true, reason: "BOT_UA", counted: false },
    );
    assert.equal(scoreHop(input(cleanHistory(), { ua: null })).reason, "BOT_UA");
    assert.equal(scoreHop(input(cleanHistory(), { ua: "  " })).reason, "BOT_UA");
  });

  it("deduplicates hops inside the window and counts hops outside it", () => {
    const history = cleanHistory();
    history.minutesSinceLastCountedSameIpLink = 5;
    assert.equal(scoreHop(input(history)).reason, "DEDUP");
    history.minutesSinceLastCountedSameIpLink = 31;
    assert.equal(scoreHop(input(history)).counted, true);
    history.minutesSinceLastCountedSameIpLink = 4.99;
    assert.equal(scoreHop(input(history)).reason, "DEDUP");
  });

  it("counts only the first hop in a self-click burst", () => {
    const history = cleanHistory();
    let counted = 0;
    for (let i = 0; i < 10; i++) {
      const verdict = scoreHop(input(history, { hasReferer: false }));
      if (verdict.counted) {
        counted++;
        history.minutesSinceLastCountedSameIpLink = 0;
      }
      history.ipHopsInVelocityWindow++;
      history.ipRefererlessHopsInWindow++;
      history.rateCounts.ipMinute++;
      history.rateCounts.ipDay++;
      history.rateCounts.poolMinute++;
      history.rateCounts.poolDay++;
    }
    assert.equal(counted, 1);
  });

  it("does not drain cap eligibility with filtered bot traffic", () => {
    const link = {
      linkId: "l",
      weight: 1,
      position: 0,
      hopsToday: 0,
      dailyCap: 5,
    };
    for (let i = 0; i < 100; i++) {
      assert.equal(scoreHop(input(cleanHistory(), { ua: "bot" })).counted, false);
    }
    assert.equal(pickSequential([link], 0)?.linkId, "l");
    assert.equal(pickWeighted([link], 0)?.linkId, "l");
  });

  it("filters at the velocity and referer-less thresholds", () => {
    const history = cleanHistory();
    history.ipHopsInVelocityWindow = HOP_FILTER_POLICY.IP_VELOCITY_MAX_HOPS;
    assert.equal(scoreHop(input(history)).reason, "IP_VELOCITY");
    history.ipHopsInVelocityWindow--;
    assert.notEqual(scoreHop(input(history)).reason, "IP_VELOCITY");
    history.ipRefererlessHopsInWindow = HOP_FILTER_POLICY.REFERERLESS_MAX_HOPS;
    assert.equal(
      scoreHop(input(history, { hasReferer: false })).reason,
      "REFERERLESS_BURST",
    );
    assert.notEqual(
      scoreHop(input(history, { hasReferer: true })).reason,
      "REFERERLESS_BURST",
    );
  });
});

describe("hop rate limits", () => {
  it("applies minute and day limits for every populated scope", () => {
    const cases: Array<[keyof HopHistory["rateCounts"], boolean, number]> = [
      ["ipMinute", true, HOP_FILTER_POLICY.RATE_LIMIT_IP_PER_MINUTE],
      ["ipDay", true, HOP_FILTER_POLICY.RATE_LIMIT_IP_PER_DAY],
      ["userMinute", true, HOP_FILTER_POLICY.RATE_LIMIT_USER_PER_MINUTE],
      ["userDay", true, HOP_FILTER_POLICY.RATE_LIMIT_USER_PER_DAY],
      ["agentMinute", true, HOP_FILTER_POLICY.RATE_LIMIT_AGENT_PER_MINUTE],
      ["agentDay", true, HOP_FILTER_POLICY.RATE_LIMIT_AGENT_PER_DAY],
      ["poolMinute", true, HOP_FILTER_POLICY.RATE_LIMIT_POOL_PER_MINUTE],
      ["poolDay", true, HOP_FILTER_POLICY.RATE_LIMIT_POOL_PER_DAY],
    ];
    for (const [key, enabled, value] of cases) {
      const history = cleanHistory();
      history.rateCounts[key] = value;
      const hasIp = key.startsWith("ip") ? enabled : true;
      const hasUser = !key.startsWith("ip") || enabled;
      const hasAgent = !key.startsWith("ip") || enabled;
      assert.equal(
        scoreHop(input(history, { hasIp, hasUser, hasAgent })).reason,
        "RATE_LIMITED",
      );
    }
  });

  it("skips rate limits for absent agent and IP scopes", () => {
    const history = cleanHistory();
    history.rateCounts.agentMinute = 999999;
    assert.notEqual(
      scoreHop(input(history, { hasAgent: false })).reason,
      "RATE_LIMITED",
    );
    history.rateCounts.agentMinute = 0;
    history.rateCounts.ipMinute = 999999;
    assert.notEqual(
      scoreHop(input(history, { hasIp: false })).reason,
      "RATE_LIMITED",
    );
  });
});

describe("hop verdicts and agent status", () => {
  it("uses precedence and preserves the verdict shape", () => {
    const history = cleanHistory();
    history.rateCounts.poolMinute = HOP_FILTER_POLICY.RATE_LIMIT_POOL_PER_MINUTE;
    assert.equal(scoreHop(input(history, { ua: "bot" })).reason, "BOT_UA");
    assert.deepEqual(scoreHop(input(cleanHistory())), {
      filtered: false,
      reason: null,
      counted: true,
    });
  });

  it("matches the working agent predicate cases", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    assert.equal(isAgentWorking("ACTIVE", null, now), true);
    assert.equal(
      isAgentWorking("ACTIVE", new Date("2026-01-01T01:00:00Z"), now),
      true,
    );
    assert.equal(isAgentWorking("PAUSED", null, now), false);
    assert.equal(isAgentWorking("DEPLETED", null, now), false);
    assert.equal(
      isAgentWorking("ACTIVE", new Date("2025-12-31T23:00:00Z"), now),
      false,
    );
  });
});
