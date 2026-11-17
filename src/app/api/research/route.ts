import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { startResearchJob } from "@/lib/research-jobs";

export const runtime = "nodejs";

/**
 * POST /api/research — start a background brand deep-research job.
 * Returns the job immediately; the research itself (~2 min) runs
 * detached server-side and clients poll GET /api/research/[id].
 * Brand name + website are both required (deep research starts from
 * the site; the bridge runs on the house key — the member holds no
 * P&R login yet).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser(); // authorization anchor
    const body = (await req.json()) as { brandName?: string; website?: string };
    const brandName = (body.brandName ?? "").trim();
    const website = (body.website ?? "").trim();
    if (!brandName || !website) {
      return NextResponse.json(
        { error: "Brand name and website are both required for deep research." },
        { status: 400 },
      );
    }
    const job = await startResearchJob({ userId: user.id, brandName, website });
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start research." },
      { status: 500 },
    );
  }
}
