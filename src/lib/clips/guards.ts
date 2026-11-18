// The clipping agent's four gates, as code.
//
// The editorial rules live in `.agents/skills/clipping-agent/SKILL.md`
// (meme-loop-engine). In prose they are advice; here they are refusals.
// Each guard throws a ClipGuardError with a code the UI and Muse can show
// in plain words — never a stack trace, never a silent pass.
//
// Keep this file pure: no prisma, no next, no env. It is imported by the
// bridge tools, the worker endpoint and the /clips desk, and it is the one
// place where "is this allowed" is answered.

export const MAX_BATCH = 25;
export const MIN_CLIP_SECONDS = 3;
export const MAX_CLIP_SECONDS = 30;
export const DEFAULT_CLIP_SECONDS = 15;

/** The skill's warning: this string is a placeholder, not a credit. */
export const PLACEHOLDER_CREDIT = "🎬 @creator";

export type ClipStatus =
  | "draft"
  | "queued"
  | "rendering"
  | "ready"
  | "approved"
  | "exported"
  | "failed"
  | "blocked";

export type GuardCode =
  | "NOT_PUBLIC"
  | "PRIVATE_HOST"
  | "UNKNOWN_HOST"
  | "EXPIRING_LINK"
  | "LEAK_SOURCE"
  | "BAD_DURATION"
  | "BATCH_TOO_LARGE"
  | "NO_CREDIT"
  | "PLACEHOLDER_CREDIT"
  | "CREDIT_MISMATCH"
  | "NOT_APPROVED"
  | "CREATOR_BLOCKED"
  | "NO_DISCLOSURE";

export class ClipGuardError extends Error {
  code: GuardCode;
  /** What a person sees. Short, specific, no shame. */
  hint: string;
  constructor(code: GuardCode, hint: string) {
    super(hint);
    this.name = "ClipGuardError";
    this.code = code;
    this.hint = hint;
  }
}

// ─── Gate 4: public material only ───────────────────────────────────

/** Platforms the skill names explicitly. */
const CLIP_PLATFORMS = [
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "instagram.com",
];

/** Direct media links are allowed from anywhere, but only by extension. */
const MEDIA_EXT = /\.(mp4|mov|mp3|m4a|wav)$/i;

/** Hosts whose whole business is leaked or pirated material. */
const LEAK_HOSTS = [
  "gofile.io",
  "anonfiles.com",
  "mega.nz",
  "pixeldrain.com",
  "1fichier.com",
  "datanodes.to",
];

/** Signed URLs expire; a clip must still resolve when the worker runs. */
const SIGNED_QUERY = /(x-amz-signature|x-amz-expires|sig=|token=|expires=)/i;

export interface SourceVerdict {
  host: string;
  kind: "platform" | "media";
}

function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Gate 4. A clip source must be public, resolvable later, and not a
 * leak. If we cannot tell, we refuse — the skill's own rule.
 */
export function isPublicSource(raw: string): SourceVerdict {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ClipGuardError("NOT_PUBLIC", "That is not a link. Paste the clip's URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ClipGuardError("NOT_PUBLIC", "Only http(s) links can be clipped.");
  }
  if (url.protocol === "http:") {
    throw new ClipGuardError("NOT_PUBLIC", "Use the https:// version of that link.");
  }
  if (url.username || url.password) {
    throw new ClipGuardError("NOT_PUBLIC", "Links with a username in them are not public clips.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  // IP literals, loopback, link-local, private ranges, mDNS, tor.
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (
    isIp ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".onion")
  ) {
    throw new ClipGuardError("PRIVATE_HOST", "That address is private. A clip has to be publicly reachable.");
  }
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new ClipGuardError("PRIVATE_HOST", "That address is on a private network, not the public web.");
  }

  if (LEAK_HOSTS.some((h) => hostMatches(host, h))) {
    throw new ClipGuardError(
      "LEAK_SOURCE",
      "That host is used for leaked or pirated files. The clipping agent does not touch it.",
    );
  }

  if (SIGNED_QUERY.test(url.search)) {
    throw new ClipGuardError(
      "EXPIRING_LINK",
      "That link is a signed, expiring URL. Save the public page link instead.",
    );
  }

  const clipperPlatform = CLIP_PLATFORMS.find((h) => hostMatches(host, h));
  if (clipperPlatform) return { host, kind: "platform" };

  if (MEDIA_EXT.test(url.pathname)) return { host, kind: "media" };

  throw new ClipGuardError(
    "UNKNOWN_HOST",
    `${host} is not a clip platform and the link does not end in a media file. Use YouTube, X, TikTok, Instagram, or a direct .mp4/.mp3.`,
  );
}

// ─── Gate 2: credit before posting ──────────────────────────────────

export interface CreditInput {
  creditWho?: string | null;
  creditUrl?: string | null;
  sourceUrl: string;
}

function normaliseHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "");
}

