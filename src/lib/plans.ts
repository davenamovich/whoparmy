// Plan configuration — deliberately configurable, not hardcoded payment
// logic. Whop manages real subscriptions/entitlements; these constants
// only drive usage limits and UI display.

export interface PlanDef {
  key: string;
  name: string;
  price: string;
  monthlyItems: number; // max successful generated items / month
  maxFormatsPerCampaign: number;
  maxLanguagesPerCampaign: number;
  maxBrands: number;
  features: string[];
  highlight?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    key: "FREE",
    name: "Starter",
    price: "$0",
    monthlyItems: 60,
    maxFormatsPerCampaign: 2,
    maxLanguagesPerCampaign: 3,
    maxBrands: 1,
    features: ["Core content formats", "Selected languages", "Basic content library"],
  },
  {
    key: "CREATOR",
    name: "Creator",
    price: "$19/mo",
    monthlyItems: 500,
    maxFormatsPerCampaign: 6,
    maxLanguagesPerCampaign: 23,
    maxBrands: 3,
    features: ["All 23 languages", "Full format catalog", "Campaign generator", "Saved brand profiles"],
    highlight: true,
  },
  {
    key: "PRO",
    name: "Pro",
    price: "$49/mo",
    monthlyItems: 2000,
    maxFormatsPerCampaign: 12,
    maxLanguagesPerCampaign: 23,
    maxBrands: 10,
    features: ["Everything in Creator", "Larger campaigns", "Advanced variations", "Publishing integrations*"],
  },
  {
    key: "AGENCY",
    name: "Agency",
    price: "$99/mo",
    monthlyItems: 10000,
    maxFormatsPerCampaign: 25,
    maxLanguagesPerCampaign: 23,
    maxBrands: 50,
    features: ["Multiple brands", "Client campaign organization", "Bulk generation", "Highest limits"],
  },
];

export const PLAN_MAP: Record<string, PlanDef> = Object.fromEntries(PLANS.map((p) => [p.key, p]));

export function getPlan(key: string): PlanDef {
  return PLAN_MAP[key] ?? PLANS[0];
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
