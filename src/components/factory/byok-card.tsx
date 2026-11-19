"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KeyStatus {
  linked: boolean;
  hasWhopId: boolean;
  status: string | null;
  botPlan: string | null;
  credits: number | null;
  granted: number | null;
  period: string | null;
  lastFetchedAt: string | null;
  reason?: string;
  message?: string;
}

/**
 * BYOK indicator (Dave, 2026-11-18): does this member have their own
 * P&R key? The key itself is derived by the engine from the member's
 * Whop identity — exactly one per Whop account — and is never typed
 * into or stored in this app. This card shows only the snapshot:
 * linked or not, which engine plan, and the last known balance.
 */
export function ByokCard() {
  const [state, setState] = useState<KeyStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge/key-status");
      if (res.ok) setState((await res.json()) as KeyStatus);
    } catch {
      // best-effort card
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await fetch("/api/bridge/key-status", { method: "POST" });
      if (res.ok) setState((await res.json()) as KeyStatus);
    } catch {
      // keep the last snapshot on screen
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 mb-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center shrink-0">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold tracking-tight">Your P&amp;R key (BYOK)</h3>
            {state === null ? null : state.linked ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">BYOK active</Badge>
            ) : (
              <Badge variant="secondary">House lane</Badge>
            )}
          </div>
          {state === null ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your key…
            </p>
          ) : state.linked ? (
            <p className="text-sm text-muted-foreground mt-1">
              Your own Plunder &amp; Riffle key is linked
              {state.botPlan ? <> · engine plan <b className="text-foreground">{state.botPlan}</b></> : null}
              {typeof state.credits === "number" ? (
                <> · <b className="text-foreground">{state.credits.toLocaleString()} credits</b> on it</>
              ) : null}
              {state.lastFetchedAt ? (
                <> · checked {new Date(state.lastFetchedAt).toLocaleDateString()}</>
              ) : null}
              . Voiced formats and your Muse spend from this key, not the shared house key.
            </p>
          ) : !state.hasWhopId ? (
            <p className="text-sm text-muted-foreground mt-1">
              Sign in with Whop and your key links automatically — the engine derives one key per Whop
              account. There is nothing to paste and nothing is stored here.
            </p>
          ) : state.status === "BLOCKED" ? (
            <p className="text-sm text-muted-foreground mt-1">
              No key is available for this account right now — contact support and we'll sort it.
              Until then, standard generations run on the shared house lane.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Not linked yet — standard generations run on the shared house lane, and voiced formats
              (Before packs, best-of reels, funnels) stay locked. Your key links itself the first
              time your Muse connects or a bot works for you — or check now.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            One key per Whop account: if you ever hold more than one, the one tied to the Whop
            account you're signed in with is the one that counts here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void checkNow()} disabled={checking || state === null}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">Check now</span>
        </Button>
      </div>
    </div>
  );
}
