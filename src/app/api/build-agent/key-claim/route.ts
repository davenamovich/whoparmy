import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { BridgeError, getMemberEngineKey, mintBridgeKeyClaim } from "@/lib/muse-bridge";
export const runtime = "nodejs";
export async function POST() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const user = await getWhopUser();
    await getMemberEngineKey(user, { fresh: true });
    const claim = await mintBridgeKeyClaim(user.id);
    return NextResponse.json({ claimLink: `https://whop.plunderandriffle.com/key-claim/${claim.code}`, expiresAt: claim.expiresAt.toISOString() }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json({ error: "A durable key claim is not available for this account." }, { status: error instanceof BridgeError ? error.status : 401, headers });
  }
}
