import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getUpdateTokenStatus, mintUpdateToken, revokeUpdateTokens } from "@/lib/muse-bridge";

export async function GET() {
  try { const user = await getWhopUser(); return NextResponse.json(await getUpdateTokenStatus(user.id)); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
export async function POST() {
  try { const user = await getWhopUser(); const out = await mintUpdateToken(user.id); return NextResponse.json({ token: out.token, createdAt: out.createdAt }, { status: 201 }); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
export async function DELETE() {
  try { const user = await getWhopUser(); return NextResponse.json({ revoked: await revokeUpdateTokens(user.id) }); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
