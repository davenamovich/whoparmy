import "server-only";
import { buildProfileFromResearch, buildProfileFromSignals, researchWebsite } from "./pr-engine";
import { isSupportedLanguage } from "./languages";
import type { AnalyzeResponse, ResearchSummary } from "./types";

/**
 * Brand deep-research analysis — the shared core behind both the
 * synchronous /api/analyze "brand" mode and the background research
 * jobs (lib/research-jobs.ts). Brand name + website in, a full
 * AnalyzeResponse out. Deep research runs on the P&R engine via the
 * bridge (house key); if it fails, the standard website scan fills in
 * so the member is never stuck.
 */

function sanitize<T extends { suggestedLanguages: string[] }>(p: T): T {
  return {
    ...p,
    suggestedLanguages: (p.suggestedLanguages ?? []).filter(isSupportedLanguage),
  };
}

function toSummary(r: {
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
}): ResearchSummary {
  return {
    brandName: r.brandName,
    voice: r.voice,
    hashtag: r.hashtag,
    analysisSummary: r.analysisSummary,
    offer: r.offer,
    audience: r.audience,
    pains: r.pains,
    angles: r.angles,
    competitors: r.competitors,
    sourceUrl: r.sourceUrl,
    researchedAt: r.researchedAt,
  };
}

export async function runBrandAnalysis(brandName: string, website: string): Promise<AnalyzeResponse> {
  try {
    const { profile, research } = await buildProfileFromResearch({ brandName, website });
    return { profile: sanitize(profile), researched: true, research: toSummary(research) };
  } catch {
    // Deep research failed (site blocks research, engine busy) —
    // fall back to the standard scan so the member is never stuck.
    const scan = await researchWebsite(website);
    const profile = await buildProfileFromSignals({
      website,
      pageText: scan.pageText,
      title: brandName,
      metaDescription: scan.metaDescription,
    });
    return {
      profile: sanitize({ ...profile, name: brandName }),
      researched: scan.researched,
      note: "Deep research couldn't complete this time, so this profile comes from a standard website scan. Please review and edit before continuing.",
    };
  }
}
