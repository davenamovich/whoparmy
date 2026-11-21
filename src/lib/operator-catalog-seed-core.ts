/**
 * ─── OPERATOR CATALOG SEED — pure core ─────────────────────────────
 *
 * Dave's directive (2026-11-21): "Links should be pulled from P&R
 * MCP." The member side already works that way — a member's Muse
 * syncs their own list_my_offers over the bridge
 * (POST /api/bridge/links/sync). The HOUSE side did not: Barry's
 * CTA strip fell back to hardcoded house URLs because the operator
 * had never hand-saved the muse / agent37_ref links that his own
 * P&R record already holds. Nobody should have to hand-save what
 * the MCP record already holds.
 *
 * This core is the pure half (the barry-rotator-core precedent — no
 * server imports, loadable by `node --test`): which catalog partners
 * become EngineLinks, the create-only application against a
 * structural db, and the never-throwing attempt wrapper the Barry
 * provision flow composes with. The server wrapper
 * (lib/operator-catalog-seed.ts) supplies the real db, the catalog
 * ladder and the designated-operator gate.
 *
 * Rules baked in here:
 * - CREATE-ONLY. A partner the operator already has ANY EngineLink
 *   row for (manual or previously synced, canonical or legacy key
 *   spelling) is skipped — the owner's saved value always wins and
 *   is never overwritten or "refreshed" from the record.
 * - RECORD LINKS ONLY. The URL stored is the catalog partner's
 *   `example` — the P&R record's own destination link for the step
 *   (list_my_offers' `link`). Nothing is invented; partners the
 *   record lists as missing, or with no usable link, are skipped.
 * - SOURCE "pr-mcp". Seeded rows carry the same source as a bridge
 *   sync, because that is what they are: the operator's P&R record,
 *   pulled. The affiliate id is extracted with the catalog's own
 *   extractor, exactly like the member sync.
 * - MUSE. The Muse invite has no MCP step and no page in the
 *   record (verified 2026-11-21: normalizeOffersPayload joins pages
 *   on saveAs and no muse page exists); it reaches the catalog only
 *   as the local-extra partner entry (MUSE_LOCAL_PARTNER, the
 *   verified muse-invite example). The DTO presents it as a partner
 *   entry, so it seeds like any other partner — from that entry.
 * - NO MEMBER SIDE EFFECTS. The member sync's free-rotator-day
 *   grant and offer-stats snapshot are member incentives; they do
 *   not exist here and never run for the operator seed.
 */

import type { CatalogPartner } from "./offer-catalog.ts";

/**
 * The two catalog helpers the seed needs, injected by the caller
 * (the repo rule: test-loadable cores never value-import a sibling
 * module — tsc forbids `.ts` value imports outside tests). The
 * server wrapper passes lib/offer-catalog.ts's real
 * migratePartnerKey / extractAffiliateRef; tests pass the same
 * functions, so the logic stays single-sourced either way.
 */
export interface CatalogSeedDeps {
  /** Canonical step for any partner key (legacy spellings migrate). */
  migrateKey: (key: string) => string;
  /** The affiliate id inside a record link, or null. */
  extractRef: (partner: string, url: string) => string | null;
}

/** Which catalog rung served the pull — mirrors
 *  lib/offer-catalog-server.ts OfferCatalogSource, plus "failed"
 *  when the pull (or the seed write) did not happen at all. */
export type CatalogSeedSource = "cache" | "live" | "snapshot" | "seed" | "failed";

export interface CatalogSeedPlanItem {
  /** Canonical partner key = the MCP step (or "muse"). */
  partner: string;
  /** The record's destination link for the step. */
  url: string;
  /** The operator's affiliate id extracted from the link. */
  externalRef: string | null;
}

/** A catalog link is seedable when it parses as an http(s) URL —
 *  the same acceptance the member sync applies to synced links. */
function usableLink(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return url;
}

/**
 * The seed plan: every catalog partner with a usable record link
 * that the operator has NOT already saved. Existing partners are
 * compared by canonical step (legacy spellings migrate), so a stale
 * "agent37" row blocks an "agent37_ref" duplicate — and wins.
 */
