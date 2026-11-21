import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";
import { getPublicAgentBundles, getPublicPoolSummary } from "@/lib/agent-stats";

export const runtime = "nodejs";

/**
 * GET /api/agents/public — the public agent directory as JSON
 * (Whop Army 2.0, Slice 2). Only owner-published profiles
 * (publicProfile + slug), only through serializePublicProfile.
 * This is the read API Muse and external agents use for discovery.
 *
 * Since 2026-11-21 each profile also carries the counted `stats`
 * and rotator `access` blocks (lib/agent-stats.ts — definitions in
 * lib/agent-stats-core.ts), and the response gains a top-level
 * `pool` block: open spots across public agents in the current
 * 23:50 ET spot window. All original fields are unchanged.
 */
export async function GET() {
  const agents = await db.hiredAgent.findMany({
    where: { publicProfile: true, slug: { not: null } },
    orderBy: [{ createdAt: "desc" }],
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  const bundles = await getPublicAgentBundles(agents.map((a) => a.id));
  const pool = await getPublicPoolSummary(bundles);
  return NextResponse.json({
    agents: agents.map((agent) => {
      const bundle = bundles.get(agent.id);
      return {
        ...serializePublicProfile(agent, agent.user),
        ...(bundle ? { stats: bundle.stats, access: bundle.access } : {}),
      };
    }),
    pool,
  });
}
