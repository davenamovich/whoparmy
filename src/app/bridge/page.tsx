"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CheckCircle2, Link2, Loader2 } from "lucide-react";
import type { BridgeState } from "@/lib/bridge";

/**
 * ─── THE BRIDGE ──────────────────────────────────────────────────────
 * The simple landing page members arrive on from meme-loop-engine.
 * Modeled on Dave's Global Content Factory page: hero, the partner
 * stack, save your own links — the start of building your own engine.
 * The first save pays the inviter's free generations (lib/bridge.ts).
 */
export default function BridgePage() {
  const { toast } = useToast();
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState<null | { firstSave: boolean; referrerPaid: boolean }>(null);
  const attributedRef = useRef(false);

  useEffect(() => {
    // Arriving with ?ref=CODE attributes this member to their inviter
    // (one-shot, server-side) so the link-save reward can find them.
    if (!attributedRef.current) {
      attributedRef.current = true;
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code) {
        void fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }).catch(() => undefined);
      }
    }
    let alive = true;
    void fetch("/api/bridge/links")
      .then((r) => r.json())
      .then((data) => {
        if (!alive || !data.bridge) return;
        setBridge(data.bridge as BridgeState);
        setDraft(Object.fromEntries((data.bridge as BridgeState).partners.map((p) => [p.key, p.url])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/bridge/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setBridge(data.bridge as BridgeState);
      setJustSaved({ firstSave: Boolean(data.firstSave), referrerPaid: Boolean(data.referrerPaid) });
      toast({ title: data.firstSave ? "Your stack is live" : "Links saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        <header className="text-center space-y-4">
          <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">
            Plunder &amp; Riffle — The Global Content Factory
          </p>
          <h1 className="text-4xl font-black leading-tight">
            Don&apos;t just make content.
            <br />
            Build your own engine.
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The tools powering the P&amp;R ecosystem have their own referral programs. Save{" "}
            <b className="text-foreground">your</b> links for each one, and your stack is live — every
            meme you make from here can carry the links that pay you. This is step one.
          </p>
        </header>

        {justSaved?.firstSave ? (
          <Card className="border-primary/50">
            <CardContent className="py-5 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold">Your stack is live.</p>
                <p className="text-sm text-muted-foreground">
                  {justSaved.referrerPaid
                    ? "The member who sent you just earned 25 free generations for bringing you in. When you invite your own people and they save their links, you earn them too."
                    : "When you invite your own people and they save their links here, you earn 25 free generations for each one."}{" "}
                  Next: give your engine a brand and let it start creating.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2 pt-1"
                >
                  Start generating <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Your links
          </h2>
          {bridge === null ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your stack…
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {bridge.partners.map((p) => (
                  <Card key={p.key}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{p.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground">{p.blurb}</p>
                      <Input
                        value={draft[p.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                        placeholder={p.example}
                        className="text-xs"
                        inputMode="url"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {bridge.linksSavedAt ? "Save links" : "Save my links — light it up"}
                </Button>
                {bridge.linksSavedAt ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Stack live since{" "}
                    {new Date(bridge.linksSavedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Saving your first link{bridge.hasReferrer ? " pays your inviter 25 free generations" : " starts your engine"}.
                  </span>
                )}
              </div>
            </>
          )}
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
