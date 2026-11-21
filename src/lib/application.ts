/**
 * ─── APPLICATIONS SHOWCASE — pure core (Whop Army 2.0, Slice 3) ────
 *
 * An Application is a public showcase entry for an app a HiredAgent
 * built. Everything testable lives here with no imports: the
 * serializer is the security boundary for /apps, /apps/{slug},
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
    appUrl: `${PUBLIC_SITE_ORIGIN}/apps/${app.slug}`,
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
}

export interface CleanAppData {
  name?: string;
  description?: string | null;
  liveUrl?: string | null;
  screenshotUrl?: string | null;
  repoUrl?: string | null;
  buildPrompt?: string | null;
  public?: boolean;
}

const URL_FIELD_LABELS = [
  ["liveUrl", "Live URL"],
  ["screenshotUrl", "Screenshot URL"],
  ["repoUrl", "Repository URL"],
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
  return { data };
}
