import { NextRequest, NextResponse } from "next/server";
import { panelQueue, markPanelInReview, savePanelVerdict, type PanelVerdict } from "@/lib/panel";

export const runtime = "nodejs";

/**
 * /api/panel/runner — the operator-side swarm runner's door
 * (Dave, 2026-11-19). Same shape as /api/trends/ingest: the
 * route carries its own credential (x-panel-key vs
 * PANEL_RUNNER_KEY) because the Board swarm runs on the
 * operator's machine, where the Board login lives.
 *   GET  → the queue (queued members + the material to review)
 *   POST {userId, boardTasks} → mark in-review
 *   POST {userId, verdict}    → store the synthesized verdict
 */
function authorized(req: NextRequest): NextResponse | null {
  const key = process.env.PANEL_RUNNER_KEY;
  if (!key) return NextResponse.json({ error: "Panel runner not configured" }, { status: 503 });
  if (req.headers.get("x-panel-key") !== key) {
    return NextResponse.json({ error: "Bad panel key" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = authorized(req);
  if (denied) return denied;
  return NextResponse.json({ queue: await panelQueue() });
}

export async function POST(req: NextRequest) {
  const denied = authorized(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    userId?: unknown;
    boardTasks?: unknown;
    verdict?: unknown;
  };
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (Array.isArray(body.boardTasks)) {
    await markPanelInReview(body.userId, body.boardTasks.filter((t): t is string => typeof t === "string"));
    return NextResponse.json({ ok: true, marked: "in-review" });
  }
  if (body.verdict && typeof body.verdict === "object") {
    const v = body.verdict as PanelVerdict;
    if (typeof v.summary !== "string" || !Array.isArray(v.lenses) || !Array.isArray(v.fixes)) {
      return NextResponse.json({ error: "verdict needs summary, lenses[], fixes[]" }, { status: 400 });
    }
    await savePanelVerdict(body.userId, { ...v, reviewedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, marked: "reviewed" });
  }
  return NextResponse.json({ error: "boardTasks or verdict required" }, { status: 400 });
}
