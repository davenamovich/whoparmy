import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bindIdentityLink,
  resolveIdentityLink,
  type IdentityDb,
  type IdentityLinkRow,
} from "./identity.ts";
import {
  bindAgentWallet,
  bindUserWallet,
  chainForAddress,
  normalizeWalletAddress,
  resolveWallet,
  walletForAgent,
  type AgentWalletRow,
  type WalletDb,
} from "./wallet-bind.ts";

const EVM_A = "0x2416d6c32c75e58d436e598be3773a4c722053bc";
const EVM_A_CHECKSUM = "0x2416D6C32C75E58D436E598BE3773A4C722053BC";
const EVM_B = "0x000000000000000000000000000000000000babe";
const SOL_A = "4AQ5dEqEFMZZQbdBw4jqs2RyX2D2d2vcSwzSL51rEhRU";

/** In-memory prisma-like fake implementing WalletDb. */
function fakeDb() {
  let seq = 0;
  const links = new Map<string, IdentityLinkRow>();
  const wallets = new Map<string, AgentWalletRow>();
  const agents = new Map<string, { id: string; userId: string }>();
  const users = new Map<string, { referredById: string | null }>();
  const key = (kind: string, value: string) => `${kind} ${value}`;
  const uniqueError = () => Object.assign(new Error("unique"), { code: "P2002" });

  const db: WalletDb = {
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
        throw new Error("unused") as never;
      },
      async delete() {
        throw new Error("unused") as never;
      },
    } as unknown as IdentityDb["pendingReferral"],
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
        for (const w of wallets.values()) {
          if (w.chain === data.chain && w.address === data.address) throw uniqueError();
          if (w.agentId === data.agentId && w.chain === data.chain) throw uniqueError();
        }
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
  };
  return {
    db,
    seedAgent: (id: string, userId: string) => agents.set(id, { id, userId }),
    seedUser: (id: string) => users.set(id, { referredById: null }),
  };
}

describe("wallet address normalization", () => {
  it("lowercases EVM addresses (checksum-insensitive)", () => {
    assert.equal(normalizeWalletAddress("evm", EVM_A_CHECKSUM), EVM_A);
    assert.equal(normalizeWalletAddress("evm", `  ${EVM_A}  `), EVM_A);
  });
  it("rejects malformed EVM addresses", () => {
    assert.equal(normalizeWalletAddress("evm", "0x123"), "");
    assert.equal(normalizeWalletAddress("evm", "2416d6c32c75e58d436e598be3773a4c722053bc"), "");
    assert.equal(normalizeWalletAddress("evm", "0xZZ6d6c32c75e58d436e598be3773a4c722053bc"), "");
  });
  it("keeps Solana base58 exactly as-is and rejects non-base58", () => {
    assert.equal(normalizeWalletAddress("solana", SOL_A), SOL_A);
    assert.equal(normalizeWalletAddress("solana", "0AQ5dEqEFMZZQbdBw4jqs2RyX2D2d2vcSwzSL51rEhRU"), "");
    assert.equal(normalizeWalletAddress("solana", "short"), "");
  });
  it("detects chain from address shape", () => {
    assert.equal(chainForAddress(EVM_A_CHECKSUM), "evm");
    assert.equal(chainForAddress(SOL_A), "solana");
    assert.equal(chainForAddress("nope"), null);
  });
});

