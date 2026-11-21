import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IdentityLinkRow } from "./identity.ts";
import type { AgentWalletRow } from "./wallet-bind.ts";
import {
  buildSettlementForDay,
  buildSettlementPacket,
  createDraftsForConfirmedDays,
  splitCents,
  type RotatorDayRow,
  type SettlementDb,
  type SettlementLineRow,
  type SettlementRow,
} from "./settlement.ts";

const HOUSE_EVM = "0x2416d6c32c75e58d436e598be3773a4c722053bc";
const OWNER_EVM = "0x0000000000000000000000000000000000000a01";
const REF_EVM = "0x0000000000000000000000000000000000000ef1";

/** In-memory prisma-like fake implementing SettlementDb. */
function fakeDb() {
  let seq = 0;
  const links = new Map<string, IdentityLinkRow>();
  const wallets = new Map<string, AgentWalletRow>();
  const agents = new Map<string, { id: string; userId: string }>();
  const users = new Map<string, { referredById: string | null }>();
  const days = new Map<string, RotatorDayRow>();
  const settlements = new Map<string, SettlementRow>();
  const lines = new Map<string, SettlementLineRow>();
  const rotators = new Map<string, { id: string; agentId: string; userId: string }>();
  const rotatorLinks = new Map<string, Array<{ engineLinkId: string }>>();
  const engineLinks = new Map<string, { id: string; userId: string; partner: string }>();
  const key = (kind: string, value: string) => `${kind} ${value}`;
  const uniqueError = () => Object.assign(new Error("unique"), { code: "P2002" });

  const db: SettlementDb = {
    identityLink: {
      async findUnique({ where }) {
        return links.get(key(where.kind_value.kind, where.kind_value.value)) ?? null;
      },
      async findMany({ where }) {
        return [...links.values()].filter((l) => l.userId === where.userId);
      },
      async create({ data }) {
        const k = key(data.kind, data.value);
        if (links.has(k)) throw uniqueError();
        const row: IdentityLinkRow = {
          id: `link-${++seq}`,
          userId: data.userId,
          kind: data.kind,
          value: data.value,
          verifiedAt: data.verifiedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        links.set(k, row);
        return row;
      },
    },
    pendingReferral: {
      async findUnique() {
        return null;
      },
      async create() {
        throw new Error("unused");
      },
      async delete() {
        throw new Error("unused");
      },
    },
    user: {
      async findUnique({ where }) {
        const u = users.get(where.id);
        return u ? { referredById: u.referredById } : null;
      },
      async updateMany() {
        return { count: 0 };
      },
    },
    hiredAgent: {
      async findUnique({ where }) {
        return agents.get(where.id) ?? null;
      },
    },
    agentWallet: {
      async findUnique({ where }) {
        if ("chain_address" in where) {
          const { chain, address } = where.chain_address;
          return (
            [...wallets.values()].find((w) => w.chain === chain && w.address === address) ?? null
          );
        }
        const { agentId, chain } = where.agentId_chain;
        return (
          [...wallets.values()].find((w) => w.agentId === agentId && w.chain === chain) ?? null
        );
      },
      async findMany({ where }) {
        return [...wallets.values()].filter((w) => w.agentId === where.agentId);
      },
      async create({ data }) {
        const row: AgentWalletRow = {
          id: `wallet-${++seq}`,
          ...data,
          verifiedAt: data.verifiedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        wallets.set(row.id, row);
        return row;
      },
      async update({ where, data }) {
        const row = wallets.get(where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    rotatorDay: {
      async findUnique({ where }) {
        return days.get(where.date) ?? null;
      },
      async findMany({ where }) {
        return [...days.values()].filter((d) => d.status === where.status);
      },
    },
    settlement: {
      async findUnique({ where }) {
        if ("rotatorDayId" in where) {
          return (
            [...settlements.values()].find((s) => s.rotatorDayId === where.rotatorDayId) ?? null
          );
        }
        return settlements.get(where.id) ?? null;
      },
      async findMany() {
        return [...settlements.values()];
      },
      async create({ data }) {
        const row: SettlementRow = {
          id: `setl-${++seq}`,
          date: data.date,
          rotatorDayId: data.rotatorDayId,
          grossCents: data.grossCents,
          currency: data.currency,
          simulated: data.simulated,
          status: data.status,
          referrerUnassigned: data.referrerUnassigned,
          notes: data.notes ?? null,
          bankrJobId: null,
          txRef: null,
          confirmedAt: null,
          settledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        settlements.set(row.id, row);
        for (const line of data.lines.create) {
          const lineRow: SettlementLineRow = { id: `line-${++seq}`, settlementId: row.id, ...line };
          lines.set(lineRow.id, lineRow);
        }
        return row;
      },
      async update({ where, data }) {
        const row = settlements.get(where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    settlementLine: {
      async findMany({ where }) {
        return [...lines.values()].filter((l) => l.settlementId === where.settlementId);
      },
    },
    agentRotator: {
      async findMany({ where }) {
        return [...rotators.values()].filter((r) => r.userId === where.userId);
      },
    },
    agentRotatorLink: {
      async findMany({ where }) {
        return rotatorLinks.get(where.rotatorId) ?? [];
      },
    },
    engineLink: {
      async findMany({ where }) {
        return [...engineLinks.values()].filter(
          (l) => l.userId === where.userId && l.partner === where.partner,
        );
      },
    },
  };

  return {
    db,
    seedUser: (id: string, referredById: string | null = null) =>
      users.set(id, { referredById }),
    seedIdentity: (userId: string, kind: string, value: string) =>
      links.set(key(kind, value), {
        id: `link-seed-${++seq}`,
        userId,
        kind,
        value,
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    seedAgent: (id: string, userId: string) => agents.set(id, { id, userId }),
    seedAgentWallet: (agentId: string, userId: string, chain: string, address: string) => {
      const row: AgentWalletRow = {
        id: `wallet-seed-${++seq}`,
        agentId,
        userId,
        chain,
        address,
        source: "bankr",
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      wallets.set(row.id, row);
      return row;
    },
    seedDay: (day: RotatorDayRow) => days.set(day.date, day),
    seedRotator: (
      rotatorId: string,
      agentId: string,
      userId: string,
      engineLinkIds: string[],
    ) => {
      rotators.set(rotatorId, { id: rotatorId, agentId, userId });
      rotatorLinks.set(
        rotatorId,
        engineLinkIds.map((engineLinkId) => ({ engineLinkId })),
      );
    },
    seedEngineLink: (id: string, userId: string, partner: string) =>
      engineLinks.set(id, { id, userId, partner }),
    setSettlementStatus: async (id: string, status: string) => {
      const row = settlements.get(id);
      if (row) row.status = status;
    },
  };
}

function confirmedDay(overrides: Partial<RotatorDayRow> = {}): RotatorDayRow {
  return {
    id: "day-1",
    date: "2026-11-20",
    status: "CONFIRMED",
    winnerUserId: "winner",
    winnerPartner: "salarium",
    winnerUrl: "https://dh.media/?affid=member",
    winningBid: 40,
    ...overrides,
  };
}

/** Winner owns agent-1 (rotator carries the winning partner link),
 *  agent-1 has an EVM payout wallet, winner was referred by "ref"
 *  who has an identity EVM wallet, house EVM bound to "house". */
function seedFullWin(fx: ReturnType<typeof fakeDb>) {
  fx.seedUser("winner", "ref");
  fx.seedUser("ref");
  fx.seedUser("house");
  fx.seedIdentity("house", "wallet_evm", HOUSE_EVM);
  fx.seedIdentity("ref", "wallet_evm", REF_EVM);
  fx.seedAgent("agent-1", "winner");
  fx.seedAgentWallet("agent-1", "winner", "evm", OWNER_EVM);
  fx.seedEngineLink("link-1", "winner", "salarium");
  fx.seedRotator("rot-1", "agent-1", "winner", ["link-1"]);
  fx.seedDay(confirmedDay());
}

describe("splitCents", () => {
  it("splits 25/25/50 exactly on round numbers", () => {
    assert.deepEqual(splitCents(100), { pr: 25, referrer: 25, owner: 50 });
    assert.deepEqual(splitCents(10_000), { pr: 2500, referrer: 2500, owner: 5000 });
  });
  it("owner absorbs the remainder; lines always sum to gross", () => {
    assert.deepEqual(splitCents(101), { pr: 25, referrer: 25, owner: 51 });
    assert.deepEqual(splitCents(1), { pr: 0, referrer: 0, owner: 1 });
    assert.deepEqual(splitCents(3), { pr: 0, referrer: 0, owner: 3 });
    assert.deepEqual(splitCents(1_000_003), { pr: 250_000, referrer: 250_000, owner: 500_003 });
    for (const gross of [0, 1, 2, 3, 7, 99, 101, 12_345]) {
      const s = splitCents(gross);
      assert.equal(s.pr + s.referrer + s.owner, gross, `gross ${gross}`);
    }
  });
  it("zero and negative gross are all zeros", () => {
    assert.deepEqual(splitCents(0), { pr: 0, referrer: 0, owner: 0 });
    assert.deepEqual(splitCents(-500), { pr: 0, referrer: 0, owner: 0 });
  });
});

describe("buildSettlementForDay", () => {
  it("returns null for missing, unconfirmed, and winnerless days", async () => {
    const fx = fakeDb();
    assert.equal(await buildSettlementForDay(fx.db, "2026-11-20"), null);
    fx.seedDay(confirmedDay({ status: "OPEN" }));
    assert.equal(await buildSettlementForDay(fx.db, "2026-11-20"), null);
    fx.seedDay(confirmedDay({ status: "CONFIRMED", winnerUserId: null }));
    assert.equal(await buildSettlementForDay(fx.db, "2026-11-20"), null);
  });

  it("builds exact 25/25/50 lines keyed by the agent sub-ID, wallets resolved", async () => {
    const fx = fakeDb();
    seedFullWin(fx);
    const result = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 10_001,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(result);
    assert.equal(result.created, true);
    const s = result.settlement;
    assert.equal(s.status, "DRAFT");
    assert.equal(s.simulated, true);
    assert.equal(s.grossCents, 10_001);
    assert.equal(s.referrerUnassigned, false);
    const byRole = Object.fromEntries(s.lines.map((l) => [l.role, l]));
    assert.equal(byRole.PR.amountCents, 2500);
    assert.equal(byRole.PR.userId, "house");
    assert.equal(byRole.PR.walletAddress, HOUSE_EVM);
    assert.equal(byRole.REFERRER.amountCents, 2500);
    assert.equal(byRole.REFERRER.userId, "ref");
    assert.equal(byRole.REFERRER.walletAddress, REF_EVM);
    assert.equal(byRole.OWNER.amountCents, 5001);
    assert.equal(byRole.OWNER.userId, "winner");
    assert.equal(byRole.OWNER.agentId, "agent-1");
    assert.equal(byRole.OWNER.walletAddress, OWNER_EVM);
    assert.equal(
      s.lines.reduce((sum, l) => sum + l.amountCents, 0),
      10_001,
    );
  });

  it("defaults to a zero-gross SIMULATED draft (today's gens auction)", async () => {
    const fx = fakeDb();
    seedFullWin(fx);
    const result = await buildSettlementForDay(fx.db, "2026-11-20", {
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(result);
    assert.equal(result.settlement.grossCents, 0);
    assert.equal(result.settlement.simulated, true);
    assert.ok(result.settlement.notes?.includes("SIMULATED"));
    assert.ok(result.settlement.lines.every((l) => l.amountCents === 0));
  });

  it("records an unassigned referrer line instead of folding it in", async () => {
    const fx = fakeDb();
    fx.seedUser("winner", null);
    fx.seedDay(confirmedDay());
    const result = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 400,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(result);
    assert.equal(result.settlement.referrerUnassigned, true);
    const ref = result.settlement.lines.find((l) => l.role === "REFERRER");
    assert.equal(ref?.userId, null);
    assert.equal(ref?.amountCents, 100);
    const owner = result.settlement.lines.find((l) => l.role === "OWNER");
    assert.equal(owner?.agentId, null); // no agent rotator carries the win
    assert.equal(owner?.amountCents, 200);
  });

  it("is idempotent per rotator day and never rewrites an existing settlement", async () => {
    const fx = fakeDb();
    seedFullWin(fx);
    const first = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 100,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(first);
    await fx.setSettlementStatus(first.settlement.id, "CONFIRMED");
    const second = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 999_999,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(second);
    assert.equal(second.created, false);
    assert.equal(second.settlement.id, first.settlement.id);
    assert.equal(second.settlement.status, "CONFIRMED");
    assert.equal(second.settlement.grossCents, 100);
  });
});

describe("buildSettlementPacket", () => {
  it("refuses a DRAFT and renders exact instructions for a CONFIRMED settlement", async () => {
    const fx = fakeDb();
    seedFullWin(fx);
    const built = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 10_000,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(built);
    const draftPacket = await buildSettlementPacket(fx.db, built.settlement.id);
    assert.equal(draftPacket.ok, false);
    if (!draftPacket.ok) assert.equal(draftPacket.reason, "not-confirmed");

    await fx.setSettlementStatus(built.settlement.id, "CONFIRMED");
    const packet = await buildSettlementPacket(fx.db, built.settlement.id);
    assert.ok(packet.ok);
    if (packet.ok) {
      assert.ok(packet.text.includes("SIMULATED"));
      assert.ok(packet.text.includes(`Send 25.00 USDC to ${HOUSE_EVM} on Base`));
      assert.ok(packet.text.includes(`Send 25.00 USDC to ${REF_EVM} on Base`));
      assert.ok(packet.text.includes(`Send 50.00 USDC to ${OWNER_EVM} on Base`));
      assert.equal(packet.json.lines.length, 3);
    }
  });

  it("refuses while any line lacks a wallet, naming the role", async () => {
    const fx = fakeDb();
    fx.seedUser("winner", "ref");
    fx.seedUser("ref"); // referrer has NO wallet bound
    fx.seedDay(confirmedDay());
    const built = await buildSettlementForDay(fx.db, "2026-11-20", {
      grossCents: 400,
      houseEvmAddress: HOUSE_EVM,
    });
    assert.ok(built);
    await fx.setSettlementStatus(built.settlement.id, "CONFIRMED");
    const packet = await buildSettlementPacket(fx.db, built.settlement.id);
    assert.equal(packet.ok, false);
    if (!packet.ok) {
      assert.equal(packet.reason, "unbound");
      assert.ok(packet.missingRoles.includes("REFERRER"));
      assert.ok(packet.missingRoles.includes("OWNER"));
    }
  });

  it("reports not-found for an unknown settlement", async () => {
    const fx = fakeDb();
    const packet = await buildSettlementPacket(fx.db, "nope");
    assert.equal(packet.ok, false);
    if (!packet.ok) assert.equal(packet.reason, "not-found");
  });
});

describe("createDraftsForConfirmedDays", () => {
  it("drafts every confirmed day once; re-running creates nothing", async () => {
    const fx = fakeDb();
    seedFullWin(fx);
    fx.seedDay(
      confirmedDay({ id: "day-2", date: "2026-11-21", winnerUserId: "winner" }),
    );
    fx.seedDay(confirmedDay({ id: "day-3", date: "2026-11-22", status: "OPEN" }));
    const first = await createDraftsForConfirmedDays(fx.db, { houseEvmAddress: HOUSE_EVM });
    assert.deepEqual(first.created.sort(), ["2026-11-20", "2026-11-21"]);
    const second = await createDraftsForConfirmedDays(fx.db, { houseEvmAddress: HOUSE_EVM });
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.existing.sort(), ["2026-11-20", "2026-11-21"]);
  });
});
