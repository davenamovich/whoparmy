/**
 * ─── BANKR CONNECTION — wallet binding (pure core, 2026-11-21) ────
 *
 * A Bankr wallet binds to the attribution spine in two halves that
 * are always written together:
 *   - IdentityLink (kind "wallet_evm" / "wallet_solana") — the
 *     OWNER half: this address belongs to this Whop Army user, ever.
 *   - AgentWallet — the AGENT half: this address is the payout
 *     address of this agent (keyed by the agent's rotator sub-ID,
 *     the HiredAgent id the ?sub= stamp carries).
 *
 * This module is the single source for wallet-address normalization
 * and for writing wallet IdentityLinks. It applies the spine's
 * set-once rule itself (same invariant as lib/identity.ts
 * bindIdentityLink — idempotent for the same user, a typed conflict
 * for a different user, never a silent rebind) rather than importing
 * it: the repo's pure cores are standalone so they stay unit-
 * testable under `node --test`, and lib/identity.ts's generic path
 * deliberately stores wallet values as given.
 *
 * resolveWallet reads both halves consistently: an AgentWallet row
 * answers { userId, agentId }; a bare IdentityLink answers
 * { userId, agentId: null }. If the two ever disagree about the
 * user, the AgentWallet row is NOT trusted for the agent half and
 * only the IdentityLink user is returned — bindings are written
 * together, so disagreement means manual DB surgery, and the safe
 * answer is the set-once one.
 *
 * Addresses are PUBLIC receive addresses only. Nothing here holds a
 * key, signs, or moves money — settlement execution happens outside
 * the server (operator + the Bankr connector).
 */

import type { IdentityDb, IdentityLinkRow } from "./identity.ts";

/**
 * The house Bankr wallet (verified live via Muse's registered
 * Bankr connector, 2026-11-21). PUBLIC receive addresses + the
 * public referral code (it is the bankr_ref offer link) — no
 * credential of any kind. Dave's Bankr API access stays in Muse's
 * connector; this app never holds a Bankr key.
 */
export const HOUSE_BANKR = {
  evm: "0x2416d6c32c75e58d436e598be3773a4c722053bc",
  solana: "4AQ5dEqEFMZZQbdBw4jqs2RyX2D2d2vcSwzSL51rEhRU",
  refCode: "7FBFB6T6-BNKR",
} as const;

export type WalletChain = "evm" | "solana";

export const WALLET_KIND_BY_CHAIN: Record<WalletChain, string> = {
  evm: "wallet_evm",
  solana: "wallet_solana",
};

export function normalizeChain(chain: unknown): WalletChain | null {
  return chain === "evm" || chain === "solana" ? chain : null;
}

const EVM_ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Normalize an address for a chain; "" when malformed. EVM
 * addresses are case-insensitive (the checksum is display only):
 * stored and compared lowercased. Solana addresses are base58 and
 * case-SIGNIFICANT: kept as-is, shape-checked so garbage never
 * binds.
 */
export function normalizeWalletAddress(chain: WalletChain, address: unknown): string {
  if (typeof address !== "string") return "";
  const v = address.trim();
  if (chain === "evm") {
    const lower = v.toLowerCase();
    return EVM_ADDRESS_RE.test(lower) ? lower : "";
  }
  return SOLANA_ADDRESS_RE.test(v) ? v : "";
}

/** Which chain an address belongs to, from its shape alone. */
export function chainForAddress(address: unknown): WalletChain | null {
  if (typeof address !== "string") return null;
  if (normalizeWalletAddress("evm", address)) return "evm";
  if (normalizeWalletAddress("solana", address)) return "solana";
  return null;
}

