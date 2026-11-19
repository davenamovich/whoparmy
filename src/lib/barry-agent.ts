import "server-only";
import { db } from "@/lib/db";
import { internalBotBudget } from "@/lib/agents";
import { BARRY_TEMPLATE_KEY, barryHireData, selectBarryRecord } from "@/lib/barry-agent-core";

/**
 * ─── BTC BARRY — agent record, server layer ────────────────────────
 *
 * ensureBarryAgent is called from /api/admin/launch AFTER a
 * successful btc-experiment launch — the DH Media link gate has
 * passed and a bridge code has been minted. It gives the launching
 * member their BTC Barry HiredAgent row so Barry sits on their
 * roster and holds a Traffic Pool v1 allotment like every other
 * agent (the pure shape + idempotency rule live in
 * barry-agent-core.ts).
 *
 * Idempotent: one Barry per member, ever. A re-launch reuses the
 * existing record untouched — including its status, so a Barry the
 * member paused stays paused.
 *
 * Deliberately NOT done here: no records for other stacks' launches,
 * and no backfill for launches that happened before this existed.
 */
export async function ensureBarryAgent(userId: string, planKey: string) {
  const candidates = await db.hiredAgent.findMany({
    where: { userId, templateKey: BARRY_TEMPLATE_KEY },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const existing = selectBarryRecord(candidates);
  if (existing) return existing;
  return db.hiredAgent.create({
    data: barryHireData(userId, internalBotBudget(planKey)),
  });
}
