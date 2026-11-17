import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getResearchJob } from "@/lib/research-jobs";

export const runtime = "nodejs";

/** GET /api/research/[id] — poll one of the member's research jobs. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser(); // authorization anchor
    const { id } = await params;
    const job = await getResearchJob(user.id, id);
    if (!job) return NextResponse.json({ error: "Research job not found." }, { status: 404 });
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the research job." },
      { status: 500 },
    );
  }
}
