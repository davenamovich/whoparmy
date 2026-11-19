// Plan configuration — deliberately configurable, not hardcoded payment
// logic. Whop manages real subscriptions/entitlements; these constants
// only drive usage limits and UI display.
//
// PRICING MODEL (Dave, 2026-11-19): the engine-meter model. Members'
// own Muse sets up and runs their agents (the Day-1 prompt does it
// for free), so seats are NEVER sold or gated — agents are unlimited
// on every plan. Plans meter what costs us money: generations,
// clips/rendering, brands, and feature breadth. BYOK past the
// allowance runs at 1 credit ($0.01) per engine call.

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
    monthlyItems: 25,
    monthlyClips: 3,
    maxFormatsPerCampaign: 2,
    maxLanguagesPerCampaign: 3,
    maxBrands: 1,
    features: ["Your own agents — no seat limits, ever", "25 generations / month on the house key", "3 clips / month", "Blueprint, Day-1 setup, team board + expert panel included", "Previews and packs — bring your own key for full generation"],
  },
  {
    key: "CREATOR",
    name: "Starter",
    price: "$29/mo",
    priceCents: 2900,
    monthlyItems: 300,
    monthlyClips: 20,
    maxFormatsPerCampaign: 6,
    maxLanguagesPerCampaign: 23,
    maxBrands: 1,
    features: ["Your own agents — no seat limits, ever", "300 generations / month", "20 clips / month, no pack needed", "All 23 languages", "Full format catalog", "BYOK: your key, your fuel — 1 credit per call past the allowance"],
    highlight: true,
  },
  {
    key: "PRO",
    name: "Operator",
    price: "$79/mo",
    priceCents: 7900,
    monthlyItems: 1500,
    monthlyClips: 60,
    maxFormatsPerCampaign: 12,
    maxLanguagesPerCampaign: 23,
    maxBrands: 5,
    features: ["Your own agents — no seat limits, ever", "1,500 generations / month", "60 clips / month + render priority", "Up to 5 brands", "Campaign marketplace — post and claim", "BYOK: your key, your fuel — 1 credit per call past the allowance"],
  },
  {
    key: "AGENCY",
    name: "Agency",
    price: "$199/mo",
    priceCents: 19900,
    monthlyItems: 6000,
    monthlyClips: 200,
    maxFormatsPerCampaign: 25,
    maxLanguagesPerCampaign: 23,
    maxBrands: 25,
    features: ["Your own agents — no seat limits, ever", "6,000 generations / month", "200 clips / month + top render priority", "Up to 25 brands — client workspaces", "Campaign marketplace priority", "BYOK: your key, your fuel — 1 credit per call past the allowance"],
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