/**
 * Gate 2. A clip without a real creator handle and its source is not
 * publishable — including the engine's own `🎬 @creator` placeholder,
 * which reads like a credit but is not one.
 */
export function assertCredit(input: CreditInput): { who: string; url: string } {
  const who = (input.creditWho ?? "").trim();
  const url = (input.creditUrl ?? "").trim();

  if (!who) {
    throw new ClipGuardError("NO_CREDIT", "No creator credit. Every clip is credited to the account it came from.");
  }
  if (who === PLACEHOLDER_CREDIT || normaliseHandle(who) === "creator") {
    throw new ClipGuardError(
      "PLACEHOLDER_CREDIT",
      "That is the engine's placeholder, not a creator. Put the real handle in.",
    );
  }
  if (!who.startsWith("@") && !who.startsWith("http")) {
    throw new ClipGuardError("NO_CREDIT", "Credit the handle as @name, or the creator's own post URL.");
  }
  if (!url) {
    throw new ClipGuardError("NO_CREDIT", "A credit needs its source link, so anyone can check where it came from.");
  }

  let source: string;
  let credit: string;
  try {
    source = new URL(input.sourceUrl).hostname.toLowerCase();
    credit = url.startsWith("http") ? new URL(url).hostname.toLowerCase() : source;
  } catch {
    throw new ClipGuardError("CREDIT_MISMATCH", "One of those links does not parse, so the credit cannot be checked.");
  }

  // The credit must point at the place the clip came from — not a
  // different platform, and not the clipping page itself.
  if (credit !== source) {
    throw new ClipGuardError(
      "CREDIT_MISMATCH",
      `The credit points at ${credit} but the clip came from ${source}. Credit the actual source.`,
    );
  }

  return { who, url };
}

// ─── Gate 1 + 3: preview, then an explicit yes ──────────────────────

export interface ApprovableClip {
  status: ClipStatus;
  pageUrl?: string | null;
}

/**
 * Gates 1 and 3. Nothing exports before a human has seen the preview
 * and approved that exact clip. Muse and the worker both call this;
 * neither can satisfy it on its own, because `approved` is only ever
 * written by the signed-in review desk.
 */
export function assertApproved(clip: ApprovableClip): void {
  if (clip.status !== "approved") {
    throw new ClipGuardError(
      "NOT_APPROVED",
      clip.status === "draft" || clip.status === "queued" || clip.status === "rendering"
        ? "Not rendered yet — there is no preview to approve."
        : "Not approved. Open /clips and approve this clip before exporting.",
    );
  }
  if (!clip.pageUrl) {
    throw new ClipGuardError("NOT_APPROVED", "Approved but no preview exists. Render it again before exporting.");
  }
}

// ─── Takedown memory ────────────────────────────────────────────────

export interface Takedown {
  creator: string;
}

/**
 * A creator who asked to be removed is blocked everywhere, not just on
 * the page where they complained. Matched on the handle.
 */
export function assertNotTakedown(creator: string | null | undefined, takedowns: Takedown[]): void {
  const handle = normaliseHandle(creator ?? "");
  if (!handle) return;
  const blocked = takedowns.some((t) => normaliseHandle(t.creator) === handle);
  if (blocked) {
    throw new ClipGuardError(
      "CREATOR_BLOCKED",
      `@${handle} asked not to be clipped. That block is permanent — do not use their material again.`,
    );
  }
}

// ─── Fan-page disclosure ────────────────────────────────────────────

/**
 * A fan or clip page says what it is. If the page carries a disclosure
 * ("Not affiliated with …"), it belongs in the copy, not only the bio.
 */
export function assertDisclosure(
  page: { disclosure?: string | null },
  copy: string,
): void {
  const line = (page.disclosure ?? "").trim();
  if (!line) return;
  if (!copy.toLowerCase().includes(line.toLowerCase())) {
    throw new ClipGuardError(
      "NO_DISCLOSURE",
      `This page's copy must carry its disclosure line: "${line}".`,
    );
  }
}

// ─── Intake: duration and batch bounds (the burn guard) ─────────────

export function clipSeconds(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_CLIP_SECONDS;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ClipGuardError("BAD_DURATION", "Clip length must be a number of seconds.");
  }
  const whole = Math.round(n);
  if (whole < MIN_CLIP_SECONDS || whole > MAX_CLIP_SECONDS) {
    throw new ClipGuardError(
      "BAD_DURATION",
      `Clips run ${MIN_CLIP_SECONDS}–${MAX_CLIP_SECONDS} seconds. ${whole}s is outside that.`,
    );
  }
  return whole;
}

/**
 * One batch is up to 25 renders — 25 engine calls on the member's key.
 * Bounded here so nothing downstream can re-queue itself in a loop.
 */
export function dedupeBatch(links: string[]): string[] {
  if (links.length > MAX_BATCH) {
    throw new ClipGuardError(
      "BATCH_TOO_LARGE",
      `That is ${links.length} links. One batch is at most ${MAX_BATCH} — send it in two.`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of links) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
