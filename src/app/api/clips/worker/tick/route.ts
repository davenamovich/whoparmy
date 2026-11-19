import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMemberEngineKey, mcpCall } from "@/lib/muse-bridge";
import {
  MAX_CLAIMS_PER_TICK,
  MAX_POLLS_PER_TICK,
  buildSitdownArgs,
  claimOrder,
  deskCaption,
  preflight,
  statusFromEngine,
  type DispatchJob,
} from "@/lib/clips/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/clips/worker/tick — the dispatcher.
 *
 * Runs on a platform schedule (outside the container, so a sleeping instance
 * still fires). Two phases, both bounded:
 *
 *   poll  — rows already rendering: one `get_job_status` each.
 *   claim — a few queued rows: one `create_sitdown` each.
 *
 * No renderer here. P&R MCP renders, and the engine routes that work to the
 * member's own Agent37 renderer instance, billed to their wallet.
 *
 * Auth is a shared cron secret, not a member session: this endpoint acts for
 * every member at once, so it must never be reachable from a browser.
 */

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const POLL_KIND = "sitdown";

/** The engine answers tools/call as MCP content; be tolerant about the shape. */
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

export async function POST(req: NextRequest) {
  const secret = env.CLIPS_CRON_SECRET ?? "";
  if (!secret || req.headers.get("x-clips-cron") !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const summary = { polled: 0, ready: 0, failed: 0, claimed: 0, blocked: 0, errors: [] as string[] };

  try {
    // ── phase 1: poll what is already rendering ──────────────────────
    const rendering = await db.clipJob.findMany({
      where: { status: "rendering", engineJobId: { not: null } },
      orderBy: { updatedAt: "asc" },
      take: MAX_POLLS_PER_TICK,
      include: { user: true, page: true },
    });

    for (const clip of rendering) {
      summary.polled += 1;
      try {
        const member = await getMemberEngineKey(clip.user);
        const reply = await mcpCall(member.key, "tools/call", {
          name: "get_job_status",
          arguments: { kind: POLL_KIND, job_id: clip.engineJobId },
        });
        const engine = readToolJson(reply) as {
          status?: string;
          pageUrl?: string;
          page_url?: string;
          caption?: string;
          warnings?: string[];
          error?: string;
        };

        const next = statusFromEngine({
          status: engine.status,
          pageUrl: engine.pageUrl ?? engine.page_url ?? null,
          caption: engine.caption ?? null,
          warnings: engine.warnings,
          error: engine.error ?? null,
        });

        if (next.status === "rendering") continue;

        const job: DispatchJob = {
          id: clip.id,
          sourceUrl: clip.sourceUrl,
          clipSeconds: clip.clipSeconds,
          hook: clip.hook,
          creditWho: clip.creditWho,
          creditUrl: clip.creditUrl,
          attempts: clip.attempts,
        };

        await db.clipJob.update({
          where: { id: clip.id },
          data:
            next.status === "ready"
              ? {
                  status: "ready",
                  pageUrl: next.pageUrl ?? null,
                  caption: deskCaption(next.caption, job),
                  warnings: JSON.stringify(next.warnings ?? []),
                  error: null,
                }
              : { status: "failed", error: next.error ?? "The engine reported a failure." },
        });

        if (next.status === "ready") summary.ready += 1;
        else summary.failed += 1;
      } catch (err) {
        summary.errors.push(`${clip.id}: ${err instanceof Error ? err.message : "poll failed"}`);
      }
    }

    // ── phase 2: claim a few queued rows ─────────────────────────────
    const queued = await db.clipJob.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      take: MAX_CLAIMS_PER_TICK * 4,
      include: { user: true, page: true },
    });

    const candidates: DispatchJob[] = queued.map((clip) => ({
      id: clip.id,
      sourceUrl: clip.sourceUrl,
      clipSeconds: clip.clipSeconds,
      hook: clip.hook,
      creditWho: clip.creditWho,
      creditUrl: clip.creditUrl,
      attempts: clip.attempts,
    }));

    const claimIds = new Set(claimOrder(candidates).map((j) => j.id));

    for (const clip of queued) {
      if (!claimIds.has(clip.id)) continue;

      const job = candidates.find((c) => c.id === clip.id)!;
      const check = preflight(job);
      if (!check.ok) {
        // Blocked before it costs a call — a missing credit would only produce
        // something the desk refuses.
        await db.clipJob.update({
          where: { id: clip.id },
          data: { status: "blocked", blockedReason: `${check.hint} (${check.code})` },
        });
        summary.blocked += 1;
        continue;
      }

      // Bridge-sourced rows carry the token that queued them. If that
      // token has been revoked or has expired since, the connection
      // that authorized this spend no longer exists — fail the row
      // BEFORE the engine call instead of charging the member's key
      // on a dead authorization.
      if (clip.bridgeTokenId) {
        const token = await db.bridgeToken.findUnique({
          where: { id: clip.bridgeTokenId },
          select: { revokedAt: true, expiresAt: true },
        });
        if (!token || token.revokedAt || token.expiresAt.getTime() <= Date.now()) {
          await db.clipJob.update({
            where: { id: clip.id },
            data: { status: "failed", error: "The bridge connection that queued this clip was revoked or expired before it rendered. Nothing was charged." },
          });
          summary.failed += 1;
          continue;
        }
      }

      // Claim it atomically: a second tick must not render the same row.
      const claimed = await db.clipJob.updateMany({
        where: { id: clip.id, status: "queued" },
        data: { status: "rendering", attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      try {
        const member = await getMemberEngineKey(clip.user);
        const args = buildSitdownArgs(job, {
          niche: clip.page.niche,
          handle: clip.page.handle,
          disclosure: clip.page.disclosure,
        });
        const reply = await mcpCall(member.key, "tools/call", { name: "create_sitdown", arguments: args });
        const out = readToolJson(reply) as { jobId?: string; job_id?: string; id?: string; error?: string };

        if (out.error) throw new Error(out.error);
        const engineJobId = out.jobId ?? out.job_id ?? out.id ?? null;

        await db.clipJob.update({
          where: { id: clip.id },
          data: { engineJobId },
        });
        summary.claimed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "create_sitdown failed";
        // One retry is allowed by attempts; the row goes back to queued until
        // MAX_ATTEMPTS, then it fails for a human.
        await db.clipJob.update({
          where: { id: clip.id },
          data: { status: job.attempts + 1 >= 2 ? "failed" : "queued", error: message },
        });
        summary.errors.push(`${clip.id}: ${message}`);
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Tick failed.", ...summary },
      { status: 500 },
    );
  }
}
