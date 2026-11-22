/**
 * ─── AGENT PUBLIC PROFILES — pure core (Whop Army 2.0, Slice 2) ────
 *
 * Everything testable about a HiredAgent's public profile lives here
 * with no imports: slug rules, the category list, capability
 * parse/serialize, and the public serializer. The serializer is the
 * security boundary for /agent/{slug}, /agents and
 * /api/agents/public/* — it exposes ONLY the fields listed in
 * PublicAgentProfile. Token budgets, instructions, tools, the owner's
 * email and every other member field stay private by construction:
 * they are simply never copied over.
 *
 * A profile is public only when the agent row has publicProfile=true
 * AND a slug. Callers (pages/APIs) enforce that before serializing.
 */

import type { PublicAgentAccess, PublicAgentStats } from "./agent-stats-core.ts";

export const AGENT_CATEGORIES = [
  "Research",
  "Business",
  "Marketing",
  "Creative",
  "Developer",
  "Automation",
  "Finance",
  "Data",
  "Personal Assistant",
  "Content",
  "Computer Use",
  "Gaming",
  "AI Infrastructure",
  "Utilities",
  "Other",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export function isAgentCategory(value: unknown): value is AgentCategory {
  return typeof value === "string" && (AGENT_CATEGORIES as readonly string[]).includes(value);
}

/** Lowercase, ASCII, hyphen-separated. Empty string when nothing usable remains. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 60 && SLUG_RE.test(value);
}

/**
 * First free slug for `base`: base, base-2, base-3, … `exists` is the
 * caller's uniqueness probe (a DB lookup in the server layer, a Set in
 * tests). Gives up after 100 collisions and returns the last candidate
 * suffixed with a random-looking tail from the base hash — in practice
 * unreachable, but never returns a slug known to be taken silently:
 * it throws instead.
 */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "agent";
  if (!(await exists(root))) return root;
  for (let n = 2; n <= 100; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${root}".`);
}

/** Capabilities are stored as a JSON array of strings (capabilitiesJson). */
export function capabilitiesToJson(capabilities: readonly string[]): string {
  const clean = [...new Set(capabilities.map((c) => c.trim()).filter(Boolean))].slice(0, 24);
  return JSON.stringify(clean);
}

export function capabilitiesFromJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter(Boolean))].slice(0, 24);
  } catch {
    return [];
  }
}

/** http/https only — anything else (javascript:, data:, relative) is refused. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface PublicProfileAgentRow {
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  description: string | null;
  category: string | null;
  capabilitiesJson: string | null;
  demoUrl: string | null;
  appUrl: string | null;
  gitUrl: string | null;
  buildPrompt: string | null;
  spaceUrl: string | null;
  agent37Ref: string | null;
  status: string;
  createdAt: Date;
}

export interface PublicProfileOwnerRow {
  name: string | null;
  whopUsername: string | null;
  refCode: string | null;
}

export interface PublicAgentProfile {
  name: string;
  slug: string;
  avatarUrl: string | null;
  description: string | null;
  category: string | null;
  capabilities: string[];
  demoUrl: string | null;
  appUrl: string | null;
  gitUrl: string | null;
  buildPrompt: string | null;
  spaceUrl: string | null;
  /** Presence only — the ref itself is never exposed. */
  agent37Connected: boolean;
  status: string;
  createdAt: string;
  owner: {
    displayName: string;
    /** The owner's public referral code, for the profile's referral link. Null when the owner has none yet. */
    refCode: string | null;
  };
  profileUrl: string;
  referralUrl: string | null;
  /** Counted stats + rotator access (2026-11-21). Attached by the
   *  server layer (lib/agent-stats.ts) after serialization — the
   *  pure serializer never computes them, and older consumers can
   *  ignore both blocks. */
  stats?: PublicAgentStats;
  access?: PublicAgentAccess;
}

export const PUBLIC_SITE_ORIGIN = "https://whop.plunderandriffle.com";

/** The fields a bridge token may read back about its owner's agent:
 *  what it may write, plus id, status, slug and the public URL. */
export interface OwnerProfileRow {
  id: string;
  name: string;
  status: string;
  slug: string | null;
  publicProfile: boolean;
  description: string | null;
  category: string | null;
  capabilitiesJson: string | null;
  avatarUrl: string | null;
  demoUrl: string | null;
  appUrl: string | null;
  gitUrl: string | null;
  buildPrompt: string | null;
  spaceUrl: string | null;
}

export interface OwnerProfileView extends Omit<OwnerProfileRow, "capabilitiesJson"> {
  capabilities: string[];
  listed: boolean;
  profileUrl: string | null;
}

/**
 * Owner-facing profile view for the bridge-token routes
 * (GET /api/agents/mine and the PATCH /api/agents/{id} reply). Built
 * field by field from an allowlist, so a full HiredAgent row passed in
 * never leaks instructions, tools, budgets, userId or agent37Ref.
 */
export function ownerProfileView(row: OwnerProfileRow): OwnerProfileView {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    slug: row.slug,
    publicProfile: row.publicProfile,
    description: row.description,
    category: row.category,
    capabilities: capabilitiesFromJson(row.capabilitiesJson),
    avatarUrl: row.avatarUrl,
    demoUrl: row.demoUrl,
    appUrl: row.appUrl,
    gitUrl: row.gitUrl,
    buildPrompt: row.buildPrompt,
    spaceUrl: row.spaceUrl,
    listed: Boolean(row.publicProfile && row.slug),
    profileUrl: row.slug ? `${PUBLIC_SITE_ORIGIN}/agent/${row.slug}` : null,
  };
}

export function serializePublicProfile(agent: PublicProfileAgentRow, owner: PublicProfileOwnerRow): PublicAgentProfile {
  const slug = agent.slug ?? "";
  const displayName = owner.name?.trim() || owner.whopUsername?.trim() || "Whop Army member";
  return {
    name: agent.name,
    slug,
    avatarUrl: agent.avatarUrl,
    description: agent.description,
    category: agent.category,
    capabilities: capabilitiesFromJson(agent.capabilitiesJson),
    demoUrl: agent.demoUrl,
    appUrl: agent.appUrl,
    gitUrl: agent.gitUrl,
    buildPrompt: agent.buildPrompt,
    spaceUrl: agent.spaceUrl,
    agent37Connected: Boolean(agent.agent37Ref),
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    owner: { displayName, refCode: owner.refCode },
    profileUrl: `${PUBLIC_SITE_ORIGIN}/agent/${slug}`,
    referralUrl: owner.refCode ? `${PUBLIC_SITE_ORIGIN}/?ref=${owner.refCode}` : null,
  };
}
