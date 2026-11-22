import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { grantFreePlacement } from "@/lib/bridge";
import { getOfferCatalog } from "@/lib/offer-catalog-server";
import { extractAffiliateRef, verifyLinkHost } from "@/lib/offer-catalog";

export const runtime = "nodejs";

/**
 * POST /api/bridge/links/sync — the member's OWN P&R record, synced
 * by their own Muse (Offers-from-MCP, 2026-11-21).
 *
 * Dave's rule: member P&R keys are NEVER stored in Whop Army. So the
 * member's Muse calls list_my_offers on the member's OWN key and
 * posts the result here with their bridge token; each offer whose
 * step is in the house catalog is host-verified against the P&R
 * record and upserted as the member's saved link (source "pr-mcp"),
 * so the saved link literally IS their P&R record's link. Steps the
 * catalog doesn't know are skipped — a member payload never invents
 * catalog entries. The pages stats ride along into an AppSetting
 * snapshot (`offer-stats:<userId>`) for later surfaces.
 *
 * Auth: bridge bearer token only (the token's user is the owner) —
 * same class as POST /api/apps; middleware lets this exact
 * method+path through to authenticate here.
 */

interface SyncOffer {
  step?: unknown;
  link?: unknown;
}
interface SyncPage {
  saveAs?: unknown;
  slug?: unknown;
  views?: unknown;
  visitors?: unknown;
  clicks?: unknown;
}

function bearerOf(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] ?? null;
}

function statNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const bearer = bearerOf(req);
    const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
    if (!credential) {
      return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
    }
    const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;

    const body = (await req.json().catch(() => null)) as { offers?: unknown; pages?: unknown } | null;
    if (!body || !Array.isArray(body.offers)) {
      return NextResponse.json(
        { error: "Send { offers: [{ step, link }], pages?: [{ saveAs, views, visitors, clicks }] }" },
        { status: 400 },
      );
    }

    const catalog = await getOfferCatalog();
    const catalogByKey = new Map(catalog.map((p) => [p.key, p]));
    const stepByPageSlug = new Map(
      catalog.filter((p) => p.pageSlug).map((p) => [p.pageSlug as string, p.key]),
    );

    const saved: string[] = [];
    const skipped: Array<{ step: string; reason: string }> = [];
    for (const raw of body.offers as SyncOffer[]) {
      const step = typeof raw?.step === "string" ? raw.step.trim() : "";
      const link = typeof raw?.link === "string" ? raw.link.trim() : "";
      if (!step) {
        skipped.push({ step: "", reason: "missing step" });
        continue;
      }
      const entry = catalogByKey.get(step);
      if (!entry) {
        skipped.push({ step, reason: "unknown step" });
        continue;
      }
      if (entry.missing) {
        // The step is on the P&R roadmap but the house account has no
        // record for it yet — there is nothing to connect the link to.
        skipped.push({ step, reason: "no P&R record yet (missing on the house account)" });
        continue;
      }
      if (!link) {
        skipped.push({ step, reason: "missing link" });
        continue;
      }
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        skipped.push({ step, reason: "not a valid URL" });
        continue;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        skipped.push({ step, reason: "link must start with https://" });
        continue;
      }
      if (link.length > 500) {
        skipped.push({ step, reason: "link too long" });
        continue;
      }
      const verdict = verifyLinkHost(entry, link);
      if (!verdict.ok) {
        skipped.push({ step, reason: `host mismatch — expected ${verdict.expectedHost}` });
        continue;
      }
      const externalRef = extractAffiliateRef(step, link);
      await db.engineLink.upsert({
        where: { userId_partner: { userId, partner: step } },
        create: { userId, partner: step, url: link, source: "pr-mcp", externalRef },
        update: { url: link, source: "pr-mcp", externalRef },
      });
      // A synced link is a saved link: it earns the offer's free
      // rotator day exactly like a manual save (once per offer, ever).
      await grantFreePlacement(userId, step);
      saved.push(step);
    }

    let statsSynced = false;
    if (Array.isArray(body.pages)) {
      const pages: Record<string, { views: number; visitors: number; clicks: number }> = {};
      for (const raw of body.pages as SyncPage[]) {
        const step =
          (typeof raw?.saveAs === "string" && raw.saveAs.trim()) ||
          (typeof raw?.slug === "string" ? stepByPageSlug.get(raw.slug.trim()) : undefined);
        if (!step || !catalogByKey.has(step)) continue;
        pages[step] = {
          views: statNum(raw.views),
          visitors: statNum(raw.visitors),
          clicks: statNum(raw.clicks),
        };
      }
      const value = JSON.stringify({ syncedAt: new Date().toISOString(), pages });
      const key = `offer-stats:${userId}`;
      await db.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      statsSynced = true;
    }

    return NextResponse.json({ saved, skipped, statsSynced });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not sync your links" },
      { status: 500 },
    );
  }
}
