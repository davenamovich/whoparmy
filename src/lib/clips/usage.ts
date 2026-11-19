import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";

/**
 * Clip allowance — three lanes, in priority order.
 *
 * The product's job is to get a member to BYOK, so the lanes are ordered by
 * how close someone is to bringing their own key, and the refusal copy points
 * at that step rather than at a bigger pack:
 *
 *   1. BYOK key held      → capped only by the engine's own credits.
 *   2. Bought clips       → `ClipCreditGrant` rows, consumed once each, and
 *                           they survive a month rollover: a clip someone paid
 *                           for is not taken back.
 *   3. Plan allowance     → `monthlyClips` in plans.ts, resets monthly.
 *
 * A clip that failed or was blocked by a guard is never charged — it produced
 * nothing. A clip that rendered and waits for approval is charged: the engine
 * already did the work.
 *
 * No second billing path: purchases arrive as grant rows written from the Whop
 * payment webhook, and the house lane stays a plan field.
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

export interface ClipUsageSnapshot {
  planUsed: number;
  planLimit: number;
  /** Clips bought and not yet spent. Never expire. */
  paidLeft: number;
  byok: boolean;
  planName: string;
}

export async function clipUsage(userId: string, planKey: string, byok = false): Promise<ClipUsageSnapshot> {
  const plan = getPlan(planKey);
  const [planUsed, paidLeft] = await Promise.all([countMonthlyClips(userId), paidClipsLeft(userId)]);
  return { planUsed, planLimit: plan.monthlyClips, paidLeft, byok, planName: plan.name };
}

export async function paidClipsLeft(userId: string): Promise<number> {
  const unspent = await db.clipCreditGrant.findMany({
    where: { userId, spentAt: null },
    select: { amount: true, spent: true },
  });
  return unspent.reduce((sum, g) => sum + Math.max(0, g.amount - g.spent), 0);
}

export interface ClipAllowance {
  ok: boolean;
  /** Which lane the next clip is drawn from. */
  lane: "byok" | "paid" | "plan" | "none";
  planUsed: number;
  planLimit: number;
  paidLeft: number;
  left: number;
  error?: string;
}

export async function assertClipAllowance(
  userId: string,
  planKey: string,
  requested: number,
  byok = false,
): Promise<ClipAllowance> {
  const plan = getPlan(planKey);
  const [planUsed, paidLeft] = await Promise.all([countMonthlyClips(userId), paidClipsLeft(userId)]);
  const planLeft = Math.max(0, plan.monthlyClips - planUsed);

  if (byok) {
    return {
      ok: true,
      lane: "byok",
      planUsed,
      planLimit: plan.monthlyClips,
      paidLeft,
      left: Number.POSITIVE_INFINITY,
    };
  }

  // Paid clips go first: they were paid for.
  if (paidLeft >= requested) {
    return { ok: true, lane: "paid", planUsed, planLimit: plan.monthlyClips, paidLeft, left: paidLeft - requested };
  }

  const combined = paidLeft + planLeft;
  if (combined >= requested) {
    return {
      ok: true,
      lane: paidLeft > 0 ? "paid" : "plan",
      planUsed,
      planLimit: plan.monthlyClips,
      paidLeft,
      left: combined - requested,
    };
  }

  return {
    ok: false,
    lane: "none",
    planUsed,
    planLimit: plan.monthlyClips,
    paidLeft,
    left: combined,
    error:
      combined === 0
        ? `No clips left this month on the ${plan.name} plan. Connect your own P&R key and the cap goes away — you pay the engine directly, per call.`
        : `That batch needs ${requested} and you have ${combined} (${paidLeft} bought, ${planLeft} on the plan). Send fewer, or connect your own key to run uncapped.`,
  };
}

/**
 * Spend n clips from the lanes, oldest paid grant first. Called once a batch is
 * accepted for rendering — never from a preview path, never twice per batch.
 * Writes are DELTAS inside one transaction (the old version wrote an
 * absolute `spent` computed from a stale read — a concurrent spend or
 * release landing in between was silently overwritten).
 */
export async function consumeClips(
  userId: string,
  count: number,
  lane: ClipAllowance["lane"],
): Promise<{ fromPaid: number; fromPlan: number }> {
  if (count <= 0 || lane === "byok") return { fromPaid: 0, fromPlan: 0 };

  return db.$transaction(async (tx) => {
    let remaining = count;
    let fromPaid = 0;

    const grants = await tx.clipCreditGrant.findMany({
      where: { userId, spentAt: null },
      orderBy: { createdAt: "asc" },
    });
    for (const grant of grants) {
      if (remaining <= 0) break;
      const available = Math.max(0, grant.amount - grant.spent);
      if (available === 0) continue;
      const take = Math.min(available, remaining);
      const spent = grant.spent + take;
      await tx.clipCreditGrant.update({
        where: { id: grant.id },
        data: { spent: { increment: take }, spentAt: spent >= grant.amount ? new Date() : null },
      });
      fromPaid += take;
      remaining -= take;
    }

    // Whatever the paid lane could not cover comes from the plan lane, which
    // is counted from ClipJob rows — no extra bookkeeping to keep consistent.
    return { fromPaid, fromPlan: remaining };
  });
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Reserve ONE clip unit inside the caller's transaction and say which
 * lane funds it. Paid grants go first (FIFO); the plan lane needs no
 * write — a ClipJob row in a charged status IS the reservation, which
 * is why intake stamps the lane on the job it creates in the same tx.
 */
export async function reserveClipUnit(
  tx: TxClient,
  userId: string,
  byok: boolean,
): Promise<{ lane: "byok" | "paid" | "plan"; grantId: string | null }> {
  if (byok) return { lane: "byok", grantId: null };
  const grants = await tx.clipCreditGrant.findMany({
    where: { userId, spentAt: null },
    orderBy: { createdAt: "asc" },
  });
  for (const grant of grants) {
    if (grant.spent >= grant.amount) continue;
    const spent = grant.spent + 1;
    await tx.clipCreditGrant.update({
      where: { id: grant.id },
      data: { spent: { increment: 1 }, spentAt: spent >= grant.amount ? new Date() : null },
    });
    return { lane: "paid", grantId: grant.id };
  }
  return { lane: "plan", grantId: null };
}

/**
 * Release a job's paid-lane reservation (failed / blocked renders are
 * never charged). Idempotent: the job's lane flips paid →
 * paid-released by conditional update, and only the caller whose
 * flip lands returns the unit to the grant.
 */
export async function releaseClipFunding(jobId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const job = await tx.clipJob.findUnique({ where: { id: jobId }, select: { fundingLane: true, grantId: true } });
    if (!job || job.fundingLane !== "paid" || !job.grantId) return;
    const flip = await tx.clipJob.updateMany({
      where: { id: jobId, fundingLane: "paid" },
      data: { fundingLane: "paid-released" },
    });
    if (flip.count !== 1) return;
    const grant = await tx.clipCreditGrant.findUnique({ where: { id: job.grantId } });
    if (!grant) return;
    const spent = Math.max(0, grant.spent - 1);
    await tx.clipCreditGrant.update({
      where: { id: grant.id },
      data: { spent, spentAt: spent >= grant.amount ? grant.spentAt : null },
    });
  });
}
