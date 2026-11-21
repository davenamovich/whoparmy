import "server-only";
import { db } from "@/lib/db";
import { internalBotBudget } from "@/lib/agents";
import { isDesignatedOperator } from "@/lib/auth";
import { capabilitiesFromJson, capabilitiesToJson } from "@/lib/agent-profile";
import {
  BARRY_PROFILE_NEXT,
  BARRY_TEMPLATE_KEY,
  barryHireData,
  barryProfileRefreshReport,
  planBarryProfileRefresh,
  selectBarryRecord,
} from "@/lib/barry-agent-core";
import {
  barryRotatorGate,
  provisionBarryRotator,
  type BarryRotatorDb,
  type EnsureBarryRotatorResult,
} from "@/lib/barry-rotator-core";
import {
  seedOperatorLinksFromOfferCatalog,
  type CatalogSeedSource,
} from "@/lib/operator-catalog-seed";

export type { EnsureBarryRotatorResult };

/**
 * Whop Army 2.0, Slice 2: the HOUSE Barry — a designated operator's
 * own BTC Barry — gets a public profile by default so /agent/btc-barry
 * exists. Defaults fill ONLY empty fields, only for operator-owned
 * Barry records, and only when the "btc-barry" slug is free (another
 * agent holding it wins; Barry stays unpublished rather than steal
 * it). A member's own Barry is NEVER auto-published.
 */
/**
 * The house-Barry profile defaults are the OUTCOME-LED copy in
 * lib/barry-agent-core.ts (BARRY_PROFILE_NEXT — Dave, 2026-11-21:
 * lead with outcome, never with an offer; the previous shipped
 * strings survive there only as the refresh guard's comparison).
 */
const BARRY_PROFILE = {
  slug: "btc-barry",
  category: BARRY_PROFILE_NEXT.category,
  capabilities: BARRY_PROFILE_NEXT.capabilities,
  description: BARRY_PROFILE_NEXT.description,
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
  // Copy fields go through the guarded refresh plan (barry-agent-
  // core): empties are filled AND fields still carrying the previous
  // shipped defaults exactly are refreshed to the outcome-led copy,
  // in one pass. Hand-edited copy is never overwritten.
  const plan = planBarryProfileRefresh({
    description: agent.description,
    category: agent.category,
    capabilities: capabilitiesFromJson(agent.capabilitiesJson),
  });
  if (plan.updates.description !== undefined) data.description = plan.updates.description;
  if (plan.updates.category !== undefined) data.category = plan.updates.category;
  if (plan.updates.capabilities !== undefined) data.capabilitiesJson = capabilitiesToJson(plan.updates.capabilities);
  if (Object.keys(data).length > 0) {
    await db.hiredAgent.update({ where: { id: agentId }, data });
  }
}

/**
 * The guarded profile-copy refresh as a reportable action (Dave,
 * 2026-11-21): for the designated operator's Barry ONLY, bring
 * description / capabilities / category to the outcome-led defaults
 * when they are empty or still equal the previous shipped defaults
 * exactly. Anything a human edited is left untouched and reported
 * as customized. Called by the provision flow so Dave's one tap in
 * /admin both provisions the rotator and refreshes the copy; the
 * launch path heals the same fields silently via
 * applyBarryProfileDefaults above.
 */
export async function refreshBarryProfileCopy(
  agentId: string,
  userId: string,
): Promise<{ profileRefreshed: boolean; reason: string }> {
  const [agent, owner] = await Promise.all([
    db.hiredAgent.findUnique({ where: { id: agentId } }),
    db.user.findUnique({ where: { id: userId }, select: { whopId: true, whopUsername: true } }),
  ]);
  if (!agent || !owner || !isDesignatedOperator(owner)) {
    return { profileRefreshed: false, reason: "Profile copy refresh applies to the operator's Barry only." };
  }
  const plan = planBarryProfileRefresh({
    description: agent.description,
    category: agent.category,
    capabilities: capabilitiesFromJson(agent.capabilitiesJson),
  });
  const data: { category?: string; capabilitiesJson?: string; description?: string } = {};
  if (plan.updates.description !== undefined) data.description = plan.updates.description;
  if (plan.updates.category !== undefined) data.category = plan.updates.category;
  if (plan.updates.capabilities !== undefined) data.capabilitiesJson = capabilitiesToJson(plan.updates.capabilities);
  if (Object.keys(data).length > 0) {
    await db.hiredAgent.update({ where: { id: agentId }, data });
  }
  return barryProfileRefreshReport(plan);
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
/** The provision result plus the guarded profile-copy refresh
 *  outcome and the P&R-record catalog pull (Dave, 2026-11-21) —
 *  the /admin card prints all three. */
export interface EnsureBarryRotatorWithProfileResult extends EnsureBarryRotatorResult {
  profileRefreshed: boolean;
  profileRefreshReason: string;
  /** EngineLinks created by the catalog pull on this run — the
   *  operator's P&R record links he had not already saved. */
  catalogSeeded: number;
  /** Which catalog rung served the pull, or "failed" (the pull is
   *  best-effort: provisioning proceeded with existing links). */
  catalogSource: CatalogSeedSource;
}

export async function ensureBarryRotatorForOperator(
  operatorUserId: string,
): Promise<EnsureBarryRotatorWithProfileResult> {
  // FIRST: pull the operator's links from his P&R record (Dave,
  // 2026-11-21: "Links should be pulled from P&R MCP"). The seed is
  // create-only — partners he already saved (by hand or bridge
  // sync) always win — and best-effort in its own guard: a catalog
  // outage never blocks provisioning, it just reports "failed" and
  // the sync below runs on whatever links already exist. It runs
  // before the rotator sync and independent of Barry's gate: the
  // links are the operator's setup data, populated whether or not
  // Barry is currently working.
  let catalogSeeded = 0;
  let catalogSource: CatalogSeedSource = "failed";
  try {
    const seed = await seedOperatorLinksFromOfferCatalog(operatorUserId);
    catalogSeeded = seed.seeded;
    catalogSource = seed.source;
  } catch (err) {
    console.error("[barry] operator catalog seed failed:", err);
  }
  const catalog = { catalogSeeded, catalogSource };

  const candidates = await db.hiredAgent.findMany({
    where: { userId: operatorUserId, templateKey: BARRY_TEMPLATE_KEY },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const barry = selectBarryRecord(candidates);
  const result = await provisionBarryRotator(db as unknown as BarryRotatorDb, {
    barry: barry ? { id: barry.id, name: barry.name, status: barry.status, expiresAt: barry.expiresAt } : null,
    operatorUserId,
  });
  // The copy refresh rides the same operator action, but only when
  // provisioning actually proceeded (a working Barry): a refused
  // gate changes nothing at all.
  if (!barry) {
    return { ...result, ...catalog, profileRefreshed: false, profileRefreshReason: "No Barry record — no profile copy to refresh." };
  }
  const gate = barryRotatorGate(
    { id: barry.id, name: barry.name, status: barry.status, expiresAt: barry.expiresAt },
    new Date(),
  );
  if (!gate.ok) {
    return { ...result, ...catalog, profileRefreshed: false, profileRefreshReason: "Barry is not working — profile copy left as-is." };
  }
  const refresh = await refreshBarryProfileCopy(barry.id, operatorUserId);
  return { ...result, ...catalog, profileRefreshed: refresh.profileRefreshed, profileRefreshReason: refresh.reason };
}
