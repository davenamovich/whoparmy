"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Brain, Check, ChevronLeft, ChevronRight, Coins, Lock, Moon, ScanSearch, Search, Sparkles, Sunrise, TrendingUp } from "lucide-react";
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
 * optional "under the hood" strip.
 *
 * Story pass (Dave, 2026-11-18 evening): "it sends users to a page
 * they have no idea what they are doing — tell a story more, make
 * it more intuitive." So the page now walks ONE example owner
 * through ONE week, beat by beat, before it ever lists a feature:
 * a cold visitor should be able to picture their own Sunday night
 * by the second screen. Dana is an illustrative example, labeled
 * as one — not a testimonial.
 *
 * Offer correction (Dave, same evening): "We are not giving every
 * user a week of content — they can get a free before." The free
 * thing is the /before pack: a spoken pitch + memes personalized
 * to the visitor's own business, built from the research. A week
 * of content is the member rhythm (plans / the bridge), never the
 * universal freebie — the copy says so.
 *
 * The three free results stay, framed
 * as what lands in the owner's lap; the machinery stays under the
 * hood at the bottom. Anonymous visitors get this page; the working
 * parts unlock only after Connect with Whop — any membership, the
 * free Trial included. Attribution (?ref=) is captured here, before
 * connect, and applied after (lib/ref-stash.ts).
 */

const STORY = [
  {
    icon: Moon,
    when: "Sunday · 9:04 pm",
    title: "Dana drops her website link",
    line: "Dana runs a dog-grooming shop in Raleigh. Marketing is the job she never gets to — there's always a dog, a phone, a register. Tonight she pastes her shop's web address into Plunder & Riffle and closes the laptop. That's her whole part.",
  },
  {
    icon: Search,
    when: "Sunday · 9:05 pm",
    title: "Ralph goes to work",
    line: "Ralph is the floor manager here. He researches Dana's shop end to end — her services, her prices, her reviews, the groomer across town — then teaches it all to her crew of bots. And he remembers it: nothing about her business ever gets asked twice.",
  },
  {
    icon: Sunrise,
    when: "Monday · 7:00 am",
    title: "Her free Before pack is waiting",
    line: "This is the free part, and it's the fun part: a Before pack made about HER shop — a pitchman pitching Dana's grooming like it's the greatest thing on television, plus five memes built from her services, her prices, her reviews. She watches her own business sold back to her, over coffee. That's the sample. No card, no commitment.",
  },
  {
    icon: ScanSearch,
    when: "Monday · 7:05 am",
    title: "The audit finds the leak",
    line: "With the content comes a free AI audit of how Dana's business shows up online: “Your site never mentions online booking — that's where the calls leak.” A real finding, a plain-English fix list, hers to keep either way.",
  },
  {
    icon: TrendingUp,
    when: "If Dana stays",
    title: "Then the rhythm starts",
    line: "The Before is what convinces her — and members run on a rhythm: a week of content at a time, approved with one tap, in her customers' languages. The special that booked out last week? Remembered. The post nobody clicked? Retired. Every week starts from everything the last one learned — that's the memory doing its job.",
  },
];

const OWNER_JOBS = ["Drop your website", "Tap approve", "Run your business"];

// The front door sells END RESULTS, not offers (Dave, 2026-11-18):
// free content, a free AI audit, persistent memory. The offer stack
// still exists — it sits at the bottom now, unforced.
const RESULTS = [
  {
    icon: Sparkles,
    title: "A free Before pack",
    line: "A spoken pitch and memes made about your business — your offer, your prices, your reviews — built from the research. It's the sample that shows you the whole machine, pointed at you. Free for every owner who drops a website.",
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

const AUDIENCES = [
  { title: "Local services", line: "Plumbers, roofers, salons — owners who need content but have no time to make it." },
  { title: "Shops & restaurants", line: "Grand openings, daily specials, reviews — a feed that never goes quiet." },
  { title: "Creators", line: "One idea becomes a week of posts, in every language your audience speaks." },
  { title: "Agencies & teams", line: "Run client brands from one stack — your links on every tool in it." },
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
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-12">
        <header className="text-center space-y-5">
          <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">
            Plunder &amp; Riffle — The Global Content Factory
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight">
            Your business, marketed
            <br />
            while you run it.
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Marketing is the job that never makes the to-do list. Here&apos;s the fix: tonight you drop
            your website — <b className="text-foreground">that&apos;s the whole job</b> — and a crew of AI
            bots that learn your business goes to work. By morning there&apos;s{" "}
            <b className="text-foreground">a free Before pack</b> waiting — a pitch and memes made about{" "}
            <i>your</i> business — plus <b className="text-foreground">a free audit</b> of what&apos;s
            costing you customers, from a crew that <b className="text-foreground">remembers your
            business</b> for next time.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
            <Button asChild size="lg">
              <a href="/api/auth/whop">
                Start free — connect with Whop <ArrowRight className="h-4 w-4 ml-1.5" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#story">Read one owner&apos;s week</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Free Trial included — connecting takes about a minute, no card.
          </p>
        </header>

        <section id="story" className="space-y-5 scroll-mt-8">
          <div className="text-center space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              One owner&apos;s week
            </h2>
            <p className="text-xs text-muted-foreground">
              An example, start to finish — picture your own business in Dana&apos;s chair.
            </p>
          </div>
          <div className="relative space-y-4 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-border sm:before:left-1/2">
            {STORY.map((beat) => (
              <div key={beat.title} className="relative flex gap-4 sm:gap-6 pl-0">
                <span className="relative z-10 w-10 h-10 shrink-0 rounded-full bg-primary/12 text-primary grid place-items-center sm:mx-auto">
                  <beat.icon className="h-5 w-5" />
                </span>
                <Card className="flex-1">
                  <CardContent className="py-4 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{beat.when}</p>
                    <p className="font-bold">{beat.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{beat.line}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-center space-y-2">
            <p className="text-sm font-bold">Your job in all of this: three things.</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {OWNER_JOBS.map((job, i) => (
                <span key={job} className="inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-3 py-1.5 text-sm font-medium">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  {i + 1} · {job}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The research, the writing, the design, the translation, the remembering — that&apos;s the crew&apos;s job.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-center uppercase tracking-widest text-muted-foreground">
            What lands in your lap — free
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
          <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <Coins className="h-4 w-4 text-primary" />
            First save pays 25 free generations — and 25 more to whoever sent you.
          </p>
        </section>

        <div className="space-y-2">
          <p className="text-center text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Or skip the reading — just play with it
          </p>
          <BrandedBotCard />
        </div>

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
        </section>

        <section className="rounded-2xl bg-primary text-primary-foreground px-6 py-8 text-center space-y-3">
          <p className="text-2xl font-black leading-snug">Your Before pack is free.</p>
          <p className="text-sm opacity-90 max-w-xl mx-auto leading-relaxed">
            Drop your website tonight, hear your own business pitched back to you over tomorrow&apos;s
            coffee. If the audit doesn&apos;t find something worth fixing, you&apos;ve lost an evening
            you weren&apos;t using anyway.
          </p>
          <Button asChild size="lg" variant="secondary">
            <a href="/api/auth/whop">
              Get started with Plunder &amp; Riffle <ArrowRight className="h-4 w-4 ml-1.5" />
            </a>
          </Button>
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
