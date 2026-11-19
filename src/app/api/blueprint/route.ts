import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getBlueprint, draftBlueprint, approveBlueprint, systemSummary } from "@/lib/blueprint";

export const runtime = "nodejs";

/**
 * /api/blueprint — the member's AI-system blueprint + dashboard
 * state (Slice 1, Dave 2026-11-19). GET returns the blueprint (or
 * null) plus the live system summary. POST {action:"draft"}
 * (re)generates a draft from research; POST {action:"approve"}
 * approves it and hires the workforce within the plan's seats.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const [blueprint, summary] = await Promise.all([getBlueprint(user.id), systemSummary(user)]);
    return NextResponse.json({ blueprint, summary });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action === "draft") {
      const blueprint = await draftBlueprint(user);
      return NextResponse.json({ blueprint });
    }
    if (body.action === "approve") {
      const blueprint = await approveBlueprint(user);
      const summary = await systemSummary(user);
      return NextResponse.json({ blueprint, summary });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
