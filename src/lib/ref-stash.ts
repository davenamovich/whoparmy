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
