"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bitcoin, Download, Loader2 } from "lucide-react";
import { formatSatsWithBtc, maskAddress } from "@/lib/btc-payouts-logic";

/**
 * /admin — "BTC Experiment — Real BTC" (Dave, 2026-11-21).
 *
 * Internal rails only: the funding ledger, the address-collection
 * toggle, the payout roster, and payout batches whose totals are
 * computed from the pool by the algo (share % → equal split). Dave
 * approves a batch here, exports its CSV, pays from his own wallet,
 * and pastes the txid to mark it PAID. The app never sends BTC.
 * Renders nothing until the operator-gated API answers.
 */

interface FundingEntry {
  id: string;
  amountSats: number;
  txid: string | null;
  note: string;
  createdAt: string;
}

interface RosterEntry {
  userId: string;
  member: string;
  maskedAddress: string | null;
}

interface PayoutLine {
  id: string;
  userId: string;
  member: string;
  address: string;
  amountSats: number;
}

interface PayoutBatch {
  id: string;
  totalSats: number;
  status: string;
  note: string;
  txid: string | null;
  createdAt: string;
  paidAt: string | null;
  lines: PayoutLine[];
}

interface Overview {
  ledger: { fundedSats: number; paidOutSats: number; balanceSats: number };
  entries: FundingEntry[];
  roster: { withAddress: RosterEntry[]; withoutAddress: RosterEntry[] };
  batches: PayoutBatch[];
  collectOn: boolean;
}

interface RunPlan {
  balanceSats: number;
  payoutBps: number;
  memberCount: number;
  distributableSats: number;
  perLineSats: number;
  distributedSats: number;
  remainderSats: number;
}

type Preview = { ok: true; plan: RunPlan } | { ok: false; error: string };

async function call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  APPROVED: "default",
  PAID: "secondary",
  CANCELLED: "destructive",
};

