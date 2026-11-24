/**
 * ─── APPLICATIONS SHOWCASE — pure core (Whop Army 2.0, Slice 3) ────
 *
 * An Application is a public showcase entry for an app a HiredAgent
 * built. Everything testable lives here with no imports: the
 * serializer is the security boundary for /spaces, /spaces/{slug},
 * /api/apps/public/* and the applications section on /agent/{slug} —
 * it exposes ONLY the fields in PublicApplication. The owner's email,
 * the agent's instructions/budgets, the owner's user id and every
 * other member field stay private by construction: they are simply
 * never copied over.
 *
 * An application is public only when its row has public=true. Callers
 * (pages/APIs) enforce that before serializing.
 *
 * Slug + URL rules are the Slice 2 agent-profile rules
 * (lib/agent-profile.ts), mirrored verbatim: the repo's pure cores
 * are import-free so node --test can load them directly, so the
 * helpers cannot be shared by import. Keep the two copies in step.
 */

export const PUBLIC_SITE_ORIGIN = "https://whop.plunderandriffle.com";

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
 * tests). Throws rather than ever returning a slug known to be taken.
 */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "app";
  if (!(await exists(root))) return root;
  for (let n = 2; n <= 100; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${root}".`);
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

export interface PublicApplicationRow {
  slug: string;
  name: string;
  description: string | null;
  liveUrl: string | null;
  screenshotUrl: string | null;
  repoUrl: string | null;
  buildPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
  videoUrl?: string | null;
  priceCents?: number;
  currency?: string;
  category?: string | null;
  demoKind?: string | null;
  buyUrl?: string | null;
  replicationManifest?: string | null;
}

export interface PublicApplicationAgentRow {
  name: string;
  slug: string | null;
  publicProfile: boolean;
}

export interface PublicApplicationOwnerRow {
  name: string | null;
  whopUsername: string | null;
}

export interface PublicApplication {
  name: string;
  slug: string;
  description: string | null;
  liveUrl: string | null;
  screenshotUrl: string | null;
  repoUrl: string | null;
  buildPrompt: string | null;
  createdAt: string;
  updatedAt: string;
  builtBy: {
    agentName: string;
    /** The agent's public slug — only when its profile is public, else null (no link target exists). */
    agentSlug: string | null;
    agentProfilePublic: boolean;
  };
  owner: {
    displayName: string;
  };
  appUrl: string;
  videoUrl: string | null;
  priceCents: number;
  currency: string;
  category: string | null;
  demoKind: "video" | "live" | null;
  buyUrl: string | null;
  replicationManifest: { skills: string[]; keys: string[]; crons: string[] };
}

export function parseReplicationManifest(value: unknown): { skills: string[]; keys: string[]; crons: string[] } {
  const empty = { skills: [] as string[], keys: [] as string[], crons: [] as string[] };
  if (typeof value !== "string") return empty;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return { skills: list(parsed.skills), keys: list(parsed.keys), crons: list(parsed.crons) };
  } catch { return empty; }
}

export function serializePublicApplication(
  app: PublicApplicationRow,
  agent: PublicApplicationAgentRow,
  owner: PublicApplicationOwnerRow,
): PublicApplication {
  const agentProfilePublic = Boolean(agent.publicProfile && agent.slug);
  return {
    name: app.name,
    slug: app.slug,
    description: app.description,
    liveUrl: app.liveUrl,
    screenshotUrl: app.screenshotUrl,
    repoUrl: app.repoUrl,
    buildPrompt: app.buildPrompt,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    builtBy: {
      agentName: agent.name,
      agentSlug: agentProfilePublic ? agent.slug : null,
      agentProfilePublic,
    },
    owner: {
      displayName: owner.name?.trim() || owner.whopUsername?.trim() || "Whop Army member",
    },
    appUrl: `${PUBLIC_SITE_ORIGIN}/spaces/${app.slug}`,
    videoUrl: isHttpUrl(app.videoUrl) ? app.videoUrl : null,
    priceCents: app.priceCents ?? 0,
    currency: app.currency ?? "USD",
    category: app.category ?? null,
    demoKind: app.demoKind === "video" || app.demoKind === "live" ? app.demoKind : null,
    buyUrl: isHttpUrl(app.buyUrl) ? app.buyUrl : null,
    replicationManifest: parseReplicationManifest(app.replicationManifest),
  };
}

