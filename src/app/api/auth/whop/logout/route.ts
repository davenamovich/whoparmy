import { NextResponse } from "next/server";
import { clearSessionCookie, clearPkceCookie } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/auth/whop/logout — clears our signed session cookie and any
 * leftover PKCE state. Whop access tokens (1h expiry) are never stored,
 * so there is nothing to revoke server-side.
 */
export async function POST() {
  await clearSessionCookie();
  await clearPkceCookie();
  return NextResponse.json({ ok: true });
}
