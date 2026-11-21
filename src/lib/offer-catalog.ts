/**
 * ─── OFFER CATALOG — the P&R MCP is the source of truth ─────────────
 *
 * Dave's order (2026-11-21): offers MUST come from the P&R MCP
 * (`list_my_offers`), and a member's saved link must connect to its
 * P&R record. The join key is the MCP `step` — the same key the MCP's
 * partner pages carry as `saveAs`.
 *
 * Before this module the catalog was a hardcoded list in lib/bridge.ts
 * with INVENTED keys (fish-audio, dh-media, upload-post…) that matched
 * nothing on the P&R side, so a saved EngineLink could never join to
 * its P&R record. The catalog is now keyed by step everywhere:
 * EngineLink.partner stores the step, and the boot migration in
 * scripts/apply-schema.ts rewrites legacy keys (PARTNER_KEY_MIGRATION).
 *
 * This module is PURE (no db, no server imports): normalization, the
 * verified seed, the key migration map, affiliate-ref extraction and
 * host verification. The fetching/caching half lives in
 * lib/offer-catalog-server.ts, which pushes the freshest catalog in
 * via setActiveCatalog() so sync consumers (rotator house pool, name
 * lookups) always resolve against the best known catalog.
 */

export interface CatalogPartner {
  /** Canonical key = the MCP `step` (or "muse" for the local extra). */
  key: string;
  name: string;
  /** The MCP `why` — why a member would promote this offer. */
  blurb: string;
  /** Dave's own link for the offer (the house example). "" when the
   *  house account has not saved one (missing offers). */
  example: string;
  /** "mcp" = from list_my_offers; "local" = Whop Army-only extra. */
  source: "mcp" | "local";
  /** True when the MCP lists the step under `missing` (the house
   *  account has no link saved for it yet). */
  missing: boolean;
  /** The plunderandriffle.com/<slug> partner page, when the MCP
   *  payload carries one for this step. */
  pageSlug: string | null;
}

/**
 * The local extra: the Muse invite has no MCP step (it is not one of
 * the hub offers on the P&R record — it is the workhouse itself).
 * Kept clearly separated (source "local"); saved links under key
 * "muse" keep working and skip host verification.
 */
export const MUSE_LOCAL_PARTNER: CatalogPartner = {
  key: "muse",
  name: "Muse",
  blurb: "Your own Muse agent — the workhouse that builds and runs it all with you.",
  example: "https://www.plunderandriffle.com/muse-invite",
  source: "local",
  missing: false,
  pageSlug: null,
};

/**
 * Static seed built from the LIVE list_my_offers payload verified by
 * Muse on 2026-11-21 (offers' step/name/why/link verbatim; display
 * names cleaned of the " affiliate link" / " referral link" suffix,
 * matching the MCP pages' names where known). The seed is the
 * last-resort fallback so the catalog is never empty: live fetch →
 * AppSetting snapshot → this seed.
 */
