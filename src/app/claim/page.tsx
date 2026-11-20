"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, LogIn, Trophy } from "lucide-react";
import { useWhopSession } from "@/components/factory/whop-auth";

/**
 * ─── CLAIM YOUR WIN ─────────────────────────────────────────────────
 * Static pages (the board, the static doors game) have no accounts —
 * a win there arrives as a signed claim code (lib/claims.ts). This is
 * where it becomes real: signed in with Whop, one tap pays the win
 * into the member's free-generation balance. Codes are single-use
 * and expire 30 days after the win.
 */
export default function ClaimPage() {
  const { toast } = useToast();
  const { session, loading } = useWhopSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<{ amount: number; newBalance: number; source: string } | null>(null);

  // Deep link from the game: /claim?code=W1.…
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) setCode(fromUrl.trim());
  }, []);

  async function claim() {
    if (!code.trim()) {
      toast({ title: "Paste your claim code first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/claims/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        amount?: number;
        newBalance?: number;
        source?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Claim failed");
      setClaimed({ amount: json.amount!, newBalance: json.newBalance!, source: json.source ?? "static" });
    } catch (err) {
      toast({ title: "Couldn't claim that win", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="text-center space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          <Trophy className="h-3.5 w-3.5" aria-hidden /> Claim your win
        </span>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Won on a P&amp;R page? It pays out here.</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          The game pages are open to everyone, so they can&apos;t hold your balance. Your win travels as a
          claim code — paste it here and the free generations land in your account, ready to spend on memes,
          bots and bids.
        </p>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Your claim code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {claimed ? (
            <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">+{claimed.amount} free generations — claimed.</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Your balance is now {claimed.newBalance} free generations. They spend automatically when
                  your plan&apos;s monthly memes run out — or bid them in the rotator.
                </p>
                {/* /bridge, not "/": home is closed while the site gate
                    is up, and the bridge is the next hand-off step. */}
                <a href="/bridge" className="inline-block mt-3 text-sm text-primary underline underline-offset-2">
                  Next: get your agent
                </a>
              </div>
            </div>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your session…
            </p>
          ) : session?.connected ? (
            <>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="W1.… — paste the whole code"
                className="font-mono text-xs"
                aria-label="Claim code"
              />
              <Button onClick={() => void claim()} disabled={busy} className="w-full font-semibold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trophy className="h-4 w-4 mr-1.5" />}
                Claim my win
              </Button>
              <p className="text-xs text-muted-foreground">
                Signed in as {session.user.whopUsername ?? session.user.name ?? "your Whop account"} — the win
                pays into this account. Each code works once and expires 30 days after the win.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                A win can only be paid into your own account, so sign in with Whop first — it takes about a
                minute, and your code stays valid while you do.
              </p>
              <Button asChild className="w-full font-semibold">
                {/* Sign-in returns here with the code still in the URL
                    (lib/gate-paths safeReturnPath), so the win is one
                    tap away when they come back. */}
                <a href={`/api/auth/whop?next=${encodeURIComponent(code.trim() ? `/claim?code=${encodeURIComponent(code.trim())}` : "/claim")}`}>
                  <LogIn className="h-4 w-4 mr-1.5" /> Sign in with Whop to claim
                </a>
              </Button>
              {code ? (
                <p className="text-xs text-muted-foreground">
                  Signing in brings you straight back here with your code filled in.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
