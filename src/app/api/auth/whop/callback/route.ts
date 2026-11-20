import { NextRequest, NextResponse } from "next/server";
import { getWhopConfig, exchangeWhopCode, fetchWhopUserInfo } from "@/lib/whop";
import { readPkceCookie, clearPkceCookie, setSessionCookie, resolveRedirectUri, canonicalOrigin } from "@/lib/session";
import { upsertWhopUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/gate-paths";

export const runtime = "nodejs";

/**
 * GET /api/auth/whop/callback — OAuth 2.1 redirect target.
 *
 * Per docs.whop.com:
 *   1. Whop returns ?code=...&state=... (or ?error=...).
 *   2. Verify state against the httpOnly PKCE cookie (CSRF).
 *   3. POST https://api.whop.com/oauth/token — JSON
 *      { grant_type: "authorization_code", code, redirect_uri,
 *        client_id, code_verifier } (PKCE, S256).
 *   4. GET https://api.whop.com/oauth/userinfo (Bearer access token)
 *      → { sub: "user_xxx", name, preferred_username, picture, email }.
 *   5. Upsert the user keyed by the verified whopId and issue our own
 *      HMAC-signed session cookie. Whop tokens are never persisted —
 *      access tokens expire after 1 hour by design.
 */
export async function GET(req: NextRequest) {
  // nextUrl.origin is the container bind address behind Railway's
  // proxy (verified live 2026-11-17) — pin redirects to the canonical
  // public origin so members never land on 0.0.0.0:8080.
  const origin = canonicalOrigin(req.nextUrl.origin);
  // Land where the sign-in started (Dave, 2026-11-20): a player who
  // signed in from /claim or /bridge goes back there, not to "/",
  // which the site gate closes. Re-validated here — the cookie is not
  // signed — so only the hand-off pages are ever a destination.
  const stored = await readPkceCookie();
  const back = safeReturnPath(stored?.next) ?? "/";
  const land = (param: string, value: string) => {
    const url = new URL(back, origin);
    url.searchParams.set(param, value);
    return NextResponse.redirect(url.toString(), { status: 302 });
  };
  const fail = (message: string) => land("auth_error", message);

  try {
    const cfg = getWhopConfig();
    if (!cfg.appId) return fail("Whop OAuth is not configured on this deployment.");

    const params = req.nextUrl.searchParams;
    const oauthError = params.get("error");
    if (oauthError) {
      return fail(`Whop OAuth error: ${oauthError}${params.get("error_description") ? ` — ${params.get("error_description")}` : ""}`);
    }

    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code || !returnedState) return fail("Missing code/state in the Whop redirect.");

    await clearPkceCookie();
    if (!stored || returnedState !== stored.state) {
      return fail("Invalid OAuth state — possible CSRF. Please try logging in again.");
    }

    const redirectUri = resolveRedirectUri(origin);
    const tokens = await exchangeWhopCode({
      code,
      redirectUri,
      clientId: cfg.appId,
      codeVerifier: stored.verifier,
    });
    const userInfo = await fetchWhopUserInfo(tokens.access_token);
    if (!userInfo?.sub) return fail("Whop userinfo did not return a user id (missing openid scope?).");

    const user = await upsertWhopUser(userInfo);
    await setSessionCookie(user.id);

    return land("welcome", "whop");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Whop sign-in failed.");
  }
}