export function planCatalogSeed(
  catalog: CatalogPartner[],
  existingPartners: Iterable<string>,
  deps: CatalogSeedDeps,
): CatalogSeedPlanItem[] {
  const existing = new Set<string>();
  for (const partner of existingPartners) existing.add(deps.migrateKey(partner));
  const planned = new Set<string>();
  const out: CatalogSeedPlanItem[] = [];
  for (const partner of catalog) {
    const step = deps.migrateKey(partner.key);
    if (partner.missing) continue;
    if (existing.has(step) || planned.has(step)) continue;
    const url = usableLink(partner.example);
    if (!url) continue;
    planned.add(step);
    out.push({ partner: step, url, externalRef: deps.extractRef(step, url) });
  }
  return out;
}

// ─── Application (structural db) ────────────────────────────────────

export interface CatalogSeedDb {
  engineLink: {
    findMany(args: {
      where: { userId: string };
      select: { partner: true };
    }): Promise<Array<{ partner: string }>>;
    create(args: {
      data: { userId: string; partner: string; url: string; source: string; externalRef: string | null };
    }): Promise<unknown>;
  };
}

/**
 * Create the planned EngineLinks for ONE user. Create-only by
 * construction: the plan is computed from the user's current rows,
 * and a row that appears concurrently (unique userId+partner) is
 * treated as existing rather than overwritten. Any other write
 * error propagates — the attempt wrapper turns it into "failed".
 */
export async function applyCatalogSeed(
  db: CatalogSeedDb,
  userId: string,
  catalog: CatalogPartner[],
  deps: CatalogSeedDeps,
): Promise<{ seeded: number; partners: string[] }> {
  const existing = await db.engineLink.findMany({ where: { userId }, select: { partner: true } });
  const plan = planCatalogSeed(catalog, existing.map((row) => row.partner), deps);
  const partners: string[] = [];
  for (const item of plan) {
    try {
      await db.engineLink.create({
        data: { userId, partner: item.partner, url: item.url, source: "pr-mcp", externalRef: item.externalRef },
      });
      partners.push(item.partner);
    } catch (err) {
      // A concurrent save won the race for this partner — the
      // owner's row stands, exactly as if it had existed at plan
      // time. Anything else is a real failure.
      if ((err as { code?: unknown } | null)?.code === "P2002") continue;
      throw err;
    }
  }
  return { seeded: partners.length, partners };
}

// ─── The never-throwing attempt ─────────────────────────────────────

export interface CatalogSeedOutcome {
  /** EngineLinks created by this attempt. */
  seeded: number;
  /** Partner keys created, in catalog order. */
  partners: string[];
  /** The catalog rung that served, or "failed". */
  source: CatalogSeedSource;
  /** False when the attempt was not even made (not the designated
   *  operator) — the loader and the writer are never called, so a
   *  non-operator is never seeded. */
  attempted: boolean;
}

/**
 * Compose the pull: gate → load catalog → apply seed. NEVER throws —
 * Barry provisioning is best-effort about links (a catalog outage
 * must not block it), so every failure lands as source "failed"
 * with zero seeded and provisioning continues with whatever links
 * already exist.
 */
export async function attemptCatalogSeed(input: {
  enabled: boolean;
  loadCatalog: () => Promise<{ partners: CatalogPartner[]; source: CatalogSeedSource }>;
  applySeed: (partners: CatalogPartner[]) => Promise<{ seeded: number; partners: string[] }>;
}): Promise<CatalogSeedOutcome> {
  if (!input.enabled) {
    return { seeded: 0, partners: [], source: "failed", attempted: false };
  }
  try {
    const { partners, source } = await input.loadCatalog();
    const applied = await input.applySeed(partners);
    return { seeded: applied.seeded, partners: applied.partners, source, attempted: true };
  } catch {
    return { seeded: 0, partners: [], source: "failed", attempted: true };
  }
}
