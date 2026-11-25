/**
 * Referral capture across the Whop-connection gate (client-side).
 *
 * A visitor can arrive with ?ref=CODE before they have an account —
 * attribution must survive the Connect-with-Whop round trip. The
 * landing page and the bridge teaser stash the code in localStorage;
 * once the visitor is connected, the working bridge page applies it
 * (POST /api/referrals, one-shot server-side) and clears the stash.
 * An explicit ?ref= in the URL always wins over an older stash.
 */

const KEY = "wa_ref";

export function stashRefFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) window.localStorage.setItem(KEY, code);
  } catch {
    // storage unavailable — attribution is best-effort pre-connect
  }
}

/**
 * Stash a page owner's referral code as the visitor's referrer —
 * ONLY when nothing is stashed yet (Dave, 2026-11-24: a user coming
 * through an agent's page is that agent owner's referral; they get
 * their own links later, in Muse). An explicit ?ref= arrival or an
 * earlier referrer always beats a page owner's default, so this
 * never overwrites an existing stash.
 */
export function stashOwnerRef(code: string | null | undefined): void {
  try {
    if (!code || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) return;
    if (!window.localStorage.getItem(KEY)) window.localStorage.setItem(KEY, code);
  } catch {
    // storage unavailable — attribution is best-effort pre-connect
  }
}

export function readStashedRef(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearStashedRef(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
