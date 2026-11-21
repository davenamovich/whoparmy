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
  // Attribution Spine A (2026-11-21): the two INTERNAL attribution
  // endpoints carry their own credential (x-pair-secret vs
  // TELEGRAM_PAIR_SECRET, checked inside the handlers — same class
  // as pair verify above). /api/attribution/mine is NOT here: it is
  // a member read and stays behind the session floor.
  "/api/attribution/resolve",
  "/api/attribution/pending-referral",
  "/api/showcase",
  // Whop Army 2.0 public agent profiles (Slice 2, 2026-11-21):
  // read-only directory/profile JSON. Handlers serve ONLY agents the
  // owner marked publicProfile, through the lib/agent-profile.ts
  // serializer — same public class as /api/showcase. The member agent
  // routes (/api/agents, /api/agents/[id]) stay behind the floor.
  "/api/agents/public",
  // Whop Army 2.0 public applications (Slice 3, 2026-11-21):
  // read-only showcase JSON. Handlers serve ONLY applications the
  // owner marked public, through the lib/application.ts serializer.
  // The write routes (/api/apps, /api/apps/[id]) stay behind the
  // floor — except a POST to /api/apps itself, which carries its own
  // credentials (session OR bridge bearer token) and is let through
  // by the method check in middleware() below, like /api/bridge/mcp.
  "/api/apps/public",
  // Whop Army 2.0 public rotator marketplace (Slice 5, 2026-11-21):
  // GET /api/rotator/today is read-only public JSON (public-safe
  // serialization only) and GET /api/rotator/launch is a redirect
  // surface in the same class as /api/bridge/rotator/go — the
  // destination is resolved server-side, never taken from the query.
  // No other routes exist under /api/rotator/.
  "/api/rotator/",
  // The trends ingest route carries its own credential (x-trends-key)
  // and rejects bad keys with 401 inside the handler; the middleware
  // floor must not block it first (2026-11-19: the daily X-trends cron
  // failed with 401 "Sign in required" until this line was added).
  "/api/trends/ingest",
  // Expert Panel runner door (2026-11-19): carries its own key
  // (x-panel-key vs PANEL_RUNNER_KEY), checked inside the handler.
  // The member-facing /api/panel stays behind the session floor.
  "/api/panel/runner",
  // The public game API carries its own credential (the server-held session
  // id); picks are validated server-side and claim minting is server-only, so
  // the auth floor must not block anonymous players (routes reject bad sessions themselves).
  "/api/doors/pickaphone",
  "/api/doors/btcgame",
  // The agent game API is public by design: agents authenticate per-call
  // with their registration secret, reads are public game state, and all
  // reward value is controlled server-side by the pool/agent caps and the
  // claim bridge's single-use nonces (2026-11-19, Slice 1).
  "/api/agentgame",
];

// Same value as SESSION_COOKIE in lib/whop.ts — duplicated because
// middleware (edge) cannot import the server lib.
const SESSION_COOKIE_NAME = "pr_session";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // POST /api/apps (Slice 3) authenticates inside the handler —
  // session cookie OR a member's bridge bearer token (prb_…), the
  // same own-credential class as /api/bridge/mcp. Only that exact
  // method+path is let through; /api/apps/[id] writes stay floored.
  const bridgePublishPost = path === "/api/apps" && req.method === "POST";
  // PATCH /api/agents/<id> (Slice 4 addition) authenticates inside
  // the handler the same way — session OR the owner's bridge bearer
  // token, so a member's Muse can manage its own agent's profile.
  // Only that exact method+path shape is let through; every other
  // /api/agents write stays behind the session floor, and the
  // handler itself 401s a bad token / 403s a non-owner.
  const bridgeAgentPatch = /^\/api\/agents\/[^/]+$/.test(path) && req.method === "PATCH";
  if (
    path.startsWith("/api/") &&
    process.env.ALLOW_OPERATOR_FALLBACK !== "1" &&
    !bridgePublishPost &&
    !bridgeAgentPatch &&
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
