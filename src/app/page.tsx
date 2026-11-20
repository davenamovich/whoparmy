"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stashRefFromUrl } from "@/lib/ref-stash";

/**
 * ─── / — the one-time door (Dave, 2026-11-20) ───────────────────────
 *
 * "Users are not going to log in repeatedly." The nine-room dashboard
 * that lived here (Create, Ralph, Campaigns, Library, Meme Army, Agents,
 * My AI System, Account) is gone: members live in their own agent, and
 * the agent does that work through the bridge. This page only points:
 *
 *   - new here   → The BTC Experiment (the front door), or /bridge if
 *                  they already played
 *   - signed in  → your agent lives in your agent app; /bridge for a
 *                  fresh code; Whop for plans and billing
 *   - operator   → /admin
 *
 * The rooms' components stay in components/factory for now and their
 * API routes are untouched (agents and the operator still use them);
 * only the doors closed. While the site gate is up this page is still
 * operator-only (app/layout.tsx); the public hand-off is /bridge.
 */

const GAME_URL = "https://thebtcexperiment.com/";
const MUSE_URL = "https://www.plunderandriffle.com/muse-invite";
const AGENT37_URL = "https://agent37.com/?via=riffle";
// TODO(Dave): deep link to Whop's membership settings once confirmed.
const WHOP_URL = "https://whop.com/";

type Session = { connected: boolean; admin: boolean; user: { name: string | null; whopUsername: string | null } | null };

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

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

  const name = session?.user?.name ?? session?.user?.whopUsername ?? null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-14 sm:py-20 space-y-10">
        <header>
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
        </header>

        {session === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Loading">
            <Loader2 className="h-4 w-4 animate-spin" />
          </p>
        ) : session.connected ? (
          <section className="space-y-5">
            <p className={label}>{name ? `Signed in as ${name}` : "Signed in"}</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-[1.02] tracking-tight">
              Your agent lives in your agent app.
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              There&apos;s nothing to run here. Your agent makes your content on the Plunder &amp; Riffle engine and
              asks you before anything publishes or spends. Open it to keep going.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={MUSE_URL} target="_blank" rel="noreferrer">
                  Open Muse <ExternalLink className="h-4 w-4 ml-1.5" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={AGENT37_URL} target="_blank" rel="noreferrer">
                  Open Agent37 <ExternalLink className="h-4 w-4 ml-1.5" />
                </a>
              </Button>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                Code expired, or setting up a new agent?{" "}
                <a className="text-primary underline underline-offset-2" href="/bridge">
                  Get a fresh code
                </a>
              </li>
              <li>
                Plans and billing are on{" "}
                <a className="text-primary underline underline-offset-2" href={WHOP_URL} target="_blank" rel="noreferrer">
                  Whop
                </a>
                .
              </li>
              {session.admin ? (
                <li>
                  <a className="text-primary underline underline-offset-2" href="/admin">
                    Admin
                  </a>
                </li>
              ) : null}
            </ul>
          </section>
        ) : (
          <section className="space-y-5">
            <h1 className="text-4xl sm:text-5xl font-black leading-[1.02] tracking-tight">Start with the experiment.</h1>
            <p className="text-muted-foreground leading-relaxed">
              Play The BTC Experiment, pick an agent, and come back here once to give it its bridge code. After that,
              your agent does the work.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={GAME_URL}>
                  Play The BTC Experiment <ArrowRight className="h-4 w-4 ml-1.5" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="/bridge">Already played? Get your agent&apos;s code</a>
              </Button>
            </div>
          </section>
        )}

        <footer className="border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
