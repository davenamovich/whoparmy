import { NextRequest, NextResponse } from "next/server";
// Web Crypto, not node:crypto: the repo has no @types/node, and this
// route runs on the Node runtime anyway (crypto.subtle is global there).
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { captureDecision } from "@/lib/clips/memory";
import { ClipGuardError, assertCredit, assertDisclosure } from "@/lib/clips/guards";

export const runtime = "nodejs";

const TOKEN_TTL_MS = 24 * 60 * 60_000;

/**
 * POST /api/clips/[id]/approve — the human yes.
 *
 * This is the only code path in the app that writes `approved`, and it is
 * reachable only with a signed-in member's session. Muse cannot call it:
 * there is no MCP tool for it, and the bridge hands `clip_*` names to
 * lib/clips/tools.ts, which has no approve handler.
 *
 * Approving also mints the one-time export token. The worker spends it to
 * call request_mp4 — so an export can never happen without this click,
 * and can never be replayed.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;

    const clip = await db.clipJob.findFirst({ where: { id, userId: user.id }, include: { page: true } });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    if (clip.status === "approved" || clip.status === "exported") {
      return NextResponse.json({ error: "Already approved." }, { status: 409 });
    }
    if (clip.status !== "ready") {
      return NextResponse.json(
        {
          error:
            clip.status === "queued" || clip.status === "rendering"
              ? "Still rendering — approve it once there is a preview to look at."
              : clip.blockedReason ?? `This clip is ${clip.status} and cannot be approved.`,
        },
        { status: 400 },
      );
    }
    if (!clip.pageUrl) {
      return NextResponse.json({ error: "No preview exists for this clip. Render it again." }, { status: 400 });
    }

    // Gate 2 runs at the moment of approval, not only at intake: a credit
    // can be missing or wrong on a clip that was queued with bare links.
    try {
      assertCredit({
        creditWho: clip.creditWho,
        creditUrl: clip.creditUrl,
        sourceUrl: clip.sourceUrl,
      });
      assertDisclosure(clip.page, clip.caption ?? "");
    } catch (err) {
      if (err instanceof ClipGuardError) {
        return NextResponse.json({ error: err.hint, code: err.code }, { status: 422 });
      }
      throw err;
    }

    const token = `clipexp_${base64url(crypto.getRandomValues(new Uint8Array(24)))}`;
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await db.$transaction([
      db.clipJob.update({
        where: { id: clip.id },
        data: { status: "approved", approvedAt: new Date() },
      }),
      db.clipExportToken.create({
        data: { clipId: clip.id, userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    // The approval is the lesson — captured once, after the row is written,
    // and never allowed to fail the request (see lib/clips/memory.ts).
    void captureDecision({
      userId: user.id,
      pageId: clip.pageId,
      clipId: clip.id,
      decision: "approved",
      note: clip.hook ? `hook kept: ${clip.hook}` : undefined,
    });

    return NextResponse.json({
      ok: true,
      // Shown once. The page hands it to the worker; it is never stored raw.
      exportToken: token,
      expiresAt: expiresAt.toISOString(),
      note: "Approved. Export needs this token — it expires in 24 hours and works once.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not approve that clip." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
