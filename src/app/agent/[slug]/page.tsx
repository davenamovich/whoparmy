import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { capabilitiesFromJson, PUBLIC_SITE_ORIGIN, serializePublicProfile } from "@/lib/agent-profile";
import { HOUSE_CTA } from "@/lib/agent-stats-core";
import { getPublicAgentBundles } from "@/lib/agent-stats";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { SpotResetCountdown } from "@/components/spot-reset-countdown";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { PhoneFrame } from "@/components/phone-frame";
import { isVideoFileUrl } from "@/lib/media-url";
import { CopyBlock } from "@/components/agents/marketplace";

export const dynamic = "force-dynamic";

/**
 * ─── /agent/{slug} — public agent profile (Whop Army 2.0, Slice 2) ──
 *
 * Renders ONLY an agent whose owner marked it publicProfile with a
 * slug, and only through serializePublicProfile (lib/agent-profile.ts)
 * — no member fields. Since 2026-11-21 the page also shows the
 * agent's counted stats and rotator access (lib/agent-stats.ts):
 * counted hops only — filtered traffic never counts, and no number
 * is shown that the ledgers can't back. Everything else 404s.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

export default async function AgentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { slug } = await params;
  // A visitor who arrived with a referral rides to the referrer's own
  // link for this agent's offers; without one, the round robin
  // (lib/agent-rotator-policy-core.ts).
  const rawRef = (await searchParams).ref;
  const ref = typeof rawRef === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(rawRef) ? rawRef : null;
  const agent = await db.hiredAgent.findFirst({
    where: { slug, publicProfile: true },
    include: { user: { select: { name: true, whopUsername: true, refCode: true } } },
  });
  if (!agent) notFound();

  const profile = serializePublicProfile(agent, agent.user);
  const capabilities = capabilitiesFromJson(agent.capabilitiesJson);
  const isBarry = slug === "btc-barry";
  const tryUrl = isBarry ? "/build" : profile.demoUrl ?? profile.appUrl ?? "/build";

  // Counted stats + rotator access for this agent (lib/agent-stats.ts).
  const bundle = (await getPublicAgentBundles([agent.id])).get(agent.id);
  const stats = bundle?.stats;
  const access = bundle?.access;
  const rideUrl = access?.rotator.serveUrl
    ? ref
      ? `${access.rotator.serveUrl}?ref=${encodeURIComponent(ref)}`
      : access.rotator.serveUrl
    : null;

  // House CTA (Dave, 2026-11-21): the strip routes offsite to
  // Plunder & Riffle — resolved owner-first in the access block
  // (the owner's own synced Muse/Agent37 links win; the house
  // URLs are the fallback).
  const ctaMuseUrl = access?.houseCta.muse.url ?? HOUSE_CTA.museUrl;
  const ctaAgent37Url = access?.houseCta.agent37.url ?? HOUSE_CTA.agent37Url;

  // Spaces built by this agent (Slice 3): only the ones the
  // owner marked public, serialized like everywhere else.
  const appRows = await db.application.findMany({
    where: { agentId: agent.id, public: true },
    orderBy: [{ createdAt: "desc" }],
    include: publicApplicationInclude,
  });
  const applications = appRows.map((row) => serializePublicApplication(row, row.agent, row.user));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <SiteHeader />

        <section className="space-y-5 py-12">
          <div className="flex items-center gap-4">
            <AgentAvatar seed={profile.slug} name={profile.name} src={profile.avatarUrl} size={64} />
            <div>
              <p className={label}>Whop Army agent</p>
              <h1 className="font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl">{profile.name}</h1>
              <p className="text-sm text-muted-foreground">
                by {profile.owner.displayName}
                {profile.category ? ` · ${profile.category}` : ""} · {profile.status}
              </p>
            </div>
          </div>

          {profile.description ? <p className="leading-relaxed text-muted-foreground">{profile.description}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={tryUrl}>{isBarry ? "GRAB A ROTATOR SPOT" : "TRY AGENT"}</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/build">BUILD YOUR OWN</a>
            </Button>
            {profile.referralUrl ? (
              <Button asChild variant="outline">
                <a href={profile.referralUrl}>REFER</a>
              </Button>
            ) : null}
          </div>
        </section>

        {stats ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>Track record</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Visitors sent</dt>
                <dd className="text-2xl font-black">{stats.visitorsSent}</dd>
                <dd className="text-xs text-muted-foreground">{stats.visitorsSent7d} in the last 7 days</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Launches</dt>
                <dd className="text-2xl font-black">{stats.launches}</dd>
                <dd className="text-xs text-muted-foreground">{stats.launches7d} in the last 7 days</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Placements run</dt>
                <dd className="text-2xl font-black">{stats.placementsRun}</dd>
                <dd className="text-xs text-muted-foreground">{stats.placementsActiveToday} active today</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Spots left this window</dt>
                <dd className="text-2xl font-black">{stats.spots.available}</dd>
                <dd className="text-xs text-muted-foreground">
                  of {stats.spots.allotment} · {stats.spots.used} used
                </dd>
              </div>
            </dl>
            <p className="text-sm font-semibold text-primary">
              <SpotResetCountdown resetsAt={stats.spots.resetsAt} />
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Counted traffic only: the hop ledger filters out bots, duplicates and bursts before anything counts —
              these numbers are not verified human traffic, and filtered hops are never included. Next window:{" "}
              {stats.spots.nextWindowAllotment} spots per agent, sized by demand when the window opens.
            </p>
          </section>
        ) : null}

        <section className="space-y-4 border-t border-border/60 py-10">
          <h2 className={label}>Get an agent like this</h2>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            {isBarry
              ? "Barry is the house demo agent: the house runs its traffic system in the open, with placements and spots counted above. Build your own agent at /build; your Muse presents offers, including DH Media, and your agent works the offers you accept."
              : "An agent like this, working for your business — that’s Muse, powered by Plunder & Riffle, running on Agent37."}
          </p>
          <div className="flex flex-wrap gap-3">
            {isBarry ? (
              <Button asChild>
                <a href="/build">GET YOUR SPOT — BUILD YOUR AGENT</a>
              </Button>
            ) : (
              <>
                <Button asChild>
                  <a href={ctaMuseUrl}>GET YOUR OWN MUSE</a>
                </Button>
                <Button asChild variant="outline">
                  <a href={ctaAgent37Url}>RUN IT ON AGENT37</a>
                </Button>
              </>
            )}
          </div>
        </section>

        {access ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>Ride the rotator</h2>
            <ul className="space-y-3">
              <li className="rounded-[10px] border border-border p-5">
                {rideUrl ? (
                  <a href={rideUrl} className="block space-y-1">
                    <span className="block font-black">Ride {profile.name}&rsquo;s rotator →</span>
                    <span className="block text-sm text-muted-foreground">
                      {isBarry
                        ? "This is not a signup. Each visit rotates through destinations members have saved with their agents."
                        : "One click sends you to one of this agent's destinations, rotating on every visit."}
                    </span>
                  </a>
                ) : (
                  <span className="block space-y-1">
                    <span className="block font-black">Ride {profile.name}&rsquo;s rotator</span>
                    <span className="block text-sm text-muted-foreground">
                      {access.rotator.state === "disabled"
                        ? "This agent's rotator is off right now."
                        : access.rotator.state === "unavailable"
                          ? "This agent's rotator is paused right now."
                          : "This agent hasn't set up its rotator yet."}
                    </span>
                  </span>
                )}
              </li>
              <li className="rounded-[10px] border border-border p-5">
                <a href={access.dailyRotatorUrl} className="block space-y-1">
                  <span className="block font-black">Enter the daily rotator →</span>
                  <span className="block text-sm text-muted-foreground">
                    Today&apos;s featured destinations from every agent — one auction, won with Bid Points.
                  </span>
                </a>
              </li>
              <li className="rounded-[10px] border border-border p-5">
                <a href={isBarry ? "/build" : access.ownRotatorUrl} className="block space-y-1">
                  <span className="block font-black">Get your own rotator →</span>
                  <span className="block text-sm text-muted-foreground">
                    {isBarry
                      ? "Connect on the bridge, save your links, and your agent rotates them the same way."
                      : "Connect on the bridge, save your links, and your agent rotates them the same way."}
                  </span>
                </a>
              </li>
            </ul>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              How spots work: spots open at <strong className="text-foreground">11:50 PM ET</strong> for the next 24
              hours, sized by demand. Members bid Bid Points — earned only from referrals — for the featured spot in the daily rotator.
            </p>
          </section>
        ) : null}

        {capabilities.length > 0 ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>What this agent does</h2>
            <ul className="flex flex-wrap gap-2">
              {capabilities.map((capability) => (
                <li key={capability} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold">
                  {capability}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {applications.length > 0 ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>Spaces built by this agent</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {applications.map((app) => (
                <li key={app.slug} className="rounded-[10px] border border-border p-5">
                  <a href={`/spaces/${app.slug}`} className="block space-y-3">
                    {app.screenshotUrl ? (
                      <PhoneFrame className="max-w-[170px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={app.screenshotUrl} alt="" />
                      </PhoneFrame>
                    ) : null}
                    <span className="block font-black leading-tight">{app.name}</span>
                    {app.description ? (
                      <span className="block text-sm leading-relaxed text-muted-foreground">{app.description}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isVideoFileUrl(profile.demoUrl) ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>Demo</h2>
            <PhoneFrame>
              <video controls preload="metadata">
                <source src={profile.demoUrl!} />
              </video>
            </PhoneFrame>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-border/60 py-10">
          <h2 className={label}>Links</h2>
          <ul className="space-y-2 text-sm">
            {profile.demoUrl ? (
              <li>
                Demo —{" "}
                <a className="text-primary underline underline-offset-2" href={profile.demoUrl} target="_blank" rel="noreferrer">
                  {profile.demoUrl}
                </a>
              </li>
            ) : null}
            {profile.appUrl ? (
              <li>
                Open app —{" "}
                <a className="text-primary underline underline-offset-2" href={profile.appUrl} target="_blank" rel="noreferrer">
                  {profile.appUrl}
                </a>
              </li>
            ) : null}
            {profile.gitUrl ? (
              <li>
                Source —{" "}
                <a className="text-primary underline underline-offset-2" href={profile.gitUrl} target="_blank" rel="noreferrer">
                  {profile.gitUrl}
                </a>
              </li>
            ) : null}
            {profile.spaceUrl ? (
              <li>
                Muse Space —{" "}
                <a className="text-primary underline underline-offset-2" href={profile.spaceUrl} target="_blank" rel="noreferrer">
                  {profile.spaceUrl}
                </a>
              </li>
            ) : null}
            <li>
              Runs on — {profile.agent37Connected ? "Connected to Agent37" : "Runs on the Plunder & Riffle engine"}
            </li>
            {profile.referralUrl ? (
              <li>
                Referral link —{" "}
                <a className="text-primary underline underline-offset-2" href={profile.referralUrl}>
                  {profile.referralUrl}
                </a>
              </li>
            ) : null}
          </ul>
        </section>

        {profile.buildPrompt ? (
          <section className="space-y-3 border-t border-border/60 py-10">
            <h2 className={label}>Build prompt</h2>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {profile.buildPrompt}
            </pre>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-border/60 py-10">
          <h2 className={label}>For agents</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            This agent&rsquo;s card as JSON — the same data an agent gets from the public API. To list an agent of your
            own, read{" "}
            <a className="font-mono text-primary underline underline-offset-2" href="/skill.md">
              /skill.md
            </a>
            .
          </p>
          <CopyBlock
            text={JSON.stringify(
              {
                name: profile.name,
                slug: profile.slug,
                description: profile.description,
                category: profile.category,
                capabilities: profile.capabilities,
                profileUrl: profile.profileUrl,
                json: `${PUBLIC_SITE_ORIGIN}/api/agents/public/${profile.slug}`,
                spotsTonight: stats ? { open: stats.spots.available, of: stats.spots.allotment } : null,
                listOwnAgent: `${PUBLIC_SITE_ORIGIN}/skill.md`,
              },
              null,
              2,
            )}
          />
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
