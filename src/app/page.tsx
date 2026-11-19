"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  LayoutGrid,
  Library,
  Swords,
  UserRound,
  Bot,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ProfileDTO } from "@/lib/types";
import { CreateWizard, type WizardResult } from "@/components/factory/create-wizard";
import { ResultsWorkspace } from "@/components/factory/results-workspace";
import { MemeStudio } from "@/components/factory/meme-studio";
import { VideoStudio } from "@/components/factory/video-studio";
import { MemeArmy } from "@/components/factory/meme-army";
import { WarRoom } from "@/components/factory/war-room";
import { AgentsView } from "@/components/factory/agents";
import { RalphChat, type RalphNavIntent } from "@/components/factory/ralph-chat";
import { TrendingView } from "@/components/factory/trending";
import { CampaignsView } from "@/components/factory/campaigns";
import { LibraryView } from "@/components/factory/library";
import { BrandsView } from "@/components/factory/brands";
import { AccountView } from "@/components/factory/account";
import { PublishingView } from "@/components/factory/publishing";
import { WhopAccountBadge, useWhopSession } from "@/components/factory/whop-auth";
import { LandingPage } from "@/components/factory/landing";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/factory/locale-switcher";
import { QuizCard } from "@/components/factory/quiz-card";

type View =
  | "create"
  | "ralph"
  | "results"
  | "campaigns"
  | "library"
  | "army"
  | "agents"
  | "account";

type NavKey = "create" | "ralph" | "campaigns" | "library" | "army" | "agents" | "account" | "admin";

// Consolidated menu (Dave, 2026-11-17): fewer doors, same rooms.
// Meme Studio folded into Create; the War Room folded into Meme
// Army. The "studio" / "warroom" view keys no longer exist — the
// components render inside their parent views below.
//
// Nav diet, phase 1 (Dave, 2026-11-18, UI audit): Brands, Trending
// and Publishing lose their doors too — Brands and Trending are
// inputs to Create (a brand feeds the wizard; a trend loads Create
// a Meme) and Publishing is a property of Campaigns, so all three
// render inside those views now. Permanent nav badges (PRO / NEW /
// LIVE / OPS) are gone: badges are for state that clears, not
// decoration (ui-ux-pro-max tab-badge rule).
const NAV: { key: View; labelKey: NavKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "create", labelKey: "create", icon: Sparkles },
  // Ralph chat (Dave, 2026-11-18): the one-click dispatcher door.
  { key: "ralph", labelKey: "ralph", icon: MessagesSquare },
  { key: "campaigns", labelKey: "campaigns", icon: LayoutGrid },
  { key: "library", labelKey: "library", icon: Library },
  { key: "army", labelKey: "army", icon: Swords },
  { key: "agents", labelKey: "agents", icon: Bot },
  { key: "account", labelKey: "account", icon: UserRound },
];

// Mobile bottom bar: max 5 (ui-ux-pro-max bottom-nav-limit), the
// same primary destinations as the sidebar minus Library.
const MOBILE_NAV: View[] = ["create", "campaigns", "army", "agents", "account"];

