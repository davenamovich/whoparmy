import "server-only";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { awardXp } from "@/lib/game";

/**
 * ─── REFERRAL PROGRAM — 30% ─────────────────────────────────────────
 *
 * Dave's program (2026-11-17): a member who brings in another member
 * earns 30% of that recruit's plan price when the recruit converts
 * (rents their first bot). Attribution is set once and never
 * overwritten; self-referrals don't count. Earnings are recorded in
 * ReferralEarning with status SIMULATED until payouts run on a real
 * rail — the UI must always carry that label.
 *
 * XP mirrors the money: +50 when a recruit joins with your code,
 * +150 when they convert.
 */

export const REFERRAL_RATE = 0.3;

/**
 * Free generations per conversion (Dave, 2026-11-17): when a referral
 * rents their first bot, the referrer also earns this many free
 * generations, stacked on top of their plan's monthly allowance and
 * spent automatically once the allowance runs out (see
 * lib/usage-server.ts). Granted at conversion only — join-only grants
 * would be farmable with free accounts.
 */
export const REFERRAL_FREE_GENS = 25;

function codeFrom(user: { id: string; whopUsername: string | null; name: string | null }): string {
  const slug = (user.whopUsername || user.name || "MEMBER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10) || "MEMBER";
  const suffix = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `${slug}-${suffix}`;
}

export async function ensureRefCode(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, whopUsername: true, name: true, refCode: true } });
  if (!user) throw new Error("User not found");
  if (user.refCode) return user.refCode;
  const code = codeFrom(user);
  const updated = await db.user.update({ where: { id: userId }, data: { refCode: code } });
  return updated.refCode!;
}

export function referralLink(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://whop.plunderandriffle.com").replace(/\/$/, "");
  return `${base}/?ref=${code}`;
}

export async function getReferralState(userId: string) {
  const code = await ensureRefCode(userId);
  const [recruits, earnings, me] = await Promise.all([
    db.user.findMany({
      where: { referredById: userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, whopUsername: true, plan: true, createdAt: true },
    }),
    db.referralEarning.findMany({ where: { referrerId: userId }, select: { recruitId: true, amountCents: true, status: true } }),
    db.user.findUnique({ where: { id: userId }, select: { freeGenBalance: true } }),
  ]);
  const convertedIds = new Set(earnings.map((e) => e.recruitId));
  return {
    code,
    link: referralLink(code),
    rate: REFERRAL_RATE,
    recruits: recruits.map((r) => ({ ...r, converted: convertedIds.has(r.id) })),
    recruitsCount: recruits.length,
    conversions: earnings.length,
    earnedCents: earnings.reduce((n, e) => n + e.amountCents, 0),
    earningsStatus: earnings[0]?.status ?? "SIMULATED",
    freeGenBalance: me?.freeGenBalance ?? 0,
    freeGensPerConversion: REFERRAL_FREE_GENS,
  };
}

export type ReferralState = Awaited<ReturnType<typeof getReferralState>>;

/** Attribute the current user to a referrer by code. One-shot. */
export async function attributeReferral(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false as const, reason: "empty" };
  const me = await db.user.findUnique({ where: { id: userId }, select: { referredById: true } });
  if (!me) return { ok: false as const, reason: "no-user" };
  if (me.referredById) return { ok: false as const, reason: "already-attributed" };
  const referrer = await db.user.findUnique({ where: { refCode: code }, select: { id: true } });
  if (!referrer) return { ok: false as const, reason: "unknown-code" };
  if (referrer.id === userId) return { ok: false as const, reason: "self" };
  await db.user.update({ where: { id: userId }, data: { referredById: referrer.id } });
  await awardXp(referrer.id, "REFERRAL_JOINED", code).catch(() => {});
  return { ok: true as const, referrerId: referrer.id };
}

/**
 * Record a conversion: the recruit rented their first bot. Awards the
 * referrer conversion XP and, on a paid plan, a 30% earning row.
 * Idempotent — one conversion per recruit, ever (unique recruitId).
 */
export async function recordConversion(recruitId: string) {
  const recruit = await db.user.findUnique({
    where: { id: recruitId },
    select: { id: true, plan: true, referredById: true },
  });
  if (!recruit?.referredById) return null;
  const existing = await db.referralEarning.findUnique({ where: { recruitId } });
  if (existing) return existing;
  await awardXp(recruit.referredById, "REFERRAL_CONVERTED", recruit.plan).catch(() => {});
  const priceCents = getPlan(recruit.plan).priceCents;
  if (priceCents <= 0) return null;
  const earning = await db.referralEarning.create({
    data: {
      referrerId: recruit.referredById,
      recruitId,
      basisPlan: recruit.plan,
      amountCents: Math.round(priceCents * REFERRAL_RATE),
    },
  });
  // Free generations land with the conversion — the idempotency guard
  // above (one earning row per recruit, ever) makes this grant
  // exactly-once as well.
  await db.user.update({
    where: { id: recruit.referredById },
    data: { freeGenBalance: { increment: REFERRAL_FREE_GENS } },
  });
  return earning;
}
