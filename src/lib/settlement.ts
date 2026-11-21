/**
 * ─── BANKR CONNECTION — rotator split settlement (pure core) ──────
 * Dave's split (standing): 25% Plunder & Riffle / 25% referrer /
 * 50% agent owner, settled daily (23:50 ET doctrine), keyed by the
 * agent's rotator sub-ID. This module is the LEDGER only: it builds
 * draft settlements for confirmed rotator days, computes the split,
 * and renders the Bankr instruction packet an operator executes
 * OUTSIDE the server. It never moves money, never calls Bankr, and
 * every record is born simulated=true — confirmed revenue is $0 and
 * today's auction settles in free generations, so drafts carry
 * grossCents=0 until a future paid placement supplies a real gross
 * through the same input.
 *
 * Rules that are load-bearing:
 *  - One settlement per rotator day (rotatorDayId unique); building
 *    is idempotent and never rewrites an existing settlement, in
 *    any status.
 *  - Only CONFIRMED days settle. An unconfirmed day has no winner
 *    and no payable — build returns null.
 *  - A winner with no referrer still gets a REFERRER line with
 *    userId null and the settlement flagged referrerUnassigned:
 *    the unassigned 25% is RECORDED, never folded into PR or owner
 *    (its destination is Dave's open question, not this code's).
 *  - The packet refuses while any line lacks a wallet address,
 *    naming the missing roles — an instruction with a hole in it
 *    is worse than no instruction.
 */

import type { AgentWalletRow, WalletDb } from "./wallet-bind.ts";

/** The agent's preferred payout wallet: EVM first (Bankr settles
 *  EVM-native), then Solana. (Read-side twin of lib/wallet-bind.ts
 *  preferredWallet — this core stays standalone for `node --test`,
 *  per the repo's pure-core convention; the logic is three lines
 *  and both copies are pinned by tests.) */
function preferredWallet(
  wallets: AgentWalletRow[],
): { chain: "evm" | "solana"; address: string } | null {
  const evm = wallets.find((w) => w.chain === "evm");
  if (evm) return { chain: "evm", address: evm.address };
  const sol = wallets.find((w) => w.chain === "solana");
  if (sol) return { chain: "solana", address: sol.address };
  return null;
}

export const SPLIT = { prBps: 2500, referrerBps: 2500, ownerBps: 5000 } as const;

export interface SplitResult {
  pr: number;
  referrer: number;
  owner: number;
}

/**
 * 25 / 25 / 50 with deterministic rounding: PR and referrer take
 * floor(gross/4) each; the OWNER absorbs the remainder so the lines
 * always sum exactly to the gross. Zero or negative gross → zeros.
 */
export function splitCents(grossCents: number): SplitResult {
  const gross = Math.floor(grossCents);
  if (!Number.isFinite(gross) || gross <= 0) return { pr: 0, referrer: 0, owner: 0 };
  const pr = Math.floor(gross / 4);
  const referrer = Math.floor(gross / 4);
  return { pr, referrer, owner: gross - pr - referrer };
}

export interface RotatorDayRow {
  id: string;
  date: string;
  status: string;
  winnerUserId: string | null;
  winnerPartner: string | null;
  winnerUrl: string | null;
  winningBid: number | null;
}