export const SEED_CATALOG: CatalogPartner[] = [
  { key: "fishaudio", name: "Fish Audio", blurb: "People you invite sign up to Fish Audio through your link.", example: "https://fish.audio/?fpr=oneminute", source: "mcp", missing: false, pageSlug: "fishaudio" },
  { key: "freebuff", name: "Freebuff", blurb: "People you invite sign up to Freebuff through your link.", example: "https://freebuff.com/get-started?ref=ref-fb33bc2a-9604-43b4-a995-fd690a7b5393&referrer=davenamovich", source: "mcp", missing: false, pageSlug: null },
  { key: "uploadpost", name: "Upload Post", blurb: "People you invite sign up to Upload Post through your link.", example: "https://upload-post.com/?ref=VESSEL", source: "mcp", missing: false, pageSlug: null },
  { key: "railway_ref", name: "Railway", blurb: "People you invite deploy on Railway through your link.", example: "https://railway.com/?referralCode=XO8ClD", source: "mcp", missing: false, pageSlug: null },
  { key: "bankr_ref", name: "Bankr", blurb: "People you invite sign up to Bankr through your link.", example: "https://bankr.bot/terminal?refCode=7FBFB6T6-BNKR", source: "mcp", missing: false, pageSlug: null },
  { key: "polyshares", name: "Polyshares", blurb: "Refer businesses to Polyshares and earn when they license their data to AI labs. Polyshares pays a 6% referral fee.", example: "https://polyshares.com/signup?ref=5a5a23fbd8eab2155ae6cd620284a30d", source: "mcp", missing: false, pageSlug: "polyshares" },
  { key: "amelia", name: "Amelia", blurb: "Refer businesses to Amelia, which pays companies to film work their crew already does. You get a referral bonus from Amelia if they sign up.", example: "https://ameliarobotics.com/referrals?via=21ff4c6135", source: "mcp", missing: false, pageSlug: "amelia" },
  { key: "agent37_ref", name: "Agent 37", blurb: "People you invite sign up to Agent37 through your link. It hosts your own MP4 renderer and AI agent team.", example: "https://www.agent37.com/?via=riffle", source: "mcp", missing: false, pageSlug: "agent37" },
  { key: "temu", name: "Temu", blurb: "People you invite join Temu's affiliate program through your link. Your own Temu product links go into /shop.", example: "https://temu.to/k/pgxcro0opym", source: "mcp", missing: false, pageSlug: null },
  { key: "whop_ref", name: "Whop", blurb: "People you invite start on Whop through your link. It's where a course, community or software gets sold.", example: "https://whop.com/?code=XIGEWN", source: "mcp", missing: false, pageSlug: null },
  { key: "salarium", name: "DH Media", blurb: "People you invite sign up to DH Media through your link, and its Bitcoin-paid offers earn you commission.", example: "https://dh.media/?affid=Vesselprotocol", source: "mcp", missing: false, pageSlug: null },
  { key: "higgsfield", name: "Higgsfield", blurb: "", example: "", source: "mcp", missing: true, pageSlug: null },
  MUSE_LOCAL_PARTNER,
];

/**
 * Legacy invented key → MCP step. Applied by the boot migration to
 * EngineLink / RotatorPlacement / RotatorBid / RotatorDay rows, and
 * at runtime when resolving names or accepting saves from stale UIs.
 * "muse" maps to itself (local extra, unchanged).
 */
export const PARTNER_KEY_MIGRATION: Record<string, string> = {
  "fish-audio": "fishaudio",
  agent37: "agent37_ref",
  "dh-media": "salarium",
  "upload-post": "uploadpost",
  whop: "whop_ref",
  railway: "railway_ref",
  bankr: "bankr_ref",
  freebuff: "freebuff",
  polyshares: "polyshares",
  amelia: "amelia",
  temu: "temu",
  muse: "muse",
};

/** Map any partner key (legacy or current) to its canonical step. */
export function migratePartnerKey(key: string): string {
  return PARTNER_KEY_MIGRATION[key] ?? key;
}

/**
 * The partner's public page on plunderandriffle.com, when the MCP
 * record carries one (pages[].slug joined on saveAs). This is the
 * OFFSITE P&R page a CTA points at — distinct from `example`, which
 * is the affiliate DESTINATION link a saved EngineLink stores.
 * Null when the record has no page for the step.
 */
export function partnerPageUrl(partner: CatalogPartner): string | null {
  return partner.pageSlug ? `https://www.plunderandriffle.com/${partner.pageSlug}` : null;
}

// ─── Active catalog (sync access for pure consumers) ────────────────
// The server half refreshes this from the MCP; until the first
// refresh lands it is the seed. Sync consumers (rotator house pool,
// click/placement name lookups) read here so they never block on the
// network and never see an empty catalog.

let activeCatalog: CatalogPartner[] = SEED_CATALOG;

export function setActiveCatalog(catalog: CatalogPartner[]): void {
  if (catalog.length) activeCatalog = catalog;
}

export function getActiveCatalog(): CatalogPartner[] {
  return activeCatalog;
}

/** Display name for any partner key — legacy keys resolve through the
 *  migration map first; unknown keys fall back to the key itself. */
export function partnerNameSync(key: string): string {
  const step = migratePartnerKey(key);
  return activeCatalog.find((p) => p.key === step)?.name ?? step;
}

/** The catalog entry for any partner key (legacy keys migrate). */
export function catalogEntrySync(key: string): CatalogPartner | null {
  const step = migratePartnerKey(key);
  return activeCatalog.find((p) => p.key === step) ?? null;
}

