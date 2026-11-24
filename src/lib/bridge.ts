import "server-only";
import { db } from "@/lib/db";
import { grantReferralBot } from "@/lib/bot-grants";
import { resolveMuseInviteCode, resolveSignup, type SignupSource } from "@/lib/bridge-signup";
import {
  SEED_CATALOG,
  extractAffiliateRef,
  migratePartnerKey,
  verifyLinkHost,
  type CatalogPartner,
} from "@/lib/offer-catalog";
import { getOfferCatalog } from "@/lib/offer-catalog-server";

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
 *
 * And the referrer's incentive grew a bot (Dave, later the same day):
 * the same first save grants the REFERRER a Meme Smith for 24 hours
 * with real job action behind it (lib/bot-grants.ts) — the +25
 * generations are its fuel once the plan meter is spent.
 */

export const LINK_SAVE_FREE_GENS = 25;

export interface BridgePartner {
  /** Canonical key = the P&R MCP `step` ("muse" for the local extra). */
  key: string;
  name: string;
  blurb: string;
  /** Dave's own link, shown as the placeholder example. */
  example: string;
  /** "mcp" = served from list_my_offers; "local" = Whop Army extra. */
  source: "mcp" | "local";
  /** True when the house P&R account has no link saved for the step. */
  missing: boolean;
  pageSlug: string | null;
}

/**
 * The catalog is served from the P&R MCP (lib/offer-catalog-server.ts);
 * BRIDGE_PARTNERS remains only as the synchronous seed view of it for
 * the rare pure consumer. Everything member-facing goes through
 * getOfferCatalog() so names/links track the P&R record.
 */
export const BRIDGE_PARTNERS: BridgePartner[] = SEED_CATALOG.map((p: CatalogPartner) => ({ ...p }));

export interface BridgePartnerState extends BridgePartner {
  url: string;
  /**
   * The sign-up destination for this offer on this member's page
   * (Dave, 2026-11-19): the member's REFERRER's saved link for the
   * offer, populated so a new member signs up under the member who
   * sent them; the house example only when the referrer has none.
   * Null when neither side has a real URL (text placeholders).
   */
  signupUrl: string | null;
  signupSource: SignupSource | null;
  /** Whose link signupUrl is, when the source is the referrer. */
  signupOwnerId: string | null;
  /**
   * The bare Muse invite CODE for the "muse" partner only (Dave,
   * 2026-11-24): the referrer's saved muse value normalized to its
   * code, house example as fallback — the /build Step-0 card shows it
   * click-to-copy, because the engine now stores codes, not links,
   * and signupUrl (URL-only) can carry neither form. Null for every
   * other partner, and null when neither side's value carries a code.
   */
  inviteCode: string | null;
  inviteCodeSource: SignupSource | null;
}

export interface BridgeState {
  partners: BridgePartnerState[];
  linksSavedAt: string | null;
  hasReferrer: boolean;
  /** Display label for the member who sent this member, if any. */
  referrerLabel: string | null;
  freeGensPerLinkSave: number;
}

export async function getBridgeState(userId: string): Promise<BridgeState> {
  const [user, links, catalog] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { linksSavedAt: true, referredById: true } }),
    db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } }),
    getOfferCatalog(),
  ]);
  // The referrer's own saved links populate the sign-up buttons.
  let referrerLabel: string | null = null;
  const referrerByPartner = new Map<string, string>();
  if (user?.referredById) {
    const [referrer, referrerLinks] = await Promise.all([
      db.user.findUnique({
        where: { id: user.referredById },
        select: { whopUsername: true, name: true },
      }),
      db.engineLink.findMany({
        where: { userId: user.referredById },
        select: { partner: true, url: true },
      }),
    ]);
    referrerLabel = referrer?.whopUsername ?? referrer?.name ?? "your referrer";
    for (const l of referrerLinks) referrerByPartner.set(l.partner, l.url);
  }
  const byPartner = new Map(links.map((l) => [l.partner, l.url]));
  return {
    partners: catalog.map((p) => {
      const signup = resolveSignup(p.example, referrerByPartner.get(p.key));
      const invite = p.key === "muse" ? resolveMuseInviteCode(p.example, referrerByPartner.get(p.key)) : null;
      return {
        ...p,
        url: byPartner.get(p.key) ?? "",
        signupUrl: signup.signupUrl,
        signupSource: signup.signupSource,
        signupOwnerId: signup.signupSource === "referrer" ? (user?.referredById ?? null) : null,
        inviteCode: invite?.code ?? null,
        inviteCodeSource: invite?.source ?? null,
      };
    }),
    linksSavedAt: user?.linksSavedAt?.toISOString() ?? null,
    hasReferrer: Boolean(user?.referredById),
    referrerLabel,
    freeGensPerLinkSave: LINK_SAVE_FREE_GENS,
  };
}

/**
 * The Muse invite code for a visitor who has no member record yet
 * (Dave, 2026-11-24): the /build Step-0 card is shown before sign-in,
 * so the referrer is identified by the ?ref= attribution code (the
 * referrer's User.refCode) instead of a referredById row. Referrer's
 * saved muse value first, house example as fallback — the same
 * resolution a signed-in member gets from getBridgeState above.
 */
