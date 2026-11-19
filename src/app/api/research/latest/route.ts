import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { latestResearchJob } from "@/lib/research-jobs";

export const runtime = "nodejs";

/**
 * GET /api/research/latest?website=... — the member's most recent job
 * for a site, so a dialog reopened after closing mid-research resumes
 * the running job (or picks up its finished result) instead of
 * starting over.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getWhopUser(); // authorization anchor
    const website = (req.nextUrl.searchParams.get("website") ?? "").trim();
    if (!website) {
      return NextResponse.json({ error: "Provide a website." }, { status: 400 });
    }
    const job = await latestResearchJob(user.id, website);
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the research job." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
