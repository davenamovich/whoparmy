import { NextRequest, NextResponse } from "next/server";

/**
 * Stamps the request pathname on a header so the root layout (a server
 * component, which never sees the URL otherwise) can make per-path
 * decisions — today: the site gate's /gate whitelist (lib/site-gate.ts).
 * This middleware deliberately makes no auth or gating decisions: the
 * gate state lives in the DB, which middleware cannot reach.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
