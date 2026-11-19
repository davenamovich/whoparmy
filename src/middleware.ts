import { NextRequest, NextResponse } from "next/server";

/**
 * Two jobs:
 *
 * 1. Stamps the request pathname on a header so the root layout (a server
 *    component, which never sees the URL otherwise) can make per-path
 *    decisions — today: the site gate's /gate whitelist (lib/site-gate.ts).
 *
 * 2. API auth floor (2026-11-18, Codex whole-repo review fix): a request
 *    to a non-public /api/* route with NO session cookie gets a clean 401
 *    here instead of reaching a handler. This is a presence check only —
 *    the cookie is verified for real inside lib/auth (getWhopUser), which
 *    throws UnauthorizedError for missing/invalid/orphaned sessions; the
 *    middleware layer just keeps anonymous traffic from ever resolving to
 *    the old anonymous operator fallback. The fallback itself now exists
 *    only behind ALLOW_OPERATOR_FALLBACK=1 (dev/sandbox), which also
 *    disables this check so local dev keeps working.
 *
 * Public paths are the ones that carry their own credentials: OAuth
 * endpoints, signature-verified webhooks, the bridge's code/bearer
 * endpoints, the cron-secret clip worker, the pair-secret Telegram
 * verify, and read-only public status/teaser/redirect surfaces
 * (including /api/showcase, the public live-generation feed proxy).
 */
const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/whop/webhook",
  "/api/whop/status",
  "/api/bridge/exchange",
  "/api/bridge/mcp",
  "/api/bridge/partners",
  "/api/bridge/rotator/go",
  "/api/clips/worker/",
  "/api/telegram/webhook/",
  "/api/telegram/pair/verify",
  "/api/showcase",
  // The trends ingest route carries its own credential (x-trends-key)
  // and rejects bad keys with 401 inside the handler; the middleware
  // floor must not block it first (2026-11-19: the daily X-trends cron
  // failed with 401 "Sign in required" until this line was added).
  "/api/trends/ingest",
  // The public game API carries its own credential (the server-held session
  // id); picks are validated server-side and claim minting is server-only, so
  // the auth floor must not block anonymous players (routes reject bad sessions themselves).
  "/api/doors/pickaphone",
];

// Same value as SESSION_COOKIE in lib/whop.ts — duplicated because
// middleware (edge) cannot import the server lib.
const SESSION_COOKIE_NAME = "pr_session";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/api/") &&
    process.env.ALLOW_OPERATOR_FALLBACK !== "1" &&
    !PUBLIC_API_PREFIXES.some((p) => path.startsWith(p)) &&
    !req.cookies.get(SESSION_COOKIE_NAME)?.value
  ) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
