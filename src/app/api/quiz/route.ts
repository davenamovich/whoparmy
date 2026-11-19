import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getQuiz, isAgentPathId, isPromotingId, saveQuiz } from "@/lib/quiz";

export const runtime = "nodejs";

/**
 * The front-door quiz (lib/quiz.ts): GET returns the member's saved
 * answers (or null — the home page shows the quiz), POST saves them.
 * A skip is a record too, so the quiz never nags twice.
 */

export async function GET() {
  const user = await getWhopUser();
  const quiz = await getQuiz(user.id);
  return NextResponse.json({ quiz }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getWhopUser();
  const body = (await req.json().catch(() => null)) as { promoting?: unknown; agentPath?: unknown; skipped?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (body.skipped === true) {
    const quiz = await saveQuiz(user.id, { promoting: null, agentPath: null, skipped: true });
    return NextResponse.json({ quiz }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!isPromotingId(body.promoting) || !isAgentPathId(body.agentPath)) {
    return NextResponse.json({ error: "Pick an answer for both questions" }, { status: 400 });
  }
  const quiz = await saveQuiz(user.id, { promoting: body.promoting, agentPath: body.agentPath });
  return NextResponse.json({ quiz }, { headers: { "Cache-Control": "no-store" } });
}