export default function Home() {
  const [view, setView] = useState<View>("create");
  const [resultsCampaignId, setResultsCampaignId] = useState<string | null>(null);
  const [brandPrefill, setBrandPrefill] = useState<ProfileDTO | null>(null);
  const [brandPrefillName, setBrandPrefillName] = useState<string | null>(null);
  const [memePrefill, setMemePrefill] = useState<{ topic: string; nonce: number } | null>(null);
  // Front-door quiz (Dave, 2026-11-18): shown until the member's
  // answers (or a skip) are on file — see lib/quiz.ts.
  const [quizNeeded, setQuizNeeded] = useState(false);
  const { session, loading: sessionLoading, reload: reloadSession } = useWhopSession();
  const { toast } = useToast();
  const tNav = useTranslations("nav");

  // OAuth return handling: ?welcome=whop | ?auth_error=...
  // Toasts are deferred to a post-commit timer: the Toaster (sibling rendered
  // after {children}) subscribes in a later effect of the same commit, so a
  // toast dispatched synchronously during this effect would be missed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const welcome = params.get("welcome");
    const authError = params.get("auth_error");
    // Referral program: stash the inviter's code; attribution happens
    // once a session exists (see the effect below).
    const ref = params.get("ref");
    if (ref) {
      try {
        window.localStorage.setItem("pr_ref", ref);
      } catch {
        // storage unavailable — attribution is a bonus, never a blocker
      }
    }
    if (welcome || authError || ref) {
      window.setTimeout(() => {
        if (welcome === "whop") {
          toast({
            title: "Signed in with Whop",
            description: "Your identity was verified via Whop OAuth — entitlements sync from your membership.",
          });
        }
        if (authError) {
          toast({ title: "Whop sign-in failed", description: authError, variant: "destructive" });
        }
      }, 50);
      window.history.replaceState({}, "", window.location.pathname);
      void reloadSession();
    }
  }, []);

  // One-shot referral attribution: if this browser arrived via a
  // member's link and the visitor is signed in, credit the inviter.
  useEffect(() => {
    if (sessionLoading || !session) return;
    let code: string | null = null;
    try {
      code = window.localStorage.getItem("pr_ref");
    } catch {
      code = null;
    }
    if (!code) return;
    try {
      window.localStorage.removeItem("pr_ref");
    } catch {
      // ignore
    }
    void fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, [session, sessionLoading]);

  // Quiz state: fetch once a connected session exists. A saved
  // record (answers or a skip) keeps the card away for good.
  useEffect(() => {
    if (sessionLoading || !session?.connected) return;
    let cancelled = false;
    void fetch("/api/quiz")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.quiz) setQuizNeeded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, sessionLoading]);

  function openResults(campaignId: string) {
    setResultsCampaignId(campaignId);
    setView("results");
  }

  function startWizardWithBrand(profile: ProfileDTO, name: string) {
    setBrandPrefill(profile);
    setBrandPrefillName(name);
    setView("create");
  }

  // Trending → Create a Meme (Dave, 2026-11-17): the trend's brief
  // lands in the Meme Studio topic field, ready to generate — the
  // button never routes a member to a bot they can't use.
  function startMemesFromTrend(topic: string) {
    setMemePrefill({ topic, nonce: Date.now() });
    setView("create");
  }

  function clearBrandPrefill() {
    setBrandPrefill(null);
    setBrandPrefillName(null);
  }

  // Ralph chat navigation intents: Ralph routes, the page moves.
  // A meme topic rides the same prefill the Trending view uses.
  function onRalphNavigate(intent: RalphNavIntent) {
    if (intent.memeTopic) {
      startMemesFromTrend(intent.memeTopic);
      return;
    }
    setView(intent.view);
  }

  function onWizardCompleted(result: WizardResult) {
    openResults(result.campaignId);
    clearBrandPrefill();
  }

  const activeLabel =
    view === "results" ? tNav("results") : tNav(NAV.find((n) => n.key === view)?.labelKey ?? "create");

  // The Whop-connection gate (Dave, 2026-11-17): anonymous visitors
  // get the landing page — the front door borrowed from the Global
  // Content Factory page. The app's working parts unlock only after
  // Connect with Whop (any membership, Trial included). A failed
  // session fetch (session === null) falls through to the app rather
  // than locking anyone out on a network hiccup.
  if (!sessionLoading && session && !session.connected) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* top header — mobile brand row + plan context */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-3">
          <button className="flex items-center gap-2.5 min-w-0" onClick={() => setView("create")} aria-label={tNav("create")}>
            <span className="w-8 h-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-black text-sm tracking-tighter shrink-0">
              P&amp;R
            </span>
            <span className="hidden min-[420px]:block text-left leading-tight">
              <span className="block text-sm font-bold tracking-tight">Global Content Factory</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Powered by P&amp;R MCP</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-28 sm:max-w-none">{activeLabel}</span>
            <LocaleSwitcher />
            <WhopAccountBadge session={session} loading={sessionLoading} onSessionChanged={() => void reloadSession()} />
          </div>
        </div>
      </header>

      <div className="flex-1 flex w-full mx-auto max-w-7xl">
        {/* sidebar — desktop */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border/60 px-3 py-5 gap-1 sticky top-14 self-start h-[calc(100vh-3.5rem)]">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === "create") clearBrandPrefill();
                setView(item.key);
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                view === item.key || (view === "results" && item.key === "create")
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              <span className="truncate">{tNav(item.labelKey)}</span>
            </button>
          ))}

          {/* /admin door (Dave, 2026-11-18): shown only when an
              admin/operator is logged in (same session.admin flag
              that gates LLM Control). /admin is a real route that
              404s for everyone else, so the link is safe to show. */}
          {session?.admin ? (
            <a
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            >
              <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
              <span className="truncate">{tNav("admin")}</span>
            </a>
          ) : null}

          <div className="mt-auto rounded-xl border bg-card p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">{tNav("taglineTitle")}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{tNav("taglineBody")}</p>
          </div>
        </aside>

        {/* main content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-12">
          {quizNeeded ? (
            <div className="mb-8">
              <QuizCard
                onDone={(v) => {
                  setQuizNeeded(false);
                  if (v) setView(v as View);
                }}
              />
            </div>
          ) : null}
          {view === "create" ? (
            <div className="space-y-12">
              {/* Ralph entry card: the button-first door, one tap
                  from the room members land in. */}
              <button
                onClick={() => setView("ralph")}
                className="w-full flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3.5 text-left hover:bg-primary/12 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-primary grid place-items-center text-primary-foreground shrink-0">
                  <MessagesSquare className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold tracking-tight">Ask Ralph — one tap, no typing</span>
                  <span className="block text-xs text-muted-foreground truncate">Free content · free AI audit · he remembers your business</span>
                </span>
              </button>
              {/* Jump chips (Dave, 2026-11-18: "where is reply guy" —
                  the Create room stacks everything, so the doors get
                  named shortcuts at the top). */}
              <div className="flex flex-wrap gap-2 -mb-6">
                {[
                  { id: "create-trending", label: "🔥 Trending — Reply Guy lives here" },
                  { id: "create-meme-studio", label: "Meme Studio" },
                  { id: "create-video-studio", label: "Video Studio" },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => document.getElementById(chip.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold hover:border-primary/50 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {/* Nav diet phase 1: Brands lives here now — pick or
                  research a brand, then the wizard below runs with it. */}
              <BrandsView onUseInCampaign={startWizardWithBrand} />
              <CreateWizard onCompleted={onWizardCompleted} initialProfile={brandPrefill} initialProfileName={brandPrefillName} />
              {/* Trending lives here too — its one action loads the
                  meme studio directly below it. */}
              <div id="create-trending" className="scroll-mt-24">
                <TrendingView onCreateMemes={startMemesFromTrend} />
              </div>
              <div id="create-meme-studio" className="scroll-mt-24">
                <MemeStudio prefill={memePrefill} />
              </div>
              <div id="create-video-studio" className="scroll-mt-24">
                <VideoStudio />
              </div>
            </div>
          ) : null}
          {view === "ralph" ? <RalphChat onNavigate={onRalphNavigate} /> : null}
          {view === "results" && resultsCampaignId ? (
            <ResultsWorkspace campaignId={resultsCampaignId} onBack={() => setView("campaigns")} />
          ) : null}
          {view === "campaigns" ? (
            <div className="space-y-12">
              <CampaignsView onOpen={openResults} onNewCampaign={() => { clearBrandPrefill(); setView("create"); }} />
              {/* Publishing folded in (nav diet phase 1): posting
                  state is a property of the campaigns above. */}
              <PublishingView />
            </div>
          ) : null}
          {view === "library" ? <LibraryView /> : null}
          {view === "army" ? (
            <div className="space-y-12">
              <MemeArmy />
              <WarRoom />
            </div>
          ) : null}
          {view === "agents" ? <AgentsView /> : null}
          {view === "account" ? <AccountView /> : null}
        </main>
      </div>

      {/* sticky footer — pushes down naturally on overflow; extra bottom
          padding on mobile keeps text clear of the fixed bottom nav */}
      <footer className="mt-auto border-t border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 pt-4 pb-[max(env(safe-area-inset-bottom),6rem)] lg:pb-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            <span className="text-foreground font-semibold">P&amp;R GLOBAL CONTENT FACTORY</span> — ONE IDEA. 23 LANGUAGES. ENDLESS CONTENT.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Powered by Plunder &amp; Riffle MCP · Meme Army by P&amp;R
          </p>
        </div>
      </footer>

      {/* bottom nav — mobile */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md pb-safe"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_NAV.includes(n.key)).map((item) => (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === "create") clearBrandPrefill();
                setView(item.key);
              }}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium relative",
                view === item.key || (view === "results" && item.key === "create") ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate px-0.5">{tNav(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
