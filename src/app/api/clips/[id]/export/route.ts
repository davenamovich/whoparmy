import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { getMemberEngineKey, mcpCall } from "@/lib/muse-bridge";
import { canExport, exportMessage, mp4State, tokenIsUsable } from "@/lib/clips/export";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/clips/[id]/export — spend the approval token, ask for the MP4.
 * GET  /api/clips/[id]/export — check the render, finish the row.
 *
 * POST is the only place a token is spent, and it spends it atomically: the
 * conditional update is what makes "one approval, one export" true rather than
 * a convention. It does not wait for the file — the engine renders asynchronously
 * and the GET is the follow-up, so a slow render cannot time out an approval.
 */

function readToolJson(reply: unknown): Record<string, unknown> {
  const r = reply as { result?: { content?: Array<{ text?: string }> } } | undefined;
  const text = r?.result?.content?.[0]?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (r?.result as Record<string, unknown>) ?? {};
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;

    const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    const check = canExport({ status: clip.status, pageUrl: clip.pageUrl, mp4Url: clip.mp4Url });
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason },
        { status: clip.mp4Url ? 409 : 400 },
      );
    }

    const token = await db.clipExportToken.findFirst({
      where: { clipId: clip.id, userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!tokenIsUsable(token)) {
      return NextResponse.json(
        {
          error:
            "That approval's export token is spent or expired. Approve the clip again at /clips — approval mints a fresh one.",
        },
        { status: 409 },
      );
    }

    // Spend it first, conditionally: two taps, two tabs or a retry cannot both
    // get a render out of one approval.
    const spent = await db.clipExportToken.updateMany({
      where: { id: token!.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (spent.count === 0) {
      return NextResponse.json({ error: "That export token was already used." }, { status: 409 });
    }

    const member = await getMemberEngineKey(user);
    const reply = await mcpCall(member.key, "tools/call", {
      name: "request_mp4",
      arguments: { page_url: clip.pageUrl, url: clip.pageUrl },
    });
    const out = readToolJson(reply) as { jobId?: string; job_id?: string; id?: string; error?: string };

    if (out.error) {
      // Hand the token back: nothing was rendered, so the approval still stands.
      await db.clipExportToken.update({ where: { id: token!.id }, data: { usedAt: null } });
      return NextResponse.json({ error: String(out.error) }, { status: 502 });
    }

    const mp4JobId = out.jobId ?? out.job_id ?? out.id ?? null;
    await db.clipJob.update({
      where: { id: clip.id },
      data: { status: "exporting", mp4JobId },
    });

    return NextResponse.json({ ok: true, note: exportMessage("started"), mp4JobId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the export." },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;

    const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    if (!clip.mp4JobId) {
      return NextResponse.json({ status: clip.status, note: "Nothing is rendering for this clip." });
    }

    const member = await getMemberEngineKey(user);
    const reply = await mcpCall(member.key, "tools/call", {
      name: "get_job_status",
      arguments: { kind: "mp4", job_id: clip.mp4JobId },
    });
    const engine = readToolJson(reply) as {
      status?: string;
      mp4Url?: string;
      mp4_url?: string;
      url?: string;
      error?: string;
    };
    const state = mp4State(engine);

    if (state.status === "exported") {
      await db.clipJob.update({
        where: { id: clip.id },
        data: { status: "exported", mp4Url: state.url ?? null, exportedAt: new Date(), error: null },
      });
    } else if (state.status === "failed") {
      await db.clipJob.update({
        where: { id: clip.id },
        // Back to approved: the human said yes, so a failed render is ours to
        // retry, not theirs to re-approve.
        data: { status: "approved", error: state.error ?? "MP4 render failed." },
      });
    }

    return NextResponse.json({
      status: state.status,
      mp4Url: state.url ?? null,
      note: exportMessage(state.status),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not check the export." },
      { status: 500 },
    );
  }
}
