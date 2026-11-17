import "server-only";
import { db } from "@/lib/db";
import { MODEL_TIERS } from "@/lib/game";

/**
 * ─── AGENT ECONOMY — hire agents with tokens ────────────────────────
 *
 * The member's token wallet is their plan's monthly weighted-token
 * allowance (TOKEN_WALLET below). Hiring an agent RESERVES part of the
 * wallet as that agent's budget; ordering a job CHARGES the agent's
 * budget at the model's real weighted cost from the 2026-11-16 proof
 * run (MODEL_TIERS in src/lib/game.ts) — no invented prices.
 *
 * The economy is agentic by design: a hired agent is a standing worker
 * with a budget and a job queue, not a one-off generation. Jobs are
 * QUEUED until the agent's Agent37 slot executes them; the queue is
 * honest about that state and never marks work done by itself.
 * Campaign bounties are token reservations between members and carry
 * SIMULATED value until real payments exist.
 */

export const TOKEN_WALLET: Record<string, number> = {
  FREE: 100_000,
  CREATOR: 1_000_000,
  PRO: 5_000_000,
  AGENCY: 25_000_000,
};

export function walletForPlan(planKey: string): number {
  return TOKEN_WALLET[planKey] ?? TOKEN_WALLET.FREE;
}

export interface AgentTemplate {
  key: string;
  name: string;
  role: string;
  tierKey: (typeof MODEL_TIERS)[number]["key"];
  minBudget: number;
}

export const AGENT_CATALOG: AgentTemplate[] = [
  { key: "scout", name: "Trend Scout", role: "Watches trends and drafts angles for your niche, every day.", tierKey: "volume", minBudget: 10_000 },
  { key: "meme-smith", name: "Meme Smith", role: "Turns briefs into meme packs and captions on order.", tierKey: "mid", minBudget: 25_000 },
  { key: "hook-smith", name: "Hook Smith", role: "Writes the hooks and headlines that ship — flagship tier.", tierKey: "final", minBudget: 50_000 },
  { key: "qa-editor", name: "QA Editor", role: "Claude-grade quality pass on your best pieces. Rare and expensive by design.", tierKey: "quality", minBudget: 100_000 },
];

export function templateByKey(key: string): AgentTemplate | undefined {
  return AGENT_CATALOG.find((t) => t.key === key);
}

export function tierCost(tierKey: string): number {
  return MODEL_TIERS.find((t) => t.key === tierKey)?.typicalWeightedTokens ?? 0;
}

/** Job kind → the tier that prices it. */
export const JOB_TIERS: Record<string, (typeof MODEL_TIERS)[number]["key"]> = {
  SCOUT: "volume",
  MEME: "mid",
  HOOK: "final",
  QA: "quality",
  CAMPAIGN: "mid",
};

export async function getWalletState(userId: string, planKey: string) {
  const allowance = walletForPlan(planKey);
  const hires = await db.hiredAgent.findMany({ where: { userId } });
  const allocated = hires.reduce((n, h) => n + h.tokenBudget, 0);
  const spent = hires.reduce((n, h) => n + h.tokensUsed, 0);
  const listings = await db.campaignListing.findMany({
    where: { posterId: userId, status: { in: ["OPEN", "ASSIGNED"] } },
  });
  const bountyReserved = listings.reduce((n, l) => n + l.bountyTokens, 0);
  return {
    allowance,
    allocated,
    spent,
    bountyReserved,
    available: allowance - allocated - bountyReserved,
  };
}

export type WalletState = Awaited<ReturnType<typeof getWalletState>>;
