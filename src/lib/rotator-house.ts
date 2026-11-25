/**
 * ─── ROTATOR HOUSE DESTINATIONS (Dave, 2026-11-24) ────────────────
 *
 * "Fix rotator — we should be sending users to dh.media or the BTC
 * experiment."
 *
 * When no member placement is live, the rotator's house fallback may
 * send users to exactly TWO destinations, alternating by ET day:
 *
 *   1. DH Media — Dave's own saved link (the catalog's salarium
 *      example, read live by the caller so a catalog refresh lands
 *      without a restart; the literal below is only the fallback if
 *      the catalog ever loses the entry).
 *   2. The BTC Experiment — the on-site game at /play (R1, Dave
 *      2026-11-24: the game lives on-site; nothing sends users
 *      off-site to play it).
 *
 * Before this module existed, the house pool rotated through the
 * WHOLE offer catalog (Temu, Agent37, Bankr, Whop, …) — verified
 * live 2026-11-24: /api/bridge/rotator/go 302'd to temu.to. The full
 * catalog is for offers presented inside Muse; it is NOT a traffic
 * destination list.
 *
 * Pure module (no imports) so the destination rule is unit-testable
 * without a database.
 */

export const DH_MEDIA_PARTNER = "salarium";
export const DH_MEDIA_NAME = "DH Media";
export const DH_MEDIA_FALLBACK_URL = "https://dh.media/?affid=Vesselprotocol";

export const BTC_EXPERIMENT_PARTNER = "the-btc-experiment";
export const BTC_EXPERIMENT_NAME = "The BTC Experiment";
export const BTC_EXPERIMENT_URL = "https://whop.plunderandriffle.com/play";

export interface HouseDestination {
  partner: string;
  name: string;
  url: string;
}

/** The complete house destination list — two entries, never more.
 *  `dhMediaUrl` is Dave's current DH Media link from the offer
 *  catalog; anything that isn't an http(s) URL falls back to the
 *  saved house link. */
export function houseDestinations(dhMediaUrl?: string | null): HouseDestination[] {
  const dh = typeof dhMediaUrl === "string" && dhMediaUrl.startsWith("http") ? dhMediaUrl : DH_MEDIA_FALLBACK_URL;
  return [
    { partner: DH_MEDIA_PARTNER, name: DH_MEDIA_NAME, url: dh },
    { partner: BTC_EXPERIMENT_PARTNER, name: BTC_EXPERIMENT_NAME, url: BTC_EXPERIMENT_URL },
  ];
}

/** Deterministic daily pick: day-of-year parity alternates the two
 *  house destinations, so the pick is recomputable from the date
 *  alone (same doctrine as the rotator's original house fallback). */
export function pickHouseDestination(dayOfYear: number, dhMediaUrl?: string | null): HouseDestination {
  const pool = houseDestinations(dhMediaUrl);
  return pool[Math.abs(dayOfYear - 1) % pool.length];
}

/**
 * ─── REFERRER CARRY-THROUGH (Dave, 2026-11-24) ─────────────────────
 *
 * Members get their referral links in Muse — a visitor arriving
 * through an agent's page or the daily rotator has NO link yet.
 * Until they get one, they ride under their REFERRER's code:
 * the agent page stashes the owner's code (lib/ref-stash.ts), the
 * rotator carries ?ref= on its links, and when the rotator sends
 * the visitor to the BTC Experiment game, the code rides on the
 * redirect so the game session — and the signup that follows it in
 * Muse — attributes to the referrer. Whether direct or rotator.
 *
 * The ref is appended ONLY to the on-site game URL: member offer
 * destinations (dh.media etc.) already carry the owner's own
 * affiliate id in the URL itself, and an extra ?ref= there could
 * collide with the offer's own parameters.
 */

const REF_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function validRefCode(raw: string | null | undefined): string | null {
  return typeof raw === "string" && REF_CODE_RE.test(raw) ? raw : null;
}

export function isBtcGameUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === "/play" || u.pathname.startsWith("/play/");
  } catch {
    return url === "/play" || url.startsWith("/play?") || url.startsWith("/play/");
  }
}

/** Append the referrer's code to a BTC Experiment game URL. Any
 *  other URL — and any invalid code — returns the URL unchanged. An
 *  existing ref on the game URL is never overwritten. */
export function appendRefToGameUrl(url: string, ref: string | null | undefined): string {
  const code = validRefCode(ref);
  if (!code || !isBtcGameUrl(url)) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.get("ref")) u.searchParams.set("ref", code);
    return u.toString();
  } catch {
    if (/[?&]ref=/.test(url)) return url;
    return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(code)}`;
  }
}
