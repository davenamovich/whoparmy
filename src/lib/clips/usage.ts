import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";

/**
 * Clip quota, on the same code path as every other metered feature:
 * a plan field (`monthlyClips` in plans.ts) plus a 402-shaped refusal.
 * No second billing path.
 *
 * A clip that failed or was blocked by a guard is not charged — it never
 * produced anything. A clip that rendered and sits waiting for approval
 * is charged: the engine already did the work.
 */

export function clipMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const CHARGED_STATUSES = ["queued", "rendering", "ready", "approved", "exported"];

export async function countMonthlyClips(userId: string): Promise<number> {
  return db.clipJob.count({
    where: { userId, createdAt: { gte: clipMonthStart() }, status: { in: CHARGED_STATUSES } },
  });
}

export interface ClipAllowance {
  ok: boolean;
  used: number;
  limit: number;
  left: number;
  error?: string;
}

export async function assertClipAllowance(
  userId: string,
  planKey: string,
  requested: number,
): Promise<ClipAllowance> {
  const plan = getPlan(planKey);
  const used = await countMonthlyClips(userId);
  const limit = plan.monthlyClips;
  const left = Math.max(0, limit - used);

  if (used + requested > limit) {
    return {
      ok: false,
      used,
      limit,
      left,
      error:
        left === 0
          ? `This month's clips are used up on the ${plan.name} plan (${used}/${limit}). Bring your own P&R key to lift the cap, or upgrade.`
          : `That batch would exceed the ${plan.name} plan (${used}/${limit} clips used, ${left} left). Send fewer links, upgrade, or bring your own key.`,
    };
  }

  return { ok: true, used, limit, left };
}