/** Shared include shape for public application reads (list + detail). */
export const publicApplicationInclude = {
  agent: { select: { name: true, slug: true, publicProfile: true } },
  user: { select: { name: true, whopUsername: true } },
} as const;

// ─── Write-side field cleaning (POST create + PATCH update) ────────

export interface AppFieldInput {
  name?: unknown;
  description?: unknown;
  liveUrl?: unknown;
  screenshotUrl?: unknown;
  repoUrl?: unknown;
  buildPrompt?: unknown;
  public?: unknown;
  videoUrl?: unknown; priceCents?: unknown; currency?: unknown; category?: unknown; demoKind?: unknown; buyUrl?: unknown; replicationManifest?: unknown;
}

export interface CleanAppData {
  name?: string;
  description?: string | null;
  liveUrl?: string | null;
  screenshotUrl?: string | null;
  repoUrl?: string | null;
  buildPrompt?: string | null;
  public?: boolean;
  videoUrl?: string | null; priceCents?: number; currency?: string; category?: string | null; demoKind?: string | null; buyUrl?: string | null; replicationManifest?: string | null;
}

const URL_FIELD_LABELS = [
  ["liveUrl", "Live URL"],
  ["screenshotUrl", "Screenshot URL"],
  ["repoUrl", "Repository URL"],
  ["videoUrl", "Video URL"],
  ["buyUrl", "Buy URL"],
] as const;

/**
 * Validate + clamp the create/update fields. `partial` (PATCH) skips
 * the name-required rule; a present-but-empty URL clears the field,
 * and every URL must be http/https. Returns a plain error string —
 * the route layer turns it into a 400.
 */
export function cleanAppFields(body: AppFieldInput, partial: boolean): { data: CleanAppData } | { error: string } {
  const data: CleanAppData = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Name is required." };
    data.name = name.slice(0, 80);
  }
  for (const [key, label] of URL_FIELD_LABELS) {
    const value = body[key];
    if (value === undefined) continue;
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      data[key] = null;
      continue;
    }
    if (!isHttpUrl(trimmed)) return { error: `${label} must be an http(s) URL.` };
    data[key] = trimmed.slice(0, 500);
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null;
  }
  if (body.buildPrompt !== undefined) {
    data.buildPrompt = typeof body.buildPrompt === "string" ? body.buildPrompt.trim().slice(0, 8000) || null : null;
  }
  if (typeof body.public === "boolean") data.public = body.public;
  for (const key of ["category", "currency"] as const) if (body[key] !== undefined) {
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if (key === "currency") { if (value && !/^[A-Za-z]{3}$/.test(value)) return { error: "Currency must be a 3-letter code." }; data.currency = (value || "USD").toUpperCase(); }
    else data.category = value.slice(0, 80) || null;
  }
  if (body.priceCents !== undefined) { const n = Number(body.priceCents); if (!Number.isInteger(n) || n < 0) return { error: "Price must be a non-negative integer number of cents." }; data.priceCents = n; }
  if (body.demoKind !== undefined) { if (body.demoKind === null || body.demoKind === "") data.demoKind = null; else if (body.demoKind === "video" || body.demoKind === "live") data.demoKind = body.demoKind; else return { error: "Demo kind must be video or live." }; }
  if (body.replicationManifest !== undefined) { if (body.replicationManifest === null || body.replicationManifest === "") data.replicationManifest = null; else { const value = typeof body.replicationManifest === "string" ? body.replicationManifest : JSON.stringify(body.replicationManifest); try { const parsed = JSON.parse(value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); data.replicationManifest = value.slice(0, 12000); } catch { return { error: "Replication manifest must be valid JSON." }; } } }
  return { data };
}

