import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { revokeBridgeToken, verifyBridgeToken } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * POST /api/bridge/revoke — kill a bridge token two ways:
 * - signed-in member: { tokenId } revokes one of their own tokens;
 * - a bridge token itself (Bearer) revokes itself.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] ?? null;
  if (bearer) {
    const session = await verifyBridgeToken(bearer);
    if (!session) return NextResponse.json({ ok: true }); // already dead
    const ok = await revokeBridgeToken(session.tokenId, session.user.id);
    return NextResponse.json({ ok });
  }
  try {
    const user = await getWhopUser();
    const body = (await req.json().catch(() => ({}))) as { tokenId?: unknown };
    if (typeof body.tokenId !== "string" || !body.tokenId) {
      return NextResponse.json({ error: "Send { tokenId }" }, { status: 400 });
    }
    const ok = await revokeBridgeToken(body.tokenId, user.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not revoke the token" },
      { status: 500 },
    );
  }
}