export interface AgentWalletRow {
  id: string;
  agentId: string;
  userId: string;
  chain: string;
  address: string;
  source: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The slice of the prisma client this module needs. */
export interface WalletDb extends IdentityDb {
  hiredAgent: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string } | null>;
  };
  agentWallet: {
    findUnique(args: {
      where:
        | { chain_address: { chain: string; address: string } }
        | { agentId_chain: { agentId: string; chain: string } };
    }): Promise<AgentWalletRow | null>;
    findMany(args: {
      where: { agentId: string };
      orderBy?: { createdAt: "asc" | "desc" };
    }): Promise<AgentWalletRow[]>;
    create(args: {
      data: {
        agentId: string;
        userId: string;
        chain: string;
        address: string;
        source: string;
        verifiedAt?: Date | null;
      };
    }): Promise<AgentWalletRow>;
    update(args: {
      where: { id: string };
      data: { address?: string; source?: string; verifiedAt?: Date | null };
    }): Promise<AgentWalletRow>;
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export type WalletIdentityBindResult =
  | { status: "bound"; link: IdentityLinkRow }
  | { status: "existing"; link: IdentityLinkRow }
  | { status: "conflict" }
  | { status: "invalid" };

/**
 * The spine's set-once bind, wallet specialization (mirrors
 * lib/identity.ts bindIdentityLink exactly): same user + alias is
 * an idempotent "existing"; a different user gets "conflict" and
 * the existing binding is left untouched.
 */
async function bindWalletIdentity(
  db: WalletDb,
  input: { userId: string; chain: WalletChain; address: string; verifiedAt?: Date | null },
): Promise<WalletIdentityBindResult> {
  const kind = WALLET_KIND_BY_CHAIN[input.chain];
  const value = input.address;
  if (!input.userId || !value) return { status: "invalid" };
  const existing = await db.identityLink.findUnique({
    where: { kind_value: { kind, value } },
  });
  if (existing) {
    return existing.userId === input.userId
      ? { status: "existing", link: existing }
      : { status: "conflict" };
  }
  try {
    const link = await db.identityLink.create({
      data: { userId: input.userId, kind, value, verifiedAt: input.verifiedAt ?? null },
    });
    return { status: "bound", link };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.identityLink.findUnique({
      where: { kind_value: { kind, value } },
    });
    if (winner && winner.userId === input.userId) return { status: "existing", link: winner };
    return { status: "conflict" };
  }
}

/** Bind a payout address to a USER alone (no agent half). */
export async function bindUserWallet(
  db: WalletDb,
  input: { userId: string; chain: unknown; address: unknown; verifiedAt?: Date | null },
): Promise<WalletIdentityBindResult> {
  const chain = normalizeChain(input.chain);
  if (!chain) return { status: "invalid" };
  const address = normalizeWalletAddress(chain, input.address);
  if (!address) return { status: "invalid" };
  return bindWalletIdentity(db, {
    userId: input.userId,
    chain,
    address,
    verifiedAt: input.verifiedAt ?? null,
  });
}

export type BindAgentWalletResult =
  | { status: "bound"; wallet: AgentWalletRow; identity: WalletIdentityBindResult }
  | { status: "existing"; wallet: AgentWalletRow; identity: WalletIdentityBindResult }
  | { status: "conflict"; reason: "identity-bound-to-other-user" | "address-bound-to-other-agent" }
  | { status: "invalid"; reason: "bad-chain" | "bad-address" | "no-agent" };

/**
 * Bind a payout address to an agent. The owner is DERIVED from the
 * agent row — callers never assert it. Refusals:
 *  - the address is IdentityLink-bound to a different user;
 *  - the address already serves a different agent on this chain.
 * Re-binding the same agent+chain to a NEW address updates the
 * AgentWallet row (the old IdentityLink stays bound to the owner —
 * it is still their address; the agent half is the current pointer).
 */
export async function bindAgentWallet(
  db: WalletDb,
  input: {
    agentId: string;
    chain: unknown;
    address: unknown;
    source?: string;
    verifiedAt?: Date | null;
  },
): Promise<BindAgentWalletResult> {
  const chain = normalizeChain(input.chain);
  if (!chain) return { status: "invalid", reason: "bad-chain" };
  const address = normalizeWalletAddress(chain, input.address);
  if (!address) return { status: "invalid", reason: "bad-address" };
  const agent = await db.hiredAgent.findUnique({
    where: { id: input.agentId },
    select: { id: true, userId: true },
  });
  if (!agent) return { status: "invalid", reason: "no-agent" };
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "bankr";
  const verifiedAt = input.verifiedAt ?? null;

  // Owner half first: a cross-user identity conflict refuses before
  // any agent row is touched.
  const identity = await bindWalletIdentity(db, {
    userId: agent.userId,
    chain,
    address,
    verifiedAt,
  });
  if (identity.status === "conflict") {
    return { status: "conflict", reason: "identity-bound-to-other-user" };
  }
  if (identity.status === "invalid") return { status: "invalid", reason: "bad-address" };

  const holder = await db.agentWallet.findUnique({
    where: { chain_address: { chain, address } },
  });
  if (holder && holder.agentId !== agent.id) {
    return { status: "conflict", reason: "address-bound-to-other-agent" };
  }
  if (holder) return { status: "existing", wallet: holder, identity };

  const mine = await db.agentWallet.findUnique({
    where: { agentId_chain: { agentId: agent.id, chain } },
  });
  try {
    if (mine) {
      const wallet = await db.agentWallet.update({
        where: { id: mine.id },
        data: { address, source, verifiedAt },
      });
      return { status: "bound", wallet, identity };
    }
    const wallet = await db.agentWallet.create({
      data: { agentId: agent.id, userId: agent.userId, chain, address, source, verifiedAt },
    });
    return { status: "bound", wallet, identity };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.agentWallet.findUnique({
      where: { chain_address: { chain, address } },
    });
    if (winner && winner.agentId === agent.id) return { status: "existing", wallet: winner, identity };
    return { status: "conflict", reason: "address-bound-to-other-agent" };
  }
}

export interface ResolvedWallet {
  userId: string;
  agentId: string | null;
  chain: WalletChain;
  address: string;
}

/**
 * Resolve an address to its bound user (and agent, when an
 * AgentWallet row names one). The AgentWallet row's user is only
 * trusted when it agrees with the set-once IdentityLink; on
 * disagreement the IdentityLink user wins and agentId is dropped.
 */
export async function resolveWallet(
  db: WalletDb,
  address: unknown,
): Promise<ResolvedWallet | null> {
  const chain = chainForAddress(address);
  if (!chain) return null;
  return resolveWalletOnChain(db, chain, address);
}

/** resolveWallet with the chain stated explicitly (the resolver
 *  route's path — a wallet_evm query never answers from Solana). */
export async function resolveWalletOnChain(
  db: WalletDb,
  chain: WalletChain,
  address: unknown,
): Promise<ResolvedWallet | null> {
  const normalized = normalizeWalletAddress(chain, address);
  if (!normalized) return null;
  const kind = WALLET_KIND_BY_CHAIN[chain];
  const [identity, row] = await Promise.all([
    db.identityLink.findUnique({ where: { kind_value: { kind, value: normalized } } }),
    db.agentWallet.findUnique({ where: { chain_address: { chain, address: normalized } } }),
  ]);
  const identityUserId = identity?.userId ?? null;
  if (row && (!identityUserId || identityUserId === row.userId)) {
    return { userId: row.userId, agentId: row.agentId, chain, address: normalized };
  }
  if (identityUserId) {
    return { userId: identityUserId, agentId: null, chain, address: normalized };
  }
  if (row) {
    // AgentWallet row with no identity half (should not happen —
    // bindings are written together): answer from the row alone.
    return { userId: row.userId, agentId: row.agentId, chain, address: normalized };
  }
  return null;
}

/** All payout addresses bound to an agent, oldest first. */
export async function walletForAgent(
  db: WalletDb,
  agentId: string,
): Promise<AgentWalletRow[]> {
  if (!agentId) return [];
  return db.agentWallet.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
}

/** The agent's preferred payout wallet: EVM first (Bankr settles EVM-native), then Solana. */
export function preferredWallet(
  wallets: AgentWalletRow[],
): { chain: WalletChain; address: string } | null {
  const evm = wallets.find((w) => w.chain === "evm");
  if (evm) return { chain: "evm", address: evm.address };
  const sol = wallets.find((w) => w.chain === "solana");
  if (sol) return { chain: "solana", address: sol.address };
  return null;
}
