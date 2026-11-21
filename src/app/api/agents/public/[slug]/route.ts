import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";

export const runtime = "nodejs";

/**
 * GET /api/agents/public/{slug} — one public agent profile as JSON
 * (Whop Army 2.0, Slice 2). 404 unless the agent exists with that
 * slug AND its owner marked it publicProfile.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await db.hiredAgent.findFirst({
    where: { slug, publicProfile: true },
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  if (!agent) return NextResponse.json({ error: "Agent profile not found." }, { status: 404 });
  return NextResponse.json({ agent: serializePublicProfile(agent, agent.user) });
}
