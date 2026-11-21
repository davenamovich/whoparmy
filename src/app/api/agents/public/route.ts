import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";

export const runtime = "nodejs";

/**
 * GET /api/agents/public — the public agent directory as JSON
 * (Whop Army 2.0, Slice 2). Only owner-published profiles
 * (publicProfile + slug), only through serializePublicProfile.
 * This is the read API Muse and external agents use for discovery.
 */
export async function GET() {
  const agents = await db.hiredAgent.findMany({
    where: { publicProfile: true, slug: { not: null } },
    orderBy: [{ createdAt: "desc" }],
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  return NextResponse.json({ agents: agents.map((agent) => serializePublicProfile(agent, agent.user)) });
}
