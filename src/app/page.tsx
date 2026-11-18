"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Sparkles,
  LayoutGrid,
  Library,
  Fingerprint,
  Swords,
  UserRound,
  Flame,
  Bot,
  Cpu,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ProfileDTO } from "@/lib/types";
import { CreateWizard, type WizardResult } from "@/components/factory/create-wizard";
import { ResultsWorkspace } from "@/components/factory/results-workspace";
import { MemeStudio } from "@/components/factory/meme-studio";
import { VideoStudio } from "@/components/factory/video-studio";
import { MemeArmy } from "@/components/factory/meme-army";
import { WarRoom } from "@/components/factory/war-room";
import { AgentsView } from "@/components/factory/agents";
// LLM Control is operator-only (Dave, 2026-11-17): it is loaded
// lazily so its code never even ships in the main bundle members
// download — the nav item and the view are admin-gated below, and
// the /api/llm-console route 403s non-operators server-side.
const LlmConsole = dynamic(
  () => import("@/components/factory/llm-console").then((m) => m.LlmConsole),
  { ssr: false },
);
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

type View =
  | "create"
  | "results"
  | "campaigns"
  | "library"
  | "brands"
  | "publishing"
  | "army"
  | "agents"
  | "trending"
  | "llm"
  | "account";

type NavKey = "create" | "campaigns" | "library" | "brands" | "publishing" | "army" | "agents" | "trending" | "llm" | "account";

// Consolidated menu (Dave, 2026-11-17): fewer doors, same rooms.
// Meme Studio folded into Create; the War Room folded into Meme
// Army. The "studio" / "warroom" view keys no longer exist — the
// components render inside their parent views below.
const NAV: { key: View; labelKey: NavKey; icon: React.ComponentType<{ className?: string }>; badge?: string }[] = [
  { key: "create", labelKey: "create", icon: Sparkles },
  { key: "campaigns", labelKey: "campaigns", icon: LayoutGrid },
  { key: "library", labelKey: "library", icon: Library },
  { key: "brands", labelKey: "brands", icon: Fingerprint },
  { key: "publishing", labelKey: "publishing", icon: Flame },
  { key: "army", labelKey: "army", icon: Swords, badge: "PRO" },
  { key: "agents", labelKey: "agents", icon: Bot, badge: "NEW" },
  { key: "trending", labelKey: "trending", icon: TrendingUp, badge: "LIVE" },
  { key: "llm", labelKey: "llm", icon: Cpu, badge: "OPS" },
  { key: "account", labelKey: "account", icon: UserRound },
];

const MOBILE_NAV: View[] = ["create", "agents", "campaigns", "library", "army", "account"];

export default function Home() {
  const [view, setView] = useState<View>("create");
  const [resultsCampaignId, setResultsCampaignId] = useState<string | null>(null);
  const [brandPrefill, setBrandPrefill] = useState<ProfileDTO | null>(null);
  const [brandPrefillName, setBrandPrefillName] = useState<string | null>(null);
  const [memePrefill, setMemePrefill] = useState<{ topic: string; nonce: number } | null>(null);
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
          {NAV.filter((n) => n.key !== "llm" || session?.admin).map((item) => (
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
              {item.badge ? (
                <Badge className="ml-auto bg-primary/15 text-primary border-0 text-[9px] px-1.5 py-0">{item.badge}</Badge>
              ) : null}
            </button>
          ))}

          <div className="mt-auto rounded-xl border bg-card p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">{tNav("taglineTitle")}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{tNav("taglineBody")}</p>
          </div>
        </aside>

        {/* main content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-12">
          {view === "create" ? (
            <div className="space-y-12">
              <CreateWizard onCompleted={onWizardCompleted} initialProfile={brandPrefill} initialProfileName={brandPrefillName} />
              <MemeStudio prefill={memePrefill} />
              <VideoStudio />
            </div>
          ) : null}
          {view === "results" && resultsCampaignId ? (
            <ResultsWorkspace campaignId={resultsCampaignId} onBack={() => setView("campaigns")} />
          ) : null}
          {view === "campaigns" ? <CampaignsView onOpen={openResults} onNewCampaign={() => { clearBrandPrefill(); setView("create"); }} /> : null}
          {view === "library" ? <LibraryView /> : null}
          {view === "brands" ? <BrandsView onUseInCampaign={startWizardWithBrand} /> : null}
          {view === "publishing" ? <PublishingView /> : null}
          {view === "army" ? (
            <div className="space-y-12">
              <MemeArmy />
              <WarRoom />
            </div>
          ) : null}
          {view === "agents" ? <AgentsView /> : null}
          {view === "trending" ? <TrendingView onCreateMemes={startMemesFromTrend} /> : null}
          {view === "llm" && session?.admin ? <LlmConsole /> : null}
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
        <div className="grid grid-cols-7">
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
              {item.badge ? <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-primary" /> : null}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
