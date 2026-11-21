import "server-only";
import { db } from "@/lib/db";
import { isDesignatedOperator } from "@/lib/auth";
import { extractAffiliateRef, migratePartnerKey } from "@/lib/offer-catalog";
import { getOfferCatalogWithSource } from "@/lib/offer-catalog-server";
import {
  applyCatalogSeed,
  attemptCatalogSeed,
  type CatalogSeedDb,
  type CatalogSeedOutcome,
} from "@/lib/operator-catalog-seed-core";

export type { CatalogSeedOutcome, CatalogSeedSource } from "@/lib/operator-catalog-seed-core";

/**
 * ─── OPERATOR CATALOG SEED — server wrapper ────────────────────────
 *
 * Pulls the DESIGNATED OPERATOR's links from his own P&R record —
 * the house list_my_offers catalog (lib/offer-catalog-server.ts) —
 * into his EngineLinks, so Barry's rotator lead and profile CTA
 * resolve to his real Muse + Agent37 record links with zero
 * hand-saving (Dave, 2026-11-21: "Links should be pulled from P&R
 * MCP").
 *
 * Operator-only, twice over: every caller already gates on the
 * designated operator (the provision route's requireOperator, the
 * launch route, the operator-gated kit path), and this wrapper
 * re-checks isDesignatedOperator itself — a member id passed here
 * by mistake seeds nothing (attemptCatalogSeed's `enabled` gate;
 * members' links come only from their own bridge sync, untouched).
 *
 * Never throws: the outcome reports how many links were created and
 * which catalog rung served ("live" / "cache" / "snapshot" /
 * "seed"), or "failed" — Barry provisioning treats the pull as
 * best-effort and proceeds with whatever links already exist.
 */
export async function seedOperatorLinksFromOfferCatalog(
  operatorUserId: string,
): Promise<CatalogSeedOutcome> {
  try {
    const user = await db.user.findUnique({
      where: { id: operatorUserId },
      select: { whopId: true, whopUsername: true },
    });
    const enabled = !!user && isDesignatedOperator(user);
    return await attemptCatalogSeed({
      enabled,
      loadCatalog: async () => {
        const { partners, source } = await getOfferCatalogWithSource();
        return { partners, source };
      },
      applySeed: (partners) =>
        applyCatalogSeed(db as unknown as CatalogSeedDb, operatorUserId, partners, {
          migrateKey: migratePartnerKey,
          extractRef: extractAffiliateRef,
        }),
    });
  } catch {
    return { seeded: 0, partners: [], source: "failed", attempted: true };
  }
}
