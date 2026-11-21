"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { stashRefFromUrl } from "@/lib/ref-stash";

/**
 * ─── / — Whop Army 2.0, Slice 1 (Dave's tap, 2026-11-21) ───────────
 *
 * "Remove most of /" — the one-time door's sections are gone. What
 * remains is the 2.0 front door and nothing else:
 *
 *   WHOP ARMY — Agents that do things.
 *   DISCOVER AGENTS · ENTER THE ROTATOR · BUILD AN AGENT
 *
 * Destinations are existing surfaces only:
 *   - DISCOVER AGENTS  -> /agents (the public agent directory,
 *                          Whop Army 2.0 Slice 2)
 *   - ENTER THE ROTATOR -> the live rotator serve (/api/bridge/rotator/go)
 *   - BUILD AN AGENT    -> /bridge (the hand-off: sign in, save a link,
 *                          get your agent's kit)
 *
 * The session probe survives only so operators keep their /admin
 * door in the header. Member rooms and their APIs are untouched —
 * members live in their own agent, reached via /bridge.
 */

const DISCOVER_URL = "/agents";
const ROTATOR_URL = "/api/bridge/rotator/go";
const BUILD_URL = "/bridge";
const CONNECT_URL = "/api/auth/whop";

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            {session?.admin ? (
              <a className="text-primary underline underline-offset-2" href="/admin">
                Admin
              </a>
            ) : null}
            <a className="text-primary underline underline-offset-2" href={CONNECT_URL}>
              Connect
            </a>
          </nav>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center space-y-5 py-16 text-center">
          <p className={label}>Whop Army</p>
          <h1 className="text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Agents that do things.
          </h1>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            Discover AI agents, applications, tools, and autonomous services built by people and agents.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild>
              <a href={DISCOVER_URL}>DISCOVER AGENTS</a>
            </Button>
            <Button asChild variant="outline">
              <a href={ROTATOR_URL}>ENTER THE ROTATOR</a>
            </Button>
            <Button asChild variant="outline">
              <a href={BUILD_URL}>BUILD AN AGENT</a>
            </Button>
          </div>
        </section>

        <footer className="border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
