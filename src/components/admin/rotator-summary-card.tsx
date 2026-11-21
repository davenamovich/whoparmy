"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RotatorSummary } from "@/lib/rotator-market";

/**
 * Operator card for the public rotator marketplace (Slice 5): the
 * /api/admin/rotator-summary read — derived inventory states, gens
 * bid volume, counted marketplace traffic. Renders nothing unless
 * the operator-only API answers (same pattern as BtcRealPanel).
 * Financials stay explicitly SIMULATED: paid placements are not
 * live; settlement is Slice 6.
 */
export function RotatorSummaryCard() {
  const [summary, setSummary] = useState<RotatorSummary | null>(null);

  useEffect(() => {
    void fetch("/api/admin/rotator-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSummary(data))
      .catch(() => undefined);
  }, []);

  if (!summary) return null;

  const rows: Array<[string, string]> = [
    ["Window", `${summary.window.from} → ${summary.window.to}`],
    [
      "Days by state",
      Object.entries(summary.daysByState)
        .map(([state, n]) => `${state} ${n}`)
        .join(" · ") || "—",
    ],
    ["Bids", `${summary.totalBids} (${summary.gensBidVolume} gens bid)`],
    ["Confirmed winners", `${summary.confirmedWinners} (${summary.gensDeducted} gens deducted)`],
    ["Counted impressions (marketplace)", String(summary.countedImpressions)],
    ["Counted launches (marketplace)", String(summary.countedLaunches)],
    ["Active free placements today", String(summary.activeFreePlacements)],
    ["Financials", `$${(summary.financials.grossCents / 100).toFixed(2)} — ${summary.financials.status}`],
  ];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Rotator marketplace</CardTitle>
        <p className="text-sm text-muted-foreground">
          The public /rotator surface over the existing daily auction. Currency is free generations; traffic numbers
          are counted hops only.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
