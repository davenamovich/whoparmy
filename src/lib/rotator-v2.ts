import "server-only";
import { db } from "@/lib/db";
import { etDateString } from "@/lib/rotator";
import { spotWindowKeyForPlacementDate } from "@/lib/rotator-market";
import {
  BARRY_SLUG as POLICY_BARRY_SLUG,
  DH_MEDIA_PARTNER_KEYS,
  effectivePolicy,
  filterRowsByPolicy,
  planMemberPoolSync,
  referrerRow,
  validateOffers,
  validatePool,
} from "@/lib/agent-rotator-policy-core";
import {
  hashIp,
  HOP_FILTER_POLICY,
  isAgentWorking,
  appendSubParam,
  mintAgentRotatorCode,
  mintUserRotatorCode,
  pickSequential,
  pickWeighted,
  resolveSigningSecret,
  scoreHop,
  uaFamily,
  validateLinkSet,
  verifyUserRotatorCode,
  verifyAgentRotatorCode,
  type PickableLink,
  enforcementEffects, forfeitedAgentIds, summarizeHopDay,
  type EnforcementLike, type EnforcementEffects, type HopDaySummary,
} from "@/lib/rotator-v2-core";

export type AdminResult = { ok: true; detail: string } | { ok: false; error: string };

export async function listActiveEnforcements() {
  return db.rotatorEnforcement.findMany({
    where: { liftedAt: null },
    orderBy: { createdAt: "desc" },
  });
}
export async function applyEnforcement(
  input: { scope: unknown; scopeId: unknown; level: unknown; reason: unknown },
  createdBy: string,
): Promise<AdminResult> {
  if (input.scope !== "AGENT" && input.scope !== "USER") {
    return { ok: false, error: "Scope must be AGENT or USER." };
  }
  if (!["WARN", "THROTTLE", "FORFEIT", "REMOVED"].includes(String(input.level))) {
    return { ok: false, error: "Invalid enforcement level." };
  }
  if (typeof input.scopeId !== "string" || !input.scopeId.trim()) {
    return { ok: false, error: "Scope id is required." };
  }
  if (typeof input.reason !== "string" || !input.reason.trim()) {
    return { ok: false, error: "Reason is required." };
  }
  await db.rotatorEnforcement.create({
    data: {
      scope: input.scope,
      scopeId: input.scopeId,
      level: input.level as string,
      reason: input.reason,
      createdBy,
    },
  });
  return {
    ok: true,
    detail: `Applied ${input.level} to ${input.scope} ${input.scopeId}: ${input.reason}`,
  };
}
export async function liftEnforcement(id: unknown): Promise<AdminResult> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, error: "Enforcement id is required." };
  }
  const row = await db.rotatorEnforcement.findUnique({ where: { id } });
  if (!row || row.liftedAt) {
    return { ok: false, error: "Enforcement not found or already lifted." };
  }
  await db.rotatorEnforcement.update({
    where: { id },
    data: { liftedAt: new Date() },
  });
  return { ok: true, detail: `Lifted enforcement ${id}.` };
}
async function activeEnforcementsFor(ctx: { agentId?: string | null; userId?: string | null }): Promise<EnforcementLike[] | null> {
  if (!ctx.agentId && !ctx.userId) {
    return [];
  }
  try {
    return await db.rotatorEnforcement.findMany({
      where: {
        liftedAt: null,
        OR: [
          ...(ctx.agentId ? [{ scope: "AGENT", scopeId: ctx.agentId }] : []),
          ...(ctx.userId ? [{ scope: "USER", scopeId: ctx.userId }] : []),
        ],
      },
      select: { scope: true, scopeId: true, level: true },
    });
  } catch (err) {
    console.error("[rotator-v2] enforcement lookup failed:", err);
    return null;
  }
}
async function enforcementEffectsFor(ctx: { agentId?: string | null; userId?: string | null }): Promise<EnforcementEffects> {
  const rows = await activeEnforcementsFor(ctx);
  return rows
    ? enforcementEffects(rows, ctx)
    : { serveBlocked: false, slotsForfeited: false, userRateScale: 1, agentRateScale: 1 };
}
export async function getForfeitedAgentIds(
  placements: Array<{ userId: string }>,
): Promise<Set<string>> {
  try {
    const rows = await listActiveEnforcements();
    const users = [...new Set(placements.map((p) => p.userId))];
    const agents = await db.hiredAgent.findMany({
      where: { userId: { in: users } },
      select: { id: true, userId: true },
    });
    const map = new Map<string, string[]>();
    for (const agent of agents) {
      map.set(agent.userId, [...(map.get(agent.userId) ?? []), agent.id]);
    }
    return forfeitedAgentIds(rows, map);
  } catch (err) {
    console.error("[rotator-v2] forfeiture lookup failed:", err);
    return new Set();
  }
}

