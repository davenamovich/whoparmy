import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { startBuildResearch } from "@/lib/build-agent-server";

export const runtime = "nodejs";

/**
 * POST /api/build-agent/research — step 1 of the Build-an-Agent flow:
 * deep research on the member's website, on the existing background
 * research lane (lib/research-jobs.ts). Returns immediately with the
 * flow state; the client polls GET /api/build-agent until the
 * research lands (or is reused from the brand already on file).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { website?: string; brandName?: string };
    const out = await startBuildResearch(user, body.website ?? "", body.brandName);
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json({ state: out.state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start research." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
