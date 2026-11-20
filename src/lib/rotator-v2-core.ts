import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * ─── USER ROTATOR V2 — pure core ───────────────────────────────────
 *
 * Dave's rule: a rotator can only point at the owner's own saved
 * EngineLinks. The code and pick helpers live here so that ownership,
 * link limits, and destination selection are easy to validate without
 * database state. Hop records keep only a hash of the IP, never the raw
 * address, and a failed hop write must never interrupt a redirect.
 */

export function rotatorV2Enabled(env: NodeJS.ProcessEnv): boolean {
  return env.ROTATOR_V2 === "1";
}

export function resolveSigningSecret(env: NodeJS.ProcessEnv): string | null {
  return env.ROTATOR_SIGNING_SECRET?.trim() || env.SESSION_SECRET?.trim() || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function mintCode(key: "r" | "a", id: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ [key]: id })).toString("base64url");
  return `v1.${payload}.${sign(payload, secret)}`;
}

function verifyCode(key: "r" | "a", code: string, secret: string): string | null {
  const parts = String(code ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }

  const expected = sign(parts[1], secret);
  const actualBytes = Buffer.from(parts[2]);
  const expectedBytes = Buffer.from(expected);

  // timingSafeEqual requires equal-length buffers, so check lengths first.
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  try {
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return value && typeof value[key] === "string" && value[key] ? value[key] : null;
  } catch {
    return null;
  }
}

export function mintUserRotatorCode(rotatorId: string, secret: string): string {
  return mintCode("r", rotatorId, secret);
}

export function verifyUserRotatorCode(code: string, secret: string): { rotatorId: string } | null {
  const rotatorId = verifyCode("r", code, secret);
  return rotatorId ? { rotatorId } : null;
}

export function mintAgentRotatorCode(rotatorId: string, secret: string): string {
  return mintCode("a", rotatorId, secret);
}

export function verifyAgentRotatorCode(code: string, secret: string): { rotatorId: string } | null {
  const rotatorId = verifyCode("a", code, secret);
  return rotatorId ? { rotatorId } : null;
}

export function appendSubParam(url: string, sub: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("sub")) return url;
    parsed.searchParams.append("sub", sub);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function pickGroupedDestination<T>(groups: T[][], hour: number): T | null {
  const available = groups.filter((group) => group.length > 0);
  if (!available.length) return null;
  const groupIndex = ((hour % available.length) + available.length) % available.length;
  const group = available[groupIndex];
  const entryIndex = Math.floor(hour / available.length) % group.length;
  return group[(entryIndex + group.length) % group.length];
}

export interface PickableLink {
  linkId: string;
  weight: number;
  position: number;
  hopsToday: number;
  dailyCap: number | null;
}

function eligible(links: PickableLink[]): PickableLink[] {
  // Capped links leave the pool as soon as today's counted hops reach the cap.
  return links
    .filter((link) => link.dailyCap === null || link.hopsToday < link.dailyCap)
    .sort((a, b) => a.position - b.position || a.linkId.localeCompare(b.linkId));
}

export function pickSequential(links: PickableLink[], hopIndex: number): PickableLink | null {
  const available = eligible(links);
  if (!available.length) {
    return null;
  }

  return available[((hopIndex % available.length) + available.length) % available.length];
}

