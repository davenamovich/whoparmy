/**
 * ─── AGENT ROTATOR OFFER POLICY — pure core (Dave, 2026-11-22) ─────
 *
 * Two rules from Dave:
 *   1. "Each agent only promotes their offers chosen by their owner."
 *      An agent rotator carries the owner's picked partner keys
 *      (AgentRotator.offersJson); a destination whose partner is not
 *      on that list is never served, whatever rows the rotator holds.
 *   2. "Users coming to Barry's page without a referral cycle through
 *      the rotator round robin, and sign up with that user's DH Media
 *      page." A MEMBERS-pool rotator serves EVERY member's saved link
 *      for the picked offers — members get in on the rotator by
 *      saving that offer's link — one member per visit, in turn.
 *      A visitor WITH a referral goes to the referrer's own link for
 *      the offer when they have one saved.
 *
 * Pools:
 *   OWNER   — only the owner's saved links (the original behaviour).
 *   MEMBERS — every member's saved link for the picked offers, and
 *             the pick is always SEQUENTIAL (a weighted pick would
 *             let row weights favour some members over others).
 *
 * Barry: until his owner configures him (offersJson null), house
 * Barry (slug btc-barry) defaults to DH Media + MEMBERS — the rule
 * Dave stated, and the DH-only serve filter this core replaces.
 *
 * Import-free on purpose (the traffic-pool-core precedent) so
 * `node --test` loads it directly; lib/rotator-v2.ts applies it.
 */

export const BARRY_SLUG = "btc-barry";
/** DH Media's canonical P&R MCP step key plus the legacy key. */
export const DH_MEDIA_PARTNER_KEYS: readonly string[] = ["salarium", "dh-media"];

export const ROTATOR_POOLS = ["OWNER", "MEMBERS"] as const;
export type RotatorPool = (typeof ROTATOR_POOLS)[number];
export type RotatorMode = "SEQUENTIAL" | "WEIGHTED";

export const MAX_OFFERS = 20;

export interface RotatorPolicyRow {
  offersJson: string | null;
  pool: string;
  mode: string;
}

export interface RotatorPolicy {
  /** Partner keys this agent may promote; null = no offer filter. */
  offers: string[] | null;
  pool: RotatorPool;
  mode: RotatorMode;
  /** True when the owner has not configured offers and a default applied. */
  defaulted: boolean;
}

/** Parse the stored offer list. Null for unset or unreadable. */
export function parseOffers(json: string | null | undefined): string[] | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return null;
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  } catch {
    return null;
  }
}

/**
 * Validate an owner's offer pick. Keys must be plain partner keys and,
 * when the catalog is known, partners that exist. An empty array is a
 * valid pick: the agent promotes nothing until the owner adds offers.
 */
export function validateOffers(
  input: unknown,
  knownPartners?: ReadonlySet<string>,
): { ok: true; offers: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Offers must be an array of partner keys." };
  if (input.length > MAX_OFFERS) return { ok: false, error: `Pick at most ${MAX_OFFERS} offers.` };
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw.trim())) {
      return { ok: false, error: "Every offer must be a partner key." };
    }
    const key = raw.trim();
    if (knownPartners && !knownPartners.has(key)) return { ok: false, error: `Unknown offer: ${key}.` };
    if (!out.includes(key)) out.push(key);
  }
  return { ok: true, offers: out };
}

export function validatePool(input: unknown): { ok: true; pool: RotatorPool } | { ok: false; error: string } {
  return input === "OWNER" || input === "MEMBERS"
    ? { ok: true, pool: input }
    : { ok: false, error: "Pool must be OWNER or MEMBERS." };
}

/** The policy a rotator actually serves under, defaults applied. */
export function effectivePolicy(row: RotatorPolicyRow, agentSlug: string | null | undefined): RotatorPolicy {
  const stored = parseOffers(row.offersJson);
  const isBarry = agentSlug === BARRY_SLUG;
  const defaulted = stored === null && isBarry;
  const offers = stored ?? (isBarry ? [...DH_MEDIA_PARTNER_KEYS] : null);
  const pool: RotatorPool = row.pool === "MEMBERS" || defaulted ? "MEMBERS" : "OWNER";
  const mode: RotatorMode = pool === "MEMBERS" ? "SEQUENTIAL" : row.mode === "SEQUENTIAL" ? "SEQUENTIAL" : "WEIGHTED";
  return { offers, pool, mode, defaulted };
}

export interface PolicyRow {
  engineLink: { userId: string; partner: string };
}

/** Rows the policy allows: partner on the offer list, and — for an
 *  OWNER pool — the owner's own link. */
export function filterRowsByPolicy<T extends PolicyRow>(rows: T[], policy: RotatorPolicy, ownerUserId: string): T[] {
  return rows.filter((row) => {
    if (policy.offers && !policy.offers.includes(row.engineLink.partner)) return false;
    if (policy.pool === "OWNER" && row.engineLink.userId !== ownerUserId) return false;
    return true;
  });
}

/**
 * Which member links a MEMBERS pool is missing. Candidates are every
 * saved link for the picked offers, oldest first; new rows append
 * after the current last position so existing members keep their
 * place in the round robin.
 */
export function planMemberPoolSync(
  existing: ReadonlyArray<{ engineLinkId: string; position: number }>,
  candidates: ReadonlyArray<{ id: string }>,
): Array<{ engineLinkId: string; position: number }> {
  const have = new Set(existing.map((row) => row.engineLinkId));
  let next = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const out: Array<{ engineLinkId: string; position: number }> = [];
  for (const c of candidates) {
    if (have.has(c.id)) continue;
    have.add(c.id);
    out.push({ engineLinkId: c.id, position: next++ });
  }
  return out;
}

/** The referrer's own row among the allowed rows, if they have one. */
export function referrerRow<T extends PolicyRow>(rows: T[], referrerUserId: string | null): T | null {
  if (!referrerUserId) return null;
  return rows.find((row) => row.engineLink.userId === referrerUserId) ?? null;
}
