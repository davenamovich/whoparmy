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
