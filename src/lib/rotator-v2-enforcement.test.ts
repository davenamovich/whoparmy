import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enforcementEffects,
  forfeitedAgentIds,
  summarizeHopDay,
  scoreHop,
  HOP_FILTER_POLICY,
  type EnforcementLike,
  type HopHistory,
} from "./rotator-v2-core.ts";

const defaults = {
  serveBlocked: false,
  slotsForfeited: false,
  userRateScale: 1,
  agentRateScale: 1,
};

const history = (): HopHistory => ({
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

const baseHop = {
  ua: "Mozilla/5.0",
  hasIp: false,
  hasReferer: true,
  hasUser: true,
  hasAgent: true,
  history: history(),
};

const row = (scope: string, scopeId: string, level: string): EnforcementLike => ({
  scope,
  scopeId,
  level,
});

describe("rotator enforcement core", () => {
  it("uses default effects for an empty enforcement list", () => {
    assert.deepEqual(enforcementEffects([], {}), defaults);
  });

  it("WARN rows for matching agents and users leave effects at defaults", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("AGENT", "agent-a", "WARN")],
        { agentId: "agent-a" },
      ),
      defaults,
    );
    assert.deepEqual(
      enforcementEffects(
        [row("USER", "user-a", "WARN")],
        { userId: "user-a" },
      ),
      defaults,
    );
  });

  it("throttles the agent rate scale for an agent enforcement", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("AGENT", "agent-a", "THROTTLE")],
        { agentId: "agent-a" },
      ),
      { ...defaults, agentRateScale: 0.5 },
    );
  });

  it("throttles user and agent rate scales for a user enforcement", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("USER", "user-a", "THROTTLE")],
        { agentId: "agent-a", userId: "user-a" },
      ),
      { ...defaults, userRateScale: 0.5, agentRateScale: 0.5 },
    );
  });

  it("does not stack agent and user throttles below one half", () => {
    assert.deepEqual(
      enforcementEffects(
        [
          row("AGENT", "agent-a", "THROTTLE"),
          row("USER", "user-a", "THROTTLE"),
        ],
        { agentId: "agent-a", userId: "user-a" },
      ),
      { ...defaults, userRateScale: 0.5, agentRateScale: 0.5 },
    );
  });

  it("forfeits slots for a matching agent", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("AGENT", "agent-a", "FORFEIT")],
        { agentId: "agent-a" },
      ),
      { ...defaults, slotsForfeited: true },
    );
  });

  it("forfeits slots for a user enforcement in an agent context", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("USER", "user-a", "FORFEIT")],
        { agentId: "agent-a", userId: "user-a" },
      ),
      { ...defaults, slotsForfeited: true },
    );
  });

  it("blocks serving for a removed agent", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("AGENT", "agent-a", "REMOVED")],
        { agentId: "agent-a" },
      ),
      { ...defaults, serveBlocked: true },
    );
  });

  it("blocks serving for a removed user in a user-only context", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("USER", "user-a", "REMOVED")],
        { userId: "user-a" },
      ),
      { ...defaults, serveBlocked: true },
    );
  });

  it("blocks serving for a removed user in an agent context", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("USER", "user-a", "REMOVED")],
        { agentId: "agent-a", userId: "user-a" },
      ),
      { ...defaults, serveBlocked: true },
    );
  });

  it("ignores enforcement rows with a different scope id", () => {
    const rows = [row("AGENT", "other-agent", "REMOVED"), row("USER", "other-user", "FORFEIT")];
    assert.deepEqual(
      enforcementEffects(rows, { agentId: "agent-a", userId: "user-a" }),
      defaults,
    );
  });

  it("does not apply an agent row to another agent owned by the same user", () => {
    assert.deepEqual(
      enforcementEffects(
        [row("AGENT", "agent-a", "REMOVED")],
        { agentId: "agent-b", userId: "user-a" },
      ),
      defaults,
    );
  });

  it("restores default effects when the database omits a lifted row", () => {
    const activeRows = [row("AGENT", "agent-a", "REMOVED")];
    assert.equal(
      enforcementEffects(activeRows, { agentId: "agent-a" }).serveBlocked,
      true,
    );

    // listActiveEnforcements filters liftedAt=null, so a lifted row is absent from this list.
    const rowsAfterLift = activeRows.filter(() => false);
    assert.deepEqual(enforcementEffects(rowsAfterLift, { agentId: "agent-a" }), defaults);
  });

  it("counts a user hop at the default rate limit", () => {
    const hop = { ...baseHop, history: history() };
    hop.history.rateCounts.userMinute = 200;

    assert.equal(scoreHop(hop).counted, true);
    assert.equal(HOP_FILTER_POLICY.RATE_LIMIT_USER_PER_MINUTE, 300);
  });

  it("rate limits a user hop at half the user threshold", () => {
    const hop = { ...baseHop, history: history() };
    hop.history.rateCounts.userMinute = 200;

    assert.equal(scoreHop({ ...hop, rateScales: { user: 0.5 } }).reason, "RATE_LIMITED");
  });

  it("counts an agent hop at the default rate limit", () => {
    const hop = { ...baseHop, history: history() };
    hop.history.rateCounts.agentMinute = 200;

    assert.equal(scoreHop(hop).counted, true);
  });

  it("rate limits an agent hop at half the agent threshold", () => {
    const hop = { ...baseHop, history: history() };
    hop.history.rateCounts.agentMinute = 200;

    assert.equal(scoreHop({ ...hop, rateScales: { agent: 0.5 } }).reason, "RATE_LIMITED");
  });

  it("expands agent and user forfeits to the affected agent ids", () => {
    const rows = [row("AGENT", "agent-a", "FORFEIT"), row("USER", "user-a", "FORFEIT")];
    const agentsByUser = new Map([["user-a", ["agent-b", "agent-c"]]]);

    assert.deepEqual([...forfeitedAgentIds(rows, agentsByUser)].sort(), [
      "agent-a",
      "agent-b",
      "agent-c",
    ]);
  });

  it("ignores WARN and REMOVED rows when calculating forfeited agents", () => {
    const rows = [row("AGENT", "agent-a", "WARN"), row("USER", "user-a", "REMOVED")];
    const agentsByUser = new Map([["user-a", ["agent-b"]]]);

    assert.deepEqual([...forfeitedAgentIds(rows, agentsByUser)], []);
  });

  it("ignores user forfeits when the user is absent from the agent map", () => {
    assert.deepEqual(
      [...forfeitedAgentIds([row("USER", "missing-user", "FORFEIT")], new Map())],
      [],
    );
  });

  it("summarizes totals and includes null reasons as UNKNOWN", () => {
    const summary = summarizeHopDay([
      { counted: true, filterReason: null, agentId: "agent-a", userId: "user-a" },
      { counted: false, filterReason: "BOT_UA", agentId: "agent-b", userId: "user-a" },
      { counted: false, filterReason: null, agentId: null, userId: null },
    ]);

    assert.equal(summary.total, 3);
    assert.equal(summary.countedTotal, 1);
    assert.equal(summary.filteredTotal, 2);
    assert.deepEqual(summary.filteredByReason, { BOT_UA: 1, UNKNOWN: 1 });
  });

  it("rolls up agents and excludes null agent ids while retaining them in totals", () => {
    const summary = summarizeHopDay([
      { counted: true, filterReason: null, agentId: "agent-a", userId: null },
      { counted: false, filterReason: "BOT_UA", agentId: null, userId: null },
    ]);

    assert.equal(summary.total, 2);
    assert.deepEqual(summary.perAgent, [{ agentId: "agent-a", counted: 1, filtered: 0 }]);
  });

  it("rolls up user totals", () => {
    const summary = summarizeHopDay([
      { counted: true, filterReason: null, agentId: null, userId: "user-a" },
      { counted: false, filterReason: "BOT_UA", agentId: null, userId: "user-a" },
      { counted: true, filterReason: null, agentId: null, userId: "user-b" },
    ]);

    assert.deepEqual(summary.perUser, [
      { userId: "user-a", counted: 1, filtered: 1 },
      { userId: "user-b", counted: 1, filtered: 0 },
    ]);
  });

  it("orders agents by counted total and then by id", () => {
    const summary = summarizeHopDay([
      { counted: true, filterReason: null, agentId: "agent-b", userId: null },
      { counted: true, filterReason: null, agentId: "agent-a", userId: null },
      { counted: false, filterReason: "BOT_UA", agentId: "agent-c", userId: null },
    ]);

    assert.deepEqual(summary.perAgent, [
      { agentId: "agent-a", counted: 1, filtered: 0 },
      { agentId: "agent-b", counted: 1, filtered: 0 },
      { agentId: "agent-c", counted: 0, filtered: 1 },
    ]);
  });
});
