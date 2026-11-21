import "server-only";
import { db } from "@/lib/db";
import { internalBotBudget } from "@/lib/agents";
import { isDesignatedOperator } from "@/lib/auth";
import { capabilitiesToJson } from "@/lib/agent-profile";
import { BARRY_TEMPLATE_KEY, barryHireData, selectBarryRecord } from "@/lib/barry-agent-core";
import {
  provisionBarryRotator,
  type BarryRotatorDb,
  type EnsureBarryRotatorResult,
} from "@/lib/barry-rotator-core";

export type { EnsureBarryRotatorResult };

/**
 * Whop Army 2.0, Slice 2: the HOUSE Barry — a designated operator's
 * own BTC Barry — gets a public profile by default so /agent/btc-barry
 * exists. Defaults fill ONLY empty fields, only for operator-owned
 * Barry records, and only when the "btc-barry" slug is free (another
 * agent holding it wins; Barry stays unpublished rather than steal
 * it). A member's own Barry is NEVER auto-published.
 */
const BARRY_PROFILE = {
  slug: "btc-barry",
  category: "Marketing",
  capabilities: ["Marketing", "Content Creation", "Research"],
  description:
    "BTC Barry runs The BTC Experiment for his owner's brand — research, content and distribution through Whop Army, with a plain-numbers weekly report.",
} as const;

async function applyBarryProfileDefaults(agentId: string, userId: string) {
  const [agent, owner] = await Promise.all([
    db.hiredAgent.findUnique({ where: { id: agentId } }),
    db.user.findUnique({ where: { id: userId }, select: { whopId: true, whopUsername: true } }),
  ]);
  if (!agent || !owner || !isDesignatedOperator(owner)) return;
  const data: {
    slug?: string;
    publicProfile?: boolean;
    category?: string;
    capabilitiesJson?: string;
    description?: string;
  } = {};
  if (!agent.slug) {
    const taken = await db.hiredAgent.findFirst({ where: { slug: BARRY_PROFILE.slug, id: { not: agentId } }, select: { id: true } });
    if (!taken) data.slug = BARRY_PROFILE.slug;
  }
  const effectiveSlug = agent.slug ?? data.slug;
  if (effectiveSlug && !agent.publicProfile) data.publicProfile = true;
  if (!agent.category) data.category = BARRY_PROFILE.category;
  if (!agent.capabilitiesJson) data.capabilitiesJson = capabilitiesToJson(BARRY_PROFILE.capabilities);
  if (!agent.description) data.description = BARRY_PROFILE.description;
  if (Object.keys(data).length > 0) {
    await db.hiredAgent.update({ where: { id: agentId }, data });
  }
}

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
  if (existing) {
    await applyBarryProfileDefaults(existing.id, userId);
    return db.hiredAgent.findUnique({ where: { id: existing.id } });
  }
  const created = await db.hiredAgent.create({
    data: barryHireData(userId, internalBotBudget(planKey)),
  });
  await applyBarryProfileDefaults(created.id, userId);
  return db.hiredAgent.findUnique({ where: { id: created.id } });
}

/**
 * Barry's rotator, for the DESIGNATED OPERATOR's Barry only (Dave,
 * 2026-11-21): find-or-create his AgentRotator through the shared
 * creation path and add-only sync his destinations from the
 * operator's saved EngineLinks, so /agent/btc-barry's Ride door is
 * live. Selection follows the house rule — the operator's OWN
 * oldest btc-barry row (selectBarryRecord, exactly as
 * ensureBarryAgent above) — and the provisioning flow itself lives
 * in lib/barry-rotator-core.ts (provisionBarryRotator, structural
 * db); this wrapper resolves the record and binds the real db.
 *
 * Callers run it best-effort exactly like ensureBarryAgent — a
 * provisioning failure must never eat a launch or a kit mint — and
 * ONLY for the operator: members' Barrys (and members' agents
 * generally) provision through their own owner API, untouched.
 */
export async function ensureBarryRotatorForOperator(operatorUserId: string): Promise<EnsureBarryRotatorResult> {
  const candidates = await db.hiredAgent.findMany({
    where: { userId: operatorUserId, templateKey: BARRY_TEMPLATE_KEY },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const barry = selectBarryRecord(candidates);
  return provisionBarryRotator(db as unknown as BarryRotatorDb, {
    barry: barry ? { id: barry.id, name: barry.name, status: barry.status, expiresAt: barry.expiresAt } : null,
    operatorUserId,
  });
}