// ─── list_my_offers normalization ───────────────────────────────────

interface RawOffer {
  step?: unknown;
  name?: unknown;
  why?: unknown;
  link?: unknown;
}
interface RawPage {
  slug?: unknown;
  name?: unknown;
  saveAs?: unknown;
}

function cleanOfferName(name: string): string {
  return name.replace(/\s+(affiliate|referral)\s+link$/i, "").trim();
}

/**
 * Normalize a raw list_my_offers result into catalog partners.
 * Offers come first (payload order); `missing` steps follow, flagged;
 * the Muse local extra is appended last, always. Page names/slugs
 * join on pages.saveAs === step.
 */
export function normalizeOffersPayload(payload: Record<string, unknown>): CatalogPartner[] {
  const offers = Array.isArray(payload.offers) ? (payload.offers as RawOffer[]) : [];
  const missing = Array.isArray(payload.missing) ? (payload.missing as RawOffer[]) : [];
  const pages = Array.isArray(payload.pages) ? (payload.pages as RawPage[]) : [];
  const pageByStep = new Map<string, { name: string; slug: string }>();
  for (const pg of pages) {
    if (typeof pg.saveAs === "string" && pg.saveAs) {
      pageByStep.set(pg.saveAs, {
        name: typeof pg.name === "string" ? pg.name : "",
        slug: typeof pg.slug === "string" ? pg.slug : "",
      });
    }
  }
  const out: CatalogPartner[] = [];
  const seen = new Set<string>();
  const push = (raw: RawOffer, isMissing: boolean) => {
    const step = typeof raw.step === "string" ? raw.step.trim() : "";
    if (!step || seen.has(step)) return;
    seen.add(step);
    const page = pageByStep.get(step);
    const rawName = typeof raw.name === "string" ? raw.name : "";
    out.push({
      key: step,
      name: page?.name || (rawName ? cleanOfferName(rawName) : step),
      blurb: typeof raw.why === "string" ? raw.why : "",
      example: !isMissing && typeof raw.link === "string" ? raw.link : "",
      source: "mcp",
      missing: isMissing,
      pageSlug: page?.slug || null,
    });
  };
  for (const o of offers) push(o, false);
  for (const m of missing) push(m, true);
  out.push(MUSE_LOCAL_PARTNER);
  return out;
}

// ─── Affiliate-ref extraction + host verification ───────────────────

/** Query params that carry a member's affiliate id, in check order. */
const REF_PARAMS = ["fpr", "ref", "via", "affid", "code", "referralCode", "refCode"] as const;

/**
 * Extract the member's affiliate id from their saved link — the value
 * that ties the link to their record on the partner's side. Sources:
 * the REF_PARAMS query params (first non-empty wins), and for Temu
 * the /k/<id> path segment. Null when nothing extractable is present
 * (a bare domain link is still a link; it just carries no ref).
 */
export function extractAffiliateRef(step: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (step === "temu" || parsed.hostname === "temu.to") {
    const m = /^\/k\/([^/?#]+)/.exec(parsed.pathname);
    if (m) return decodeURIComponent(m[1]);
  }
  for (const param of REF_PARAMS) {
    const v = parsed.searchParams.get(param)?.trim();
    if (v) return v;
  }
  return null;
}

/** Host of a URL with the leading "www." stripped; null if unparseable. */
export function normalizedHost(raw: string): string | null {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export type HostVerdict = { ok: true } | { ok: false; expectedHost: string };

/**
 * Verify a member's link belongs to the catalog record for its step:
 * the link's host must equal the house link's host. Exempt (ok) when
 * the partner is a local extra, when the house record has no link
 * (missing offers), or when the house example is not a parseable URL
 * (text placeholders carry no host to check against).
 */
export function verifyLinkHost(entry: CatalogPartner, url: string): HostVerdict {
  if (entry.source === "local") return { ok: true };
  const expected = entry.example ? normalizedHost(entry.example) : null;
  if (!expected) return { ok: true };
  const actual = normalizedHost(url);
  if (actual && actual === expected) return { ok: true };
  return { ok: false, expectedHost: expected };
}
