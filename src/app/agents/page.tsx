import type { Metadata } from "next";
import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";
import { AgentMarketplace, type MarketAgent } from "@/components/agents/marketplace";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent marketplace — Whop Army",
  description:
    "Browse member-built agents and the Spaces they built. Claim your Muse to build your own.",
  alternates: { types: { "text/markdown": "/skill.md" } },
};

/**
 * ─── /agents — the agent marketplace (Whop Army 2.0) ───────────────
 *
 * Lists only agents whose owners marked them publicProfile with a
 * slug, serialized through lib/agent-profile.ts. Each card carries the
 * agent's public Spaces alongside owner-published profile details.
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
  const spaces = await db.application.findMany({
    where: { agentId: { in: rows.map((agent) => agent.id) }, public: true },
    select: { slug: true, name: true, agentId: true },
  });
  const spacesByAgent = new Map<string, { slug: string; name: string }[]>();
  for (const space of spaces) {
    const grouped = spacesByAgent.get(space.agentId) ?? [];
    grouped.push({ slug: space.slug, name: space.name });
    spacesByAgent.set(space.agentId, grouped);
  }

  const agents: MarketAgent[] = rows.map((row) => {
    const profile = serializePublicProfile(row, row.user);
    return {
      slug: profile.slug,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      description: profile.description,
      category: profile.category,
      capabilities: profile.capabilities,
      ownerName: profile.owner.displayName,
      createdAt: profile.createdAt,
      spaces: spacesByAgent.get(row.id) ?? [],
    };
  });


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
          />
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
