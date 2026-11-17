import "server-only";
import { db } from "@/lib/db";
import { getPlan, type PlanDef } from "@/lib/plans";

/**
 * ─── Server-side monthly usage accounting ─────────────────────────────
 *
 * One source of truth for the subscription-aware cap:
 *   - counting happens over UsageRecord rows (TEXT + IMAGE) since the
 *     1st of the current calendar month;
 *   - FAILED rows are never counted — failed generations are never charged;
 *   - every paid-generation endpoint (campaigns, regenerations, Meme Army
 *     packs) checks the same allowance BEFORE spending engine credits.
 */

export function usageMonthStart(): Date {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return monthStart;
}

export async function countMonthlyUsage(userId: string): Promise<number> {
  const usage = await db.usageRecord.groupBy({
    by: ["kind"],
    where: { userId, createdAt: { gte: usageMonthStart() }, kind: { in: ["TEXT", "IMAGE"] } },
    _sum: { count: true },
  });
  return usage.reduce((n, u) => n + (u._sum.count ?? 0), 0);
}

export type AllowanceResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number; requested: number; plan: PlanDef; error: string };

// ─── Free generations (referral rewards) ─────────────────────────────
// Members earn free generations when a referral converts
// (lib/referrals.ts). The balance is a bonus pool ON TOP of the plan's
// monthly allowance: the allowance check counts it, and successful
// generations beyond the plan cap draw it down (applyFreeGens, called
// from recordUsage — failures are never recorded, so they never
// spend). freeGenApplied tracks how much of the pool this month's
// over-cap usage has consumed, so the draw-down is exact.

export function freeGenMonthKey(): string {
  const start = usageMonthStart();
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
}

export async function getFreeGenBalance(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { freeGenBalance: true } });
  return user?.freeGenBalance ?? 0;
}

/** Draw down the free-gen pool for successful over-cap generations. */
export async function applyFreeGens(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, freeGenBalance: true, freeGenMonth: true, freeGenApplied: true },
  });
  if (!user) return;
  const month = freeGenMonthKey();
  const appliedBefore = user.freeGenMonth === month ? user.freeGenApplied : 0;
  if (user.freeGenBalance <= 0 && user.freeGenMonth === month) return;

  const used = await countMonthlyUsage(userId);
  const cap = getPlan(user.plan).monthlyItems;
  const beyondCap = Math.max(0, used - cap);
  const shouldApply = Math.min(beyondCap, appliedBefore + user.freeGenBalance);
  const delta = shouldApply - appliedBefore;

  if (delta <= 0 && user.freeGenMonth === month) return;
  await db.user.update({
    where: { id: userId },
    data: {
      freeGenBalance: user.freeGenBalance - Math.max(0, delta),
      freeGenMonth: month,
      freeGenApplied: shouldApply,
    },
  });
}

/**
 * Check whether `requested` more items fit inside the user's monthly plan
 * allowance. Returns a structured 402 payload on failure so routes can
 * respond consistently (message + plan context for the upgrade UI).
 */
export async function assertMonthlyAllowance(
  userId: string,
  planKey: string,
  requested: number,
): Promise<AllowanceResult> {
  const plan = getPlan(planKey);
  const used = await countMonthlyUsage(userId);
  // The free-generation pool (referral rewards) stacks on top of the
  // plan allowance; successful over-cap generations draw it down via
  // applyFreeGens when their usage is recorded.
  const freeGens = await getFreeGenBalance(userId);
  const limit = plan.monthlyItems + freeGens;
  if (used + requested > limit) {
    return {
      ok: false,
      used,
      limit,
      requested,
      plan,
      error:
        used >= limit
          ? `Monthly limit reached on the ${plan.name} plan (${limit} items including free generations). Upgrade your plan to keep generating — failed generations are never charged.`
          : `This would exceed the ${plan.name} plan's monthly limit (${limit} items including free generations; ${limit - used} left). Upgrade your plan or reduce the request.`,
    };
  }
  return { ok: true, used, limit };
}
