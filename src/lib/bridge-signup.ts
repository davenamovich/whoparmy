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
