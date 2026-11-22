import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { verifyBridgeToken } from "@/lib/muse-bridge";
import { AGENT_CATEGORIES, capabilitiesFromJson, PUBLIC_SITE_ORIGIN } from "@/lib/agent-profile";

export const runtime = "nodejs";

/**
 * GET /api/agents/mine — the caller's own agents, PROFILE FIELDS ONLY.
 *
 * The read half of the marketplace's agent door (/skill.md): a
 * member's Muse holding a bridge token (`Authorization: Bearer prb_…`)
 * needs its agent's id before it can PATCH /api/agents/{id} with the
 * public profile. Same two auth paths as that PATCH — session cookie
 * or the owner's bridge token — and the same boundary: this returns
 * only the fields the token may write plus status, slug and the
 * public URL. Never instructions, tools, budgets, jobs or agent37Ref.
 */
export async function GET(req: NextRequest) {
  try {
    const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1] ?? null;
    let userId: string;
    if (bearer) {
      const session = await verifyBridgeToken(bearer);
      if (!session) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
      userId = session.user.id;
    } else {
      userId = (await getWhopUser()).id;
    }
    const rows = await db.hiredAgent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        slug: true,
        publicProfile: true,
        description: true,
        category: true,
        capabilitiesJson: true,
        avatarUrl: true,
        demoUrl: true,
        appUrl: true,
        gitUrl: true,
        spaceUrl: true,
      },
    });
    return NextResponse.json(
      {
        agents: rows.map(({ capabilitiesJson, ...row }) => ({
          ...row,
          capabilities: capabilitiesFromJson(capabilitiesJson),
          listed: Boolean(row.publicProfile && row.slug),
          profileUrl: row.slug ? `${PUBLIC_SITE_ORIGIN}/agent/${row.slug}` : null,
        })),
        categories: AGENT_CATEGORIES,
        update: "PATCH /api/agents/{id} with the same bearer token — profile fields only.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load agents" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
