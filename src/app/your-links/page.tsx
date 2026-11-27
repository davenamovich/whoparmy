"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";

/**
 * /your-links — the member-visible read-back of the links saved on
 * their profile through the bridge (GET /api/bridge/links →
 * getBridgeState). Restored 2026-11-27: the old Your Links page was
 * removed when /bridge became a redirect, leaving members no on-site
 * surface to confirm what their Muse saved for them.
 */

interface Partner {
  key: string;
  name: string;
  blurb: string;
  url: string;
  signupUrl: string | null;
  signupSource: "referrer" | "house" | null;
}

interface BridgeState {
  partners: Partner[];
  linksSavedAt: string | null;
  referrerLabel: string | null;
}

const step = "rounded-[10px] border border-border bg-card p-5 sm:p-6 space-y-3";
const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

export default function YourLinksPage() {
  const [state, setState] = useState<BridgeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    void fetch("/api/bridge/links", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { setUnauthorized(true); return; }
        const data = (await r.json()) as { bridge?: BridgeState; error?: string };
        if (!r.ok || !data.bridge) throw new Error(data.error ?? "Could not load your links");
        setState(data.bridge);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your links"));
  }, []);

  const saved = state?.partners.filter((p) => p.url) ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <SiteHeader />
        <section className="space-y-3">
          <p className={label}>Your Links</p>
          <h1 className="font-display text-4xl font-black leading-[1.02] tracking-tight">The links saved on your profile</h1>
          <p className="leading-relaxed text-muted-foreground">
            These are the offer links your Muse saved for you through the bridge. Your shares and sign-up buttons use
            exactly these links — if one is missing, ask your Muse to finish that unlock, or save it in Mission Control.
          </p>
        </section>

        {unauthorized ? (
          <section className={step}>
            <p className="font-semibold">Sign in to see your links</p>
            <p className="text-sm text-muted-foreground">Your links live on your own member profile.</p>
            <Button asChild>
              <a href="/api/auth/whop?next=%2Fyour-links">Sign in with Whop</a>
            </Button>
          </section>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>
        ) : !state ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your links…</p>
        ) : (
          <section className={step} aria-label="Saved links">
            <p className="text-sm text-muted-foreground">
              {saved.length} of {state.partners.length} links saved
              {state.linksSavedAt ? ` · last saved ${new Date(state.linksSavedAt).toLocaleString()}` : ""}
              {state.referrerLabel ? ` · you came in under ${state.referrerLabel}` : ""}
            </p>
            <ul className="divide-y divide-border">
              {state.partners.map((p) => (
                <li key={p.key} className="space-y-1 py-3">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {p.url ? (
                    <p className="break-all font-mono text-xs">{p.url}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Not saved yet{p.signupUrl ? <> — <a className="underline underline-offset-4" href={`/api/bridge/signup?partner=${encodeURIComponent(p.key)}`}>sign up{p.signupSource === "referrer" ? " through your referrer's link" : ""}</a> to get yours</> : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Building your agent? <a className="font-semibold underline underline-offset-4" href="/build">Go to /build</a>
            </p>
          </section>
        )}
        <SiteFooter />
      </div>
    </main>
  );
}
