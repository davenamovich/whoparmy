import "server-only";
import { db } from "@/lib/db";
import { listEngineOffers } from "@/lib/engine";
import {
  SEED_CATALOG,
  getActiveCatalog,
  normalizeOffersPayload,
  setActiveCatalog,
  type CatalogPartner,
} from "@/lib/offer-catalog";

/**
 * ─── OFFER CATALOG — server half ────────────────────────────────────
 *
 * Serves the partner catalog from the P&R MCP (list_my_offers on the
 * HOUSE key — the public hub catalog only; a member's own offers
 * never come through here, they arrive over the bridge from the
 * member's own Muse, see /api/bridge/links/sync).
 *
 * Freshness ladder, so the catalog is never empty and never blocks a
 * page on the engine:
 *   1. in-memory cache (TTL 15 min)
 *   2. live list_my_offers fetch → cached + snapshotted to AppSetting
 *   3. last-good AppSetting snapshot (`offer-catalog:v1`)
 *   4. the static verified seed (lib/offer-catalog.ts SEED_CATALOG)
 * Every successful resolution also feeds setActiveCatalog(), which is
 * what the sync consumers (rotator, click ledgers) read.
 */

export const OFFER_CATALOG_TTL_MS = 15 * 60 * 1000;
const SNAPSHOT_KEY = "offer-catalog:v1";

interface Snapshot {
  fetchedAt: string;
  partners: CatalogPartner[];
}

let memoryCache: { fetchedAt: number; partners: CatalogPartner[] } | null = null;
let inflight: Promise<CatalogPartner[]> | null = null;

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: SNAPSHOT_KEY } });
    if (!row) return null;
    const parsed = JSON.parse(row.value) as Snapshot;
    if (!Array.isArray(parsed.partners) || !parsed.partners.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(partners: CatalogPartner[]): Promise<void> {
  const value = JSON.stringify({ fetchedAt: new Date().toISOString(), partners } satisfies Snapshot);
  await db.appSetting
    .upsert({ where: { key: SNAPSHOT_KEY }, create: { key: SNAPSHOT_KEY, value }, update: { value } })
    .catch(() => undefined);
}

async function fetchFromMcp(): Promise<CatalogPartner[]> {
  const payload = await listEngineOffers();
  const partners = normalizeOffersPayload(payload);
  if (!partners.length) throw new Error("list_my_offers returned no offers");
  return partners;
}

/** Resolve the catalog, refreshing from the MCP when the cache is stale. */
export async function getOfferCatalog(now = Date.now()): Promise<CatalogPartner[]> {
  if (memoryCache && now - memoryCache.fetchedAt < OFFER_CATALOG_TTL_MS) {
    return memoryCache.partners;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const partners = await fetchFromMcp();
      memoryCache = { fetchedAt: Date.now(), partners };
      setActiveCatalog(partners);
      await writeSnapshot(partners);
      return partners;
    } catch {
      // Engine unreachable / unconfigured: last-good snapshot, then seed.
      const snapshot = await readSnapshot();
      const partners = snapshot?.partners ?? getActiveCatalog() ?? SEED_CATALOG;
      // Cache the fallback briefly so a down engine is not hammered on
      // every request, but retry well before the full TTL.
      memoryCache = { fetchedAt: Date.now() - (OFFER_CATALOG_TTL_MS - 60_000), partners };
      setActiveCatalog(partners);
      return partners;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test/dev seam: drop the in-memory cache so the next read refetches. */
export function resetOfferCatalogCache(): void {
  memoryCache = null;
  inflight = null;
}
