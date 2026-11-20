import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getMemberDashboard } from "@/lib/dashboard";

/**
 * The member dashboard: referrals, rotator access, clicks and BTC
 * wallet activity for the signed-in member (lib/dashboard.ts).
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ dashboard: await getMemberDashboard(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your dashboard" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