describe("bindUserWallet (the wallet IdentityLink writer)", () => {
  it("binds an EVM address case-insensitively and resolves it in any case", async () => {
    const { db } = fakeDb();
    const res = await bindUserWallet(db, { userId: "u1", chain: "evm", address: EVM_A_CHECKSUM });
    assert.equal(res.status, "bound");
    // Stored normalized: the generic spine resolver finds it by the
    // lowercase form, and resolveWallet finds it in any case.
    assert.equal(await resolveIdentityLink(db, "wallet_evm", EVM_A), "u1");
    assert.equal((await resolveWallet(db, EVM_A_CHECKSUM))?.userId, "u1");
    const again = await bindUserWallet(db, { userId: "u1", chain: "evm", address: EVM_A });
    assert.equal(again.status, "existing");
  });
  it("refuses a malformed EVM address and a cross-user rebind", async () => {
    const { db } = fakeDb();
    assert.equal(
      (await bindUserWallet(db, { userId: "u1", chain: "evm", address: "0x123" })).status,
      "invalid",
    );
    await bindUserWallet(db, { userId: "u1", chain: "evm", address: EVM_A });
    assert.equal(
      (await bindUserWallet(db, { userId: "u2", chain: "evm", address: EVM_A_CHECKSUM })).status,
      "conflict",
    );
  });
  it("binds and resolves a bankr_ref code through the generic spine path", async () => {
    const { db } = fakeDb();
    const res = await bindIdentityLink(db, { userId: "u1", kind: "bankr_ref", value: "7FBFB6T6-BNKR" });
    assert.equal(res.status, "bound");
    assert.equal(await resolveIdentityLink(db, "bankr_ref", "7FBFB6T6-BNKR"), "u1");
  });
});

describe("bindAgentWallet", () => {
  it("binds both halves; resolveWallet returns user + agent", async () => {
    const { db, seedAgent } = fakeDb();
    seedAgent("agent-1", "u1");
    const res = await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: EVM_A_CHECKSUM });
    assert.equal(res.status, "bound");
    assert.equal(await resolveIdentityLink(db, "wallet_evm", EVM_A), "u1");
    const resolved = await resolveWallet(db, EVM_A);
    assert.deepEqual(resolved, { userId: "u1", agentId: "agent-1", chain: "evm", address: EVM_A });
    const again = await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: EVM_A });
    assert.equal(again.status, "existing");
  });

  it("refuses an address bound to a different user", async () => {
    const { db, seedAgent } = fakeDb();
    seedAgent("agent-1", "u1");
    seedAgent("agent-2", "u2");
    await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: EVM_A });
    const res = await bindAgentWallet(db, { agentId: "agent-2", chain: "evm", address: EVM_A });
    assert.deepEqual(res, { status: "conflict", reason: "identity-bound-to-other-user" });
  });

  it("refuses an address already serving another agent of the same user", async () => {
    const { db, seedAgent } = fakeDb();
    seedAgent("agent-1", "u1");
    seedAgent("agent-2", "u1");
    await bindAgentWallet(db, { agentId: "agent-1", chain: "solana", address: SOL_A });
    const res = await bindAgentWallet(db, { agentId: "agent-2", chain: "solana", address: SOL_A });
    assert.deepEqual(res, { status: "conflict", reason: "address-bound-to-other-agent" });
  });

  it("rebinds an agent to a new address on the same chain", async () => {
    const { db, seedAgent } = fakeDb();
    seedAgent("agent-1", "u1");
    await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: EVM_A });
    const res = await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: EVM_B });
    assert.equal(res.status, "bound");
    const wallets = await walletForAgent(db, "agent-1");
    assert.equal(wallets.length, 1);
    assert.equal(wallets[0].address, EVM_B);
    assert.equal((await resolveWallet(db, EVM_B))?.agentId, "agent-1");
  });

  it("rejects unknown agents and bad addresses", async () => {
    const { db, seedAgent } = fakeDb();
    seedAgent("agent-1", "u1");
    assert.deepEqual(
      await bindAgentWallet(db, { agentId: "ghost", chain: "evm", address: EVM_A }),
      { status: "invalid", reason: "no-agent" },
    );
    assert.deepEqual(
      await bindAgentWallet(db, { agentId: "agent-1", chain: "evm", address: "0x123" }),
      { status: "invalid", reason: "bad-address" },
    );
    assert.deepEqual(
      await bindAgentWallet(db, { agentId: "agent-1", chain: "btc", address: EVM_A }),
      { status: "invalid", reason: "bad-chain" },
    );
  });

  it("resolveWallet answers user-only for a bare identity binding", async () => {
    const { db } = fakeDb();
    await bindIdentityLink(db, { userId: "u9", kind: "wallet_solana", value: SOL_A });
    const resolved = await resolveWallet(db, SOL_A);
    assert.deepEqual(resolved, { userId: "u9", agentId: null, chain: "solana", address: SOL_A });
    assert.equal(await resolveWallet(db, EVM_B), null);
  });
});
