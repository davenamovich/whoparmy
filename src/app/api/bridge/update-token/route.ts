import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { BridgeError, getOrCreateUpdateToken, getUpdateTokenStatus, revokeUpdateTokens } from "@/lib/muse-bridge";

export async function GET() {
  try { const user = await getWhopUser(); return NextResponse.json(await getUpdateTokenStatus(user.id)); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
export async function POST() {
  const headers = { "Cache-Control": "no-store" };
  try { const user = await getWhopUser(); const out = await getOrCreateUpdateToken(user.id); return NextResponse.json({ token: out.token, createdAt: out.createdAt }, { status: 201, headers }); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : err instanceof BridgeError ? err.status : 500, headers }); }
}
export async function DELETE() {
  try { const user = await getWhopUser(); return NextResponse.json({ revoked: await revokeUpdateTokens(user.id) }); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
