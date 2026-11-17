import { db } from "@/lib/db";
import type { Campaign, Asset, BrandProfile, ArmyBot, Mission, ArmyMember, Submission } from "@prisma/client";
import { languageLabel } from "@/lib/languages";
import { FORMAT_MAP, OBJECTIVE_MAP, TONE_MAP } from "@/lib/formats";
import type {
  CampaignDTO,
  AssetDTO,
  BrandDTO,
  MissionDTO,
  MemberDTO,
  LanguageRef,
  FormatRef,
} from "@/lib/types";

export function serializeCampaign(c: Campaign, assetCounts?: { total: number; done: number; failed: number }): CampaignDTO {
  const langs = safeParse<string[]>(c.languages, ["en"]);
  const formats = safeParse<{ category: string; format: string }[]>(c.formats, []);
  const languages: LanguageRef[] = langs.map((code) => ({ code, label: languageLabel(code) }));
  const formatRefs: FormatRef[] = formats.map((f) => ({
    category: (f.category ?? "SOCIAL") as FormatRef["category"],
    format: f.format,
    label: FORMAT_MAP[f.format]?.label ?? f.format,
  }));
  return {
    id: c.id,
    name: c.name,
    businessName: c.businessName,
    website: c.website,
    sourceType: c.sourceType,
    objective: OBJECTIVE_MAP[c.objective]?.label ?? c.objective,
    customObjective: c.customObjective,
    tone: TONE_MAP[c.tone] ?? c.tone,
    customTone: c.customTone,
    languages,
    formats: formatRefs,
    piecesPerFormat: c.piecesPerFormat,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    assetCounts,
  };
}

export function serializeAsset(a: Asset): AssetDTO {
  return {
    id: a.id,
    campaignId: a.campaignId,
    type: a.type as AssetDTO["type"],
    format: a.format,
    formatLabel: a.formatLabel,
    language: a.language,
    languageLabel: a.languageLabel,
    title: a.title,
    body: a.body,
    topText: a.topText,
    bottomText: a.bottomText,
    imageUrl: a.imageUrl,
    pageUrl: a.pageUrl,
    status: a.status,
    error: a.error,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeBrand(b: BrandProfile): BrandDTO {
  return {
    id: b.id,
    name: b.name,
    website: b.website,
    industry: b.industry,
    description: b.description,
    products: b.products,
    audience: b.audience,
    voice: b.voice,
    languages: safeParse<string[]>(b.languages, ["en"]),
    cta: b.cta,
    links: b.links,
    research: b.researchJson ? safeParse<BrandDTO["research"]>(b.researchJson, null) : null,
    createdAt: b.createdAt.toISOString(),
  };
}

export function serializeMission(m: Mission): MissionDTO {
  return {
    id: m.id,
    title: m.title,
    product: m.product,
    description: m.description,
    targetUrl: m.targetUrl,
    audience: m.audience,
    languages: safeParse<string[]>(m.languages, ["en"]),
    durationDays: m.durationDays,
    dailyRequirement: m.dailyRequirement,
    rewardBudget: m.rewardBudget,
    rules: m.rules,
    contentPack: safeParse<{ kind: string; title: string; body: string }[]>(m.contentPackJson, []),
    status: m.status,
    announcedAt: m.announcedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export function serializeMember(m: ArmyMember): MemberDTO {
  return {
    id: m.id,
    displayName: m.displayName,
    username: m.username,
    language: m.language,
    points: m.points,
    shares: m.shares,
    referrals: m.referrals,
    clicks: m.clicks,
    verifiedClicks: m.verifiedClicks,
    badges: safeParse<string[]>(m.badges, []),
    isDemo: m.isDemo,
    joinedAt: m.joinedAt.toISOString(),
  };
}

export function serializeBot(b: ArmyBot): import("@/lib/types").BotDTO {
  return {
    id: b.id,
    armyName: b.armyName,
    logoUrl: b.logoUrl,
    colorPrimary: b.colorPrimary,
    colorSecondary: b.colorSecondary,
    website: b.website,
    botUsername: b.botUsername,
    webhookStatus: b.webhookStatus,
    groupTitle: b.groupTitle,
    languages: safeParse<string[]>(b.languages, ["en"]),
    welcomeMessage: b.welcomeMessage,
    rewards: safeParse<{ name: string; type: string; cost: string; description: string }[]>(b.rewardsJson, []),
    status: b.status,
    webhookUrl: b.webhookUrl,
    createdAt: b.createdAt.toISOString(),
  };
}

export function safeParse<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export async function campaignAssetCounts(campaignId: string) {
  const assets = await db.asset.findMany({ where: { campaignId }, select: { status: true } });
  return {
    total: assets.length,
    done: assets.filter((a) => a.status === "DONE").length,
    failed: assets.filter((a) => a.status === "FAILED").length,
  };
}
