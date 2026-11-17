// Shared DTOs used by both the API routes and the frontend sections.

import type { ContentCategory } from "./formats";

export interface ProfileDTO {
  name: string;
  industry?: string;
  description: string;
  products: string[];
  audience?: string;
  sellingPoints: string[];
  differentiators: string[];
  website?: string;
  primaryLanguage: string;
  suggestedLanguages: string[];
  suggestedTones: string[];
}

/** What P&R deep research knows about a brand (research_brand, brief mode). */
export interface ResearchSummary {
  brandName?: string;
  voice?: string;
  hashtag?: string;
  analysisSummary?: string;
  offer?: string;
  audience?: string;
  pains: string[];
  angles: string[];
  competitors: string[];
  sourceUrl?: string;
  researchedAt?: number;
}

export interface AnalyzeResponse {
  profile: ProfileDTO;
  researched: boolean; // true when the website was actually fetched & parsed
  note?: string;
  research?: ResearchSummary; // present when the P&R deep-research bridge answered
}

/** Background brand-research job, as served by /api/research*. */
export interface ResearchJobDTO {
  id: string;
  brandName: string;
  website: string;
  status: "running" | "done" | "failed";
  result?: AnalyzeResponse;
  error?: string;
  createdAt: number;
  elapsedSec: number;
}

export interface LanguageRef {
  code: string;
  label: string;
}

export interface FormatRef {
  category: ContentCategory;
  format: string;
  label: string;
}

export interface CampaignDTO {
  id: string;
  name: string;
  businessName: string;
  website?: string | null;
  sourceType: string;
  objective: string;
  customObjective?: string | null;
  tone: string;
  customTone?: string | null;
  languages: LanguageRef[];
  formats: FormatRef[];
  piecesPerFormat: number;
  status: string;
  createdAt: string;
  assetCounts?: { total: number; done: number; failed: number };
}

export interface AssetDTO {
  id: string;
  campaignId?: string | null;
  type: ContentCategory;
  format: string;
  formatLabel: string;
  language: string;
  languageLabel: string;
  title: string;
  body: string;
  topText?: string | null;
  bottomText?: string | null;
  imageUrl?: string | null;
  pageUrl?: string | null; // engine share page (/m/…) for engine-generated memes
  status: string;
  error?: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  campaignId: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  currentStep?: string | null;
  error?: string | null;
}

export interface BrandDTO {
  id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
  products?: string | null;
  audience?: string | null;
  voice?: string | null;
  languages: string[];
  cta?: string | null;
  links?: string | null;
  research?: ResearchSummary | null;
  createdAt: string;
}

export interface UsageSummaryDTO {
  plan: string;
  planName: string;
  used: number;
  limit: number;
  remaining: number;
  totals: {
    text: number;
    image: number;
    failed: number;
    campaigns: number;
    assets: number;
    languagesUsed: number;
  };
  recent: { kind: string; count: number; createdAt: string }[];
}

// ─── Meme Army DTOs (bot token is NEVER included client-side) ───────
export interface BotDTO {
  id: string;
  armyName: string;
  logoUrl?: string | null;
  colorPrimary: string;
  colorSecondary: string;
  website?: string | null;
  botUsername?: string | null;
  webhookStatus: string;
  groupTitle?: string | null;
  languages: string[];
  welcomeMessage?: string | null;
  rewards: { name: string; type: string; cost: string; description: string }[];
  status: string;
  webhookUrl?: string | null;
  createdAt: string;
}

export interface MissionDTO {
  id: string;
  title: string;
  product?: string | null;
  description: string;
  targetUrl?: string | null;
  audience?: string | null;
  languages: string[];
  durationDays: number;
  dailyRequirement?: string | null;
  rewardBudget?: string | null;
  rules?: string | null;
  contentPack: { kind: string; title: string; body: string }[];
  status: string;
  announcedAt?: string | null;
  createdAt: string;
}

export interface MemberDTO {
  id: string;
  displayName: string;
  username?: string | null;
  language: string;
  points: number;
  shares: number;
  referrals: number;
  clicks: number;
  verifiedClicks: number;
  badges: string[];
  isDemo: boolean;
  joinedAt: string;
}

export interface ArmyStatsDTO {
  participants: number;
  shares: number;
  referrals: number;
  verifiedClicks: number;
  contentGenerated: number;
}

export interface ArmyResponseDTO {
  bot: BotDTO | null;
  missions: MissionDTO[];
  members: MemberDTO[];
  stats: ArmyStatsDTO;
  canCreateBot?: boolean; // bot creation gate: paid plan or army upsell
}