export interface SpaceGroupItem { owner: { displayName: string }; }
export function groupSpacesByOwner<T extends SpaceGroupItem>(spaces: T[]): Array<{ ownerKey: string; ownerName: string; spaces: T[] }> {
  const groups: Array<{ ownerKey: string; ownerName: string; spaces: T[] }> = [];
  const byName = new Map<string, typeof groups[number]>();
  for (const space of spaces) {
    const ownerName = space.owner.displayName || "Whop Army member";
    let group = byName.get(ownerName);
    if (!group) { group = { ownerKey: ownerName, ownerName, spaces: [] }; byName.set(ownerName, group); groups.push(group); }
    group.spaces.push(space);
  }
  return groups;
}

export const HOUSE_SPACE: PublicApplication = {
  slug: "plunder-riffle-content-engine", name: "P&R Content Engine",
  description: "Enter a business URL and get a real content pack back — all 27 Plunder & Riffle MCP tools behind one approval inbox, run by your own Muse.",
  category: "Content engine", priceCents: 0, currency: "USD", demoKind: "live", videoUrl: null, screenshotUrl: null,
  liveUrl: null, buyUrl: null, repoUrl: null,
  buildPrompt: "Build me a Space called \"P&R Content Engine\" — the SMB owner's front door to the Plunder & Riffle engine.\n\nArchitecture: queue + write-back. The Space holds no keys and runs no inference. Its UI queues jobs; the owner's own Muse (connected over the Plunder & Riffle bridge) claims them, runs the P&R MCP tools on the owner's own credits, and writes results back through the Space's record actions. Nothing publishes, sends, or spends without the owner's approval tap.\n\nFive tabs:\n1. HOME / APPROVAL INBOX — account, brand, and offer snapshots plus every finished preview waiting for the owner's approve/reject tap; approval renders the MP4.\n2. CREATE — eleven one-input tools over the P&R MCP (27 tools total): brand research, audits, memes, slideshows, hot takes, iMessage pieces, scroll and infomercial add-ons, follow-ups. Each tool takes ONE input; the engine populates everything else.\n3. BRAND — save a brand voice as the engine default (hand-written or from a research job), auto-condensed to the engine's 1000-character voice limit, verified by read-back proof.\n4. OFFERS — seed campaigns from finished research briefs; set the owner's call page (their video inside a phone frame, their button at the end).\n5. LIBRARY — every job, newest first, with status, retries, and follow-up creation.\n\nActions: createJob, recordJobUpdate, listJobs, retryJob, createFollowupJob, approveAndRender, refreshSnapshots, recordSnapshot, getDashboard, saveBrand, saveBrandFromJob, saveBrandProfile, condenseBrandProfile, recordBrandSaveResult, createCampaign, setCallPage, setLanguage, dailyEngineCheck.\n\nRecurring: a daily engine-check executor cron (07:15 ET) on the owner's Muse claims queued jobs, polls unfinished ones, and surfaces finished previews for approval.\n\nKeys (names only — the replicator creates their own accounts and their Muse saves their own keys during onboarding): a Plunder & Riffle API key via the bridge. The Space itself stores no secrets.",
  replicationManifest: { skills: ["Queue + write-back Space architecture (the Space holds no keys; the owner's Muse executes)", "Plunder & Riffle MCP bridge — all 27 engine tools, run in the owner's own Muse", "Approval-inbox pattern — previews wait for the owner's tap; approval renders the MP4", "Brand voice save with read-back verification"], keys: ["Plunder & Riffle API key — your own, saved by your Muse via the bridge during onboarding"], crons: ["Daily engine check, 07:15 ET (owner's Muse executor)"] },
  createdAt: "2026-11-24T00:00:00.000Z", updatedAt: "2026-11-24T00:00:00.000Z",
  builtBy: { agentName: "Plunder & Riffle", agentSlug: null, agentProfilePublic: false }, owner: { displayName: "Plunder & Riffle" },
  appUrl: `${PUBLIC_SITE_ORIGIN}/spaces/plunder-riffle-content-engine`,
};
