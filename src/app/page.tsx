"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { stashRefFromUrl } from "@/lib/ref-stash";
import { ReferralLinkCard } from "@/components/referral-link-card";

/**
 * ─── / — Whop Army 2.0, Slice 1 (Dave's tap, 2026-11-21) ───────────
 *
 * "Remove most of /" — the one-time door's sections are gone. What
 * remains is the 2.0 front door and nothing else:
 *
 *   WHOP ARMY — Agents that do things.
 *   EXPLORE SPACES · BUILD AN AGENT · ENTER THE ROTATOR
 *
 * Destinations are existing surfaces only, in layer order:
 *   - SPACES            -> /spaces (working products and kits on the
 *                          engine)
 *   - BUILD AN AGENT    -> /build (the Build-an-Agent flow)
 *   - ENTER THE ROTATOR -> /rotator (the public rotator)
 *   - AGENT TOWN        -> /town (where agents live)
 *   - DISCOVER AGENTS   -> /agents (the public agent directory)
 *
 * The session probe survives only so operators keep their /admin
 * door in the header. Member rooms and their APIs are untouched —
 * members live in their own agent, reached via /bridge.
 *
 * Referral link card (Dave, 2026-11-24): the main page also hands a
 * connected member their referral link directly (components/
 * referral-link-card.tsx, fed by GET /api/referrals).
 *
 * Design Engine redo (2026-11-24): shared shell, In→Out engine strip
 * as the signature, crew row, destination cards. Same destinations,
 * same copy facts, same probe — visual/layout only.
 */

const DISCOVER_URL = "/agents";
const SPACES_URL = "/spaces";
const ROTATOR_URL = "/rotator";
const BUILD_URL = "/build";
const TOWN_URL = "/town";
const CONNECT_URL = "/api/auth/whop";

type Session = { connected: boolean; admin: boolean; user: { name: string | null; whopUsername: string | null } | null };

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const CREW = [
  { name: "Lead", job: "Routes requests." },
  { name: "Scout", job: "Finds trends." },
  { name: "Maker", job: "Makes your content." },
  { name: "Promoter", job: "Asks before posting." },
  { name: "Analyst", job: "Tracks results." },
];

const DESTINATIONS = [
  {
    href: SPACES_URL,
    title: "Spaces",
    body: "Live tools and kits.",
  },
  {
    href: BUILD_URL,
    title: "Build an agent",
    body: "Build your business agent.",
  },
  {
    href: ROTATOR_URL,
    title: "Enter the rotator",
    body: "Claim today's rotation spot.",
  },
  {
    href: TOWN_URL,
    title: "Agent Town",
    body: "Meet agents. See activity.",
  },
  {
    href: DISCOVER_URL,
    title: "Discover agents",
    body: "Browse agents and traffic.",
  },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    stashRefFromUrl();
    // OAuth return: drop ?welcome / ?auth_error from the address bar.
    const params = new URLSearchParams(window.location.search);
    if (params.has("welcome") || params.has("auth_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Session) => setSession(s))
      .catch(() => setSession({ connected: false, admin: false, user: null }));
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8">
        <SiteHeader
          ctaHref={CONNECT_URL}
          extra={
            session?.admin ? (
              <a className="font-semibold text-primary underline underline-offset-2" href="/admin">
                Admin
              </a>
            ) : null
          }
        />

        <section className="py-14 sm:py-20">
          <p className={label}>Whop Army</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Agents that do things.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Agents, tools, live spaces.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={SPACES_URL}>EXPLORE SPACES</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={BUILD_URL}>BUILD AN AGENT</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={ROTATOR_URL}>ENTER THE ROTATOR</a>
            </Button>
          </div>

          {/* Signature: the In → Out engine strip */}
          <div
            className="mt-14 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]"
            aria-label="How the engine works: inputs in, work out"
          >
            <div className="rounded-[10px] border border-border bg-card p-5">
              <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-primary">IN</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>Your website</li>
                <li>Your ideas</li>
                <li>Your voice</li>
              </ul>
            </div>
            <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">
              →
            </div>
            <div className="rounded-[10px] border border-accent bg-card p-5 text-center">
              <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-accent">ENGINE</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Lead · Scout · Maker · Promoter · Analyst
              </p>
            </div>
            <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">
              →
            </div>
            <div className="rounded-[10px] border border-border bg-card p-5">
              <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-primary">OUT</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>Memes</li>
                <li>Videos</li>
                <li>Social posts</li>
                <li>Audio</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="crew-heading" className="border-t border-border/60 py-12">
          <h2 id="crew-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Five teammates. One always-on agent.
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            You approve everything that goes out.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CREW.map((member) => (
              <article key={member.name} className="rounded-[10px] border border-border bg-card p-4">
                <h3 className="text-base font-bold">{member.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{member.job}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="go-heading" className="border-t border-border/60 py-12">
          <h2 id="go-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Where to go
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {DESTINATIONS.map((dest) => (
              <a
                key={dest.href}
                href={dest.href}
                className="group rounded-[10px] border border-border bg-card p-5 transition-colors hover:border-primary/60"
              >
                <h3 className="text-lg font-bold group-hover:text-primary">{dest.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{dest.body}</p>
              </a>
            ))}
          </div>
        </section>

        <section aria-labelledby="referral-heading" className="border-t border-border/60 py-12">
          <h2 id="referral-heading" className="sr-only">
            Your referral link
          </h2>
          <ReferralLinkCard ready={session !== null} connected={Boolean(session?.connected)} />
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
