/**
 * ─── SIGN-UP LINK RESOLUTION — pure core ─────────────────────────────
 *
 * Dave's rule (2026-11-19): the Your Links page populates each offer
 * with the REFERRER's link for that offer — a new member signs up
 * under the member who sent them. Only when the referrer has no link
 * saved for that offer does the page fall back to the house example
 * (Dave's own link). A "link" that is not an http(s) URL (the catalog
 * carries text placeholders for Freebuff / Railway) is not a sign-up
 * link at all: no button, the member asks their referrer instead.
 *
 * Kept pure (no db, no server imports) so the rule is unit-testable.
 */

export type SignupSource = "referrer" | "house";

export interface SignupResolution {
  signupUrl: string | null;
  signupSource: SignupSource | null;
}

function httpUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  return url.startsWith("https://") || url.startsWith("http://") ? url : null;
}

/** The sign-up destination for one offer on a member's Your Links page. */
export function resolveSignup(example: string, referrerUrl: string | null | undefined): SignupResolution {
  const fromReferrer = httpUrl(referrerUrl);
  if (fromReferrer) return { signupUrl: fromReferrer, signupSource: "referrer" };
  const fromHouse = httpUrl(example);
  if (fromHouse) return { signupUrl: fromHouse, signupSource: "house" };
  return { signupUrl: null, signupSource: null };
}

// ─── Muse invite CODE resolution (Dave, 2026-11-24) ───────────────
//
// The engine's muse ladder step now stores the invite CODE itself,
// not a link (meme-loop-engine d5fabd23): a member's saved value for
// the muse step may be a bare code, and the house example served from
// list_my_offers is the house code in the same bare form. resolveSignup
// above only understands http(s) URLs, so a bare code resolves to no
// sign-up link at all — the /build Step-0 card needs the CODE itself
// (click-to-copy, redeemed inside Muse's Settings), resolved with
// the same referrer-first / house-fallback rule as every other offer.

/** A Muse invite code: 4–12 alphanumerics (mirrors the engine's
 *  MUSE_INVITE_CODE_RE in credit-ladder.ts). */
export const MUSE_INVITE_CODE_RE = /^[A-Za-z0-9]{4,12}$/;

/** Hosts a genuine Muse invite link can live on (www-insensitive,
 *  exact match — suffix spoofs fail), mirroring STEP_ACCEPTED_HOSTS. */
const MUSE_INVITE_HOSTS = ["plunderandriffle.com", "muse.ai"];

/** Last path segments that are page names, never a code — the bare
 *  splash / join links carry no code and must not yield one. */
const MUSE_PAGE_SEGMENTS = new Set(["join", "invite", "muse-invite", "signup", "sign-up", "redeem", "settings"]);

/**
 * Extract the bare Muse invite code from a saved muse value: the
 * value itself when it is a bare code, or the code carried by a
 * pasted invite link (?code= / ?invite= / a code-shaped last path
 * segment) on one of the accepted hosts. Anything else — a link with
 * no code in it, a foreign host, junk — yields null.
 */
export function extractMuseInviteCode(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (MUSE_INVITE_CODE_RE.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!MUSE_INVITE_HOSTS.includes(host)) return null;
  for (const param of ["code", "invite"]) {
    const carried = url.searchParams.get(param)?.trim();
    if (carried && MUSE_INVITE_CODE_RE.test(carried)) return carried;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && MUSE_INVITE_CODE_RE.test(last) && !MUSE_PAGE_SEGMENTS.has(last.toLowerCase())) return last;
  return null;
}

export interface MuseInviteResolution {
  code: string | null;
  source: SignupSource | null;
}

/** The Muse invite code for a new member: their referrer's saved
 *  muse value first, the house example as the fallback — the same
 *  order resolveSignup applies to sign-up links. */
export function resolveMuseInviteCode(
  example: string,
  referrerValue: string | null | undefined,
): MuseInviteResolution {
  const fromReferrer = extractMuseInviteCode(referrerValue);
  if (fromReferrer) return { code: fromReferrer, source: "referrer" };
  const fromHouse = extractMuseInviteCode(example);
  if (fromHouse) return { code: fromHouse, source: "house" };
  return { code: null, source: null };
}
