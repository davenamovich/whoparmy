"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  describeBindHouseSummary,
  groupBindings,
  truncateMiddle,
  type HouseBindSummaryView,
} from "@/lib/bindings-view";
import { HOUSE_BANKR } from "@/lib/wallet-bind";

interface SettlementLine {
  role: string;
  userId: string | null;
  agentId: string | null;
  walletAddress: string | null;
  chain: string | null;
  amountCents: number;
}

interface Settlement {
  id: string;
  date: string;
  grossCents: number;
  currency: string;
  simulated: boolean;
  status: string;
  referrerUnassigned: boolean;
  bankrJobId: string | null;
  txRef: string | null;
  lines: SettlementLine[];
}

interface WalletLink {
  kind: string;
  value: string;
  userId: string;
  userName: string;
  isOperator: boolean;
  verifiedAt: string | null;
}

interface AgentWalletRow {
  agentId: string;
  userId: string;
  chain: string;
  address: string;
  source: string;
  verifiedAt: string | null;
  agentName: string;
  agentSlug: string | null;
  ownerName: string;
}

/**
 * Operator card for the Bankr connection (2026-11-21): house wallet
 * binding + the rotator split settlement ledger. Renders nothing
 * unless the operator-only APIs answer. Money stays SIMULATED —
 * confirming only produces the Bankr instruction packet; execution
 * happens outside this app (Muse's Bankr connector, after Dave's
 * per-run approval) and "settle" only records its refs.
 */