export interface SettlementRow {
  id: string;
  date: string;
  rotatorDayId: string | null;
  grossCents: number;
  currency: string;
  simulated: boolean;
  status: string;
  referrerUnassigned: boolean;
  notes: string | null;
  bankrJobId: string | null;
  txRef: string | null;
  confirmedAt: Date | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementLineRow {
  id: string;
  settlementId: string;
  role: string;
  userId: string | null;
  agentId: string | null;
  walletAddress: string | null;
  chain: string | null;
  amountCents: number;
}

export interface SettlementWithLines extends SettlementRow {
  lines: SettlementLineRow[];
}

export interface SettlementLineInput {
  role: string;
  userId: string | null;
  agentId: string | null;
  walletAddress: string | null;
  chain: string | null;
  amountCents: number;
}

/** The slice of the prisma client this module needs. */
export interface SettlementDb extends WalletDb {
  rotatorDay: {
    findUnique(args: { where: { date: string } }): Promise<RotatorDayRow | null>;
    findMany(args: {
      where: { status: string };
      orderBy?: { date: "asc" | "desc" };
    }): Promise<RotatorDayRow[]>;
  };
  settlement: {
    findUnique(args: {
      where: { rotatorDayId: string } | { id: string };
    }): Promise<SettlementRow | null>;
    findMany(args: {
      orderBy?: { createdAt: "asc" | "desc" };
      take?: number;
    }): Promise<SettlementRow[]>;
    create(args: {
      data: {
        date: string;
        rotatorDayId: string;
        grossCents: number;
        currency: string;
        simulated: boolean;
        status: string;
        referrerUnassigned: boolean;
        notes?: string | null;
        lines: { create: SettlementLineInput[] };
      };
    }): Promise<SettlementRow>;
    update(args: {
      where: { id: string };
      data: Partial<
        Pick<SettlementRow, "status" | "bankrJobId" | "txRef" | "confirmedAt" | "settledAt" | "notes">
      >;
    }): Promise<SettlementRow>;
  };
  settlementLine: {
    findMany(args: {
      where: { settlementId: string };
    }): Promise<SettlementLineRow[]>;
  };
  agentRotator: {
    findMany(args: {
      where: { userId: string };
    }): Promise<Array<{ id: string; agentId: string; userId: string }>>;
  };
  agentRotatorLink: {
    findMany(args: {
      where: { rotatorId: string };
    }): Promise<Array<{ engineLinkId: string }>>;
  };
  engineLink: {
    findMany(args: {
      where: { userId: string; partner: string };
    }): Promise<Array<{ id: string }>>;
  };
}

async function withLines(
  db: SettlementDb,
  settlement: SettlementRow,
): Promise<SettlementWithLines> {
  const lines = await db.settlementLine.findMany({
    where: { settlementId: settlement.id },
  });
  const order: Record<string, number> = { PR: 0, REFERRER: 1, OWNER: 2 };
  lines.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  return { ...settlement, lines };
}

/**
 * Best available agent linkage for a win (documented heuristic):
 * the winning bid names a partner (the member's saved link that was
 * featured). If one of the winner's agent rotators rotates exactly
 * that partner's EngineLink, the win came through that agent — its
 * id is the sub-ID the settlement is keyed by. Otherwise the win is
 * the user's own (agentId null) and the OWNER line falls back to
 * the user's identity wallets.
 */
export async function findAgentForWin(
  db: SettlementDb,
  winnerUserId: string,
  winnerPartner: string | null,
): Promise<string | null> {
  if (!winnerPartner) return null;
  const [rotators, partnerLinks] = await Promise.all([
    db.agentRotator.findMany({ where: { userId: winnerUserId } }),
    db.engineLink.findMany({ where: { userId: winnerUserId, partner: winnerPartner } }),
  ]);
  if (rotators.length === 0 || partnerLinks.length === 0) return null;
  const partnerLinkIds = new Set(partnerLinks.map((l) => l.id));
  for (const rotator of rotators) {
    const links = await db.agentRotatorLink.findMany({ where: { rotatorId: rotator.id } });
    if (links.some((l) => partnerLinkIds.has(l.engineLinkId))) return rotator.agentId;
  }
  return null;
}

/** A user's identity-level payout wallet: EVM first, then Solana. */
async function identityWalletForUser(
  db: SettlementDb,
  userId: string,
): Promise<{ chain: "evm" | "solana"; address: string } | null> {
  const aliases = await db.identityLink.findMany({ where: { userId } });
  const evm = aliases.find((a) => a.kind === "wallet_evm");
  if (evm) return { chain: "evm", address: evm.value };
  const sol = aliases.find((a) => a.kind === "wallet_solana");
  if (sol) return { chain: "solana", address: sol.value };
  return null;
}

export interface BuildOptions {
  /** The day's payable value in cents. Today there is none (the
   *  auction settles in free generations) — callers omit it and the
   *  draft is born at 0, SIMULATED. A future paid placement passes
   *  its real gross here. */
  grossCents?: number;
  /** The house Bankr EVM address (public). The PR line always names
   *  it; its userId resolves from the spine binding when bound. */
  houseEvmAddress?: string | null;
}

export type BuildResult = { settlement: SettlementWithLines; created: boolean };

/**
 * Build (or return) the settlement for one ET day. Null when the
 * day doesn't exist, isn't CONFIRMED, or has no winner — there is
 * nothing to settle. Idempotent per rotatorDayId.
 */
export async function buildSettlementForDay(
  db: SettlementDb,
  date: string,
  opts: BuildOptions = {},
): Promise<BuildResult | null> {
  const day = await db.rotatorDay.findUnique({ where: { date } });
  if (!day || day.status !== "CONFIRMED" || !day.winnerUserId) return null;

  const existing = await db.settlement.findUnique({
    where: { rotatorDayId: day.id },
  });
  if (existing) return { settlement: await withLines(db, existing), created: false };

  const grossCents = Math.max(0, Math.floor(opts.grossCents ?? 0));
  const split = splitCents(grossCents);
  const winnerUserId = day.winnerUserId;

  // OWNER — the winner; agent + wallet when the win came through an
  // agent rotator, else the winner's own identity wallet.
  const agentId = await findAgentForWin(db, winnerUserId, day.winnerPartner);
  let ownerWallet: { chain: "evm" | "solana"; address: string } | null = null;
  if (agentId) {
    ownerWallet = preferredWallet(
      await db.agentWallet.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } }),
    );
  }
  if (!ownerWallet) {
    ownerWallet = await identityWalletForUser(db, winnerUserId);
  }

  // REFERRER — the winner's referrer (referrals are tied to the
  // USER, set-once). No referrer → unassigned line, flagged, never
  // folded into another role.
  const winner = await db.user.findUnique({
    where: { id: winnerUserId },
    select: { referredById: true },
  });
  const referrerId = winner?.referredById ?? null;
  const referrerWallet = referrerId ? await identityWalletForUser(db, referrerId) : null;

  // PR — the house. The address is the house Bankr EVM (public);
  // userId resolves from the spine binding when it exists. The
  // caller supplies the canonical address (HOUSE_BANKR.evm); the
  // lowercase/trim here is defensive only.
  const houseEvm = opts.houseEvmAddress?.trim().toLowerCase() || null;
  const prLink = houseEvm
    ? await db.identityLink.findUnique({
        where: { kind_value: { kind: "wallet_evm", value: houseEvm } },
      })
    : null;
  const prUserId = prLink?.userId ?? null;

  const lines: SettlementLineInput[] = [
    {
      role: "PR",
      userId: prUserId,
      agentId: null,
      walletAddress: houseEvm,
      chain: houseEvm ? "evm" : null,
      amountCents: split.pr,
    },
    {
      role: "REFERRER",
      userId: referrerId,
      agentId: null,
      walletAddress: referrerWallet?.address ?? null,
      chain: referrerWallet?.chain ?? null,
      amountCents: split.referrer,
    },
    {
      role: "OWNER",
      userId: winnerUserId,
      agentId,
      walletAddress: ownerWallet?.address ?? null,
      chain: ownerWallet?.chain ?? null,
      amountCents: split.owner,
    },
  ];

  const created = await db.settlement.create({
    data: {
      date: day.date,
      rotatorDayId: day.id,
      grossCents,
      currency: "USD",
      simulated: true,
      status: "DRAFT",
      referrerUnassigned: referrerId === null,
      notes:
        grossCents === 0
          ? "No USD payable for this day — the auction settled in free generations. SIMULATED draft."
          : null,
      lines: { create: lines },
    },
  });
  return { settlement: await withLines(db, created), created: true };
}

