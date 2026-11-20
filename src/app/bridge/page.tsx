"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { BtcAddressesCard } from "@/components/bridge/btc-addresses-card";
import type { BridgeState } from "@/lib/bridge";
import { clearStashedRef, readStashedRef, stashRefFromUrl } from "@/lib/ref-stash";

/**
 * ─── /bridge — the one-time hand-off (Dave, 2026-11-20) ─────────────
 *
 * A player arrives here from The BTC Experiment's "ACTIVATE YOUR
 * AGENT" (?ref= preserved) with their agent already chosen. This page
 * does one job: turn "I have an agent and a DH Media link" into "my
 * agent has its kit" — a bridge code and the BTC Barry prompt — and
 * then get out of the way. Members do not come back to run anything;
 * their agent does the work.
 *
 *   signed out → Sign in with Whop (returns here, lib/gate-paths)
 *   signed in  → 1. your DH Media link (the unlock)
 *                2. your agent kit (POST /api/bridge/agent — the
 *                   "experiment" scope: any plan, own balance, 24h)
 *                3. give it to your agent (Muse, Agent37, any agent)
 *
 * What used to live here (the referral dashboard, the affiliate
 * manager, the rotator and its bids) moved to the member's agent; the
 * API routes it used are untouched. Rotator admin moved to /admin.
 * The page stays open while the site gate is up (lib/gate-paths.ts).
 */

const MUSE_URL = "https://www.plunderandriffle.com/muse-invite";
const AGENT37_URL = "https://agent37.com/?via=riffle";
const GAME_URL = "https://thebtcexperiment.com/";
// TODO(Dave): a deep link to Whop's membership settings, once
// confirmed in Whop's docs. whop.com is the safe default.
const WHOP_URL = "https://whop.com/";

type Kit = { code: string; expiresAt: string; budgetCredits: number; connectUrl: string; prompt: string };
type Session = { connected: boolean; admin: boolean; user: { name: string | null; whopUsername: string | null } | null };

const step = "rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3";
const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

function mask(url: string): string {
  return url.length <= 28 ? url : `${url.slice(0, 18)}…${url.slice(-6)}`;
}

function CopyButton({ text, children }: { text: string; children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 2000);
          })
          .catch(() => undefined);
      }}
    >
      {done ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
      {done ? "Copied" : children}
    </Button>
  );
}

export default function BridgePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const attributedRef = useRef(false);

  useEffect(() => {
    // Capture ?ref= before sign-in: the stash survives the Whop round
    // trip, and is applied once a real session exists (below).
    stashRefFromUrl();
    // A failed Whop sign-in lands back here with ?auth_error= (the
    // callback returns to the page that started it). Read with the
    // session, so both settle in one update.
    const failed = new URLSearchParams(window.location.search).get("auth_error");
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Session) => {
        setAuthError(failed);
        setSession(s);
      })
      .catch(() => {
        setAuthError(failed);
        setSession({ connected: false, admin: false, user: null });
      });
  }, []);

  useEffect(() => {
    if (!session?.connected || attributedRef.current) return;
    attributedRef.current = true;
    const code = new URLSearchParams(window.location.search).get("ref") ?? readStashedRef();
    if (!code) return;
    void fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .catch(() => undefined)
      .finally(() => clearStashedRef());
  }, [session]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16 space-y-8">
        <header className="space-y-4">
          <p className={label}>The BTC Experiment · get your agent</p>
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.02] tracking-tight">
            Give your agent its first job.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Your agent makes your content on the Plunder &amp; Riffle engine. This page gives it the one thing it
            needs: a bridge code — its connection to the engine, on your own credits. One sign-in, once. You
            won&apos;t need this page again.
          </p>
        </header>

        {authError ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            Whop sign-in didn&apos;t finish: {authError}. Try again below.
          </p>
        ) : null}

        {session === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in…
          </p>
        ) : !session.connected ? (
          <SignedOut />
        ) : (
          <SignedIn />
        )}

        <footer className="border-t border-border/60 pt-6 space-y-2 text-xs text-muted-foreground">
          <p>
            Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown
            anywhere is simulated until it&apos;s actually paid. Nothing is guaranteed.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <a className="underline underline-offset-2" href={WHOP_URL} target="_blank" rel="noreferrer">
              Plans and billing: Whop
            </a>
            <a className="underline underline-offset-2" href={GAME_URL} target="_blank" rel="noreferrer">
              Back to the experiment
            </a>
            {session?.admin ? (
              <a className="underline underline-offset-2" href="/admin">
                Admin
              </a>
            ) : null}
          </p>
        </footer>
      </div>
    </main>
  );
}

function SignedOut() {
  return (
    <div className={step}>
      <p className="font-semibold">Sign in with Whop to get your code.</p>
      <p className="text-sm text-muted-foreground">
        It ties your agent&apos;s connection to you, so what it makes runs on your own credits and your links stay
        yours. The free Trial counts.
      </p>
      <Button asChild size="lg">
        <a href="/api/auth/whop?next=%2Fbridge">
          Sign in with Whop <ArrowRight className="h-4 w-4 ml-1.5" />
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">
        No agent yet?{" "}
        <a className="underline underline-offset-2" href={MUSE_URL} target="_blank" rel="noreferrer">
          Muse
        </a>{" "}
        if you&apos;re on Facebook, or{" "}
        <a className="underline underline-offset-2" href={AGENT37_URL} target="_blank" rel="noreferrer">
          Agent37
        </a>{" "}
        if you&apos;re not. Both are our referral links.
      </p>
    </div>
  );
}

