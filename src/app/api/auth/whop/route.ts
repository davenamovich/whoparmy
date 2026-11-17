import { NextRequest, NextResponse } from "next/server";
import { getWhopConfig, buildWhopAuthorizeUrl, whopPublicStatus } from "@/lib/whop";
import { generatePkcePair, generateState, setPkceCookie, resolveRedirectUri } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/auth/whop — "Log in with Whop" entry point.
 *
 * Builds the OAuth 2.1 + PKCE authorize request per docs.whop.com:
 *   GET https://api.whop.com/oauth/authorize
 *     response_type=code, client_id=app_xxx, redirect_uri (exact match),
 *     scope="openid profile email", state, nonce,
 *     code_challenge (S256), code_challenge_method=S256
 *
 * The PKCE verifier + state are held in a short-lived httpOnly cookie —
 * they never touch the browser's JS.
 */
export async function GET(req: NextRequest) {
  const cfg = getWhopConfig();
  if (!cfg.appId) {
    return NextResponse.json(
      {
        configured: false,
        error: "Whop OAuth is not configured on this deployment.",
        hint: "Set WHOP_APP_ID (app_xxx from https://whop.com/dashboard/developer, OAuth section) and add this callback URL as an exact-match redirect URI: "
          + resolveRedirectUri(req.nextUrl.origin),
        status: whopPublicStatus(),
      },
      { status: 503 },
    );
  }

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();
  const nonce = generateState();
  await setPkceCookie(state, verifier);

  const authorizeUrl = buildWhopAuthorizeUrl({
    clientId: cfg.appId,
    redirectUri: resolveRedirectUri(req.nextUrl.origin),
    state,
    nonce,
    codeChallenge: challenge,
  });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
