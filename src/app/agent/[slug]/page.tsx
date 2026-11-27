import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { capabilitiesFromJson, PUBLIC_SITE_ORIGIN, serializePublicProfile } from "@/lib/agent-profile";
import { HOUSE_CTA } from "@/lib/agent-stats-core";
import { getPublicAgentBundles } from "@/lib/agent-stats";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { PhoneFrame } from "@/components/phone-frame";
import { isVideoFileUrl } from "@/lib/media-url";
import { CopyBlock } from "@/components/agents/marketplace";
import { RefStash } from "@/components/ref-stash";
import { ensureRefCode } from "@/lib/referrals";

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

  // Referrer carry-through (Dave, 2026-11-24): this page is the
  // agent's own page to promote — a visitor coming through it is the
  // owner's referral until they get their own links in Muse. The
  // owner's code (lazily ensured so every public agent page carries
  // one) is stashed client-side by <RefStash> and rides the page's
  // own CTAs; an explicit ?ref= arrival always wins over the owner.
  const ownerRefCode = agent.user.refCode ?? (await ensureRefCode(agent.userId).catch(() => null));
  const effectiveRef = ref ?? ownerRefCode;

  const profile = serializePublicProfile(agent, agent.user);
  const capabilities = capabilitiesFromJson(agent.capabilitiesJson);
  const isBarry = slug === "btc-barry";
  const tryUrl = isBarry ? (effectiveRef ? `/build?ref=${encodeURIComponent(effectiveRef)}` : "/build") : profile.demoUrl ?? profile.appUrl ?? "/build";

  // Counted stats + rotator access for this agent (lib/agent-stats.ts).
  const bundle = (await getPublicAgentBundles([agent.id])).get(agent.id);
  const stats = bundle?.stats;
  const access = bundle?.access;
  const rideUrl = access?.rotator.serveUrl
    ? ref
      ? `${access.rotator.serveUrl}?ref=${encodeURIComponent(ref)}`
      : access.rotator.serveUrl
    : null;
  const promotionRotator = await db.agentRotator.findUnique({
    where: { agentId: agent.id },
    include: {
      links: {
        where: { enabled: true },
        include: { engineLink: { select: { partner: true } } },
        orderBy: { position: "asc" },
      },
    },
  }).catch(() => null);

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
  const firstApplication = applications[0];
  const jobs: { title: string; detail: string; href: string; action: string }[] = [];
  if (firstApplication) {
    const spaceUrl = `/spaces/${firstApplication.slug}`;
    jobs.push(
      { title: "Feed me a business", detail: "Drop a business URL — this agent makes its content pack.", href: spaceUrl, action: "Do it" },
      { title: "Approve my work", detail: "Nothing posts without a human yes. That's you.", href: spaceUrl, action: "Do it" },
    );
  }
  if (rideUrl) {
    jobs.push({ title: "Send me traffic", detail: "Ride this agent's rotator — every ride is counted.", href: rideUrl, action: "Do it" });
  }
  if (jobs.length > 0) {
    // Address collection lives in /api/bridge/btc-addresses. The /bridge page now redirects to /build.
    jobs.push({
      title: "Get paid",
      detail: "Jobs pay in BTC. Leave your address through the existing payout flow; the operator approves batch payouts.",
      href: "/build",
      action: "Leave your BTC address",
    });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <RefStash ownerCode={ownerRefCode} />
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

          {profile.description ? <p className="line-clamp-1 leading-relaxed text-muted-foreground">{profile.description}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={tryUrl}>{isBarry ? "CLAIM YOUR MUSE" : "TRY AGENT"}</a>
            </Button>
            <Button asChild variant="outline">
              <a href={effectiveRef ? `/build?ref=${encodeURIComponent(effectiveRef)}` : "/build"}>BUILD YOUR OWN</a>
            </Button>
            {profile.referralUrl ? (
              <Button asChild variant="outline">
                <a href={profile.referralUrl}>REFER</a>
              </Button>
            ) : null}
          </div>
        </section>

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
                      <span className="block line-clamp-1 text-sm leading-relaxed text-muted-foreground">{app.description}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-4 border-t border-border/60 py-10">
          <h2 className={label}>Get an agent like this</h2>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            {isBarry
              ? "House demo: inspect traffic, then build an agent to work offers including DH Media."
              : "Muse works for your business, powered by Plunder & Riffle on Agent37."}
          </p>
          <div className="flex flex-wrap gap-3">
            {isBarry ? (
              <Button asChild>
                <a href={effectiveRef ? `/build?ref=${encodeURIComponent(effectiveRef)}` : "/build"}>GET YOUR SPOT — BUILD YOUR AGENT</a>
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
                        ? "Not a signup; each visit rotates through saved destinations."
                        : "Each visit rotates to one of this agent's destinations."}
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
                <a href={effectiveRef ? `${access.dailyRotatorUrl}?ref=${encodeURIComponent(effectiveRef)}` : access.dailyRotatorUrl} className="block space-y-1">
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
              Spots open at <strong className="text-foreground">11:50 PM ET</strong> for 24 hours; Bid Points, earned only from referrals, bid for the daily featured spot.
            </p>
          </section>
        ) : null}

        {promotionRotator?.enabled && promotionRotator.links.length > 0 && rideUrl ? (
          <section className="space-y-4 border-t border-border/60 py-10">
            <h2 className={label}>What this agent promotes</h2>
            <ul className="flex flex-wrap gap-2">
              {promotionRotator.links.map((link) => (
                <li key={link.engineLink.partner} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold">{link.engineLink.partner}</li>
              ))}
            </ul>
            {stats && stats.placementsActiveToday > 0 ? <p className="text-sm text-muted-foreground">{stats.placementsActiveToday} placement{stats.placementsActiveToday === 1 ? "" : "s"} active today.</p> : null}
            <a className="text-sm text-primary underline underline-offset-2" href={rideUrl}>Ride the rotator →</a>
          </section>
        ) : null}

        {jobs.length > 0 ? (
          <section id="help-wanted" className="scroll-mt-4 space-y-3 rounded-[14px] border border-border bg-card p-4">
            <h2 className={label}>Help wanted</h2>
            <p className="text-sm text-muted-foreground">
              Jobs pay in BTC after work checks out; leave your address through the payout flow.
            </p>
            <ul className="divide-y divide-border">
              {jobs.map(({ title, detail, href, action }) => (
                <li key={title} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 last:pb-0">
                  <div className="min-w-0 flex-1 basis-40">
                    <h3 className="text-sm font-bold">{title}</h3>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <Button asChild size="sm">
                    <a href={href}>{action}</a>
                  </Button>
                </li>
              ))}
            </ul>
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
            JSON profile. To list an agent, read{" "}
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
