import "server-only";
import { db } from "@/lib/db";
import { MODEL_TIERS } from "@/lib/game";
import { getPlan } from "@/lib/plans";

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
 * with a budget and a job queue, not a one-off generation. Jobs execute
 * through the agent runner (src/lib/agent-runner.ts) via Starimg the
 * moment they're ordered; the charge reconciles to actual weighted
 * tokens and failed runs are refunded in full. Campaign bounties are
 * token reservations between members and carry SIMULATED value until
 * real payments exist.
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

/**
 * Bot rental (pricing decision 2026-11-17): members rent bots by the
 * month and count memes — tokens are NEVER shown to members. Each
 * rented bot gets an internal fuel budget (its share of the plan's
 * token wallet) purely as an ops/abuse ledger; the member only sees
 * the bot, its jobs, and the plan's meme meter.
 */
export function internalBotBudget(planKey: string): number {
  const plan = getPlan(planKey);
  return Math.floor(walletForPlan(planKey) / Math.max(1, plan.botSeats));
}

export interface AgentTemplate {
  key: string;
  name: string;
  role: string;
  tierKey: (typeof MODEL_TIERS)[number]["key"];
  minBudget: number;
  /** Factory (2026-11-18): the job kind this template's order form opens on. */
  defaultKind?: string;
  /** Factory: standing instructions copied onto the hire — the CUSTOM
   *  job kind runs on these. Only set where the template IS its
   *  instructions (custom builds, FAQ). */
  instructions?: string;
}

export const AGENT_CATALOG: AgentTemplate[] = [
  { key: "scout", name: "Trend Scout", role: "Watches trends and drafts angles for your niche, every day.", tierKey: "volume", minBudget: 10_000, defaultKind: "SCOUT" },
  { key: "meme-smith", name: "Meme Smith", role: "Turns briefs into meme packs and captions on order.", tierKey: "mid", minBudget: 25_000, defaultKind: "MEME" },
  { key: "assessor", name: "The Assessor", role: "Bridge agent: hands your own Muse the Assessor command — it makes your free /before pack on your own credits and writes your $999 assessment offer.", tierKey: "mid", minBudget: 25_000, defaultKind: "ASSESS" },
  { key: "hook-smith", name: "Hook Smith", role: "Writes the hooks and headlines that ship — flagship tier.", tierKey: "final", minBudget: 50_000, defaultKind: "HOOK" },
  { key: "qa-editor", name: "QA Editor", role: "Claude-grade quality pass on your best pieces. Rare and expensive by design.", tierKey: "quality", minBudget: 100_000, defaultKind: "QA" },
  // ─── SMB Agent Factory templates (Dave, 2026-11-18) ──────────────
  // Only templates whose work runs on tools that exist TODAY are
  // listed. Sales/outreach templates that need prospect discovery +
  // email (Lead Scout stack, still draft) are deliberately absent —
  // they ship when that lane does, not before.
  {
    key: "custom",
    name: "Custom AI Employee",
    role: "Built for you by the Agent Architect from your own description — name, role, instructions and tools picked for the job you described.",
    tierKey: "mid",
    minBudget: 25_000,
    defaultKind: "CUSTOM",
  },
  {
    key: "competitor-monitor",
    name: "Competitor Monitor",
    role: "Scout reports on your competitors and your niche: what they're pushing, the angles they're winning with, and the opening for you. Order a report whenever you want one.",
    tierKey: "volume",
    minBudget: 10_000,
    defaultKind: "SCOUT",
  },
  {
    key: "content-creator",
    name: "Content Creator",
    role: "Turns a brief into a ready-to-approve campaign pack: announcement post, meme concepts, social posts and CTAs in your brand's voice.",
    tierKey: "mid",
    minBudget: 25_000,
    defaultKind: "CAMPAIGN",
  },
  {
    key: "social-media-agent",
    name: "Social Media Agent",
    role: "Drafts your social posts and campaign packs for approval. It creates — you approve and post. Nothing ever publishes on its own.",
    tierKey: "mid",
    minBudget: 25_000,
    defaultKind: "CAMPAIGN",
  },
  {
    key: "video-script-agent",
    name: "Video Script Agent",
    role: "Runs the P&R engine's video lane from a topic brief — episodes and pitches that land as previews in your library for your approval.",
    tierKey: "mid",
    minBudget: 25_000,
    defaultKind: "VIDEO",
  },
  {
    key: "local-seo-researcher",
    name: "Local SEO Researcher",
    role: "Research reports on how your business shows up locally: your offer, your audience's pains, your competitors, and the content angles that close the gaps it finds.",
    tierKey: "volume",
    minBudget: 10_000,
    defaultKind: "SCOUT",
  },
  {
    key: "lead-researcher",
    name: "Lead Researcher",
    role: "Research-only prospect intelligence: from a brief naming a niche and area, it profiles the kinds of businesses worth approaching and the angle that fits each. It does not contact anyone — outreach stays yours.",
    tierKey: "volume",
    minBudget: 10_000,
    defaultKind: "SCOUT",
  },
  {
    key: "faq-agent",
    name: "FAQ Agent",
    role: "Answers customer questions from your business facts: paste a question (or a batch) and get accurate, on-brand answers drafted from your brief and your business profile. Drafts for you — it never sends.",
    tierKey: "mid",
    minBudget: 25_000,
    defaultKind: "CUSTOM",
    instructions:
      "You are an FAQ agent for the owner's business. Answer each customer question in the brief accurately and in the brand's voice, using only facts the owner has provided in the brief or their business profile. If a question needs a fact you do not have, say exactly what is missing instead of inventing it — never guess prices, hours, policies or availability. Keep answers short, warm and ready to paste. When the brief holds several questions, answer each under its own heading.",
  },
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
  // VIDEO runs on the engine's video lane (agent-runner intercepts it);
  // the tier only satisfies kind validation — its order cost is 0
  // because video is accounted in VIDEO usage, not hire tokens.
  VIDEO: "mid",
  // ASSESS is a bridge handoff (v2, Dave 2026-11-18): the runner
  // returns a paste-ready bridge command and the member's OWN Muse
  // makes the /before pack on the member's OWN credits — Whoparmy
  // generates nothing, so the order cost is 0 and no plan meter is
  // drawn. The tier only satisfies kind validation.
  ASSESS: "mid",
  // CUSTOM (SMB Agent Factory, 2026-11-18): the job runs on the
  // hire's own standing instructions instead of a fixed kind prompt.
  CUSTOM: "mid",
};