export async function getMuseInviteForRef(
  refCode?: string | null,
): Promise<{ code: string | null; source: SignupSource | null }> {
  const catalog = await getOfferCatalog();
  const muse = catalog.find((p) => p.key === "muse");
  let referrerValue: string | null = null;
  const code = refCode?.trim();
  if (code) {
    const referrer = await db.user.findUnique({ where: { refCode: code }, select: { id: true } });
    if (referrer) {
      const link = await db.engineLink.findUnique({
        where: { userId_partner: { userId: referrer.id, partner: "muse" } },
        select: { url: true },
      });
      referrerValue = link?.url ?? null;
    }
  }
  return resolveMuseInviteCode(muse?.example ?? "", referrerValue);
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

/** Grant the free rotator day for one offer; returns true if new.
 *  Exported for the bridge links sync (a synced link is a saved link:
 *  it earns the same free day, idempotently). */
export async function grantFreePlacement(userId: string, partner: string): Promise<boolean> {
  try {
    // Snapshot the URL being saved right now: the earned day serves
    // THIS link. (The rotator used to resolve the member's current
    // link at serve time, so editing a link later silently rewrote
    // the free day the member had already earned.)
    const link = await db.engineLink.findUnique({
      where: { userId_partner: { userId, partner } },
      select: { url: true },
    });
    await db.rotatorPlacement.create({
      data: { userId, partner, date: etTomorrowString(), url: link?.url ?? null },
    });
    return true;
  } catch {
    // Unique violation — already granted (once per offer, ever).
    return false;
  }
}

/**
 * The member's saved offer links, named for agent briefs (Dave,
 * 2026-11-19): links saved on whop.plunderandriffle.com bridge into
 * P&R with the member — the connect brief and the Day-1 setup
 * prompt carry them, so the member's agent promotes with the
 * member's own links from the first connection.
 */
export async function getSavedOfferLinks(userId: string): Promise<{ name: string; url: string }[]> {
  const [links, catalog] = await Promise.all([
    db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } }),
    getOfferCatalog(),
  ]);
  const nameFor = new Map(catalog.map((p) => [p.key, p.name]));
  return links
    .filter((l) => l.url?.trim())
    .map((l) => ({ name: nameFor.get(migratePartnerKey(l.partner)) ?? l.partner, url: l.url }));
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
  const [links, catalog] = await Promise.all([
    db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } }),
    getOfferCatalog(),
  ]);
  for (const l of links) {
    await grantFreePlacement(userId, l.partner);
  }
  const placements = await db.rotatorPlacement.findMany({ where: { userId } });
  const byPartner = new Map(links.map((l) => [l.partner, l.url]));
  const placementByPartner = new Map(placements.map((p) => [p.partner, p]));
  const today = etDateString();
  const offers = catalog.map((p) => {
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
  const catalog = await getOfferCatalog();
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
        partnerName: catalog.find((p) => p.key === migratePartnerKey(pl.partner))?.name ?? pl.partner,
        userId: pl.userId,
        userLabel: pl.user.whopUsername ?? pl.user.name ?? pl.user.email,
        url: link?.url ?? null,
      };
    }),
  );
  return {
    offerSignups: catalog.map((p) => ({
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
      referrerBotGranted: boolean;
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
  const catalog = await getOfferCatalog();
  const catalogByKey = new Map(catalog.map((p) => [p.key, p]));
  const clean = new Map<string, string>();
  for (const [rawKey, raw] of Object.entries(entries)) {
    // Legacy invented keys (fish-audio, dh-media…) migrate to the MCP
    // step on the way in, so a stale UI can never write an old key.
    const key = migratePartnerKey(rawKey);
    const entry = catalogByKey.get(key);
    if (!entry) return { ok: false, error: `Unknown partner: ${rawKey}` };
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
      // Host verification (Offers-from-MCP, 2026-11-21): a saved link
      // must live on the same host as its P&R record, so the saved
      // link provably IS a link for that offer. Local extras and
      // host-less records are exempt (see verifyLinkHost).
      const verdict = verifyLinkHost(entry, url);
      if (!verdict.ok) {
        return {
          ok: false,
          error: `This link doesn't look like a ${entry.name} link — it should be on ${verdict.expectedHost}.`,
        };
      }
    }
    clean.set(key, url);
  }

  const placementsGranted: string[] = [];
  for (const [partner, url] of clean) {
    if (url) {
      const externalRef = extractAffiliateRef(partner, url);
      await db.engineLink.upsert({
        where: { userId_partner: { userId, partner } },
        create: { userId, partner, url, source: "manual", externalRef },
        update: { url, source: "manual", externalRef },
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
  let referrerBotGranted = false;
  let saverPaid = false;
  if (me && !me.linksSavedAt) {
    const remaining = await db.engineLink.count({ where: { userId } });
    if (remaining > 0) {
      // Claim the first-save flip CONDITIONALLY, in one transaction
      // with both balance grants: two concurrent saves used to both
      // read linksSavedAt as null and pay out twice. Only the save
      // whose claim lands pays anyone.
      const claimed = await db.$transaction(async (tx) => {
        const flip = await tx.user.updateMany({
          where: { id: userId, linksSavedAt: null },
          data: { linksSavedAt: new Date(), freeGenBalance: { increment: LINK_SAVE_FREE_GENS } },
        });
        if (flip.count !== 1) return false;
        if (me.referredById) {
          await tx.user.update({
            where: { id: me.referredById },
            data: { freeGenBalance: { increment: LINK_SAVE_FREE_GENS } },
          });
        }
        return true;
      });
      if (claimed) {
        firstSave = true;
        saverPaid = true;
        if (me.referredById) {
          referrerPaid = true;
          // Dave, 2026-11-17: the referrer also gets a bot for 24 hours,
          // with real action behind it — the +25 generations above are
          // its fuel. A grant failure must never fail the link save.
          try {
            referrerBotGranted = Boolean(await grantReferralBot(me.referredById));
          } catch {
            referrerBotGranted = false;
          }
        }
      }
    }
  }

  return {
    ok: true,
    firstSave,
    referrerPaid,
    referrerBotGranted,
    saverPaid,
    placementsGranted,
    state: await getBridgeState(userId),
  };
}