export function SettlementsCard() {
  const [links, setLinks] = useState<WalletLink[] | null>(null);
  const [wallets, setWallets] = useState<AgentWalletRow[]>([]);
  const [operatorUserId, setOperatorUserId] = useState<string>("");
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [packet, setPacket] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bindSummary, setBindSummary] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [bindRes, setlRes] = await Promise.all([
      fetch("/api/admin/wallet-bind").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/settlements").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (bindRes) {
      const ls = bindRes.links as WalletLink[];
      setLinks(ls);
      setWallets((bindRes.wallets as AgentWalletRow[]) ?? []);
      setOperatorUserId(ls.find((l) => l.isOperator)?.userId ?? "");
    }
    if (setlRes) setSettlements(setlRes.settlements as Settlement[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!links || !settlements) return null;

  const bindings = groupBindings({
    links,
    wallets,
    operatorUserId,
    houseEvm: HOUSE_BANKR.evm,
  });
  const houseBound = bindings.yours.isHouse;

  async function act(body: Record<string, string>, after?: (data: Record<string, unknown>) => void) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setNotice(typeof data.error === "string" ? data.error : `Action failed (${res.status})`);
      } else if (after) {
        after(data);
      }
    } catch {
      setNotice("Action failed — network error");
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function bindHouse() {
    setBusy(true);
    setNotice(null);
    setBindSummary(null);
    try {
      const res = await fetch("/api/admin/wallet-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "bind-house" }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.house) {
        // Show the REAL summary — what bound, what was already
        // bound, and what was skipped and why (e.g. Barry).
        setBindSummary(describeBindHouseSummary(data.house as HouseBindSummaryView));
      } else {
        setNotice(String(data.error ?? "Bind failed"));
      }
    } catch {
      setNotice("Bind failed — network error");
    } finally {
      setBusy(false);
      void load();
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Bankr settlement — rotator split 25 / 25 / 50</CardTitle>
        <p className="text-sm text-muted-foreground">
          Wallets bind to the attribution spine (user + agent sub-ID). Settlements are a SIMULATED ledger: the
          auction is bid in Bid Points today, gross is $0, and confirming only renders the Bankr instruction
          packet — execution happens outside this app after Dave approves the specific run.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span>
            House Bankr wallet:{" "}
            <strong>{houseBound ? "bound ✓" : "not bound"}</strong>
          </span>
          {!houseBound && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void bindHouse()}>
              Bind house wallet
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act({ action: "create-drafts" }, (d) => setNotice(`Drafts created: ${(d.created as string[])?.join(", ") || "none"}`))}
          >
            Create drafts for confirmed days
          </Button>
        </div>

        {notice && <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">{notice}</p>}

        {bindSummary && (
          <div className="mb-4 rounded-md border p-3 text-sm">
            <p className="font-semibold">Bind house wallet — result</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {bindSummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-4 rounded-md border p-3 text-sm">
          <p className="font-semibold">Bindings — synced</p>
          <p className="mt-0.5 text-muted-foreground">
            Bindings are private operator records for settlement — binding a wallet does not make an agent
            public.
          </p>

          <p className="mt-3 font-medium">Your wallet</p>
          {bindings.yours.hasAny ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {bindings.yours.evm && (
                <li>
                  EVM:{" "}
                  <span className="font-mono" title={bindings.yours.evm.value}>
                    {truncateMiddle(bindings.yours.evm.value)}
                  </span>
                  {bindings.yours.isHouse ? " · house wallet" : ""}
                  {bindings.yours.evm.verifiedAt ? " · verified ✓" : ""}
                </li>
              )}
              {bindings.yours.solana && (
                <li>
                  Solana:{" "}
                  <span className="font-mono" title={bindings.yours.solana.value}>
                    {truncateMiddle(bindings.yours.solana.value)}
                  </span>
                  {bindings.yours.solana.verifiedAt ? " · verified ✓" : ""}
                </li>
              )}
              {bindings.yours.bankrRef && (
                <li>
                  Bankr ref code: <span className="font-mono">{bindings.yours.bankrRef.value}</span>
                  {bindings.yours.bankrRef.verifiedAt ? " · verified ✓" : ""}
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No wallet bindings for your account yet — use “Bind house wallet” above.
            </p>
          )}

          <p className="mt-3 font-medium">Agent wallets</p>
          {bindings.agents.length === 0 ? (
            <p className="mt-1 text-muted-foreground">No agent wallets bound yet.</p>
          ) : (
            <div className="mt-1 space-y-2">
              {bindings.agents.map((g) => (
                <div key={g.agentId}>
                  <p>
                    {g.agentName}
                    {g.agentSlug ? <span className="text-muted-foreground"> · /agent/{g.agentSlug}</span> : ""}{" "}
                    <span className="text-muted-foreground">· owner {g.ownerName}</span>
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {g.wallets.map((w) => (
                      <li key={`${w.chain}-${w.address}`}>
                        {w.chain === "evm" ? "EVM" : "Solana"}:{" "}
                        <span className="font-mono" title={w.address}>
                          {truncateMiddle(w.address)}
                        </span>{" "}
                        · {w.source}
                        {w.verifiedAt ? " · verified ✓" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {bindings.others.length > 0 && (
            <>
              <p className="mt-3 font-medium">Other bindings</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {bindings.others.map((l) => (
                  <li key={`${l.kind}-${l.value}`}>
                    {l.userName} · {l.kind}:{" "}
                    <span className="font-mono" title={l.value}>
                      {truncateMiddle(l.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settlements yet.</p>
        ) : (
          <div className="space-y-3">
            {settlements.map((s) => (
              <div key={s.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {s.date} · ${(s.grossCents / 100).toFixed(2)} {s.currency}
                    {s.simulated ? " · SIMULATED" : ""}
                    {s.referrerUnassigned ? " · referrer unassigned" : ""}
                  </span>
                  <span className="font-mono text-xs">{s.status}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {s.lines.map((l) => (
                    <li key={l.role}>
                      {l.role}: ${(l.amountCents / 100).toFixed(2)} →{" "}
                      {l.walletAddress ?? <span className="text-amber-600 dark:text-amber-400">UNBOUND</span>}
                      {l.agentId ? ` · agent ${l.agentId}` : ""}
                    </li>
                  ))}
                </ul>
                {(s.bankrJobId || s.txRef) && (
                  <p className="mt-1 font-mono text-xs">
                    bankrJobId: {s.bankrJobId ?? "—"} · txRef: {s.txRef ?? "—"}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.status === "DRAFT" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "confirm", id: s.id })}>
                      Confirm
                    </Button>
                  )}
                  {(s.status === "CONFIRMED" || s.status === "SETTLED") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act({ action: "packet", id: s.id }, (d) => setPacket(String(d.text ?? "")))}
                    >
                      Bankr packet
                    </Button>
                  )}
                  {s.status === "CONFIRMED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        const txRef = window.prompt("Tx ref from the external Bankr execution:");
                        if (txRef) void act({ action: "settle", id: s.id, txRef });
                      }}
                    >
                      Record settled
                    </Button>
                  )}
                  {s.status !== "SETTLED" && s.status !== "VOID" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "void", id: s.id })}>
                      Void
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {packet && (
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{packet}</pre>
        )}
      </CardContent>
    </Card>
  );
}
