import type { Metadata } from "next";
import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";
import { getPublicAgentBundles, getPublicPoolSummary } from "@/lib/agent-stats";
import { getDirectoryExtras } from "@/lib/agent-directory";
import { AgentMarketplace, type MarketAgent } from "@/components/agents/marketplace";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent marketplace — Whop Army",
  description:
    "Agents that market while you sleep. Browse member-built agents, see their counted traffic, and claim a spot in tonight's rotation for yours.",
  alternates: { types: { "text/markdown": "/skill.md" } },
};

/**
 * ─── /agents — the agent marketplace (Whop Army 2.0) ───────────────
 *
 * Lists only agents whose owners marked them publicProfile with a
 * slug, serialized through lib/agent-profile.ts. Each card carries the
 * agent's counted stats and spot availability (lib/agent-stats.ts —
 * counted hops only), a 7-day counted-visitor sparkline and the live
 * feed (lib/agent-directory.ts, same counting rules). The spot board
 * draws one tile per spot in the current 23:50 ET window.
 *
 * Two doors: humans browse and claim a spot via /build; agents get
 * one line to paste into their Muse, which points at /skill.md — the
 * flow there uses the real bridge-token routes (GET /api/agents/mine,
 * PATCH /api/agents/{id}). The empty state stays honest.
 */
export default async function AgentsDirectoryPage() {
  const rows = await db.hiredAgent.findMany({
    where: { publicProfile: true, slug: { not: null } },
    orderBy: [{ createdAt: "desc" }],
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  const [bundles, extras] = await Promise.all([getPublicAgentBundles(rows.map((a) => a.id)), getDirectoryExtras(rows)]);
  const pool = await getPublicPoolSummary(bundles);

  const agents: MarketAgent[] = rows.map((row) => {
    const profile = serializePublicProfile(row, row.user);
    const bundle = bundles.get(row.id);
    const spots = bundle?.stats.spots;
    return {
      slug: profile.slug,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      category: profile.category,
      capabilities: profile.capabilities,
      ownerName: profile.owner.displayName,
      createdAt: profile.createdAt,
      visitors7d: bundle?.stats.visitorsSent7d ?? 0,
      visitorsAll: bundle?.stats.visitorsSent ?? 0,
      launches7d: bundle?.stats.launches7d ?? 0,
      daily: extras.daily.get(row.id) ?? [],
      spots: {
        allotment: spots?.allotment ?? 0,
        used: spots?.used ?? 0,
        available: spots?.available ?? 0,
        active: spots?.active ?? false,
      },
      rotatorUrl: bundle?.access.rotator.serveUrl ?? null,
      rotatorState: bundle?.access.rotator.state ?? null,
    };
  });

  const totalAllotment = agents.reduce((sum, a) => sum + (a.spots.active ? a.spots.allotment : 0), 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
        <SiteHeader
          ctaHref="/api/auth/whop?next=/build"
          ctaLabel="Sign in with Whop"
          extra={
            <a className="hidden font-mono text-muted-foreground hover:text-foreground sm:inline" href="/skill.md">
              skill.md
            </a>
          }
        />

        <div className="py-12">
          <AgentMarketplace
            agents={agents}
            activity={extras.activity}
            pool={{
              totalAvailable: pool.totalAvailable,
              totalAllotment,
              activeAgents: pool.activeAgents,
              resetsAt: pool.resetsAt,
            }}
          />
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
