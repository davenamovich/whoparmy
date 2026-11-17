import "server-only";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { countMonthlyUsage } from "@/lib/usage-server";

/**
 * ─── WAR ROOM — the gamified Bifrost layer ──────────────────────────
 *
 * Game rules that keep the game honest:
 *  - XP is earned ONLY from real work events (a pack generated, a
 *    campaign created, a smart route taken) recorded as XpEvent rows.
 *    Page views, clicks and logins earn nothing.
 *  - Rank is a pure function of lifetime XP (RANKS below).
 *  - "Energy" is not a stored balance: it is the plan's monthly
 *    allowance read live against UsageRecord — the same numbers the
 *    billing gate uses (src/lib/usage-server.ts). When Bifrost lands
 *    (Phase 2), Energy swaps to the member's virtual-key budget and
 *    only this module changes.
 *  - Money is never gamified here. The Render Pool and its 25% splits
 *    stay SIMULATED until real payments exist (Phase 3).
 */

export const RANKS = [
  { key: "RECRUIT", name: "Recruit", minXp: 0 },
  { key: "MEME_SMITH", name: "Meme Smith", minXp: 100 },
  { key: "CONTENT_CAPTAIN", name: "Content Captain", minXp: 300 },
  { key: "RENDER_LORD", name: "Render Lord", minXp: 750 },
  { key: "GENERAL", name: "General", minXp: 1500 },
] as const;

export type RankDef = (typeof RANKS)[number];

export function rankForXp(xp: number): { rank: RankDef; next: RankDef | null; xpIntoRank: number; xpToNext: number } {
  let current: RankDef = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) current = r;
  const idx = RANKS.indexOf(current);
  const next = idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  return {
    rank: current,
    next,
    xpIntoRank: xp - current.minXp,
    xpToNext: next ? next.minXp - xp : 0,
  };
}

export const XP_VALUES = {
  PACK_GENERATED: 100,
  CAMPAIGN_CREATED: 50,
  SMART_ROUTE: 25,
} as const;

export type XpKind = keyof typeof XP_VALUES;

/** Model tiers a member picks in Create (the Starimg routing rule,
 *  proven live 2026-11-16 — see the Bifrost proof report). Costs are
 *  weighted tokens (tokens x coefficient) for one typical brief job. */
export const MODEL_TIERS = [
  { key: "volume", label: "Scout", model: "deepseek-v4.1-flash-1017", coefficient: 0.16, typicalWeightedTokens: 40, blurb: "Angles, drafts, scouting. Fastest and cheapest." },
  { key: "mid", label: "Balanced", model: "gpt-6-luna", coefficient: 0.3, typicalWeightedTokens: 74, blurb: "Captions, variants, everyday generation." },
  { key: "final", label: "Flagship", model: "gpt-6-sol", coefficient: 2, typicalWeightedTokens: 438, blurb: "The hook or headline that ships." },
  { key: "quality", label: "Claude QA", model: "claude-sonnet-5", coefficient: 2, typicalWeightedTokens: 9000, blurb: "Rare quality pass. Costs ~200x a Scout run — the router never picks it for you." },
] as const;

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Award XP for a real work event and roll the streak. Streak counts
 * consecutive UTC days with at least one XP event. Callers on a
 * generation path must not fail the generation if this throws —
 * wrap in .catch(() => {}) there; XP is a reward, not a gate.
 */
export async function awardXp(userId: string, kind: XpKind, meta?: string) {
  const amount = XP_VALUES[kind];
  const today = utcDay();
  const yesterday = utcDay(new Date(Date.now() - 86_400_000));

  const profile = await db.gameProfile.upsert({
    where: { userId },
    create: { userId, xp: 0, streakDays: 0, lastActiveOn: null },
    update: {},
  });

  let streakDays = profile.streakDays;
  if (profile.lastActiveOn === today) {
    // already counted today
  } else if (profile.lastActiveOn === yesterday) {
    streakDays = profile.streakDays + 1;
  } else {
    streakDays = 1;
  }

  const [updated] = await db.$transaction([
    db.gameProfile.update({
      where: { userId },
      data: { xp: { increment: amount }, streakDays, lastActiveOn: today },
    }),
    db.xpEvent.create({ data: { userId, kind, amount, meta: meta ?? null } }),
  ]);
  return updated;
}

