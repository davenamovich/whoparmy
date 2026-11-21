/**
 * ─── BTC BARRY — agent record, pure core ───────────────────────────
 *
 * Dave's rule (2026-11-19): BTC Barry is available to every Whop
 * Army member who saves their DH Media link — and like every agent,
 * Barry holds a daily traffic pool (Traffic Pool v1). But a stack
 * launch only mints a bridge code: Barry lived in the member's own
 * Muse with NO HiredAgent row, so he held no pool and appeared
 * nowhere on the member's roster. Dave approved closing that gap
 * (2026-11-19): a successful btc-experiment launch creates Barry's
 * agent record.
 *
 * This module is the pure half (the traffic-pool-core precedent):
 * the exact hire shape a launch creates, and the idempotency rule —
 * ONE Barry per member, ever. The server half (lib/barry-agent.ts)
 * does the find-or-create against the DB.
 *
 * Field choices follow the factory hire path (POST /api/agents,
 * lib/blueprint.ts) wherever the schema has a hire convention:
 * - status ACTIVE from birth — an ACTIVE hire with no expiry is a
 *   working agent under the pool core's rules, so Barry holds his
 *   10 slots/day exactly like any other agent.
 * - expiresAt null — Barry is not a 24h REFERRAL grant; nothing
 *   about him lapses.
 * - source "STACK" — he was neither rented (RENTAL) nor earned as a
 *   referral bot (REFERRAL); he arrived via a stack launch.
 * - instructions / toolsJson null — Barry's real instructions are
 *   the stack prompt handed over at launch (it carries a one-time
 *   bridge code and is never stored); he is not a factory CUSTOM
 *   build with standing instructions or a tool selection.
 * - tokenBudget is the caller's to supply (the server half passes
 *   internalBotBudget(plan), the same internal ops cap every hire
 *   carries — Barry himself runs on the member's own credits
 *   through the bridge).
 */

export const BARRY_TEMPLATE_KEY = "btc-barry";
export const BARRY_AGENT_NAME = "BTC Barry";
export const BARRY_SOURCE = "STACK";
export const BARRY_ROLE =
  "The BTC Experiment agent — runs your DH Media experiment from your own Muse: research, content, distribution through the daily traffic pool, and a plain-numbers weekly report.";

export interface BarryHireData {
  userId: string;
  templateKey: string;
  name: string;
  tokenBudget: number;
  tokensUsed: number;
  status: string;
  source: string;
  expiresAt: null;
  role: string;
  instructions: null;
  toolsJson: null;
}

/** The exact HiredAgent create payload for a member's BTC Barry. */
export function barryHireData(userId: string, tokenBudget: number): BarryHireData {
  return {
    userId,
    templateKey: BARRY_TEMPLATE_KEY,
    name: BARRY_AGENT_NAME,
    tokenBudget,
    tokensUsed: 0,
    status: "ACTIVE",
    source: BARRY_SOURCE,
    expiresAt: null,
    role: BARRY_ROLE,
    instructions: null,
    toolsJson: null,
  };
}

/**
 * ─── House-Barry public profile copy ───────────────────────────────
 *
 * Dave (2026-11-21): "never lead with offer, lead with outcome — DH
 * Media is just a tool, it could be any offer." The house Barry's
 * profile copy follows the brand law: the outcome leads, no offer
 * is named, the rotator + tracked stats are the proof surface.
 *
 * PREVIOUS is the shipped default verbatim (Slice 2) — it is kept
 * ONLY as the refresh guard's comparison string: a production row
 * still carrying exactly these values is untouched house copy and
 * may be refreshed to NEXT; anything else is treated as edited by
 * a human and left alone. Category stays "Marketing": the profile
 * taxonomy (lib/agent-profile.ts AGENT_CATEGORIES) is a fixed list
 * with no "Growth" entry, so the outcome category does not exist
 * yet — the description and capabilities carry the outcome lead.
 */
export interface BarryProfileDefaults {
  category: string;
  capabilities: readonly string[];
  description: string;
}

export const BARRY_PROFILE_PREVIOUS: BarryProfileDefaults = {
  category: "Marketing",
  capabilities: ["Marketing", "Content Creation", "Research"],
  description:
    "BTC Barry runs The BTC Experiment for his owner's brand — research, content and distribution through Whop Army, with a plain-numbers weekly report.",
};