/** Create DRAFT settlements for every CONFIRMED day that lacks one. */
export async function createDraftsForConfirmedDays(
  db: SettlementDb,
  opts: BuildOptions = {},
): Promise<{ created: string[]; existing: string[] }> {
  const days = await db.rotatorDay.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { date: "asc" },
  });
  const created: string[] = [];
  const existing: string[] = [];
  for (const day of days) {
    const result = await buildSettlementForDay(db, day.date, opts);
    if (!result) continue;
    (result.created ? created : existing).push(day.date);
  }
  return { created, existing };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const CHAIN_LABEL: Record<string, string> = { evm: "Base", solana: "Solana" };
const ROLE_LABEL: Record<string, string> = {
  PR: "PR (Plunder & Riffle)",
  REFERRER: "REFERRER",
  OWNER: "OWNER (agent owner)",
};

export interface PacketJson {
  settlementId: string;
  date: string;
  rotatorDayId: string | null;
  grossCents: number;
  currency: string;
  simulated: boolean;
  status: string;
  referrerUnassigned: boolean;
  lines: Array<{
    role: string;
    userId: string | null;
    agentId: string | null;
    walletAddress: string | null;
    chain: string | null;
    amountCents: number;
    instruction: string;
  }>;
}

export type PacketResult =
  | { ok: true; settlement: SettlementWithLines; text: string; json: PacketJson }
  | { ok: false; reason: "not-found" | "not-confirmed" | "unbound"; missingRoles: string[] };

