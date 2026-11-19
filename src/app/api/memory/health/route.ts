import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { memoryHealth } from "@/lib/clips/memory";

export const runtime = "nodejs";

/**
 * GET /api/memory/health — is memory actually on for this member?
 *
 * Before this route, a misconfigured bridge and a working one with
 * nothing to say looked identical: both silently returned "no memory",
 * by design, so the clip pipeline never breaks. That silence is why
 * approvals were being captured for days with nobody noticing the Memory
 * tab stayed empty.
 *
 * The answer separates the three states:
 *   configured:false                  → MNEMOS_BRIDGE_TOKEN is not set here
 *   configured:true, reachable:false  → the bridge is down or rejecting us
 *   configured:true, reachable:true   → memory is on; facts tells you if
 *                                       anything has been captured yet
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json(await memoryHealth(user.id));
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Memory health couldn't be read",
      },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
