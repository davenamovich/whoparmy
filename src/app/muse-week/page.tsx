"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Bot, CheckCircle2, Coins, Copy, KeyRound, Loader2, Lock, RefreshCw, ShieldOff } from "lucide-react";
import { museWeekCommand } from "@/lib/muse-week-command";

/**
 * ─── MUSE WEEK ───────────────────────────────────────────────────────
 * Dave's end result (2026-11-17): the member creates a Muse account,
 * copies ONE command from this page, and their Muse makes a week of
 * content through the bridge — on the member's own P&R credits.
 * The command text lives in src/lib/muse-week-command.ts (single
 * source — this page, Ralph chat, and MEMBER-ONE-COMMAND.md all
 * render the same text; change it there).
 */

interface BridgeAccount {
  connected: boolean;
  eligible: boolean;
  botPlan: string;
  credits: number | null;
  granted: number;
  period: string | null;
  brand: { name: string; website: string | null } | null;
  tokens: Array<{ id: string; budgetCredits: number; spentCredits: number; expiresAt: string; active: boolean }>;
  weekBudgetCredits: number;
  offers: Offer[];
  error: string | null;
  errorCode: string | null;
}

type OfferId = "taste" | "week" | "opener";

interface Offer {
  id: OfferId;
  name: string;
  budgetCredits: number;
  blurb: string;
}

const FALLBACK_OFFERS: Offer[] = [
  { id: "taste", name: "The Taste", budgetCredits: 115, blurb: "One day-pack — run the whole flow once." },
  { id: "week", name: "The Week", budgetCredits: 805, blurb: "Seven day-packs, one per day, seven angles." },
  { id: "opener", name: "Week + Opener", budgetCredits: 855, blurb: "The Week, plus a personalized /before pitch for your business." },
];

export default function MuseWeekPage() {
  const { toast } = useToast();
  const [gate, setGate] = useState<"loading" | "teaser" | "open">("loading");
  const [account, setAccount] = useState<BridgeAccount | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<OfferId>("week");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadAccount = useCallback(async () => {
    const res = await fetch("/api/bridge/account");
    if (res.ok) {
      const json = (await res.json()) as { account: BridgeAccount };
      setAccount(json.account);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const json = (await res.json()) as { connected?: boolean };
        if (!json.connected) {
          setGate("teaser");
          return;
        }
        setGate("open");
        await loadAccount();
      } catch {
        setGate("teaser");
      }
    })();
  }, [loadAccount]);

  const generateCode = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/bridge/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: offerId }) });
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) throw new Error(json.error || "Could not generate a code");
      setCode(json.code);
      setCopied(false);
    } catch (err) {
      toast({ title: "Bridge code failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (tokenId: string) => {
    await fetch("/api/bridge/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenId }),
    });
    await loadAccount();
  };

  if (gate === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your connection…
        </p>
      </main>
    );
  }

  if (gate === "teaser") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <h1 className="text-3xl font-bold">Your Muse makes your week</h1>
        <p className="text-muted-foreground">
          Create a Muse, paste one command from this page, and your agent makes 7 days of content for your business —
          on your own Plunder &amp; Riffle credits, through this bridge. Connect with Whop to see your command.
        </p>
        <p className="text-sm font-medium">A special offer for Operator and Agency members — not a public offer.</p>
        <Button asChild>
          <a href="/api/auth/whop">Connect with Whop</a>
        </Button>
      </main>
    );
  }

  const businessUrl = account?.brand?.website || "https://your-business-website.com";
  const offers = account?.offers?.length ? account.offers : FALLBACK_OFFERS;
  const selectedOffer = offers.find((o) => o.id === offerId) ?? offers[0];
  const budget = selectedOffer.budgetCredits;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your Muse makes your week</h1>
        <p className="mt-2 text-muted-foreground">
          One command. Seven days of content. Your credits, your agent, your approval before anything publishes.
        </p>
        <p className="mt-1 text-sm font-medium">A special offer for Operator and Agency members — not a public offer.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5" /> 1 · Your Muse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Don&apos;t have a Muse yet? Join with invite code <strong>49YNE2</strong> — you get 1 billion tokens and
            so does the member who invited you (join within 48 hours of the invite for it to count).
          </p>
          <Button variant="outline" asChild>
            <a href="https://www.plunderandriffle.com/muse-invite" target="_blank" rel="noreferrer">
              Create your Muse
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5" /> 2 · Your credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!account && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your P&amp;R balance…
            </p>
          )}
          {account?.connected && (
            <>
              <p>
                Balance: <strong>{account.credits === -1 ? "Unlimited" : `${account.credits} credits`}</strong>
                {account.granted > 0 && <> · {account.granted} granted this cycle</>}
                {account.period && <> · cycle {account.period.replace("paid:", "")}</>}
              </p>
              <p className="text-muted-foreground">
                These credits live on your own Plunder &amp; Riffle key, issued for your Whop account. Your Muse
                spends them through this bridge — it never sees the key itself.
              </p>
            </>
          )}
          {account && !account.connected && (
            <p className="flex items-start gap-2 text-amber-500">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              {account.errorCode === "NO_WHOP_ID"
                ? "Sign in with Whop (not the operator fallback) so your account can be linked to its credits."
                : account.error ?? "The bridge is not reachable yet."}
            </p>
          )}
          {account && account.tokens.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="font-medium">Bridge tokens</p>
              {account.tokens.map((t) => (
                <p key={t.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>
                    {t.active ? "Active" : "Dead"} · spent {t.spentCredits} of {t.budgetCredits} credits · expires{" "}
                    {new Date(t.expiresAt).toLocaleDateString()}
                  </span>
                  {t.active && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(t.id)}>
                      <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" /> 3 · Your one command
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {account && !account.eligible ? (
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This one&apos;s not on your plan. The Muse bridge is a special offer for{" "}
                <strong>Operator and Agency</strong> members — one command, and your own Muse makes your week on
                your own credits. Upgrade in Whop and this page unlocks.
              </span>
            </p>
          ) : (
            <>
          {!account?.brand?.website && account?.connected && (
            <p className="text-amber-500">
              Add a brand with your business website first (Brands, above) — the command below carries a placeholder
              URL until you do. You can also just tell your Muse the right URL when you paste it.
            </p>
          )}
          {!code ? (
            <>
              <div className="space-y-2">
                {offers.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOfferId(o.id)}
                    className={`w-full rounded-md border p-3 text-left ${o.id === offerId ? "border-primary bg-muted" : "border-border"}`}
                  >
                    <span className="font-medium">{o.name}</span> · {o.budgetCredits} credits
                    <span className="block text-muted-foreground">{o.blurb}</span>
                  </button>
                ))}
              </div>
              <Button onClick={generateCode} disabled={busy || !account?.connected}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Generate my command
              </Button>
            </>
          ) : (
            <>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-relaxed">
                {museWeekCommand(code, businessUrl, budget, offerId)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(museWeekCommand(code, businessUrl, budget, offerId));
                    setCopied(true);
                  }}
                >
                  {copied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copied" : "Copy the command"}
                </Button>
                <Button variant="outline" onClick={generateCode} disabled={busy}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Fresh code (kills the old one)
                </Button>
              </div>
              <p className="text-muted-foreground">
                The code inside expires in 15 minutes and works once. The token it issues lasts 7 days — one pairing,
                one run. Your Muse will quote {selectedOffer.name} first (list price {budget} credits) and wait for
                your &ldquo;go&rdquo; before spending anything.
              </p>
            </>
          )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
