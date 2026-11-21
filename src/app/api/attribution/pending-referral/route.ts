import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordPendingReferral, type IdentityDb } from "@/lib/identity";
import { telegramPairConfigured, telegramPairSecretOk } from "@/lib/telegram-pair";

export const runtime = "nodejs";

/**
 * POST /api/attribution/pending-referral — INTERNAL server-to-server
 * (Spine A, 2026-11-21): record that a Telegram-first arrival came
 * via a member's referral BEFORE the arrival has a Whop account.
 * The bot half (Spine B) reports these; the claim fires later, when
 * that Telegram user joins and pairs (pair verify → claim). Same
 * shared-secret gate as pair verify. First referrer wins — an
 * existing pending row is returned as-is, never overwritten.
 * Body { kind: "telegram", value, refCode } →
 *   201 { recorded: true, created: true }  — newly recorded
 *   200 { recorded: true, created: false } — already existed
 *   404 unknown refCode · 400 bad body / unsupported kind
 */
export async function POST(req: NextRequest) {
  if (!telegramPairConfigured()) {
    return NextResponse.json({ error: "attribution not configured" }, { status: 503 });
  }
  if (!telegramPairSecretOk(req.headers.get("x-pair-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    value?: unknown;
    refCode?: unknown;
  };
  if (
    typeof body.kind !== "string" ||
    (typeof body.value !== "string" && typeof body.value !== "number") ||
    !String(body.value).trim() ||
    typeof body.refCode !== "string" ||
    !body.refCode.trim()
  ) {
    return NextResponse.json(
      { error: "kind, value and refCode are required" },
      { status: 400 },
    );
  }
  if (body.kind.trim().toLowerCase() !== "telegram") {
    return NextResponse.json({ error: "unsupported kind" }, { status: 400 });
  }
  const referrer = await db.user.findUnique({
    where: { refCode: body.refCode.trim().toUpperCase() },
    select: { id: true },
  });
  if (!referrer) {
    return NextResponse.json({ error: "unknown refCode" }, { status: 404 });
  }
  const result = await recordPendingReferral(db as unknown as IdentityDb, {
    kind: "telegram",
    value: body.value,
    referrerId: referrer.id,
  });
  if (result.status === "invalid") {
    return NextResponse.json({ error: "kind, value and refCode are required" }, { status: 400 });
  }
  return NextResponse.json(
    { recorded: true, created: result.status === "created" },
    { status: result.status === "created" ? 201 : 200 },
  );
}
