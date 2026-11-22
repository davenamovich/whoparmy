import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { createBuildAgent } from "@/lib/build-agent-server";

export const runtime = "nodejs";

/**
 * POST /api/build-agent/create — steps 3+4 of the Build-an-Agent
 * flow: design the agent from research + quiz, create its real
 * HiredAgent record (profile prefilled, NOT public), compose the
 * personalized build prompt on the Day-1 machinery, and mint the
 * member's bridge code. Re-running reuses the same agent and mints a
 * fresh code (the mint retires the old one, as everywhere else).
 */
export async function POST(request: Request) {
  try {
    const user = await getWhopUser();
    const body = await request.json().catch(() => ({})) as { walkthrough?: unknown };
    const out = await createBuildAgent(user, { walkthrough: body.walkthrough === true });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(out.result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build your agent." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