/**
 * ─── USER ROTATOR V2 — database operations ─────────────────────────
 *
 * This module connects each member's rotator to their own saved
 * EngineLinks, applies their daily hop caps, and records a privacy-safe
 * hop when a destination is served. If recording the hop fails, the
 * redirect still succeeds: analytics must never strand a visitor.
 */

function etMidnight(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;

  // Convert the ET calendar midnight into UTC, correcting for the offset
  // represented at the current guess (including daylight saving changes).
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
    guess += target - represented;
  }

  return new Date(guess);
}

/**
 * Find-or-create an agent's rotator row — THE creation path for
 * AgentRotator, shared by the member agent-rotator API (below) and
 * Barry's provisioning (lib/barry-rotator.ts, which issues this
 * exact upsert against its structural db). The create payload is
 * only { agentId, userId }: mode (WEIGHTED) and enabled defaults
 * live in the schema, and the signed serve code is derived from
 * the row id at read time (mintAgentRotatorCode), never stored.
 */
export async function ensureAgentRotatorRow(agentId: string, userId: string) {
  return db.agentRotator.upsert({
    where: { agentId },
    create: { agentId, userId },
    update: {},
  });
}

/**
 * Loads an agent's rotator and today's hop counts for its saved links.
 */
export async function getAgentRotator(ownerUserId: string, agentId: string) {
  const agent = await db.hiredAgent.findUnique({ where: { id: agentId } });
  if (!agent || agent.userId !== ownerUserId) {
    return null;
  }

  const rotator = await ensureAgentRotatorRow(agentId, agent.userId);
  const today = etDateString();
  const [links, hops] = await Promise.all([
    db.agentRotatorLink.findMany({
      where: { rotatorId: rotator.id },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: {
        rotatorId: rotator.id,
        counted: true,
        ts: { gte: dayStart(today), lt: dayEnd(today) },
        linkId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(hops.map((hop) => [hop.linkId!, hop._count._all]));
  const key = secret();
  return {
    ...rotator,
    /** What the rotator actually serves under, defaults applied. */
    policy: effectivePolicy(rotator, agent.slug),
    code: key ? mintAgentRotatorCode(rotator.id, key) : null,
    links: links.map((link) => ({ ...link, hopsToday: counts.get(link.id) ?? 0 })),
  };
}

/**
 * Updates an agent's rotator settings and replaces its saved links after validation.
 */
export async function updateAgentRotator(ownerUserId: string, agentId: string, input: unknown): Promise<RotatorUpdateResult & { notFound?: boolean }> {
  const agent = await db.hiredAgent.findUnique({ where: { id: agentId }, select: { userId: true } });
  if (!agent || agent.userId !== ownerUserId) {
    return { ok: false, error: "Agent not found.", notFound: true };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid rotator settings." };
  }

  const body = input as Record<string, unknown>;
  if (body.mode !== undefined && body.mode !== "SEQUENTIAL" && body.mode !== "WEIGHTED") {
    return { ok: false, error: "Mode must be SEQUENTIAL or WEIGHTED." };
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { ok: false, error: "Enabled must be a boolean." };
  }
  // The owner's offer pick (Dave, 2026-11-22: "each agent only promotes
  // their offers chosen by their owner") and pool. `offers: null`
  // clears the pick back to unconfigured.
  let offersJson: string | null | undefined;
  if (body.offers !== undefined) {
    if (body.offers === null) {
      offersJson = null;
    } else {
      const offers = validateOffers(body.offers);
      if (!offers.ok) return offers;
      offersJson = JSON.stringify(offers.offers);
    }
  }
  let pool: string | undefined;
  if (body.pool !== undefined) {
    const checked = validatePool(body.pool);
    if (!checked.ok) return checked;
    pool = checked.pool;
  }

  let validated: ReturnType<typeof validateLinkSet> | undefined;
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) {
      return { ok: false, error: "Links must be an array." };
    }

    const ids = body.links.map((link) =>
      link && typeof link === "object" ? (link as { engineLinkId?: unknown }).engineLinkId : null,
    );
    if (ids.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Every link must belong to you." };
    }

    const owned = await db.engineLink.findMany({ where: { userId: ownerUserId, id: { in: ids as string[] } }, select: { id: true } });
    validated = validateLinkSet(new Set(owned.map((row) => row.id)), body.links);
    if (!validated.ok) return validated;
  }
  const rotator = await ensureAgentRotatorRow(agentId, agent.userId);
  await db.$transaction(async (tx) => {
    await tx.agentRotator.update({
      where: { id: rotator.id },
      data: {
        ...(body.mode ? { mode: body.mode as string } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled as boolean } : {}),
        ...(offersJson !== undefined ? { offersJson } : {}),
        ...(pool !== undefined ? { pool } : {}),
      },
    });

    if (validated?.ok) {
      await tx.agentRotatorLink.deleteMany({ where: { rotatorId: rotator.id } });
      if (validated.links.length) {
        await tx.agentRotatorLink.createMany({
          data: validated.links.map((link) => ({ ...link, rotatorId: rotator.id })),
        });
      }
    }
  });
  return { ok: true };
}

export type RotatorHopInput = {
  surface: string;
  rotatorId: string | null;
  agentId: string | null;
  userId: string | null;
  linkId: string | null;
  code: string;
  meta: { ip: string | null; ua: string | null; referer: string | null };
};

export async function recordRotatorHop(input: RotatorHopInput): Promise<void> {
  let refererHost: string | null = null;
  try {
    if (input.meta.referer) {
      refererHost = new URL(input.meta.referer).host;
    }
  } catch {
    /* Bad referrers have no host. */
  }

  const ipHash = hashIp(input.meta.ip);
  let verdict = { filtered: false, reason: null as string | null, counted: true };
  try {
    const now = new Date();
    const history = await gatherHopHistory(ipHash, input.linkId, input.userId, input.agentId, now);
    const effects = (input.agentId || input.userId)
      ? await enforcementEffectsFor({ agentId: input.agentId, userId: input.userId })
      : { userRateScale: 1, agentRateScale: 1 };
    verdict = scoreHop({
      ua: input.meta.ua,
      hasIp: ipHash !== null,
      hasReferer: refererHost !== null,
      hasUser: input.userId !== null,
      hasAgent: input.agentId !== null,
      history,
      rateScales: { user: effects.userRateScale, agent: effects.agentRateScale },
    });
  } catch (err) {
    console.error("[rotator-v2] hop scoring failed:", err);
  }

  try {
    await db.rotatorHop.create({
      data: {
        surface: input.surface,
        rotatorId: input.rotatorId,
        agentId: input.agentId,
        userId: input.userId,
        linkId: input.linkId,
        code: input.code.slice(0, 128),
        ipHash,
        uaFamily: uaFamily(input.meta.ua),
        refererHost,
        filtered: verdict.filtered,
        filterReason: verdict.reason,
        counted: verdict.counted,
      },
    });
  } catch (err) {
    console.error("[rotator-v2] hop recording failed:", err);
  }
}

async function gatherHopHistory(ipHash: string | null, linkId: string | null, userId: string | null, agentId: string | null, now: Date) {
  const minuteStart = new Date(now.getTime() - 60_000);
  const velocityStart = new Date(now.getTime() - HOP_FILTER_POLICY.IP_VELOCITY_WINDOW_MINUTES * 60_000);
  const refererlessStart = new Date(now.getTime() - HOP_FILTER_POLICY.REFERERLESS_WINDOW_MINUTES * 60_000);
  const today = etDateString();
  const day = { gte: dayStart(today), lt: dayEnd(today) };
  const empty = { ipMinute: 0, ipDay: 0, userMinute: 0, userDay: 0, agentMinute: 0, agentDay: 0, poolMinute: 0, poolDay: 0 };
  const ipWhere = ipHash ? { ipHash } : null;
  // Find the last counted hop for duplicate detection.
  const lastQuery = ipHash && linkId
    ? db.rotatorHop.findFirst({ where: { ipHash, linkId, counted: true }, orderBy: { ts: "desc" }, select: { ts: true } })
    : Promise.resolve(null);
  // Count recent IP hops for velocity filtering.
  const velocityQuery = ipWhere
    ? db.rotatorHop.count({ where: { ...ipWhere, ts: { gte: velocityStart } } })
    : Promise.resolve(0);
  // Count recent IP hops without a referer.
  const refererlessQuery = ipWhere
    ? db.rotatorHop.count({ where: { ...ipWhere, refererHost: null, ts: { gte: refererlessStart } } })
    : Promise.resolve(0);
  // Count IP hops in the minute and day rate-limit windows.
  const ipMinuteQuery = ipWhere
    ? db.rotatorHop.count({ where: { ...ipWhere, ts: { gte: minuteStart } } })
    : Promise.resolve(0);
  const ipDayQuery = ipWhere
    ? db.rotatorHop.count({ where: { ...ipWhere, ts: day } })
    : Promise.resolve(0);
  // Count user hops in the minute and day rate-limit windows.
  const userMinuteQuery = userId
    ? db.rotatorHop.count({ where: { userId, ts: { gte: minuteStart } } })
    : Promise.resolve(0);
  const userDayQuery = userId
    ? db.rotatorHop.count({ where: { userId, ts: day } })
    : Promise.resolve(0);
  // Count agent hops in the minute and day rate-limit windows.
  const agentMinuteQuery = agentId
    ? db.rotatorHop.count({ where: { agentId, ts: { gte: minuteStart } } })
    : Promise.resolve(0);
  const agentDayQuery = agentId
    ? db.rotatorHop.count({ where: { agentId, ts: day } })
    : Promise.resolve(0);
  // Count all pool hops in the minute and day rate-limit windows.
  const poolMinuteQuery = db.rotatorHop.count({ where: { ts: { gte: minuteStart } } });
  const poolDayQuery = db.rotatorHop.count({ where: { ts: day } });
  const [last, velocity, refererless, ipMinute, ipDay, userMinute, userDay, agentMinute, agentDay, poolMinute, poolDay] = await Promise.all([
    lastQuery,
    velocityQuery,
    refererlessQuery,
    ipMinuteQuery,
    ipDayQuery,
    userMinuteQuery,
    userDayQuery,
    agentMinuteQuery,
    agentDayQuery,
    poolMinuteQuery,
    poolDayQuery,
  ]);
  const minutesSinceLastCountedSameIpLink = last
    ? (now.getTime() - last.ts.getTime()) / 60_000
    : null;
  const rateCounts = ipWhere
    ? { ipMinute, ipDay, userMinute, userDay, agentMinute, agentDay, poolMinute, poolDay }
    : { ...empty, userMinute, userDay, agentMinute, agentDay, poolMinute, poolDay };
  return {
    minutesSinceLastCountedSameIpLink,
    ipHopsInVelocityWindow: velocity,
    ipRefererlessHopsInWindow: refererless,
    rateCounts,
  };
}

/**
 * Kept for callers and tests of the 2026-11-22 DH-only fix: house
 * Barry's offers now come from the rotator policy
 * (lib/agent-rotator-policy-core.ts), whose Barry default is exactly
 * this DH Media filter.
 */
export const BARRY_SLUG = POLICY_BARRY_SLUG;
export const BARRY_DH_MEDIA_PARTNERS: readonly string[] = DH_MEDIA_PARTNER_KEYS;
export function filterBarryRideRows<T extends { engineLink: { partner: string } }>(
  agentSlug: string | null | undefined,
  rows: T[],
): T[] {
  if (agentSlug !== BARRY_SLUG) return rows;
  return rows.filter((row) => DH_MEDIA_PARTNER_KEYS.includes(row.engineLink.partner));
}

type RotatorRow = NonNullable<Awaited<ReturnType<typeof db.agentRotator.findUnique>>>;

/**
 * A MEMBERS pool picks up every member who has saved a link for one of
 * the agent's offers: saving the link is how a member gets in on the
 * rotator. Add-only, appended after the current last position, so the
 * round robin order of existing members never shifts.
 */
async function syncMemberPool(rotatorId: string, offers: string[] | null): Promise<void> {
  if (!offers || offers.length === 0) return;
  const [existing, candidates] = await Promise.all([
    db.agentRotatorLink.findMany({ where: { rotatorId }, select: { engineLinkId: true, position: true } }),
    db.engineLink.findMany({
      where: { partner: { in: offers }, url: { startsWith: "http" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
  ]);
  const plan = planMemberPoolSync(existing, candidates);
  for (const row of plan) {
    // One at a time: SQLite has no createMany skipDuplicates, and a
    // concurrent serve may have added the same member a moment ago
    // (the unique [rotatorId, engineLinkId] index rejects the repeat).
    await db.agentRotatorLink
      .create({ data: { rotatorId, engineLinkId: row.engineLinkId, position: row.position } })
      .catch(() => undefined);
  }
}

/** Rows this rotator may serve right now, under its offer policy. */
async function servableRows(rotator: RotatorRow, agentSlug: string | null) {
  // Member agents serve through the rotator only while their $20/mo
  // marketplace listing is active (Dave, 2026-11-23). The house stack
  // agent (Barry) is exempt: it is the front door, not a member listing.
  if (agentSlug !== BARRY_SLUG) {
    const listing = await db.user.findUnique({ where: { id: rotator.userId }, select: { listingActive: true } });
    if (!listing?.listingActive) return { policy: effectivePolicy(rotator, agentSlug), rows: [], hopCount: 0, counts: new Map<string, number>() };
  }
  const policy = effectivePolicy(rotator, agentSlug);
  if (policy.pool === "MEMBERS") await syncMemberPool(rotator.id, policy.offers);
  const today = etDateString();
  const window = { gte: dayStart(today), lt: dayEnd(today) };
  const [allRows, hopCount, hopRows] = await Promise.all([
    db.agentRotatorLink.findMany({
      where: {
        rotatorId: rotator.id,
        enabled: true,
        ...(policy.pool === "OWNER" ? { engineLink: { userId: rotator.userId } } : {}),
      },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.count({
      where: { rotatorId: rotator.id, counted: true, ts: window },
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: { rotatorId: rotator.id, counted: true, ts: window, linkId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const rows = filterRowsByPolicy(allRows, policy, rotator.userId);
  const counts = new Map(hopRows.map((hop) => [hop.linkId!, hop._count._all]));
  return { policy, rows, hopCount, counts };
}

function pickRow<T extends { id: string; weight: number; position: number; dailyCap: number | null }>(
  rows: T[],
  mode: "SEQUENTIAL" | "WEIGHTED",
  hopCount: number,
  counts: Map<string, number>,
): T | null {
  const picks: PickableLink[] = rows.map((link) => ({
    linkId: link.id,
    weight: link.weight,
    position: link.position,
    hopsToday: counts.get(link.id) ?? 0,
    dailyCap: link.dailyCap,
  }));
  const pick = mode === "SEQUENTIAL" ? pickSequential(picks, hopCount) : pickWeighted(picks, Math.random());
  return pick ? rows.find((link) => link.id === pick.linkId) ?? null : null;
}

/** Serves an agent's signed rotator link and records the selected hop.
 *  With `ref` (a member's refCode), a visitor to a MEMBERS pool goes to
 *  that member's own link for the agent's offers when they have one;
 *  without it, the rotator's normal pick (a MEMBERS pool's round robin). */
export async function serveAgentRotator(
  code: string,
  meta: { ip: string | null; ua: string | null; referer: string | null },
  opts: { ref?: string | null } = {},
) {
  const key = secret();
  if (!key) {
    return null;
  }

  const verified = verifyAgentRotatorCode(code, key);
  if (!verified) {
    return null;
  }

  const rotator = await db.agentRotator.findUnique({ where: { id: verified.rotatorId } });
  if (!rotator?.enabled) {
    return null;
  }
  const agent = await db.hiredAgent.findUnique({ where: { id: rotator.agentId }, select: { status: true, expiresAt: true, slug: true } });
  if (!agent || !isAgentWorking(agent.status, agent.expiresAt, new Date())) {
    return null;
  }
  if ((await enforcementEffectsFor({ agentId: rotator.agentId, userId: rotator.userId })).serveBlocked) {
    return null;
  }

  const { policy, rows, hopCount, counts } = await servableRows(rotator, agent.slug);
  const ref = typeof opts.ref === "string" ? opts.ref.trim() : "";
  let selected: (typeof rows)[number] | null = null;
  if (ref && policy.pool === "MEMBERS") {
    const referrer = await db.user.findFirst({ where: { refCode: ref }, select: { id: true } });
    selected = referrerRow(rows, referrer?.id ?? null);
  }
  selected ??= pickRow(rows, policy.mode, hopCount, counts);
  if (!selected) {
    return null;
  }

  await recordRotatorHop({
    surface: "AGENT",
    rotatorId: rotator.id,
    agentId: rotator.agentId,
    userId: rotator.userId,
    linkId: selected.id,
    code,
    meta,
  });
  return {
    url: appendSubParam(selected.engineLink.url, rotator.agentId),
    agentId: rotator.agentId,
    linkId: selected.id,
    rotatorId: rotator.id,
  };
}

/** Resolves an agent's current eligible destination for the bridge rotator. */
export async function resolveAgentRotatorDestination(agentId: string) {
  const rotator = await db.agentRotator.findUnique({ where: { agentId } });
  if (!rotator?.enabled) {
    return null;
  }
  const agent = await db.hiredAgent.findUnique({ where: { id: rotator.agentId }, select: { status: true, expiresAt: true, slug: true } });
  if (!agent || !isAgentWorking(agent.status, agent.expiresAt, new Date())) {
    return null;
  }
  const destinationEffects = await enforcementEffectsFor({ agentId: rotator.agentId, userId: rotator.userId });
  if (destinationEffects.serveBlocked || destinationEffects.slotsForfeited) {
    return null;
  }

  const { policy, rows, hopCount, counts } = await servableRows(rotator, agent.slug);
  const selected = pickRow(rows, policy.mode, hopCount, counts);
  if (!selected) {
    return null;
  }
  return {
    url: appendSubParam(selected.engineLink.url, agentId),
    partner: selected.engineLink.partner,
    // The member whose link is served: in a MEMBERS pool that is not
    // the agent's owner.
    userId: selected.engineLink.userId,
    rotatorId: rotator.id,
    linkId: selected.id,
  };
}

const dayStart = (date: string) => etMidnight(date);

const dayEnd = (date: string) =>
  etMidnight(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(etMidnight(date).getTime() + 36 * 60 * 60 * 1000)),
  );

const secret = () => resolveSigningSecret(process.env);

export async function getRotatorHopDayReport(
  date: string,
): Promise<HopDaySummary & { date: string }> {
  const rows = await db.rotatorHop.findMany({
    where: { ts: { gte: dayStart(date), lt: dayEnd(date) } },
    select: { counted: true, filterReason: true, agentId: true, userId: true },
  });
  return {
    date,
    ...summarizeHopDay(rows),
  };
}

/** Slot usage remains sourced from AgentTrafficDay; hopClicks is the additional v2 hop-based view. */
export async function getWeeklyTrafficReport(userId: string, endDate = etDateString()) {
  const [year, month, day] = endDate.split("-").map(Number);
  // Use UTC calendar parts so daylight saving changes cannot skip a date.
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1, day - (6 - i)));
    const utcYear = date.getUTCFullYear();
    const utcMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const utcDay = String(date.getUTCDate()).padStart(2, "0");
    return `${utcYear}-${utcMonth}-${utcDay}`;
  });
  const days = await Promise.all(dates.map(async (date) => {
    const [slots, hops] = await Promise.all([
      // AgentTrafficDay rows are keyed by SPOT WINDOW key since
      // 2026-11-21: the slots a placement date consumed live under
      // the window that governed it (key = placement date − 1).
      db.agentTrafficDay.findMany({
        where: { userId, date: spotWindowKeyForPlacementDate(date) },
        select: { agentId: true, slotsUsed: true },
      }),
      db.rotatorHop.findMany({
        where: { userId, ts: { gte: dayStart(date), lt: dayEnd(date) } },
        select: { counted: true, filterReason: true, agentId: true, userId: true },
      }),
    ]);
    const perAgent: Record<string, number> = {};
    let totalUsed = 0;
    for (const row of slots) {
      perAgent[row.agentId] = row.slotsUsed;
      totalUsed += row.slotsUsed;
    }
    const summary = summarizeHopDay(hops);
    return {
      date,
      slots: { totalUsed, perAgent },
      hopClicks: { counted: summary.countedTotal, filtered: summary.filteredTotal },
    };
  }));
  return {
    userId,
    from: dates[0],
    to: dates[6],
    days,
  };
}

export async function getMyRotator(userId: string) {
  const rotator = await db.userRotator.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const today = etDateString();
  const from = dayStart(today);
  const to = dayEnd(today);

  const [links, hops] = await Promise.all([
    db.userRotatorLink.findMany({
      where: { rotatorId: rotator.id },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: {
        rotatorId: rotator.id,
        counted: true,
        ts: { gte: from, lt: to },
        linkId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(hops.map((hop) => [hop.linkId!, hop._count._all]));
  const key = secret();

  return {
    ...rotator,
    code: key ? mintUserRotatorCode(rotator.id, key) : null,
    links: links.map((link) => ({ ...link, hopsToday: counts.get(link.id) ?? 0 })),
  };
}

export type RotatorUpdateResult = { ok: true } | { ok: false; error: string };

export async function updateMyRotator(userId: string, input: unknown): Promise<RotatorUpdateResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid rotator settings." };
  }

  const body = input as Record<string, unknown>;
  if (body.mode !== undefined && body.mode !== "SEQUENTIAL" && body.mode !== "WEIGHTED") {
    return { ok: false, error: "Mode must be SEQUENTIAL or WEIGHTED." };
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { ok: false, error: "Enabled must be a boolean." };
  }

  let validated: ReturnType<typeof validateLinkSet> | undefined;
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) {
      return { ok: false, error: "Links must be an array." };
    }

    const ids = body.links.map((link) =>
      link && typeof link === "object" ? (link as { engineLinkId?: unknown }).engineLinkId : null,
    );
    if (ids.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Every link must belong to you." };
    }

    const ownedRows = await db.engineLink.findMany({
      where: { userId, id: { in: ids as string[] } },
      select: { id: true },
    });
    validated = validateLinkSet(new Set(ownedRows.map((row) => row.id)), body.links);
    if (!validated.ok) {
      return validated;
    }
  }

  const rotator = await db.userRotator.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await db.$transaction(async (tx) => {
    await tx.userRotator.update({
      where: { id: rotator.id },
      data: {
        ...(body.mode ? { mode: body.mode as string } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled as boolean } : {}),
      },
    });

    if (validated?.ok) {
      await tx.userRotatorLink.deleteMany({ where: { rotatorId: rotator.id } });
      if (validated.links.length) {
        await tx.userRotatorLink.createMany({
          data: validated.links.map((link) => ({ ...link, rotatorId: rotator.id })),
        });
      }
    }
  });

  return { ok: true };
}

export async function serveUserRotator(
  code: string,
  meta: { ip: string | null; ua: string | null; referer: string | null },
): Promise<{ url: string } | null> {
  const key = secret();
  if (!key) {
    return null;
  }

  const verified = verifyUserRotatorCode(code, key);
  if (!verified) {
    return null;
  }

  const rotator = await db.userRotator.findUnique({
    where: { id: verified.rotatorId },
    include: { user: { select: { id: true } } },
  });
  if (!rotator?.enabled) {
    return null;
  }
  if ((await enforcementEffectsFor({ userId: rotator.userId })).serveBlocked) {
    return null;
  }

  const today = etDateString();
  const from = dayStart(today);
  const to = dayEnd(today);
  const [rows, hopCount, hopRows] = await Promise.all([
    db.userRotatorLink.findMany({
      where: {
        rotatorId: rotator.id,
        enabled: true,
        engineLink: { userId: rotator.userId },
      },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.count({
      where: { rotatorId: rotator.id, counted: true, ts: { gte: from, lt: to } },
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: {
        rotatorId: rotator.id,
        counted: true,
        ts: { gte: from, lt: to },
        linkId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(hopRows.map((hop) => [hop.linkId!, hop._count._all]));
  const picks: PickableLink[] = rows.map((link) => ({
    linkId: link.id,
    weight: link.weight,
    position: link.position,
    hopsToday: counts.get(link.id) ?? 0,
    dailyCap: link.dailyCap,
  }));
  const pick =
    rotator.mode === "SEQUENTIAL"
      ? pickSequential(picks, hopCount)
      : pickWeighted(picks, Math.random());
  if (!pick) {
    return null;
  }

  const selected = rows.find((link) => link.id === pick.linkId)!;
  await recordRotatorHop({
    surface: "USER",
    rotatorId: rotator.id,
    agentId: null,
    userId: rotator.userId,
    linkId: selected.id,
    code,
    meta,
  });

  return { url: selected.engineLink.url };
}
