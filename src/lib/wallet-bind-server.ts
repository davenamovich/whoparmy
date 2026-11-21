import "server-only";
import { db } from "@/lib/db";
import { bindIdentityLink, type IdentityDb } from "@/lib/identity";
import {
  bindAgentWallet,
  bindUserWallet,
  HOUSE_BANKR,
  type WalletDb,
} from "@/lib/wallet-bind";
import { BARRY_TEMPLATE_KEY } from "@/lib/barry-agent-core";

export { HOUSE_BANKR };

/**
 * ─── BANKR CONNECTION — server wrappers (2026-11-21) ───────────────
 * Thin adapters from lib/wallet-bind.ts's pure core onto the real db,
 * plus the house Bankr binding. The house addresses (lib/wallet-
 * bind.ts HOUSE_BANKR) are PUBLIC receive addresses — no credential
 * of any kind lives in this app. Dave's Bankr API access stays in
 * Muse's registered connector; settlement execution happens
 * there, never in this server.
 */
const wdb = db as unknown as WalletDb;
const idb = db as unknown as IdentityDb;

export interface HouseBindSummary {
  userId: string;
  identity: Array<{ kind: string; value: string; status: string; reason: string | null }>;
  agent: {
    agentId: string;
    agentName: string | null;
    wallets: Array<{ chain: string; status: string; reason: string | null }>;
  } | null;
  agentSkipped: string | null;
}

/** Human reason for a non-bound/existing bind outcome (null when bound/existing). */
function outcomeReason(status: string, detail?: string): string | null {
  if (status === "bound" || status === "existing") return null;
  if (status === "conflict") {
    if (detail === "identity-bound-to-other-user") return "address is bound to a different user";
    if (detail === "address-bound-to-other-agent") return "address already serves a different agent";
    return "already bound to a different user";
  }
  if (status === "invalid") {
    if (detail === "no-agent") return "agent row not found";
    if (detail === "bad-address") return "address failed validation";
    if (detail === "bad-chain") return "unknown chain";
    return "value failed validation";
  }
  return detail ?? null;
}

/**
 * Bind the house Bankr wallet to an operator user — and to that
 * operator's BTC Barry agent row when one exists (Barry first, per
 * the 2026-11-20 wallet-attribution design: the wallet binds to the
 * agent's existing rotator sub-ID). Idempotent: every write goes
 * through the set-once bind helpers, so re-running reports
 * "existing" and changes nothing. Barry is skipped gracefully when
 * the operator has no Barry row yet (he is created by a stack
 * launch); the user-level bindings still land.
 */
export async function bindHouseBankr(operatorUserId: string): Promise<HouseBindSummary> {
  const identity: HouseBindSummary["identity"] = [];
  for (const chain of ["evm", "solana"] as const) {
    const res = await bindUserWallet(wdb, {
      userId: operatorUserId,
      chain,
      address: HOUSE_BANKR[chain],
      verifiedAt: new Date(),
    });
    identity.push({
      kind: chain === "evm" ? "wallet_evm" : "wallet_solana",
      value: HOUSE_BANKR[chain],
      status: res.status,
      reason: outcomeReason(res.status),
    });
  }
  const refRes = await bindIdentityLink(idb, {
    userId: operatorUserId,
    kind: "bankr_ref",
    value: HOUSE_BANKR.refCode,
    verifiedAt: new Date(),
  });
  identity.push({
    kind: "bankr_ref",
    value: HOUSE_BANKR.refCode,
    status: refRes.status,
    reason: outcomeReason(refRes.status),
  });

  // Barry targeting: the OPERATOR's OWN btc-barry row — the same
  // oldest-row rule ensureBarryAgent / selectBarryRecord use
  // (per-member rows, templateKey "btc-barry"). Never another
  // member's Barry.
  const barry = await db.hiredAgent.findFirst({
    where: { userId: operatorUserId, templateKey: BARRY_TEMPLATE_KEY },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  if (!barry) {
    return {
      userId: operatorUserId,
      identity,
      agent: null,
      agentSkipped: "no btc-barry agent row for this operator — user bindings only",
    };
  }
  const wallets: Array<{ chain: string; status: string; reason: string | null }> = [];
  for (const chain of ["evm", "solana"] as const) {
    const res = await bindAgentWallet(wdb, {
      agentId: barry.id,
      chain,
      address: HOUSE_BANKR[chain],
      source: "bankr",
      verifiedAt: new Date(),
    });
    wallets.push({
      chain,
      status: res.status,
      reason: outcomeReason(res.status, "reason" in res ? res.reason : undefined),
    });
  }
  return {
    userId: operatorUserId,
    identity,
    agent: { agentId: barry.id, agentName: barry.name, wallets },
    agentSkipped: null,
  };
}
