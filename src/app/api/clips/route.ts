import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { queueClipLinks, type IntakeLink } from "@/lib/clips/intake";
import { clipUsage } from "@/lib/clips/usage";

export const runtime = "nodejs";

/**
 * The review desk's data route.
 *
 * GET  — the member's pages, the queue, and this month's clip count.
 * POST — add links from the desk. Same intake path as `clip_batch` on the
 *        Muse bridge (lib/clips/intake), so a human and an agent cannot
 *        get different guard behaviour on the same link.
 */

export async function GET() {
  try {
    const user = await getWhopUser();
    const [pages, clips, usage] = await Promise.all([
      db.clipPage.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } }),
      db.clipJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 }),
      clipUsage(user.id, user.plan),
    ]);

    return NextResponse.json({
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        handle: p.handle,
        niche: p.niche,
        platforms: safeJson<string[]>(p.platforms, []),
        disclosure: p.disclosure,
        approvalHours: p.approvalHours,
      })),
      clips: clips.map((c) => ({
        id: c.id,
        pageId: c.pageId,
        status: c.status,
        sourceUrl: c.sourceUrl,
        sourceHost: c.sourceHost,
        clipSeconds: c.clipSeconds,
        hook: c.hook,
        caption: c.caption,
        creditWho: c.creditWho,
        pageUrl: c.pageUrl,
        mp4Url: c.mp4Url,
        warnings: safeJson<string[]>(c.warnings, []),
        blockedReason: c.blockedReason,
        error: c.error,
        createdAt: c.createdAt.toISOString(),
      })),
      usage: {
        used: usage.planUsed,
        limit: usage.planLimit,
        plan: usage.planName,
        paidLeft: usage.paidLeft,
        byok: usage.byok,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the queue." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

interface IntakeBody {
  pageId?: string;
  links?: Array<string | IntakeLink>;
  clipSeconds?: number;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as IntakeBody;

    if (!body.pageId) {
      return NextResponse.json({ error: "Pick a page first." }, { status: 400 });
    }
    if (!Array.isArray(body.links) || body.links.length === 0) {
      return NextResponse.json({ error: "Paste at least one link." }, { status: 400 });
    }

    const links: IntakeLink[] = body.links.map((item) =>
      typeof item === "string" ? { url: item } : item,
    );

    const result = await queueClipLinks(user, body.pageId, links, body.clipSeconds ?? 15);

    // The allowance refusal is the 402 path, same as every other metered
    // feature — the client shows the upgrade copy from `error`.
    if (!result.ok && result.allowance && !result.allowance.ok) {
      return NextResponse.json(
        {
          error: result.allowance.error,
          used: result.allowance.planUsed,
          limit: result.allowance.planLimit,
          paidLeft: result.allowance.paidLeft,
          refused: result.refused,
        },
        { status: 402 },
      );
    }
    if (result.error && result.created.length === 0) {
      return NextResponse.json({ error: result.error, refused: result.refused }, { status: 400 });
    }

    return NextResponse.json({
      created: result.created.length,
      refused: result.refused,
      left: result.allowance ? Math.max(0, result.allowance.left - result.created.length) : null,
      lane: result.allowance?.lane ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "That batch did not go in." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
