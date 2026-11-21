import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { validateQuizAnswers } from "@/lib/build-agent";
import { saveBuildQuiz } from "@/lib/build-agent-server";

export const runtime = "nodejs";

/**
 * POST /api/build-agent/quiz — step 2 of the Build-an-Agent flow:
 * save the short quiz (7 questions, lib/build-agent.ts). Answers are
 * validated against the quiz definition server-side — a client can
 * never store an answer the design mapping doesn't understand.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { answers?: unknown };
    const validated = validateQuizAnswers(body.answers);
    if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
    const state = await saveBuildQuiz(user, validated.answers);
    return NextResponse.json({ state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the quiz." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
