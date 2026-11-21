import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getBuildFlow, refreshBuildResearch } from "@/lib/build-agent-server";

export const runtime = "nodejs";

/**
 * GET /api/build-agent — the member's Build-an-Agent flow state
 * (Whop Army 2.0, Slice 4). Session-only (middleware floors it);
 * reading also refreshes a running research job to done/failed.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const state = await refreshBuildResearch(user);
    return NextResponse.json({ state: state ?? (await getBuildFlow(user.id)) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the build flow" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
