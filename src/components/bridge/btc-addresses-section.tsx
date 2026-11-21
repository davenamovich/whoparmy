"use client";

import { useEffect, useState } from "react";
import { BtcAddressesCard } from "@/components/bridge/btc-addresses-card";
import type { BridgeBtcMode } from "@/lib/btc-payouts-logic";

/**
 * The /bridge BTC block, in the mode the Real BTC collection toggle
 * dictates (Dave, 2026-11-21):
 *
 * - "optional" (toggle OFF, the default): the historical collapsed
 *   block, byte-for-byte the presentation members have today.
 * - "collect" (toggle ON): a prominent, always-open payout-collection
 *   card — a payout address is required to receive BTC payouts, and
 *   the card itself nudges members who haven't saved one.
 *
 * The mode rides on GET /api/bridge/btc-addresses (collectMode). Any
 * failure — signed out, network — leaves the optional presentation,
 * so the toggle can never break the page.
 */
export function BtcAddressesSection() {
  const [mode, setMode] = useState<BridgeBtcMode>("optional");

  useEffect(() => {
    void fetch("/api/bridge/btc-addresses")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.collectMode === "collect") setMode("collect");
      })
      .catch(() => undefined);
  }, []);

  if (mode === "collect") {
    return (
      <section className="space-y-3 rounded-2xl border-2 border-primary/60 bg-card p-5 sm:p-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          The BTC Experiment · payout address
        </p>
        <h3 className="text-base font-bold">BTC payouts are on — we need your payout address</h3>
        <p className="text-sm text-muted-foreground">
          When the experiment pays out BTC, it goes to the receive address saved here.{" "}
          <b className="text-foreground">A payout address is required to receive BTC payouts</b> — if yours is
          missing when a payout runs, there is nowhere to send your share. Your agent address stays optional
          and unchanged.
        </p>
        <BtcAddressesCard collectMode />
      </section>
    );
  }

  return (
    <details className="rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
        Your BTC addresses (optional — your agent will ask)
      </summary>
      <div className="px-5 pb-5">
        <BtcAddressesCard />
      </div>
    </details>
  );
}
