import { db } from "@/lib/db";
import { serializePublicProfile } from "@/lib/agent-profile";
import { HOUSE_CTA } from "@/lib/agent-stats-core";
import { getPublicAgentBundles, getPublicPoolSummary } from "@/lib/agent-stats";

export const dynamic = "force-dynamic";

/**
 * ─── /agents — public agent directory (Whop Army 2.0, Slice 2) ─────
 *
 * Lists only agents whose owners marked them publicProfile with a
 * slug, serialized through lib/agent-profile.ts. The empty state is
 * honest: when nobody has published a profile yet, the page says so.
 *
 * Since 2026-11-21 each card also carries the agent's counted stats
 * and spot availability (lib/agent-stats.ts — counted hops only,
 * filtered traffic never counts), the header shows pool-wide open
 * spots for the current 23:50 ET spot window, and each card links
 * the agent's own rotator when it is live.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

export default async function AgentsDirectoryPage() {
  const agents = await db.hiredAgent.findMany({
    where: { publicProfile: true, slug: { not: null } },
    orderBy: [{ createdAt: "desc" }],
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  const bundles = await getPublicAgentBundles(agents.map((a) => a.id));
  const pool = await getPublicPoolSummary(bundles);
  const profiles = agents.map((agent) => {
    const bundle = bundles.get(agent.id);
    return {
      ...serializePublicProfile(agent, agent.user),
      ...(bundle ? { stats: bundle.stats, access: bundle.access } : {}),
    };
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            <a className="text-primary underline underline-offset-2" href="/api/auth/whop">
              Connect
            </a>
          </nav>
        </header>

        <section className="space-y-4 py-12">
          <p className={label}>Whop Army</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">Agents that do things.</h1>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            Every agent below was published by its owner. Open one to see what it does, try it, or build your own.
          </p>
          {profiles.length > 0 ? (
            <p className="text-sm font-semibold text-primary">
              {pool.totalAvailable} {pool.totalAvailable === 1 ? "spot" : "spots"} open across {pool.activeAgents}{" "}
              public {pool.activeAgents === 1 ? "agent" : "agents"} this window · spots reset at 11:50 PM ET
            </p>
          ) : null}
        </section>

        {profiles.length === 0 ? (
          <section className="border-t border-border/60 py-10">
            <p className="leading-relaxed text-muted-foreground">
              No agents have published a public profile yet. The first ones are being built —{" "}
              <a className="text-primary underline underline-offset-2" href="/bridge">
                build yours
              </a>
              .
            </p>
          </section>
        ) : (
          <ul className="grid gap-4 pb-12 sm:grid-cols-2">
            {profiles.map((profile) => (
              <li key={profile.slug} className="rounded-2xl border border-border p-5">
                <a href={`/agent/${profile.slug}`} className="block space-y-3">
                  <span className="flex items-center gap-3">
                    {profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
                        {profile.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span>
                      <span className="block font-black leading-tight">{profile.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        by {profile.owner.displayName}
                        {profile.category ? ` · ${profile.category}` : ""}
                      </span>
                    </span>
                  </span>
                  {profile.description ? (
                    <span className="block text-sm leading-relaxed text-muted-foreground">{profile.description}</span>
                  ) : null}
                  {profile.capabilities.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {profile.capabilities.slice(0, 4).map((capability) => (
                        <span key={capability} className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                          {capability}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </a>
                {profile.stats ? (
                  <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {profile.stats.visitorsSent} visitors sent · {profile.stats.launches} launches ·{" "}
                      {profile.stats.placementsRun} placements · {profile.stats.spots.available} spots left
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Counted traffic only — bots and duplicates never count. Spots reset at 11:50 PM ET.
                    </p>
                    {profile.access?.rotator.serveUrl ? (
                      <a
                        href={profile.access.rotator.serveUrl}
                        className="inline-block text-xs font-bold text-primary underline underline-offset-2"
                      >
                        Ride {profile.name}&rsquo;s rotator →
                      </a>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {profile.access?.rotator.state === "disabled"
                          ? "This agent's rotator is off right now."
                          : profile.access?.rotator.state === "unavailable"
                            ? "This agent's rotator is paused right now."
                            : "This agent hasn't set up its rotator yet."}
                      </p>
                    )}
                    <p className="text-[11px]">
                      <a
                        href={profile.access?.houseCta.muse.url ?? HOUSE_CTA.museUrl}
                        className="font-bold text-primary underline underline-offset-2"
                      >
                        Get your own → Muse
                      </a>
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-auto border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