export function BtcRealPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Funding form
  const [fundAmount, setFundAmount] = useState("");
  const [fundTxid, setFundTxid] = useState("");
  const [fundNote, setFundNote] = useState("");

  // Create-run form + algo preview
  const [sharePct, setSharePct] = useState("50");
  const [runNote, setRunNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-batch txid inputs + per-line amount edits
  const [txids, setTxids] = useState<Record<string, string>>({});
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const overview = (await call("/api/admin/btc")) as unknown as Overview;
      setData(overview);
      const amounts: Record<string, string> = {};
      for (const b of overview.batches) for (const l of b.lines) amounts[l.id] = String(l.amountSats);
      setLineAmounts(amounts);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const shareBps = (() => {
    const pct = Number(sharePct);
    if (!Number.isFinite(pct)) return null;
    return Math.round(pct * 100);
  })();

  useEffect(() => {
    if (shareBps === null) {
      setPreview(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void fetch(`/api/admin/btc/batches/preview?payoutBps=${shareBps}`)
        .then((r) => r.json())
        .then((p) => setPreview(p as Preview))
        .catch(() => setPreview(null));
    }, 300);
  }, [shareBps]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something failed");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  const { ledger, entries, roster, batches, collectOn } = data;

  return (
    <section className="mt-10">
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Bitcoin className="h-5 w-5 text-primary" /> BTC Experiment — Real BTC
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal rails: fund the pool, collect payout addresses, and run payouts the algo sizes from the
          pool. You approve every batch and pay from your own wallet — the app never holds keys and never
          sends BTC.
        </p>
      </header>

      {error ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{notice}</p>
      ) : null}

      {/* Balance */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Real-BTC balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSatsWithBtc(ledger.balanceSats)}</p>
            <p className="mt-1 text-xs text-muted-foreground">funded minus PAID payouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total funded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSatsWithBtc(ledger.fundedSats)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{entries.length} ledger entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paid out
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSatsWithBtc(ledger.paidOutSats)}</p>
            <p className="mt-1 text-xs text-muted-foreground">PAID batches only</p>
          </CardContent>
        </Card>
      </div>

      {/* Collection toggle */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Payout address collection on /bridge</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Badge variant={collectOn ? "default" : "outline"}>{collectOn ? "ON — collecting" : "OFF — optional"}</Badge>
          <p className="min-w-64 flex-1 text-sm text-muted-foreground">
            {collectOn
              ? "Members see the BTC block on /bridge as payout collection: a payout address is required to receive BTC payouts, with a nudge when theirs is missing."
              : "Members see the BTC block on /bridge as optional, exactly as today. Turn this on when you're ready to collect payout addresses."}
          </p>
          <Button
            variant={collectOn ? "outline" : "default"}
            disabled={busy === "toggle"}
            onClick={() =>
              void act("toggle", async () => {
                await call("/api/admin/btc/toggle", { method: "POST", body: JSON.stringify({ on: !collectOn }) });
                setNotice(`Address collection is now ${!collectOn ? "ON" : "OFF"} on /bridge.`);
              })
            }
          >
            {busy === "toggle" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Turn {collectOn ? "off" : "on"}
          </Button>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Add funding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add real BTC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="btc-fund-amount" className="text-sm font-medium">Amount (BTC)</label>
              <Input
                id="btc-fund-amount"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="0.01000000"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="btc-fund-txid" className="text-sm font-medium">TxID (optional)</label>
              <Input
                id="btc-fund-txid"
                value={fundTxid}
                onChange={(e) => setFundTxid(e.target.value)}
                placeholder="on-chain transaction id"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="btc-fund-note" className="text-sm font-medium">Note (optional)</label>
              <Input
                id="btc-fund-note"
                value={fundNote}
                onChange={(e) => setFundNote(e.target.value)}
                placeholder="e.g. first pool funding"
                autoComplete="off"
              />
            </div>
            <Button
              disabled={busy === "fund" || !fundAmount.trim()}
              onClick={() =>
                void act("fund", async () => {
                  await call("/api/admin/btc/funding", {
                    method: "POST",
                    body: JSON.stringify({ amountBtc: fundAmount.trim(), txid: fundTxid.trim() || undefined, note: fundNote.trim() || undefined }),
                  });
                  setFundAmount("");
                  setFundTxid("");
                  setFundNote("");
                  setNotice("Funding recorded in the ledger.");
                })
              }
            >
              {busy === "fund" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add to the pool
            </Button>
            {entries.length > 0 ? (
              <ul className="space-y-2 pt-2">
                {entries.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 text-sm">
                    <span className="font-medium">{formatSatsWithBtc(e.amountSats)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleDateString()}
                      {e.note ? ` · ${e.note}` : ""}
                      {e.txid ? ` · tx ${e.txid.slice(0, 10)}…` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-1 text-sm text-muted-foreground">No funding yet — the pool is empty.</p>
            )}
          </CardContent>
        </Card>

        {/* Roster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Payout roster — {roster.withAddress.length} with an address · {roster.withoutAddress.length} without
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Eligible for payout runs
              </p>
              {roster.withAddress.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody has saved a payout address yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {roster.withAddress.map((r) => (
                    <li key={r.userId} className="flex items-baseline justify-between gap-2">
                      <span>{r.member}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.maskedAddress}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                No address saved
              </p>
              {roster.withoutAddress.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every member has an address saved.</p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {roster.withoutAddress.map((r) => (
                    <li key={r.userId}>{r.member}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create a run — the algo sizes it from the pool */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Create a payout run</CardTitle>
          <p className="text-sm text-muted-foreground">
            The algo sizes the run from the pool: pick the share, it splits that amount equally across every
            member with a saved address. Lines stay editable while the run is a draft.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label htmlFor="btc-run-share" className="text-sm font-medium">Share of the pool (%)</label>
              <Input
                id="btc-run-share"
                value={sharePct}
                onChange={(e) => setSharePct(e.target.value)}
                inputMode="decimal"
                className="w-28"
                autoComplete="off"
              />
            </div>
            <div className="min-w-64 flex-1 space-y-1.5">
              <label htmlFor="btc-run-note" className="text-sm font-medium">Note — the win / reference</label>
              <Input
                id="btc-run-note"
                value={runNote}
                onChange={(e) => setRunNote(e.target.value)}
                placeholder="e.g. Week 1 experiment win"
                autoComplete="off"
              />
            </div>
            <Button
              disabled={busy === "create" || !preview?.ok}
              onClick={() =>
                void act("create", async () => {
                  const res = await call("/api/admin/btc/batches", {
                    method: "POST",
                    body: JSON.stringify({ payoutBps: shareBps, note: runNote.trim() || undefined }),
                  });
                  const plan = res.plan as RunPlan;
                  setRunNote("");
                  setNotice(
                    `Run created (DRAFT): ${formatSatsWithBtc(plan.distributedSats)} across ${plan.memberCount} members — ${formatSatsWithBtc(plan.perLineSats)} each, ${plan.remainderSats.toLocaleString("en-US")} sats undistributed stay in the pool.`,
                  );
                })
              }
            >
              {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create run
            </Button>
          </div>
          {preview === null ? (
            <p className="text-sm text-muted-foreground">Enter a share between 0.01% and 100% to preview the run.</p>
          ) : preview.ok ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">Pool balance</p><p className="font-semibold">{formatSatsWithBtc(preview.plan.balanceSats)}</p></div>
              <div><p className="text-xs text-muted-foreground">Distributable ({sharePct || "0"}%)</p><p className="font-semibold">{formatSatsWithBtc(preview.plan.distributableSats)}</p></div>
              <div><p className="text-xs text-muted-foreground">Eligible members</p><p className="font-semibold">{preview.plan.memberCount}</p></div>
              <div><p className="text-xs text-muted-foreground">Per member</p><p className="font-semibold">{formatSatsWithBtc(preview.plan.perLineSats)}</p></div>
              <div><p className="text-xs text-muted-foreground">Undistributed (stays in pool)</p><p className="font-semibold">{preview.plan.remainderSats.toLocaleString("en-US")} sats</p></div>
            </div>
          ) : (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {preview.error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Batches */}
      <div className="space-y-4">
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payout runs yet.</p>
        ) : (
          batches.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle className="text-base">{formatSatsWithBtc(b.totalSats)}</CardTitle>
                  <Badge variant={STATUS_VARIANT[b.status] ?? "outline"}>{b.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()} · {b.lines.length} lines
                    {b.note ? ` · ${b.note}` : ""}
                    {b.status === "PAID" && b.txid ? ` · tx ${b.txid.slice(0, 12)}…` : ""}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="divide-y divide-border">
                  {b.lines.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      <span className="min-w-32 flex-1">{l.member}</span>
                      <span className="font-mono text-xs text-muted-foreground">{maskAddress(l.address)}</span>
                      {b.status === "DRAFT" ? (
                        <>
                          <Input
                            value={lineAmounts[l.id] ?? ""}
                            onChange={(e) => setLineAmounts((m) => ({ ...m, [l.id]: e.target.value }))}
                            className="w-32"
                            inputMode="numeric"
                            aria-label={`Amount in sats for ${l.member}`}
                          />
                          <span className="text-xs text-muted-foreground">sats</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `line-${l.id}`}
                            onClick={() =>
                              void act(`line-${l.id}`, async () => {
                                const amountSats = Number(lineAmounts[l.id]);
                                if (!Number.isSafeInteger(amountSats) || amountSats < 0) {
                                  throw new Error("Line amount must be a whole number of sats, 0 or more");
                                }
                                await call(`/api/admin/btc/batches/${b.id}/lines/${l.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ amountSats }),
                                });
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === `line-del-${l.id}`}
                            onClick={() =>
                              void act(`line-del-${l.id}`, async () => {
                                await call(`/api/admin/btc/batches/${b.id}/lines/${l.id}`, { method: "DELETE" });
                              })
                            }
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <span className="font-medium">{formatSatsWithBtc(l.amountSats)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  {b.status === "DRAFT" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy === `approve-${b.id}`}
                        onClick={() =>
                          void act(`approve-${b.id}`, async () => {
                            await call(`/api/admin/btc/batches/${b.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ action: "approve" }),
                            });
                            setNotice("Batch approved. Export the CSV, pay from your wallet, then paste the txid to mark it PAID.");
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === `cancel-${b.id}`}
                        onClick={() =>
                          void act(`cancel-${b.id}`, async () => {
                            await call(`/api/admin/btc/batches/${b.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ action: "cancel" }),
                            });
                          })
                        }
                      >
                        Cancel run
                      </Button>
                    </>
                  ) : null}
                  {b.status === "APPROVED" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => window.open(`/api/admin/btc/batches/${b.id}/csv`, "_blank")}>
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                      </Button>
                      <Input
                        value={txids[b.id] ?? ""}
                        onChange={(e) => setTxids((m) => ({ ...m, [b.id]: e.target.value }))}
                        placeholder="payment txid"
                        className="w-64"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Button
                        size="sm"
                        disabled={busy === `paid-${b.id}` || !(txids[b.id] ?? "").trim()}
                        onClick={() =>
                          void act(`paid-${b.id}`, async () => {
                            await call(`/api/admin/btc/batches/${b.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ action: "paid", txid: (txids[b.id] ?? "").trim() }),
                            });
                            setNotice("Batch marked PAID — the balance has been debited.");
                          })
                        }
                      >
                        Mark PAID
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === `cancel-${b.id}`}
                        onClick={() =>
                          void act(`cancel-${b.id}`, async () => {
                            await call(`/api/admin/btc/batches/${b.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ action: "cancel" }),
                            });
                          })
                        }
                      >
                        Cancel run
                      </Button>
                    </>
                  ) : null}
                  {b.status === "PAID" ? (
                    <Button size="sm" variant="outline" onClick={() => window.open(`/api/admin/btc/batches/${b.id}/csv`, "_blank")}>
                      <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