export const BARRY_PROFILE_NEXT: BarryProfileDefaults = {
  category: "Marketing",
  capabilities: [
    "Daily content engine",
    "First-video creation",
    "Business research & audit",
    "Rotator distribution",
    "Tracked clicks & stats",
  ],
  description:
    "BTC Barry runs a daily growth experiment for his owner's business — researching the market, creating the day's content, and sending real visitors through his rotator. Every click is tracked and the numbers sit on his profile: an audience that grows on schedule, proven in public.",
};

export interface BarryProfileCurrent {
  description: string | null;
  category: string | null;
  capabilities: string[];
}

export interface BarryProfileRefreshPlan {
  /** Fields to write (only fields that are empty or still carry the
   *  previous house defaults exactly). Absent = leave as-is. */
  updates: { description?: string; category?: string; capabilities?: string[] };
  /** Fields this plan writes. */
  refreshedFields: string[];
  /** Fields left untouched because a human edited them. */
  customizedFields: string[];
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The guarded refresh (Dave, 2026-11-21): per field, write the
 * outcome-led NEXT value only when the current value is empty or
 * equals the PREVIOUS shipped default exactly. A value that is
 * neither empty, nor the previous default, nor already the next
 * default was edited by a human — it is reported customized and
 * never overwritten.
 */
export function planBarryProfileRefresh(current: BarryProfileCurrent): BarryProfileRefreshPlan {
  const updates: BarryProfileRefreshPlan["updates"] = {};
  const refreshedFields: string[] = [];
  const customizedFields: string[] = [];

  const description = current.description?.trim() ? current.description : null;
  if (description === null || description === BARRY_PROFILE_PREVIOUS.description) {
    if (description !== BARRY_PROFILE_NEXT.description) {
      updates.description = BARRY_PROFILE_NEXT.description;
      refreshedFields.push("description");
    }
  } else if (description !== BARRY_PROFILE_NEXT.description) {
    customizedFields.push("description");
  }

  const category = current.category?.trim() ? current.category : null;
  if (category === null || category === BARRY_PROFILE_PREVIOUS.category) {
    if (category !== BARRY_PROFILE_NEXT.category) {
      updates.category = BARRY_PROFILE_NEXT.category;
      refreshedFields.push("category");
    }
  } else if (category !== BARRY_PROFILE_NEXT.category) {
    customizedFields.push("category");
  }

  if (
    current.capabilities.length === 0 ||
    sameStringList(current.capabilities, BARRY_PROFILE_PREVIOUS.capabilities)
  ) {
    if (!sameStringList(current.capabilities, BARRY_PROFILE_NEXT.capabilities)) {
      updates.capabilities = [...BARRY_PROFILE_NEXT.capabilities];
      refreshedFields.push("capabilities");
    }
  } else if (!sameStringList(current.capabilities, BARRY_PROFILE_NEXT.capabilities)) {
    customizedFields.push("capabilities");
  }

  return { updates, refreshedFields, customizedFields };
}

/** The one-line report the provision summary carries. */
export function barryProfileRefreshReport(plan: BarryProfileRefreshPlan): {
  profileRefreshed: boolean;
  reason: string;
} {
  if (plan.refreshedFields.length > 0) {
    const left =
      plan.customizedFields.length > 0
        ? ` Customized field(s) left as-is: ${plan.customizedFields.join(", ")}.`
        : "";
    return {
      profileRefreshed: true,
      reason: `Profile copy refreshed to the outcome-led defaults (${plan.refreshedFields.join(", ")}).${left}`,
    };
  }
  if (plan.customizedFields.length > 0) {
    return { profileRefreshed: false, reason: "Profile copy customized — left as-is." };
  }
  return { profileRefreshed: false, reason: "Profile copy already carries the outcome-led defaults." };
}

export interface BarryCandidate {
  id: string;
  templateKey: string;
  createdAt: Date;
}

function byCreatedThenId<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  const dt = a.createdAt.getTime() - b.createdAt.getTime();
  return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The idempotency rule: from a member's hire rows, the Barry record
 * to reuse — the OLDEST btc-barry row — or null when the member has
 * no Barry yet and one must be created. Reuse is unconditional on
 * status: if the member paused Barry, a re-launch does not silently
 * resurrect him; the record is theirs to resume.
 */
export function selectBarryRecord<T extends BarryCandidate>(candidates: T[]): T | null {
  const barrys = candidates.filter((c) => c.templateKey === BARRY_TEMPLATE_KEY).sort(byCreatedThenId);
  return barrys[0] ?? null;
}
