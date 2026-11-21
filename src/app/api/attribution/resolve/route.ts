import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  normalizeIdentityKind,
  resolveIdentityLink,
  type IdentityDb,
} from "@/lib/identity";
import { resolveWalletOnChain, type WalletDb } from "@/lib/wallet-bind";
import { telegramPairConfigured, telegramPairSecretOk } from "@/lib/telegram-pair";

export const runtime = "nodejs";

/**
 * POST /api/attribution/resolve — INTERNAL server-to-server (Spine A,
 * 2026-11-21): answer "which Whop Army user owns this alias?" for
 * the bot half (Spine B will call this; no bot code ships here).
 * Gated by the SAME shared secret as Telegram pair verify
 * (x-pair-secret vs TELEGRAM_PAIR_SECRET) so no new secret exists.
 * Body { kind, value } → 200 { userId } | 404 { userId: null }.
 *
 * Bankr connection (2026-11-21): kinds "wallet_evm" / "wallet_solana"
 * / "bankr_ref" resolve through the same spine. Wallet kinds also
 * return agentId when the address is an agent's payout wallet (an
 * OPTIONAL field — the telegram shape is unchanged).
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
  const kind = normalizeIdentityKind(body.kind);
  if (kind === "wallet_evm" || kind === "wallet_solana") {
    const resolved = await resolveWalletOnChain(
      db as unknown as WalletDb,
      kind === "wallet_evm" ? "evm" : "solana",
      body.value,
    );
    if (!resolved) {
      return NextResponse.json({ userId: null }, { status: 404 });
    }
    return NextResponse.json(
      { userId: resolved.userId, agentId: resolved.agentId },
      { headers: { "Cache-Control": "no-store" } },
    );
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
