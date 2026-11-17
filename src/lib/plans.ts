// Plan configuration — deliberately configurable, not hardcoded payment
// logic. Whop manages real subscriptions/entitlements; these constants
// only drive usage limits and UI display.

export interface PlanDef {
  key: string;
  name: string;
  price: string;
  priceCents: number; // monthly price in cents (referral basis)
  botSeats: number; // rented bots (agents) included in the plan
  monthlyItems: number; // max successful generated items (memes) / month on the house lane
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
    botSeats: 1,
    monthlyItems: 25,
    maxFormatsPerCampaign: 2,
    maxLanguagesPerCampaign: 3,
    maxBrands: 1,
    features: ["1 trial bot", "25 memes / month", "Previews only — bring your own key to unlock full generation"],
  },
  {
    key: "CREATOR",
    name: "Starter",
    price: "$29/mo",
    priceCents: 2900,
    botSeats: 1,
    monthlyItems: 300,
    maxFormatsPerCampaign: 6,
    maxLanguagesPerCampaign: 23,
    maxBrands: 1,
    features: ["1 rented meme bot", "300 memes / month", "All 23 languages", "Full format catalog", "BYOK upgrade: your key, your fuel, caps lift"],
    highlight: true,
  },
  {
    key: "PRO",
    name: "Operator",
    price: "$79/mo",
    priceCents: 7900,
    botSeats: 3,
    monthlyItems: 1500,
    maxFormatsPerCampaign: 12,
    maxLanguagesPerCampaign: 23,
    maxBrands: 5,
    features: ["3 rented bots", "1,500 memes / month", "Campaign marketplace — post and claim", "Advanced variations", "BYOK upgrade: your key, your fuel, caps lift"],
  },
  {
    key: "AGENCY",
    name: "Agency",
    price: "$199/mo",
    priceCents: 19900,
    botSeats: 10,
    monthlyItems: 6000,
    maxFormatsPerCampaign: 25,
    maxLanguagesPerCampaign: 23,
    maxBrands: 25,
    features: ["10 rented bots", "6,000 memes / month", "Client brands and workspaces", "Campaign marketplace priority", "BYOK upgrade: your key, your fuel, caps lift"],
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
