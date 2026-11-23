// Plan configuration — deliberately configurable, not hardcoded payment
// logic. Whop manages real subscriptions/entitlements; these constants
// only drive usage limits and UI display.
//
// Pricing model (Dave, 2026-11-23): all members get 100 free monthly
// generations. Additional generation credits cost $0.01 each. Listing
// a marketplace agent is the only monthly charge ($20/month).

export interface PlanDef {
  key: string;
  name: string;
  price: string;
  priceCents: number; // monthly price in cents (referral basis)
  monthlyItems: number; // max successful generated items (memes) / month on the house lane
  monthlyClips: number; // max successful clips / month (the Clipper; BYOK lifts it)
  maxFormatsPerCampaign: number;
  maxLanguagesPerCampaign: number;
  maxBrands: number;
  features: string[];
  highlight?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    key: "FREE",
    name: "Trial",
    price: "$0",
    priceCents: 0,
    monthlyItems: 100,
    monthlyClips: 3,
    maxFormatsPerCampaign: 2,
    maxLanguagesPerCampaign: 3,
    maxBrands: 1,
    features: ["100 free generations every month", "No subscription needed to connect your Muse", "Credit packs: $0.01 per credit", "$20/month to list an agent and unlock the rotator"],
  },
  {
    key: "CREATOR",
    name: "Starter",
    price: "$0",
    priceCents: 0,
    monthlyItems: 100,
    monthlyClips: 20,
    maxFormatsPerCampaign: 6,
    maxLanguagesPerCampaign: 23,
    maxBrands: 1,
    features: ["100 free generations every month", "No subscription needed to connect your Muse", "Credit packs: $0.01 per credit", "$20/month to list an agent and unlock the rotator"],
    highlight: true,
  },
  {
    key: "PRO",
    name: "Operator",
    price: "$0",
    priceCents: 0,
    monthlyItems: 100,
    monthlyClips: 60,
    maxFormatsPerCampaign: 12,
    maxLanguagesPerCampaign: 23,
    maxBrands: 5,
    features: ["100 free generations every month", "No subscription needed to connect your Muse", "Credit packs: $0.01 per credit", "$20/month to list an agent and unlock the rotator"],
  },
  {
    key: "AGENCY",
    name: "Agency",
    price: "$0",
    priceCents: 0,
    monthlyItems: 100,
    monthlyClips: 200,
    maxFormatsPerCampaign: 25,
    maxLanguagesPerCampaign: 23,
    maxBrands: 25,
    features: ["100 free generations every month", "No subscription needed to connect your Muse", "Credit packs: $0.01 per credit", "$20/month to list an agent and unlock the rotator"],
  },
];

export const PLAN_MAP: Record<string, PlanDef> = Object.fromEntries(PLANS.map((p) => [p.key, p]));

export function getPlan(key: string): PlanDef {
  return PLAN_MAP[key] ?? PLANS[0];
}

/**
 * Bot creation gate (Dave, 2026-11-17): not everyone can create their
 * own Telegram army bot. Creation requires a paid base plan
 * (Starter/Operator/Agency) or a Meme Army upsell plan. Trial members
 * use the content factory on the bridge; the bot is a paid unlock.
 * Existing owners are never gated out of managing their bot — the
 * check applies at creation only (enforced in the onboard route).
 */
export function canCreateArmyBot(user: { plan: string; memeArmyPlan?: string | null }): boolean {
  if (user.memeArmyPlan) return true;
  return user.plan === "CREATOR" || user.plan === "PRO" || user.plan === "AGENCY";
}

// ─── Meme Army premium upsell pricing (separate recurring revenue) ──
export interface ArmyPlanDef {
  key: string;
  name: string;
  setup: string;
  monthly: string;
  blurb: string;
  features: string[];
}

export const ARMY_PLANS: ArmyPlanDef[] = [
  {
    key: "CUSTOM",
    name: "Custom Meme Army Bot",
    setup: "$99 setup",
    monthly: "$49/mo",
    blurb: "Your own branded Telegram bot that mobilizes your community.",
    features: [
      "Custom-branded Telegram bot",
      "Daily meme missions engine",
      "Multi-language campaign delivery",
      "Leaderboard & participation tracking",
      "Referral link tracking",
    ],
  },
  {
    key: "AGENCY",
    name: "Meme Army Agency",
    setup: "$299 setup",
    monthly: "$149/mo",
    blurb: "Run meme armies for clients at scale.",
    features: [
      "Everything in Custom",
      "Agency multi-campaign workflows",
      "High-volume generation",
      "Optional campaign reward budgets",
      "Priority generation queue*",
    ],
  },
];

// High-volume generation and reward budgets are billed separately from
// the base subscription (usage accounting lives in src/lib/plans.ts +
// UsageRecord rows).
export const USAGE_NOTE = "High-volume generation and optional campaign reward budgets are billed separately.";