function SignedIn() {
  const [dhLink, setDhLink] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [minting, setMinting] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bridge/links", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { bridge?: BridgeState }) => {
        const url = data.bridge?.partners.find((p) => p.key === "dh-media")?.url?.trim() ?? "";
        setDhLink(url || null);
      })
      .catch(() => setDhLink(null));
  }, []);

  async function saveLink() {
    setSavingLink(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/bridge/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: { "dh-media": draft.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your link");
      const url = (data.bridge as BridgeState | undefined)?.partners.find((p) => p.key === "dh-media")?.url ?? draft.trim();
      setDhLink(url || null);
      setEditing(false);
      setKit(null); // a new link means a new kit: the prompt carries the link
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not save your link");
    } finally {
      setSavingLink(false);
    }
  }

  async function getKit() {
    setMinting(true);
    setKitError(null);
    try {
      const res = await fetch("/api/bridge/agent", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not make your kit");
      setKit(data as Kit);
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Could not make your kit");
    } finally {
      setMinting(false);
    }
  }

  const linkReady = typeof dhLink === "string" && dhLink.length > 0 && !editing;

  return (
    <div className="space-y-5">
      {/* 1 — the unlock */}
      <section className={step} aria-labelledby="s1">
        <p className={label}>Step 1</p>
        <h2 id="s1" className="text-lg font-bold">Your DH Media link</h2>
        {dhLink === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : linkReady ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <code className="rounded-md border bg-background px-2 py-1 text-xs">{mask(dhLink)}</code>
            <button
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => {
                setDraft(dhLink);
                setEditing(true);
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Saving your own DH Media referral link is what unlocks your agent&apos;s connection. Your agent
              promotes this link, so it has to be yours.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://dh.media/?affid=…"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
              <Button onClick={() => void saveLink()} disabled={savingLink || !draft.trim()}>
                {savingLink ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Save my link
              </Button>
            </div>
            {linkError ? <p className="text-sm text-destructive">{linkError}</p> : null}
          </div>
        )}
      </section>

      {/* 2 — the kit */}
      <section className={step} aria-labelledby="s2">
        <p className={label}>Step 2</p>
        <h2 id="s2" className="text-lg font-bold">Your agent&apos;s kit</h2>
        {!kit ? (
          <>
            <p className="text-sm text-muted-foreground">
              A bridge code plus the BTC Barry prompt. Your agent spends your own credits, quotes before it
              spends, and can&apos;t publish anything. The code is good for 24 hours, once.
            </p>
            <Button onClick={() => void getKit()} disabled={!linkReady || minting}>
              {minting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Get my agent&apos;s kit
            </Button>
            {!linkReady && dhLink !== undefined ? (
              <p className="text-xs text-muted-foreground">Save your DH Media link first.</p>
            ) : null}
            {kitError ? <p className="text-sm text-destructive">{kitError}</p> : null}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-md border bg-background px-3 py-1.5 text-base font-bold tracking-wider">
                {kit.code}
              </code>
              <CopyButton text={kit.code}>Copy code</CopyButton>
            </div>
            <p className="text-xs text-muted-foreground">
              Good until {new Date(kit.expiresAt).toLocaleString()}, single use. Spending cap:{" "}
              {kit.budgetCredits.toLocaleString()} credits — your own balance.
            </p>
            <details className="rounded-xl border bg-background">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">See the prompt</summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-4 pb-4 font-mono text-xs leading-relaxed">
                {kit.prompt}
              </pre>
            </details>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={kit.prompt}>Copy the prompt</CopyButton>
              <CopyButton text={kit.connectUrl}>Copy the agent link</CopyButton>
              <Button variant="ghost" size="sm" onClick={() => void getKit()} disabled={minting}>
                Get a fresh code
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 3 — hand it over */}
      <section className={step} aria-labelledby="s3">
        <p className={label}>Step 3</p>
        <h2 id="s3" className="text-lg font-bold">Give it to your agent</h2>
        <ul className="space-y-3 text-sm">
          <li>
            <b>Muse</b> — already on Facebook? Open Super Muse and enter your code, or paste the prompt into
            Muse.{" "}
            <a className="inline-flex items-center gap-1 text-primary underline underline-offset-2" href={MUSE_URL} target="_blank" rel="noreferrer">
              Open Muse <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <b>Agent37</b> — not on Facebook? Give your Agent37 agent the prompt or the agent link.{" "}
            <a className="inline-flex items-center gap-1 text-primary underline underline-offset-2" href={AGENT37_URL} target="_blank" rel="noreferrer">
              Open Agent37 <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <b>Any other agent</b> that can read a web page — give it the agent link. The page tells it what to
            do.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Muse and Agent37 links are our referral links. Your agent never asks for an API key — if one does,
          don&apos;t paste it.
        </p>
      </section>

      {/* Barry's onboarding asks for these; optional, public only. */}
      <details className="rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
          Your BTC addresses (optional — your agent will ask)
        </summary>
        <div className="px-5 pb-5">
          <BtcAddressesCard />
        </div>
      </details>
    </div>
  );
}
