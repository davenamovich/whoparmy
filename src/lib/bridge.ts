import "server-only";
import { db } from "@/lib/db";

/**
 * ─── THE BRIDGE — build your own engine, step one ────────────────────
 *
 * Dave's direction (2026-11-17): members arrive from meme-loop-engine
 * (the P&R bot / hub / Telegram) and land on a simple bridge page —
 * modeled on his Global Content Factory page — where they save THEIR
 * OWN referral links for the ecosystem partners. Saving your links is
 * the start of building your own engine: your stack, your links, your
 * commissions on every tool in it.
 *
 * The first save is also the free-generation trigger (Dave, same day:
 * "users get free generations after new users save their links"): the
 * new user's REFERRER earns LINK_SAVE_FREE_GENS free generations,
 * paid instantly. One grant per new user, ever — the linksSavedAt
 * timestamp is the idempotency anchor. (The grant used to ride on
 * referral conversion; Dave moved it here. Commissions keep their own
 * trigger and eligibility gates — see lib/referrals.ts.)
 *
 * Dave extended it the same day (the trial run-out offer): the SAVER
 * also earns LINK_SAVE_FREE_GENS on that first save — "additional
 * credits if they sign up and save their unique affiliate links."
 * Both sides of one verified first save earn 25; still exactly once
 * per member, ever, anchored on the same linksSavedAt flip.
 */

export const LINK_SAVE_FREE_GENS = 25;

export interface BridgePartner {
  key: string;
  name: string;
  blurb: string;
  /** Dave's own link, shown as the placeholder example. */
  example: string;
}

export const BRIDGE_PARTNERS: BridgePartner[] = [
  {
    key: "agent37",
    name: "Agent 37",
    blurb: "Your AI agent workforce — the team that runs your engine while you sleep.",
    example: "https://agent37.com/?via=riffle",
  },
  {
    key: "fish-audio",
    name: "Fish Audio",
    blurb: "Voice for your content — narration and character voices in minutes.",
    example: "https://fish.audio/?fpr=oneminute",
  },
  {
    key: "muse",
    name: "Muse",
    blurb: "Your own Muse agent — the workhouse that builds and runs it all with you.",
    example: "https://plunderandriffle.com/muse-invite",
  },
  {
    key: "whop",
    name: "Whop",
    blurb: "The storefront — sell your own products and memberships here.",
    example: "https://whop.com/?code=XIGEWN",
  },
  {
    key: "freebuff",
    name: "Freebuff",
    blurb: "Free AI coding help — the on-ramp for builders in your audience.",
    example: "Your Freebuff referral link",
  },
  {
    key: "dh-media",
    name: "DH Media",
    blurb: "Media tools and workflow for creators who publish every day.",
    example: "https://dh.media/?affid=Vesselprotocol",
  },
  {
    key: "upload-post",
    name: "Upload Post",
    blurb: "Post everywhere from one place — the distributor for your content.",
    example: "https://upload-post.com/?ref=VESSEL",
  },
  {
    key: "temu",
    name: "Temu",
    blurb: "Products your audience already buys — meme them, link them.",
    example: "https://temu.to/k/pgxcro0opym",
  },
  {
    key: "bankr",
    name: "Bankr",
    blurb: "The agent wallet layer — crypto rails for your engine.",
    example: "https://bankr.bot/terminal?refCode=7FBFB6T6-BNKR",
  },
  {
    key: "railway",
    name: "Railway",
    blurb: "Where apps deploy — host your own stack the way this one runs.",
    example: "Your Railway referral link",
  },
];

const PARTNER_KEYS = new Set(BRIDGE_PARTNERS.map((p) => p.key));

export interface BridgeState {
  partners: Array<BridgePartner & { url: string }>;
  linksSavedAt: string | null;
  hasReferrer: boolean;
  freeGensPerLinkSave: number;
}

export async function getBridgeState(userId: string): Promise<BridgeState> {
  const [user, links] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { linksSavedAt: true, referredById: true } }),
    db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } }),
  ]);
  const byPartner = new Map(links.map((l) => [l.partner, l.url]));
  return {
    partners: BRIDGE_PARTNERS.map((p) => ({ ...p, url: byPartner.get(p.key) ?? "" })),
    linksSavedAt: user?.linksSavedAt?.toISOString() ?? null,
    hasReferrer: Boolean(user?.referredById),
    freeGensPerLinkSave: LINK_SAVE_FREE_GENS,
  };
}

// ─── Affiliate Manager: free rotator placements ─────────────────────
// Dave's rule (2026-11-17): signing up for an offer earns 24 hours
// free in the rotator for THAT offer. The observable signup is the
// link save. One placement per offer per member, ever — the
// RotatorPlacement row's unique (userId, partner) is the grant
// record — scheduled for the NEXT ET day. The Affiliate Manager
// (getAffiliateState below) tracks every offer's state per member.

function etDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function etTomorrowString(): string {
  return etDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

/** Grant the free rotator day for one offer; returns true if new. */
async function grantFreePlacement(userId: string, partner: string): Promise<boolean> {
  try {
    await db.rotatorPlacement.create({
      data: { userId, partner, date: etTomorrowString() },
    });
    return true;
  } catch {
    // Unique violation — already granted (once per offer, ever).
    return false;
  }
}

export interface AffiliateOfferState extends BridgePartner {
  url: string;
  joined: boolean;
  placement: { date: string; live: boolean } | null;
}

export interface AffiliateState {
  offers: AffiliateOfferState[];
  joinedCount: number;
  offerCount: number;
  freeDaysEarned: number;
  liveToday: number;
}

/**
 * The Affiliate Manager's per-member view: every offer, whether the
 * member joined it (link saved), and the free rotator day it earned.
 * Reading the state backfills placements for links saved before the
 * feature existed, so early members are not shorted their days.
 */
export async function getAffiliateState(userId: string): Promise<AffiliateState> {
  const links = await db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } });
  for (const l of links) {
    await grantFreePlacement(userId, l.partner);
  }
  const placements = await db.rotatorPlacement.findMany({ where: { userId } });
  const byPartner = new Map(links.map((l) => [l.partner, l.url]));
  const placementByPartner = new Map(placements.map((p) => [p.partner, p]));
  const today = etDateString();
  const offers = BRIDGE_PARTNERS.map((p) => {
    const placement = placementByPartner.get(p.key);
    return {
      ...p,
      url: byPartner.get(p.key) ?? "",
      joined: byPartner.has(p.key),
      placement: placement ? { date: placement.date, live: placement.date === today } : null,
    };
  });
  return {
    offers,
    joinedCount: offers.filter((o) => o.joined).length,
    offerCount: offers.length,
    freeDaysEarned: placements.length,
    liveToday: offers.filter((o) => o.placement?.live && o.joined).length,
  };
}

export interface AffiliateOverview {
  offerSignups: Array<{ partner: string; name: string; signups: number }>;
  placements: Array<{
    date: string;
    partner: string;
    partnerName: string;
    userId: string;
    userLabel: string;
    url: string | null; // null = the member deleted the link; the placement sits out
  }>;
  membersWithLinks: number;
}

/** Operator view for the Affiliate Manager: who signed up for what,
 *  and whose free rotator days are coming up. */
export async function getAffiliateOverview(): Promise<AffiliateOverview> {
  const [grouped, placements, members] = await Promise.all([
    db.engineLink.groupBy({ by: ["partner"], _count: { _all: true } }),
    db.rotatorPlacement.findMany({
      where: { date: { gte: etDateString() } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 60,
      include: { user: { select: { name: true, email: true, whopUsername: true } } },
    }),
    db.engineLink.findMany({ select: { userId: true }, distinct: ["userId"] }),
  ]);
  const counts = new Map(grouped.map((g) => [g.partner, g._count._all]));
  const resolved = await Promise.all(
    placements.map(async (pl) => {
      const link = await db.engineLink.findUnique({
        where: { userId_partner: { userId: pl.userId, partner: pl.partner } },
        select: { url: true },
      });
      return {
        date: pl.date,
        partner: pl.partner,
        partnerName: BRIDGE_PARTNERS.find((p) => p.key === pl.partner)?.name ?? pl.partner,
        userId: pl.userId,
        userLabel: pl.user.whopUsername ?? pl.user.name ?? pl.user.email,
        url: link?.url ?? null,
      };
    }),
  );
  return {
    offerSignups: BRIDGE_PARTNERS.map((p) => ({
      partner: p.key,
      name: p.name,
      signups: counts.get(p.key) ?? 0,
    })),
    placements: resolved,
    membersWithLinks: members.length,
  };
}

export type SaveBridgeResult =
  | {
      ok: true;
      firstSave: boolean;
      referrerPaid: boolean;
      saverPaid: boolean;
      placementsGranted: string[];
      state: BridgeState;
    }
  | { ok: false; error: string };

/**
 * Upsert the member's partner links. Empty string clears a link.
 * The first save that leaves at least one link in place flips
 * linksSavedAt and pays the referrer's free generations — exactly
 * once per member, ever.
 */
export async function saveBridgeLinks(
  userId: string,
  entries: Record<string, unknown>,
): Promise<SaveBridgeResult> {
  const clean = new Map<string, string>();
  for (const [key, raw] of Object.entries(entries)) {
    if (!PARTNER_KEYS.has(key)) return { ok: false, error: `Unknown partner: ${key}` };
    if (typeof raw !== "string") return { ok: false, error: `Link for ${key} must be text.` };
    const url = raw.trim();
    if (url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, error: `That doesn't look like a link: ${url.slice(0, 60)}` };
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "Links must start with https://" };
      }
      if (url.length > 500) return { ok: false, error: "That link is too long." };
    }
    clean.set(key, url);
  }

  const placementsGranted: string[] = [];
  for (const [partner, url] of clean) {
    if (url) {
      await db.engineLink.upsert({
        where: { userId_partner: { userId, partner } },
        create: { userId, partner, url },
        update: { url },
      });
      // Signing up for an offer earns its free rotator day.
      if (await grantFreePlacement(userId, partner)) placementsGranted.push(partner);
    } else {
      await db.engineLink.deleteMany({ where: { userId, partner } });
    }
  }

  const me = await db.user.findUnique({
    where: { id: userId },
    select: { linksSavedAt: true, referredById: true },
  });
  let firstSave = false;
  let referrerPaid = false;
  let saverPaid = false;
  if (me && !me.linksSavedAt) {
    const remaining = await db.engineLink.count({ where: { userId } });
    if (remaining > 0) {
      firstSave = true;
      await db.user.update({
        where: { id: userId },
        data: { linksSavedAt: new Date(), freeGenBalance: { increment: LINK_SAVE_FREE_GENS } },
      });
      saverPaid = true;
      if (me.referredById) {
        await db.user.update({
          where: { id: me.referredById },
          data: { freeGenBalance: { increment: LINK_SAVE_FREE_GENS } },
        });
        referrerPaid = true;
      }
    }
  }

  return {
    ok: true,
    firstSave,
    referrerPaid,
    saverPaid,
    placementsGranted,
    state: await getBridgeState(userId),
  };
}
