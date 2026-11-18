import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { captureDecision } from "@/lib/clips/memory";

export const runtime = "nodejs";

const VERDICTS = ["good", "meh", "bad"] as const;
type Verdict = (typeof VERDICTS)[number];

/**
 * POST /api/clips/[id]/feedback — what the member thought.
 *
 * This is the input the free credits are for: someone using the engine for
 * free is telling us whether the clip was any good. It is opinion, never
 * performance — no view counts are stored, inferred or displayed.
 *
 * Two destinations, on purpose:
 *   - `ClipFeedback`: the row the product can count and the member can see.
 *   - mnemos: the *reason*, in their words, so the next brief is better.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as { verdict?: string; note?: string };

    const verdict = VERDICTS.includes(body.verdict as Verdict) ? (body.verdict as Verdict) : null;
    if (!verdict) {
      return NextResponse.json({ error: 'verdict must be one of good, meh, bad.' }, { status: 400 });
    }

    const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    const note = body.note?.trim() || null;

    await db.clipFeedback.create({
      data: { userId: user.id, clipId: clip.id, verdict, note },
    });

    // The verdict is the lesson; the note is the reason. Both are hint-shaped,
    // never rules — see lib/clips/memory.ts.
    void captureDecision({
      userId: user.id,
      pageId: clip.pageId,
      clipId: clip.id,
      decision: verdict === "bad" ? "rejected" : verdict === "good" ? "approved" : "edited",
      note: note ?? `${verdict} — no reason given`,
      original: clip.hook ?? undefined,
      final: clip.caption ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      note:
        verdict === "bad"
          ? "Noted. That's what the feedback is for — it changes the next brief."
          : "Noted. It goes into the next batch's brief, not into any claim about performance.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save that feedback." },
      { status: 500 },
    );
  }
}
