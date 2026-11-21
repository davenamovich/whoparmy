import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentityLink, type IdentityDb } from "@/lib/identity";
import { telegramPairConfigured, telegramPairSecretOk } from "@/lib/telegram-pair";

export const runtime = "nodejs";

/**
 * POST /api/attribution/resolve — INTERNAL server-to-server (Spine A,
 * 2026-11-21): answer "which Whop Army user owns this alias?" for
 * the bot half (Spine B will call this; no bot code ships here).
 * Gated by the SAME shared secret as Telegram pair verify
 * (x-pair-secret vs TELEGRAM_PAIR_SECRET) so no new secret exists.
 * Body { kind, value } → 200 { userId } | 404 { userId: null }.
 */
export async function POST(req: NextRequest) {
  if (!telegramPairConfigured()) {
    return NextResponse.json({ error: "attribution not configured" }, { status: 503 });
  }
  if (!telegramPairSecretOk(req.headers.get("x-pair-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; value?: unknown };
  if (
    typeof body.kind !== "string" ||
    !body.kind.trim() ||
    (typeof body.value !== "string" && typeof body.value !== "number") ||
    !String(body.value).trim()
  ) {
    return NextResponse.json({ error: "kind and value are required" }, { status: 400 });
  }
  const userId = await resolveIdentityLink(
    db as unknown as IdentityDb,
    body.kind,
    body.value,
  );
  if (!userId) {
    return NextResponse.json({ userId: null }, { status: 404 });
  }
  return NextResponse.json({ userId }, { headers: { "Cache-Control": "no-store" } });
}
