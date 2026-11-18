"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Brain, ChevronLeft, ChevronRight, Coins, Link2, Lock, MousePointerClick, ScanSearch, Sparkles } from "lucide-react";
import { stashRefFromUrl } from "@/lib/ref-stash";
import type { BridgePartner } from "@/lib/bridge";
import { BrandedBotCard } from "@/components/factory/branded-bot-card";

/**
 * ─── THE LANDING PAGE ────────────────────────────────────────────────
 * Dave's direction (2026-11-17): borrow the Global Content Factory
 * page (his Lovable build) as Whoparmy's front door, gated with Whop
 * connection. Reworked 2026-11-18 (Dave): sell the END RESULTS —
 * free content, a free AI audit, persistent memory — and stop
 * forcing the offers; the offer slider moved to the bottom as an
 * optional "under the hood" strip. Anonymous visitors get this teaser; the working parts
 * (saving your links, free-generation rewards, the app itself) unlock
 * only after Connect with Whop — any membership, the free Trial
 * included. Attribution (?ref=) is captured here, before connect,
 * and applied after (lib/ref-stash.ts).
 */

const AUDIENCES = [
  { title: "Local services", line: "Plumbers, roofers, salons — owners who need content but have no time to make it." },
  { title: "Shops & restaurants", line: "Grand openings, daily specials, reviews — a feed that never goes quiet." },
  { title: "Creators", line: "One idea becomes a week of posts, in every language your audience speaks." },
  { title: "Agencies & teams", line: "Run client brands from one stack — your links on every tool in it." },
];

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Connect with Whop",
    line: "One sign-in. The free Trial counts — no card, no new password.",
  },
  {
    icon: Link2,
    title: "Drop your website",
    line: "Ralph researches your business — your offer, your customers, your competitors — and learns it. That research powers everything after.",
  },
  {
    icon: Sparkles,
    title: "Get the results",
    line: "Your free content and your free audit land, made from what the research found. Your agents remember all of it for next time.",
  },
];

// The front door sells END RESULTS, not offers (Dave, 2026-11-18):
// free content, a free AI audit, persistent memory. The offer stack
// still exists — it sits at the bottom now, unforced.
const RESULTS = [
  {
    icon: Sparkles,
    title: "Free content",
    line: "A week of memes and posts for your business, in your customers' languages — made by bots Ralph dispatches with one tap. You approve; nothing posts itself.",
  },
  {
    icon: ScanSearch,
    title: "A free AI audit",
    line: "We deep-research your business and hand you a real pack: your site, your offer, the gaps costing you customers — and the fix list a full assessment would execute.",
  },
  {
    icon: Brain,
    title: "Persistent memory — yours",
    line: "Your agents remember your business — every fact, every campaign, every lesson — in a memory stack of your own. One click to deploy on your own infrastructure; we never hold your bots' memories, and you can take them with you.",
  },
];

export function LandingPage() {
  const [partners, setPartners] = useState<BridgePartner[]>([]);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stashRefFromUrl();
    void fetch("/api/bridge/partners")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.partners)) setPartners(data.partners as BridgePartner[]);
      })
      .catch(() => undefined);
  }, []);

  function slide(dir: 1 | -1) {
    sliderRef.current?.scrollBy({ left: dir * 264, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-10">
        <header className="text-center space-y-5">
          <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">
            Plunder &amp; Riffle — The Global Content Factory
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight">
            Your business, marketed
            <br />
            while you run it.
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Start with three things, all free: <b className="text-foreground">a week of content</b> made
            for your business, <b className="text-foreground">an AI audit</b> of what&apos;s costing you
            customers, and <b className="text-foreground">agents that remember your business</b> — so
            every week starts smarter than the last.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
            <Button asChild size="lg">
              <a href="/api/auth/whop">
                Connect with Whop <ArrowRight className="h-4 w-4 ml-1.5" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Free Trial included — connecting takes about a minute.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-center uppercase tracking-widest text-muted-foreground">
            What you get — free
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {RESULTS.map((r) => (
              <Card key={r.title}>
                <CardContent className="py-5 space-y-2">
                  <r.icon className="h-5 w-5 text-primary" />
                  <p className="font-bold">{r.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.line}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <BrandedBotCard />

        <section id="how" className="space-y-4 scroll-mt-8">
          <h2 className="text-sm font-bold text-center uppercase tracking-widest text-muted-foreground">
            How it works
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Card key={s.title}>
                <CardContent className="py-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <s.icon className="h-5 w-5 text-primary" />
                    <span className="text-xs font-bold text-muted-foreground">STEP {i + 1}</span>
                  </div>
                  <p className="font-bold">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.line}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <Coins className="h-4 w-4 text-primary" />
            First save pays 25 free generations — and 25 more to whoever sent you.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-center uppercase tracking-widest text-muted-foreground">
            Built for owners
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <Card key={a.title}>
                <CardContent className="py-5 space-y-1">
                  <p className="font-bold">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{a.line}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center pt-2">
            <Button asChild size="lg">
              <a href="/api/auth/whop">
                Get started with Plunder &amp; Riffle <ArrowRight className="h-4 w-4 ml-1.5" />
              </a>
            </Button>
          </div>
        </section>

<section className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Under the hood — the tools, when you want them
            </h2>
            <div className="flex gap-1">
              <button
                onClick={() => slide(-1)}
                aria-label="Previous offers"
                className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => slide(1)}
                aria-label="Next offers"
                className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* The offer slider (Dave, 2026-11-17): one compact card per
              offer — name, a one-line highlight, and the locked link
              teaser — in a horizontal snap slider instead of a tall
              list, so the front door stays short. */}
          <div
            ref={sliderRef}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:thin]"
          >
            {partners.map((p) => (
              <div
                key={p.key}
                className="snap-start shrink-0 w-[248px] rounded-xl border border-border bg-card p-4 space-y-2.5"
              >
                <p className="font-bold text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{p.blurb}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
                  Your link here once you connect
                </p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            <a href="/api/auth/whop" className="text-primary underline underline-offset-2">
              Connect with Whop
            </a>{" "}
            to put your own links on the tools you use — entirely optional, and your first save earns 25 free generations.
          </p>
        </section>

                <footer className="text-center space-y-2 pt-4 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground">
            Each referral program has its own terms and payout structure. Commissions aren&apos;t guaranteed.
          </p>
          <p className="text-[11px] text-muted-foreground">Powered by Plunder &amp; Riffle MCP.</p>
        </footer>
      </div>
    </main>
  );
}