/**
 * The Factory tool registry lives in the pure architect core
 * (lib/agent-architect-core.ts) so it unit-tests without the db —
 * re-exported here for app code that reads the catalog module.
 */
export { FACTORY_TOOLS, factoryToolById, type FactoryTool } from "@/lib/agent-architect-core";

export async function getWalletState(userId: string, planKey: string) {
  const allowance = walletForPlan(planKey);
  // Referral-grant bots (source REFERRAL) are not part of the member's
  // wallet ledger — their fuel is the grant's own, not the plan's.
  const hires = await db.hiredAgent.findMany({ where: { userId, source: "RENTAL" } });
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

/**
 * Settle a marketplace listing when its claimed job finishes.
 * Exactly once, keyed on the listing's own status transition:
 * DONE → COMPLETED (the reserved bounty is spent — value is
 * SIMULATED until real payments exist, so no payout moves; the
 * reservation simply ends in the terminal state). FAILED → the
 * listing returns to OPEN with assignee/job cleared so another
 * agent can claim it; the poster's reservation stays in place.
 * A listing that is not ASSIGNED to this job is left untouched.
 */
export async function settleMarketListingForJob(jobId: string, outcome: "DONE" | "FAILED"): Promise<void> {
  const listing = await db.campaignListing.findFirst({ where: { jobId }, select: { id: true } });
  if (!listing) return;
  if (outcome === "DONE") {
    await db.campaignListing.updateMany({
      where: { id: listing.id, status: "ASSIGNED", jobId },
      data: { status: "COMPLETED" },
    });
  } else {
    await db.campaignListing.updateMany({
      where: { id: listing.id, status: "ASSIGNED", jobId },
      data: { status: "OPEN", assigneeId: null, jobId: null },
    });
  }
}