export interface MissionState {
  key: string;
  title: string;
  description: string;
  rewardXp: number;
  progress: number;
  target: number;
  done: boolean;
  locked?: string;
}

export interface BadgeState {
  key: string;
  name: string;
  description: string;
  earned: boolean;
}

export async function getGameState(userId: string, planKey: string) {
  const profile =
    (await db.gameProfile.findUnique({ where: { userId } })) ??
    (await db.gameProfile.create({ data: { userId } }));

  const grouped = await db.xpEvent.groupBy({
    by: ["kind"],
    where: { userId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = Object.fromEntries(grouped.map((g) => [g.kind, g._count._all]));
  const packs = counts.PACK_GENERATED ?? 0;
  const campaigns = counts.CAMPAIGN_CREATED ?? 0;
  const smartRoutes = counts.SMART_ROUTE ?? 0;

  const todayStart = new Date(`${utcDay()}T00:00:00.000Z`);
  const packsToday = await db.xpEvent.count({
    where: { userId, kind: "PACK_GENERATED", createdAt: { gte: todayStart } },
  });

  const plan = getPlan(planKey);
  const energyUsed = await countMonthlyUsage(userId);

  const { rank, next, xpIntoRank, xpToNext } = rankForXp(profile.xp);

  const missions: MissionState[] = [
    { key: "first-pack", title: "First Pack", description: "Generate your first Meme Army content pack.", rewardXp: XP_VALUES.PACK_GENERATED, progress: Math.min(packs, 1), target: 1, done: packs >= 1 },
    { key: "daily-pack", title: "Daily Sortie", description: "Generate a content pack today.", rewardXp: XP_VALUES.PACK_GENERATED, progress: Math.min(packsToday, 1), target: 1, done: packsToday >= 1 },
    { key: "pack-5", title: "Squad Output", description: "Generate 5 content packs.", rewardXp: XP_VALUES.PACK_GENERATED, progress: Math.min(packs, 5), target: 5, done: packs >= 5 },
    { key: "campaign-3", title: "Campaign Planner", description: "Create 3 content campaigns.", rewardXp: XP_VALUES.CAMPAIGN_CREATED, progress: Math.min(campaigns, 3), target: 3, done: campaigns >= 3 },
    { key: "streak-7", title: "Week at War", description: "Earn XP on 7 straight days.", rewardXp: 0, progress: Math.min(profile.streakDays, 7), target: 7, done: profile.streakDays >= 7 },
    { key: "three-tier-trial", title: "Three-Tier Trial", description: "Run one brief on Scout, Balanced and Flagship, pick the winner, mint it in P&R.", rewardXp: 150, progress: 0, target: 1, done: false, locked: "Arrives with the Bridge (Bifrost) — Phase 2" },
  ];

  const badges: BadgeState[] = [
    { key: "first-pack", name: "First Pack", description: "Generated a first content pack", earned: packs >= 1 },
    { key: "pack-10", name: "Pack Machine", description: "Generated 10 content packs", earned: packs >= 10 },
    { key: "campaign-3", name: "Campaign Planner", description: "Created 3 campaigns", earned: campaigns >= 3 },
    { key: "streak-7", name: "Streak 7", description: "7-day XP streak", earned: profile.streakDays >= 7 },
    { key: "route-master", name: "Route Master", description: "10 smart routes (cheap tier, QA passed)", earned: smartRoutes >= 10 },
  ];

  return {
    xp: profile.xp,
    streakDays: profile.streakDays,
    rank,
    nextRank: next,
    xpIntoRank,
    xpToNext,
    energy: { used: energyUsed, limit: plan.monthlyItems, planName: plan.name },
    counts: { packs, campaigns, smartRoutes, packsToday },
    missions,
    badges,
    tiers: MODEL_TIERS,
  };
}

export type GameState = Awaited<ReturnType<typeof getGameState>>;
