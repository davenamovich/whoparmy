import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planAddOnlyLinkSync,
  provisionBarryRotator,
  type BarryRotatorCandidate,
  type BarryRotatorDb,
} from "./barry-rotator-core.ts";

/**
 * Barry rotator provisioning (Dave, 2026-11-21) against an in-memory
 * fake of the structural db: gate refusals write nothing, the sync
 * is add-only and idempotent, the empty state is honest, and only
 * the links the operator-scoped query returns are ever synced.
 * (Resolving the operator's own oldest Barry is selectBarryRecord's
 * job — covered in barry-agent.test.ts — and the two-user proof
 * runs in the E2E against the real server.)
 */

const NOW = new Date("2026-11-21T12:00:00Z");
const OP = "user-operator";

interface RotatorRow {
  id: string;
  agentId: string;
  userId: string;
  enabled: boolean;
}
interface EngineLinkRow {
  id: string;
  userId: string;
  partner: string;
  source: string;
  createdAt: Date;
}
interface RotatorLinkRow {
  rotatorId: string;
  engineLinkId: string;
  position: number;
  weight: number;
}

function byCreatedThenId<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  const dt = a.createdAt.getTime() - b.createdAt.getTime();
  return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function fakeDb(seed: {
  rotators?: RotatorRow[];
  engineLinks?: EngineLinkRow[];
  rotatorLinks?: RotatorLinkRow[];
}) {
  const store = {
    rotators: [...(seed.rotators ?? [])],
    engineLinks: [...(seed.engineLinks ?? [])],
    rotatorLinks: [...(seed.rotatorLinks ?? [])],
  };
  let seq = 0;
  const db: BarryRotatorDb = {
    agentRotator: {
      async findUnique({ where }) {
        return store.rotators.find((r) => r.agentId === where.agentId) ?? null;
      },
      async upsert({ where, create }) {
        const existing = store.rotators.find((r) => r.agentId === where.agentId);
        if (existing) return existing;
        const row: RotatorRow = { id: `rot-${++seq}`, agentId: create.agentId, userId: create.userId, enabled: true };
        store.rotators.push(row);
        return row;
      },
    },
    engineLink: {
      async findMany({ where }) {
        return store.engineLinks
          .filter((l) => l.userId === where.userId)
          .sort(byCreatedThenId)
          .map((l) => ({ id: l.id, partner: l.partner, source: l.source, createdAt: l.createdAt }));
      },
    },
    agentRotatorLink: {
      async findMany({ where }) {
        return store.rotatorLinks
          .filter((l) => l.rotatorId === where.rotatorId)
          .map((l) => ({ engineLinkId: l.engineLinkId, position: l.position, weight: l.weight }));
      },
      async createMany({ data }) {
        for (const row of data) store.rotatorLinks.push({ ...row });
        return { count: data.length };
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of store.rotatorLinks) {
          if (row.rotatorId === where.rotatorId && row.engineLinkId === where.engineLinkId) {
            row.weight = data.weight;
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  return { db, store };
}

function barry(overrides: Partial<BarryRotatorCandidate> = {}): BarryRotatorCandidate {
  return { id: "agent-barry", name: "BTC Barry", status: "ACTIVE", expiresAt: null, ...overrides };
}

function linkRow(
  id: string,
  partner: string,
  createdAt = "2026-11-19T00:00:00Z",
  source = "manual",
): EngineLinkRow {
  return { id, userId: OP, partner, source, createdAt: new Date(createdAt) };
}

describe("provisionBarryRotator — gate", () => {
  it("refuses when there is no Barry, writing nothing", async () => {
    const { db, store } = fakeDb({ engineLinks: [linkRow("el-1", "salarium")] });
    const res = await provisionBarryRotator(db, { barry: null, operatorUserId: OP, now: NOW });
    assert.equal(res.state, "no-barry");
    assert.equal(res.agentName, null);
    assert.equal(res.rotatorCreated, false);
    assert.equal(store.rotators.length, 0);
    assert.equal(store.rotatorLinks.length, 0);
  });

  it("refuses a paused Barry, writing nothing", async () => {
    const { db, store } = fakeDb({ engineLinks: [linkRow("el-1", "salarium")] });
    const res = await provisionBarryRotator(db, { barry: barry({ status: "PAUSED" }), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "barry-not-active");
    assert.match(res.detail, /PAUSED/);
    assert.equal(store.rotators.length, 0);
    assert.equal(store.rotatorLinks.length, 0);
  });

  it("refuses an expired Barry, writing nothing", async () => {
    const { db, store } = fakeDb({ engineLinks: [linkRow("el-1", "salarium")] });
    const res = await provisionBarryRotator(db, {
      barry: barry({ expiresAt: new Date("2026-11-20T00:00:00Z") }),
      operatorUserId: OP,
      now: NOW,
    });
    assert.equal(res.state, "barry-not-active");
    assert.equal(store.rotators.length, 0);
  });
});

describe("provisionBarryRotator — provisioning", () => {
  it("creates the rotator and syncs the operator's saved links", async () => {
    const { db, store } = fakeDb({
      engineLinks: [linkRow("el-dh", "salarium", "2026-11-19T00:00:00Z"), linkRow("el-fish", "fish-audio", "2026-11-20T00:00:00Z")],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "enabled");
    assert.equal(res.agentName, "BTC Barry");
    assert.equal(res.rotatorCreated, true);
    assert.equal(res.linksAdded, 2);
    assert.equal(res.linksTotal, 2);
    assert.match(res.detail, /DH Media link is in the rotation/);
    assert.equal(store.rotators.length, 1);
    assert.equal(store.rotators[0].agentId, "agent-barry");
    assert.equal(store.rotators[0].userId, OP);
    assert.deepEqual(
      store.rotatorLinks.map((l) => [l.engineLinkId, l.position]),
      [
        ["el-dh", 0],
        ["el-fish", 1],
      ],
    );
  });

  it("is idempotent: a second run creates nothing and adds nothing", async () => {
    const { db, store } = fakeDb({
      engineLinks: [linkRow("el-dh", "salarium"), linkRow("el-fish", "fish-audio")],
    });
    await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.rotatorCreated, false);
    assert.equal(res.linksAdded, 0);
    assert.equal(res.linksTotal, 2);
    assert.equal(store.rotators.length, 1);
    assert.equal(store.rotatorLinks.length, 2);
  });

  it("add-only: existing links keep position/state, stale ones stay, new ones append", async () => {
    const { db, store } = fakeDb({
      rotators: [{ id: "rot-1", agentId: "agent-barry", userId: OP, enabled: true }],
      engineLinks: [linkRow("el-dh", "salarium"), linkRow("el-new", "bankr")],
      rotatorLinks: [
        { rotatorId: "rot-1", engineLinkId: "el-dh", position: 5, weight: 1 },
        { rotatorId: "rot-1", engineLinkId: "el-stale", position: 2, weight: 1 },
      ],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.rotatorCreated, false);
    assert.equal(res.linksAdded, 1);
    assert.equal(res.linksTotal, 3);
    const byId = new Map(store.rotatorLinks.map((l) => [l.engineLinkId, l.position]));
    assert.equal(byId.get("el-dh"), 5, "existing link keeps its position");
    assert.equal(byId.get("el-stale"), 2, "a link no longer saved is NOT removed");
    assert.equal(byId.get("el-new"), 6, "new link appends after the max position");
  });

  it("honest no-links state: rotator created, zero destinations, says so", async () => {
    const { db, store } = fakeDb({ engineLinks: [] });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "no-links");
    assert.equal(res.rotatorCreated, true);
    assert.equal(res.linksTotal, 0);
    assert.match(res.detail, /no destinations/);
    assert.equal(store.rotators.length, 1);
  });

  it("links without a DH Media link: enabled, but the summary flags the missing gate link", async () => {
    const { db } = fakeDb({ engineLinks: [linkRow("el-fish", "fish-audio")] });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "enabled");
    assert.match(res.detail, /no DH Media link is saved/);
  });

  it("a switched-off rotator is left off and reported disabled", async () => {
    const { db, store } = fakeDb({
      rotators: [{ id: "rot-1", agentId: "agent-barry", userId: OP, enabled: false }],
      engineLinks: [linkRow("el-dh", "salarium")],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "disabled");
    assert.equal(store.rotators[0].enabled, false, "provisioning never flips the switch");
  });

  it("syncs only the operator's links — another member's saved links never enter the rotation", async () => {
    const { db, store } = fakeDb({
      engineLinks: [
        linkRow("el-dh", "salarium"),
        {
          id: "el-other",
          userId: "user-member",
          partner: "salarium",
          source: "manual",
          createdAt: new Date("2026-11-19T00:00:00Z"),
        },
      ],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.linksTotal, 1);
    assert.ok(store.rotatorLinks.every((l) => l.engineLinkId !== "el-other"));
  });
});

describe("provisionBarryRotator — the lead is the outcome, never an offer (Dave, 2026-11-21)", () => {
  it("fresh sync: Muse + Agent37 take the front at weight 3, offers behind at 1", async () => {
    const { db, store } = fakeDb({
      engineLinks: [
        linkRow("el-dh", "salarium", "2026-11-18T00:00:00Z"),
        linkRow("el-muse", "muse", "2026-11-19T00:00:00Z", "pr-mcp"),
        linkRow("el-a37", "agent37_ref", "2026-11-20T00:00:00Z", "pr-mcp"),
        linkRow("el-fish", "fish-audio", "2026-11-21T00:00:00Z"),
      ],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "enabled");
    assert.deepEqual(res.leadNames, ["Muse", "Agent37"]);
    assert.equal(res.leadSource, "pr-mcp");
    assert.match(res.detail, /Lead: Muse \+ Agent37 — offers rotate behind\./);
    assert.match(res.detail, /Lead links populated from your P&R record via the bridge sync\./);
    assert.match(res.detail, /DH Media link is in the rotation behind the lead\./);
    const byPosition = [...store.rotatorLinks].sort((a, b) => a.position - b.position);
    assert.deepEqual(
      byPosition.map((l) => [l.engineLinkId, l.weight]),
      [
        ["el-muse", 3],
        ["el-a37", 3],
        ["el-dh", 1],
        ["el-fish", 1],
      ],
    );
  });

  it("re-sync raises an existing lead link's weight to 3 and leaves standards alone", async () => {
    const { db, store } = fakeDb({
      rotators: [{ id: "rot-1", agentId: "agent-barry", userId: OP, enabled: true }],
      engineLinks: [linkRow("el-muse", "muse"), linkRow("el-dh", "salarium")],
      rotatorLinks: [
        { rotatorId: "rot-1", engineLinkId: "el-muse", position: 0, weight: 1 },
        { rotatorId: "rot-1", engineLinkId: "el-dh", position: 1, weight: 2 },
      ],
    });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.linksAdded, 0);
    const byId = new Map(store.rotatorLinks.map((l) => [l.engineLinkId, l]));
    assert.equal(byId.get("el-muse")!.weight, 3, "lead raised to lead weight");
    assert.equal(byId.get("el-muse")!.position, 0, "position untouched");
    assert.equal(byId.get("el-dh")!.weight, 2, "standard link weight never touched");
  });

  it("no Muse/Agent37 saved: provisions as today but the summary flags the missing lead", async () => {
    const { db } = fakeDb({ engineLinks: [linkRow("el-dh", "salarium")] });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.state, "enabled");
    assert.deepEqual(res.leadNames, []);
    assert.match(res.detail, /no Muse link saved — rotator has no lead destination/);
  });

  it("manually saved lead links say so in the summary", async () => {
    const { db } = fakeDb({ engineLinks: [linkRow("el-muse", "muse", "2026-11-19T00:00:00Z", "manual")] });
    const res = await provisionBarryRotator(db, { barry: barry(), operatorUserId: OP, now: NOW });
    assert.equal(res.leadSource, "manual");
    assert.match(res.detail, /Lead links saved manually\./);
  });
});

describe("planAddOnlyLinkSync", () => {
  it("starts positions at 0 for an empty rotator and detects the DH Media link", () => {
    const plan = planAddOnlyLinkSync([], [
      { id: "a", partner: "fish-audio", source: "manual" },
      { id: "b", partner: "dh-media", source: "manual" },
    ]);
    assert.deepEqual(plan.toAdd, [
      { engineLinkId: "a", position: 0, weight: 1 },
      { engineLinkId: "b", position: 1, weight: 1 },
    ]);
    assert.equal(plan.total, 2);
    assert.equal(plan.hasDhMediaLink, true);
    assert.deepEqual(plan.leadNames, []);
    assert.equal(plan.leadSource, null);
  });

  it("orders lead additions canonically (Muse before Agent37) regardless of saved order", () => {
    // The catalog seed creates the operator's links in one pass —
    // saved order between the two leads is arbitrary, the front of
    // the rotation is not.
    const plan = planAddOnlyLinkSync([], [
      { id: "a37", partner: "agent37_ref", source: "pr-mcp" },
      { id: "fish", partner: "fish-audio", source: "manual" },
      { id: "muse", partner: "muse", source: "pr-mcp" },
    ]);
    assert.deepEqual(plan.toAdd, [
      { engineLinkId: "muse", position: 0, weight: 3 },
      { engineLinkId: "a37", position: 1, weight: 3 },
      { engineLinkId: "fish", position: 2, weight: 1 },
    ]);
  });

  it("adds nothing when every saved link is already in the rotator", () => {
    const plan = planAddOnlyLinkSync(
      [{ engineLinkId: "a", position: 3, weight: 1 }],
      [{ id: "a", partner: "salarium", source: "manual" }],
    );
    assert.deepEqual(plan.toAdd, []);
    assert.equal(plan.total, 1);
  });

  it("puts lead links first at lead weight, standards behind at weight 1", () => {
    const plan = planAddOnlyLinkSync([], [
      { id: "dh", partner: "salarium", source: "manual" },
      { id: "muse", partner: "muse", source: "pr-mcp" },
      { id: "a37", partner: "agent37_ref", source: "pr-mcp" },
      { id: "fish", partner: "fish-audio", source: "manual" },
    ]);
    assert.deepEqual(plan.toAdd, [
      { engineLinkId: "muse", position: 0, weight: 3 },
      { engineLinkId: "a37", position: 1, weight: 3 },
      { engineLinkId: "dh", position: 2, weight: 1 },
      { engineLinkId: "fish", position: 3, weight: 1 },
    ]);
    assert.deepEqual(plan.leadNames, ["Muse", "Agent37"]);
    assert.equal(plan.leadSource, "pr-mcp");
  });

  it("raises an existing lead link below lead weight — and never lowers anything", () => {
    const plan = planAddOnlyLinkSync(
      [
        { engineLinkId: "muse", position: 0, weight: 1 },
        { engineLinkId: "a37", position: 1, weight: 7 },
        { engineLinkId: "dh", position: 2, weight: 2 },
      ],
      [
        { id: "muse", partner: "muse", source: "manual" },
        { id: "a37", partner: "agent37_ref", source: "manual" },
        { id: "dh", partner: "salarium", source: "manual" },
      ],
    );
    assert.deepEqual(plan.weightRaises, [{ engineLinkId: "muse", weight: 3 }]);
    assert.deepEqual(plan.toAdd, []);
  });
});
