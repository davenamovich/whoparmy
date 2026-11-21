"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Bitcoin, Loader2 } from "lucide-react";
import type { BtcAddresses } from "@/lib/btc-addresses";

/**
 * The member's two PUBLIC BTC receive addresses — their own, and a
 * dedicated agent address from their own self-custody wallet (the
 * payout address they enter on DH Media). BTC Barry's onboarding asks
 * for them (lib/stacks.ts), so they stay on /bridge after the
 * one-time-door overhaul. Receive-only: no wallet is ever generated,
 * no key is ever held, nothing is custodied.
 */
export function BtcAddressesCard({ collectMode = false }: { collectMode?: boolean }) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [receive, setReceive] = useState("");
  const [agent, setAgent] = useState("");
  const [receiveLabel, setReceiveLabel] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/bridge/btc-addresses")
      .then((r) => r.json())
      .then((data) => {
        if (!data.addresses) return;
        const a = data.addresses as BtcAddresses;
        setReceive(a.btcReceiveAddress);
        setAgent(a.agentBtcAddress);
        setReceiveLabel(a.btcReceiveInfo?.label ?? null);
        setAgentLabel(a.agentBtcInfo?.label ?? null);
        setLoaded(true);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/bridge/btc-addresses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ btcReceiveAddress: receive, agentBtcAddress: agent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const a = data.addresses as BtcAddresses;
      setReceive(a.btcReceiveAddress);
      setAgent(a.agentBtcAddress);
      setReceiveLabel(a.btcReceiveInfo?.label ?? null);
      setAgentLabel(a.agentBtcInfo?.label ?? null);
      toast({ title: "BTC addresses saved" });
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

  if (!loaded) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Bitcoin className="h-4 w-4 text-primary" /> Your BTC addresses — The BTC Experiment
      </h2>
      {collectMode && !receive.trim() ? (
        <p className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm">
          <b>You haven&apos;t saved a payout address yet.</b> Add your BTC receive address below — a payout
          address is required to receive BTC payouts, and without one there is nowhere to send yours.
        </p>
      ) : null}
      <Card>
        <CardContent className="py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            The BTC Experiment runs on <b className="text-foreground">public receive addresses from your own
            wallet</b>. Whop Army never generates wallets, never holds keys, and never custodies funds — these
            are saved here so you and your agent always use the right ones.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="btc-receive" className="text-sm font-medium">
                Your BTC receive address
                {collectMode ? <span className="text-primary"> — required for BTC payouts</span> : null}
              </label>
              <Input
                id="btc-receive"
                value={receive}
                onChange={(e) => setReceive(e.target.value)}
                placeholder="bc1… / 3… / 1…"
                className="text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                The address you use to receive BTC.
                {receiveLabel ? (
                  <>
                    {" "}
                    Saved: <b className="text-foreground">{receiveLabel}</b>.
                  </>
                ) : null}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="btc-agent" className="text-sm font-medium">
                Your agent BTC address
              </label>
              <Input
                id="btc-agent"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="bc1… / 3… / 1…"
                className="text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                A dedicated receive address from your own self-custody wallet, set aside for your agent. This is
                the payout address to enter when you register your DH Media account, so any payout DH Media
                makes lands in the address set aside for it. Nothing is guaranteed.
                {agentLabel ? (
                  <>
                    {" "}
                    Saved: <b className="text-foreground">{agentLabel}</b>.
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Whether DH Media lets you change that payout address later is unverified — confirm on dh.media.
          </p>
          <p className="text-xs font-semibold text-foreground">
            Public receive address only. Never enter a seed phrase or private key — we will never ask for one.
          </p>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save addresses
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
