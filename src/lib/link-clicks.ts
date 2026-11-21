import "server-only";
import { db } from "@/lib/db";
import { partnerNameSync } from "@/lib/offer-catalog";

/**
 * ─── LINK CLICKS — the dashboard's click ledger ──────────────────────
 *
 * Dave (2026-11-19): the member dashboard shows clicks. The only
 * clicks this app can honestly count are the ones it serves itself:
 * the Your Links "Sign up" redirect (lib/bridge.ts resolution, served
 * by /api/bridge/signup) and the rotator redirect (/api/bridge/
 * rotator/go). Recording is best-effort — a failed write never blocks
 * the redirect the visitor came for.
 */

export type LinkClickSource = "signup" | "rotator";

export async function recordLinkClick(input: {
  ownerUserId: string | null;
  partner: string;
  source: LinkClickSource;
  visitorUserId?: string | null;
}): Promise<void> {
  try {
    await db.linkClick.create({
      data: {
        ownerUserId: input.ownerUserId,
        partner: input.partner,
        source: input.source,
        visitorUserId: input.visitorUserId ?? null,
      },
    });
  } catch (err) {
    console.error("[link-clicks] record failed:", err);
  }
}

export interface ClickStats {
  total: number;
  signup: number;
  rotator: number;
  byPartner: Array<{ partner: string; name: string; clicks: number }>;
  recent: Array<{ partner: string; name: string; source: string; createdAt: string }>;
}

/** Clicks credited to THIS member's links (owner = the member). */
export async function getClickStats(userId: string): Promise<ClickStats> {
  const [grouped, recent] = await Promise.all([
    db.linkClick.groupBy({
      by: ["partner", "source"],
      where: { ownerUserId: userId },
      _count: { _all: true },
    }),
    db.linkClick.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { partner: true, source: true, createdAt: true },
    }),
  ]);
  const nameOf = (k: string) => partnerNameSync(k);
  let signup = 0;
  let rotator = 0;
  const perPartner = new Map<string, number>();
  for (const g of grouped) {
    if (g.source === "signup") signup += g._count._all;
    if (g.source === "rotator") rotator += g._count._all;
    perPartner.set(g.partner, (perPartner.get(g.partner) ?? 0) + g._count._all);
  }
  return {
    total: signup + rotator,
    signup,
    rotator,
    byPartner: [...perPartner.entries()]
      .map(([partner, clicks]) => ({ partner, name: nameOf(partner), clicks }))
      .sort((a, b) => b.clicks - a.clicks),
    recent: recent.map((r) => ({
      partner: r.partner,
      name: nameOf(r.partner),
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
