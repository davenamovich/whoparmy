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

export type SaveBridgeResult =
  | { ok: true; firstSave: boolean; referrerPaid: boolean; state: BridgeState }
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

  for (const [partner, url] of clean) {
    if (url) {
      await db.engineLink.upsert({
        where: { userId_partner: { userId, partner } },
        create: { userId, partner, url },
        update: { url },
      });
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
  if (me && !me.linksSavedAt) {
    const remaining = await db.engineLink.count({ where: { userId } });
    if (remaining > 0) {
      firstSave = true;
      await db.user.update({ where: { id: userId }, data: { linksSavedAt: new Date() } });
      if (me.referredById) {
        await db.user.update({
          where: { id: me.referredById },
          data: { freeGenBalance: { increment: LINK_SAVE_FREE_GENS } },
        });
        referrerPaid = true;
      }
    }
  }

  return { ok: true, firstSave, referrerPaid, state: await getBridgeState(userId) };
}
