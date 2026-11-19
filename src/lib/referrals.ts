import "server-only";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { awardXp } from "@/lib/game";
import { LINK_SAVE_FREE_GENS } from "@/lib/bridge";

/**
 * ─── REFERRAL PROGRAM — 30% ─────────────────────────────────────────
 *
 * Dave's program (2026-11-17): a member who brings in another member
 * earns 30% of that recruit's plan price when the recruit converts
 * (rents their first bot) — once the referrer is commission-unlocked
 * (see COMMISSION_UNLOCK_CONVERSIONS; qualifying conversions before
 * the unlock earn no commission, never a held one). Free generations
 * pay on a separate trigger: when a recruit saves their bridge links
 * (lib/bridge.ts).
 * Attribution is set once and never overwritten; self-referrals don't
 * count. Earnings are recorded in ReferralEarning with status
 * SIMULATED until payouts run on a real rail — the UI must always
 * carry that label.
 *
 * XP mirrors the money: +50 when a recruit joins with your code,
 * +150 when they convert.
 */

export const REFERRAL_RATE = 0.3;

/**
 * Free generations in the referral program now pay on the bridge
 * link-save trigger — see LINK_SAVE_FREE_GENS in lib/bridge.ts
 * (Dave moved the trigger there, 2026-11-17). They stack on top of
 * the plan's monthly allowance and are spent automatically once the
 * allowance runs out (lib/usage-server.ts).
 */

/**
 * Commission unlock gates (Dave, 2026-11-17 — "both gates", corrected
 * same day): commissions are NEVER locked or held. The gates are
 * ELIGIBILITY: a referrer starts earning commissions once they have
 * this many confirmed (converted) sign-ups — the qualifying sign-ups
 * themselves earn no commission — and, once Connect-with-P&R lands
 * (Slice A), a connected P&R key is also required. commissionGateOpen
 * is the single seam both gates flow through. Free generations are
 * NOT gated either way: they pay instantly per conversion (cheap,
 * capped, and they're the visible hook of the program).
 */
export const COMMISSION_UNLOCK_CONVERSIONS = 3;

async function commissionGateOpen(referrerId: string): Promise<boolean> {
  const conversions = await db.referralEarning.count({ where: { referrerId } });
  // Slice A hook: also require a live PrConnection for this referrer
  // once Connect-with-P&R ships (Dave's key gate). Until then the
  // threshold alone governs.
  return conversions >= COMMISSION_UNLOCK_CONVERSIONS;
}

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
    // QUALIFYING rows are confirmed sign-ups that predate the
    // referrer's commission unlock — they count toward the gate and
    // carry no commission. Everything else is earned commission.
    earnedCents: earnings
      .filter((e) => e.status !== "QUALIFYING" && e.status !== "LOCKED")
      .reduce((n, e) => n + e.amountCents, 0),
    commissionsUnlocked: earnings.length >= COMMISSION_UNLOCK_CONVERSIONS,
    commissionUnlockAt: COMMISSION_UNLOCK_CONVERSIONS,
    earningsStatus: earnings[0]?.status ?? "SIMULATED",
    freeGenBalance: me?.freeGenBalance ?? 0,
    freeGensPerLinkSave: LINK_SAVE_FREE_GENS,
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
  // Conditional claim: two concurrent attributions with different
  // codes must not both win (the read above is only a pre-check).
  // Only the caller whose update lands pays the join XP.
  const claimed = await db.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: referrer.id },
  });
  if (claimed.count !== 1) return { ok: false as const, reason: "already-attributed" };
  await awardXp(referrer.id, "REFERRAL_JOINED", code).catch(() => {});
  return { ok: true as const, referrerId: referrer.id };
}

/**
 * Record a conversion: the recruit rented their first bot. Awards the
 * referrer conversion XP; the commission itself is recorded as a 30%
 * earning row only when the referrer's unlock gates are open
 * (otherwise the row stays QUALIFYING at $0 and counts toward the
 * gate). Free generations are NOT granted here — they pay when the
 * recruit saves their bridge links (lib/bridge.ts).
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
  const referrerId = recruit.referredById;
  // One write, final values, inside one transaction. The old flow
  // inserted a $0 QUALIFYING row and then fixed it up in a second
  // write when the gate was open — a crash between the two stranded
  // a permanently-wrong row, and the gate count was read outside
  // any transaction. Now the gate is evaluated against the
  // referrer's conversions in createdAt order INCLUDING this one
  // (commissions flow from the unlocking sign-up onward), and the
  // row is created once with its computed amount and status.
  // (Legacy LOCKED rows from the short-lived hold build are released
  // in the same transaction; that model was retired the day it
  // shipped.) A racing duplicate hits the unique recruitId and
  // simply reads back the winner's row.
  try {
    return await db.$transaction(async (tx) => {
      const prior = await tx.referralEarning.findMany({
        where: { referrerId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const gateOpen = prior.length + 1 >= COMMISSION_UNLOCK_CONVERSIONS;
      const row = await tx.referralEarning.create({
        data: {
          referrerId,
          recruitId,
          basisPlan: recruit.plan,
          amountCents: gateOpen ? Math.round(priceCents * REFERRAL_RATE) : 0,
          status: gateOpen ? "SIMULATED" : "QUALIFYING",
        },
      });
      if (gateOpen) {
        await tx.referralEarning.updateMany({
          where: { referrerId, status: "LOCKED" },
          data: { status: "SIMULATED" },
        });
      }
      return row;
    });
  } catch {
    return db.referralEarning.findUnique({ where: { recruitId } });
  }
}
