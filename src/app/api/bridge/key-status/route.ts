import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { BridgeError, getMemberEngineKey, hasLinkedCreditAccount } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * BYOK indicator state (Dave, 2026-11-18).
 *
 * The member's P&R key is NOT a Whop product and is never typed into
 * this app: the engine derives exactly ONE key per Whop customer
 * (HMAC of the bridge secret + the Whop user id + a key version) and
 * Whoparmy fetches it server-to-server when a lane needs it. All
 * this endpoint ever returns is the display snapshot — plan,
 * balance, status — never the key itself.
 *
 * GET  → the stored snapshot (no engine call).
 * POST → a fresh engine check (which also refreshes the snapshot).
 */

interface KeyStatusBody {
  linked: boolean;
  hasWhopId: boolean;
  status: string | null; // ACTIVE | BLOCKED | UNCONFIGURED | null (never checked)
  botPlan: string | null;
  credits: number | null;
  granted: number | null;
  period: string | null;
  lastFetchedAt: string | null;
}

async function snapshot(userId: string, hasWhopId: boolean): Promise<KeyStatusBody> {
  const row = await db.bridgeConnection.findUnique({ where: { userId } }).catch(() => null);
  if (!row) {
    return {
      linked: false,
      hasWhopId,
      status: null,
      botPlan: null,
      credits: null,
      granted: null,
      period: null,
      lastFetchedAt: null,
    };
  }
  return {
    linked: row.status === "ACTIVE",
    hasWhopId,
    status: row.status,
    botPlan: row.botPlan,
    credits: row.credits,
    granted: row.granted,
    period: row.period,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const user = await getWhopUser();
  return NextResponse.json(await snapshot(user.id, hasLinkedCreditAccount(user)));
}

export async function POST() {
  const user = await getWhopUser();
  if (!hasLinkedCreditAccount(user)) {
    return NextResponse.json({ ...(await snapshot(user.id, false)), reason: "no_whop_id" });
  }
  try {
    await getMemberEngineKey(user, { fresh: true });
    return NextResponse.json(await snapshot(user.id, true));
  } catch (err) {
    if (err instanceof BridgeError) {
      // A state, not a crash: BLOCKED / NOT_CONFIGURED already marked
      // the snapshot inside getMemberEngineKey.
      return NextResponse.json({
        ...(await snapshot(user.id, true)),
        reason: err.code.toLowerCase(),
        message: err.message,
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Key check failed" },
      { status: 500 },
    );
  }
}