export function pickWeighted(links: PickableLink[], rand: number): PickableLink | null {
  const available = eligible(links);
  const weights = available.map((link) => Math.max(1, link.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!available.length || total <= 0) {
    return null;
  }

  let bucket = Math.min(Math.max(rand, 0), 0.999999999) * total;
  for (let i = 0; i < available.length; i++) {
    if (bucket < weights[i]) {
      return available[i];
    }
    bucket -= weights[i];
  }

  return available[available.length - 1];
}

export function uaFamily(ua: string | null): string {
  const value = ua ?? "";
  if (!value) {
    return "Other";
  }
  if (/bot|spider|crawler|slurp/i.test(value)) {
    return "Bot";
  }
  if (/Edg\//i.test(value)) {
    return "Edge";
  }
  if (/Chrome\//i.test(value)) {
    return "Chrome";
  }
  if (/Firefox\//i.test(value)) {
    return "Firefox";
  }
  if (/Safari\//i.test(value)) {
    return "Safari";
  }
  return "Other";
}

/**
 * Hop filtering changes accounting only. It never changes the visitor's redirect.
 *
 * Checks run in this order so the first matching reason is recorded:
 * bot or empty user-agent, duplicate hop, IP velocity, referer-less burst,
 * then rate limits. Bot identity is checked first because it is the clearest
 * signal and must win when several filters match the same hop.
 */
export const HOP_FILTER_POLICY = {
  DEDUP_WINDOW_MINUTES: 30,
  IP_VELOCITY_WINDOW_MINUTES: 5,
  IP_VELOCITY_MAX_HOPS: 30,
  REFERERLESS_WINDOW_MINUTES: 5,
  REFERERLESS_MAX_HOPS: 20,
  RATE_LIMIT_IP_PER_MINUTE: 60,
  RATE_LIMIT_IP_PER_DAY: 2000,
  RATE_LIMIT_USER_PER_MINUTE: 300,
  RATE_LIMIT_USER_PER_DAY: 20000,
  RATE_LIMIT_AGENT_PER_MINUTE: 300,
  RATE_LIMIT_AGENT_PER_DAY: 20000,
  RATE_LIMIT_POOL_PER_MINUTE: 2000,
  RATE_LIMIT_POOL_PER_DAY: 200000,
} as const;

export type HopFilterReason = "BOT_UA" | "DEDUP" | "IP_VELOCITY" | "REFERERLESS_BURST" | "RATE_LIMITED";
export interface HopHistory {
  minutesSinceLastCountedSameIpLink: number | null;
  ipHopsInVelocityWindow: number;
  ipRefererlessHopsInWindow: number;
  rateCounts: {
    ipMinute: number;
    ipDay: number;
    userMinute: number;
    userDay: number;
    agentMinute: number;
    agentDay: number;
    poolMinute: number;
    poolDay: number;
  };
}
export interface HopVerdict {
  filtered: boolean;
  reason: HopFilterReason | null;
  counted: boolean;
}

export type EnforcementScope = "AGENT" | "USER";
export type EnforcementLevel = "WARN" | "THROTTLE" | "FORFEIT" | "REMOVED";
export interface EnforcementLike {
  scope: string;
  scopeId: string;
  level: string;
}
export interface EnforcementEffects {
  serveBlocked: boolean;
  slotsForfeited: boolean;
  userRateScale: number;
  agentRateScale: number;
}

/** Active rows only: the DB filters liftedAt=null before these effects are applied. */
export function enforcementEffects(
  enforcements: EnforcementLike[],
  ctx: { agentId?: string | null; userId?: string | null },
): EnforcementEffects {
  const effects: EnforcementEffects = {
    serveBlocked: false,
    slotsForfeited: false,
    userRateScale: 1,
    agentRateScale: 1,
  };
  for (const row of enforcements) {
    const agentMatch = row.scope === "AGENT" && !!ctx.agentId && row.scopeId === ctx.agentId;
    const userMatch = row.scope === "USER" && !!ctx.userId && row.scopeId === ctx.userId;
    if (!agentMatch && !userMatch) {
      continue;
    }
    if (row.level === "REMOVED") {
      effects.serveBlocked = true;
    }
    if (row.level === "FORFEIT") {
      effects.slotsForfeited = true;
    }
    if (row.level === "THROTTLE") {
      if (agentMatch) {
        effects.agentRateScale = 0.5;
      }
      if (userMatch) {
        effects.userRateScale = 0.5;
        effects.agentRateScale = 0.5;
      }
    }
  }
  return effects;
}

export function forfeitedAgentIds(enforcements: EnforcementLike[], agentIdsByUser: Map<string, string[]>): Set<string> {
  const ids = new Set<string>();
  for (const row of enforcements) {
    if (row.level !== "FORFEIT") {
      continue;
    }
    if (row.scope === "AGENT") {
      ids.add(row.scopeId);
    }
    if (row.scope === "USER") {
      for (const id of agentIdsByUser.get(row.scopeId) ?? []) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export interface HopSummaryRow {
  counted: boolean;
  filterReason: string | null;
  agentId: string | null;
  userId: string | null;
}
export interface HopDaySummary {
  total: number;
  countedTotal: number;
  filteredTotal: number;
  filteredByReason: Record<string, number>;
  perAgent: Array<{ agentId: string; counted: number; filtered: number }>;
  perUser: Array<{ userId: string; counted: number; filtered: number }>;
}
export function summarizeHopDay(rows: HopSummaryRow[]): HopDaySummary {
  let countedTotal = 0;
  let filteredTotal = 0;
  const filteredByReason: Record<string, number> = {};
  const agents = new Map<string, { counted: number; filtered: number }>();
  const users = new Map<string, { counted: number; filtered: number }>();
  for (const row of rows) {
    const key = row.counted ? "counted" : "filtered";
    if (row.counted) {
      countedTotal++;
    } else {
      filteredTotal++;
      const reason = row.filterReason ?? "UNKNOWN";
      filteredByReason[reason] = (filteredByReason[reason] ?? 0) + 1;
    }
    if (row.agentId) {
      const item = agents.get(row.agentId) ?? { counted: 0, filtered: 0 };
      item[key]++;
      agents.set(row.agentId, item);
    }
    if (row.userId) {
      const item = users.get(row.userId) ?? { counted: 0, filtered: 0 };
      item[key]++;
      users.set(row.userId, item);
    }
  }
  return {
    total: rows.length,
    countedTotal,
    filteredTotal,
    filteredByReason,
    perAgent: [...agents]
      .map(([agentId, counts]) => ({ agentId, ...counts }))
      .sort((a, b) => b.counted - a.counted || a.agentId.localeCompare(b.agentId)),
    perUser: [...users]
      .map(([userId, counts]) => ({ userId, ...counts }))
      .sort((a, b) => b.counted - a.counted || a.userId.localeCompare(b.userId)),
  };
}

export function scoreHop(input: {
  ua: string | null;
  hasIp: boolean;
  hasReferer: boolean;
  hasUser: boolean;
  hasAgent: boolean;
  history: HopHistory;
  rateScales?: { user?: number; agent?: number };
}): HopVerdict {
  let reason: HopFilterReason | null = null;
  if (uaFamily(input.ua) === "Bot" || !input.ua?.trim()) {
    reason = "BOT_UA";
  } else if (
    input.hasIp &&
    input.history.minutesSinceLastCountedSameIpLink !== null &&
    input.history.minutesSinceLastCountedSameIpLink < HOP_FILTER_POLICY.DEDUP_WINDOW_MINUTES
  ) {
    reason = "DEDUP";
  } else if (
    input.hasIp &&
    input.history.ipHopsInVelocityWindow >= HOP_FILTER_POLICY.IP_VELOCITY_MAX_HOPS
  ) {
    reason = "IP_VELOCITY";
  } else if (
    input.hasIp &&
    !input.hasReferer &&
    input.history.ipRefererlessHopsInWindow >= HOP_FILTER_POLICY.REFERERLESS_MAX_HOPS
  ) {
    reason = "REFERERLESS_BURST";
  } else {
    const c = input.history.rateCounts;
    const ipRateLimited =
      input.hasIp &&
      (c.ipMinute >= HOP_FILTER_POLICY.RATE_LIMIT_IP_PER_MINUTE ||
        c.ipDay >= HOP_FILTER_POLICY.RATE_LIMIT_IP_PER_DAY);
    const userRateLimited =
      input.hasUser &&
      (c.userMinute >= Math.floor(HOP_FILTER_POLICY.RATE_LIMIT_USER_PER_MINUTE * (input.rateScales?.user ?? 1)) ||
        c.userDay >= Math.floor(HOP_FILTER_POLICY.RATE_LIMIT_USER_PER_DAY * (input.rateScales?.user ?? 1)));
    const agentRateLimited =
      input.hasAgent &&
      (c.agentMinute >= Math.floor(HOP_FILTER_POLICY.RATE_LIMIT_AGENT_PER_MINUTE * (input.rateScales?.agent ?? 1)) ||
        c.agentDay >= Math.floor(HOP_FILTER_POLICY.RATE_LIMIT_AGENT_PER_DAY * (input.rateScales?.agent ?? 1)));
    const poolRateLimited =
      c.poolMinute >= HOP_FILTER_POLICY.RATE_LIMIT_POOL_PER_MINUTE ||
      c.poolDay >= HOP_FILTER_POLICY.RATE_LIMIT_POOL_PER_DAY;
    if (ipRateLimited || userRateLimited || agentRateLimited || poolRateLimited) {
      reason = "RATE_LIMITED";
    }
  }
  return reason ? { filtered: true, reason, counted: false } : { filtered: false, reason: null, counted: true };
}

/** Matches traffic-pool-core's working-agent rule for redirect eligibility. */
export function isAgentWorking(status: string, expiresAt: Date | null, now: Date): boolean {
  return status === "ACTIVE" && (expiresAt === null || expiresAt.getTime() > now.getTime());
}

export function hashIp(ip: string | null): string | null {
  return ip == null ? null : createHash("sha256").update(ip).digest("hex");
}

export type LinkInput = {
  engineLinkId: unknown;
  weight?: unknown;
  dailyCap?: unknown;
  position?: unknown;
  enabled?: unknown;
};

export function validateLinkSet(
  owned: Set<string>,
  links: unknown,
):
  | {
      ok: true;
      links: Array<{
        engineLinkId: string;
        weight: number;
        dailyCap: number | null;
        position: number;
        enabled: boolean;
      }>;
    }
  | { ok: false; error: string } {
  if (!Array.isArray(links)) {
    return { ok: false, error: "Links must be an array." };
  }

  const output: Array<{
    engineLinkId: string;
    weight: number;
    dailyCap: number | null;
    position: number;
    enabled: boolean;
  }> = [];
  const seenEngineLinkIds = new Set<string>();

  for (const raw of links as LinkInput[]) {
    if (!raw || typeof raw.engineLinkId !== "string" || !owned.has(raw.engineLinkId)) {
      return { ok: false, error: "Every link must belong to you." };
    }
    if (seenEngineLinkIds.has(raw.engineLinkId)) {
      return { ok: false, error: "Each link can only appear once." };
    }
    seenEngineLinkIds.add(raw.engineLinkId);

    const weight = raw.weight === undefined ? 1 : raw.weight;
    const dailyCap = raw.dailyCap === undefined ? null : raw.dailyCap;
    const position = raw.position === undefined ? 0 : raw.position;
    const enabled = raw.enabled === undefined ? true : raw.enabled;

    if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      return { ok: false, error: "Weight must be an integer from 1 to 100." };
    }
    if (
      !(dailyCap === null ||
        (typeof dailyCap === "number" &&
          Number.isInteger(dailyCap) &&
          dailyCap >= 1 &&
          dailyCap <= 100000))
    ) {
      return { ok: false, error: "Daily cap is invalid." };
    }
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 1000 ||
      typeof enabled !== "boolean"
    ) {
      return { ok: false, error: "Link settings are invalid." };
    }

    output.push({
      engineLinkId: raw.engineLinkId,
      weight: weight as number,
      dailyCap: dailyCap as number | null,
      position: position as number,
      enabled,
    });
  }

  return { ok: true, links: output };
}