/**
 * The Bankr instruction packet for a CONFIRMED (or already SETTLED)
 * settlement: one natural-language instruction per line, ready for
 * an operator to submit to the Bankr agent via Muse's connector
 * after Dave approves the specific run. Refuses while any line
 * lacks a wallet address, naming the missing roles.
 */
export async function buildSettlementPacket(
  db: SettlementDb,
  settlementId: string,
): Promise<PacketResult> {
  const found = await db.settlement.findUnique({ where: { id: settlementId } });
  if (!found) return { ok: false, reason: "not-found", missingRoles: [] };
  const settlement = await withLines(db, found);
  if (settlement.status !== "CONFIRMED" && settlement.status !== "SETTLED") {
    return { ok: false, reason: "not-confirmed", missingRoles: [] };
  }
  const missingRoles = settlement.lines
    .filter((l) => !l.walletAddress)
    .map((l) => l.role);
  if (missingRoles.length > 0) {
    return { ok: false, reason: "unbound", missingRoles };
  }

  const jsonLines = settlement.lines.map((l) => {
    const amount = (l.amountCents / 100).toFixed(2);
    const chainLabel = CHAIN_LABEL[l.chain ?? "evm"] ?? l.chain ?? "Base";
    return {
      role: l.role,
      userId: l.userId,
      agentId: l.agentId,
      walletAddress: l.walletAddress,
      chain: l.chain,
      amountCents: l.amountCents,
      instruction: `Send ${amount} USDC to ${l.walletAddress} on ${chainLabel}`,
    };
  });

  const header = settlement.simulated
    ? "BANKR SETTLEMENT PACKET — SIMULATED: amounts are ledger figures, not real money. Do not execute as a real payment."
    : "BANKR SETTLEMENT PACKET";
  const text = [
    header,
    `Settlement: ${settlement.id}`,
    `Rotator day: ${settlement.date} (ET) · Gross: ${formatUsd(settlement.grossCents)} ${settlement.currency} · Split: 25% Plunder & Riffle / 25% referrer / 50% agent owner`,
    settlement.referrerUnassigned
      ? "Note: the REFERRER share is UNASSIGNED (the winner's owner has no referrer) — it is recorded, not redirected."
      : null,
    "Lines:",
    ...jsonLines.map(
      (l, i) =>
        `${i + 1}. ${ROLE_LABEL[l.role] ?? l.role}${l.agentId ? ` · agent sub-ID ${l.agentId}` : ""} — ${l.instruction}`,
    ),
    "Execute via the Bankr agent (Muse's registered connector) only after Dave approves this specific run; then record the Bankr job id / tx ref with the settle action. Whop Army never moves money itself.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    ok: true,
    settlement,
    text,
    json: {
      settlementId: settlement.id,
      date: settlement.date,
      rotatorDayId: settlement.rotatorDayId,
      grossCents: settlement.grossCents,
      currency: settlement.currency,
      simulated: settlement.simulated,
      status: settlement.status,
      referrerUnassigned: settlement.referrerUnassigned,
      lines: jsonLines,
    },
  };
}
