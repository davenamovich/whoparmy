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
  if (used + requested > plan.monthlyItems) {
    return {
      ok: false,
      used,
      limit: plan.monthlyItems,
      requested,
      plan,
      error:
        used >= plan.monthlyItems
          ? `Monthly limit reached on the ${plan.name} plan (${plan.monthlyItems} items). Upgrade your plan to keep generating — failed generations are never charged.`
          : `This would exceed the ${plan.name} plan's monthly limit (${plan.monthlyItems} items; ${plan.monthlyItems - used} left). Upgrade your plan or reduce the request.`,
    };
  }
  return { ok: true, used, limit: plan.monthlyItems };
}
