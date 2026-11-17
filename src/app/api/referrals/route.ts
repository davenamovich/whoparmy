import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { attributeReferral, getReferralState } from "@/lib/referrals";

export const runtime = "nodejs";

/** Your referral state: code, link, recruits, conversions, 30% earnings (SIMULATED until payouts run on a real rail). */
export async function GET() {
  try {
    const user = await getWhopUser();
    const state = await getReferralState(user.id);
    return NextResponse.json({ referrals: state });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load referrals" }, { status: 500 });
  }
}

/** Attribute the signed-in member to a referrer code (one-shot). */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { code?: string };
    if (!body.code) return NextResponse.json({ error: "Missing referral code." }, { status: 400 });
    const result = await attributeReferral(user.id, body.code);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Attribution failed" }, { status: 500 });
  }
}
