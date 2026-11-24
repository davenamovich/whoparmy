import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, isDesignatedOperator, UnauthorizedError } from "@/lib/auth";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { cleanAppFields, uniqueSlug, type AppFieldInput } from "@/lib/application";

export const runtime = "nodejs";

interface AppBody extends AppFieldInput {
  agentId?: string;
  agentSlug?: string;
}

/**
 * POST /api/apps — publish an application built by an agent
 * (Whop Army 2.0, Slice 3). Two auth paths, one ownership rule:
 *
 *  (a) Session — the signed-in member (agentId or agentSlug in the
 *      body); designated operators may also publish for house agents.
 *  (b) Bridge token — `Authorization: Bearer prb_…` from a member's
 *      own Muse (verified by lib/muse-bridge verifyBridgeToken);
 *      the agent is identified by agentSlug and the token's user must
 *      own it. No operator override on this path.
 *
 * The slug is auto-generated from the name, unique across all apps.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AppBody;

    const auth = req.headers.get("authorization") ?? "";
    const bearer = /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] ?? null;

    let userId: string;
    let operator = false;
    if (bearer) {
      const credential = await verifyAnyBridgeToken(bearer);
      if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
      userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
    } else {
      const user = await getWhopUser();
      userId = user.id;
      operator = isDesignatedOperator(user);
    }

    const agent = body.agentId
      ? await db.hiredAgent.findFirst({ where: { id: body.agentId } })
      : body.agentSlug
        ? await db.hiredAgent.findFirst({ where: { slug: body.agentSlug } })
        : null;
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (agent.userId !== userId && !operator) {
      return NextResponse.json({ error: "This agent belongs to another member." }, { status: 403 });
    }

    const cleaned = cleanAppFields(body, false);
    if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const data = cleaned.data;

    const slug = await uniqueSlug(data.name!, async (candidate) => {
      const taken = await db.application.findFirst({ where: { slug: candidate }, select: { id: true } });
      return Boolean(taken);
    });

    const app = await db.application.create({
      data: {
        agentId: agent.id,
        userId: agent.userId,
        slug,
        name: data.name!,
        description: data.description ?? null,
        liveUrl: data.liveUrl ?? null,
        screenshotUrl: data.screenshotUrl ?? null,
        repoUrl: data.repoUrl ?? null,
        buildPrompt: data.buildPrompt ?? null,
        videoUrl: data.videoUrl ?? null, priceCents: data.priceCents ?? 0, currency: data.currency ?? "USD", category: data.category ?? null, demoKind: data.demoKind ?? null, buyUrl: data.buyUrl ?? null, replicationManifest: data.replicationManifest ?? null,
        public: data.public ?? false,
      },
    });
    return NextResponse.json({ app }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publish failed" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
