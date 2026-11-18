"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GrantUser {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  freeGenBalance: number;
}

/**
 * Grant credits card for /admin (Dave, 2026-11-18). Credits are
 * extra generations in the user's free-gen pool — the same pool
 * referral rewards pay into, drawn down past the plan cap. The
 * operator's own account is pinned first and preselected: granting
 * yourself is a first-class case, not a workaround.
 */
export function GrantCredits() {
  const [users, setUsers] = useState<GrantUser[] | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [amount, setAmount] = useState<string>("100");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/grant-credits");
        if (!res.ok) throw new Error(`User list failed (${res.status})`);
        const data = (await res.json()) as { operatorId: string; users: GrantUser[] };
        // Operator first, then everyone else in the order served.
        const mine = data.users.filter((u) => u.id === data.operatorId);
        const rest = data.users.filter((u) => u.id !== data.operatorId);
        setUsers([...mine, ...rest]);
        setOperatorId(data.operatorId);
        setSelected(data.operatorId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load users");
      }
    })();
  }, []);

  async function grant() {
    const n = Math.floor(Number(amount));
    if (!selected || !Number.isFinite(n) || n < 1) {
      setError("Pick a user and a whole-number amount of at least 1.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/grant-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected, amount: n }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        granted?: number;
        balance?: number;
        user?: { name: string | null; email: string };
      };
      if (!res.ok) throw new Error(data.error ?? `Grant failed (${res.status})`);
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === selected ? { ...u, freeGenBalance: data.balance ?? u.freeGenBalance } : u)) : prev,
      );
      const who = data.user ? (data.user.name ?? data.user.email) : "user";
      setNote(`Granted ${data.granted} credits to ${who} — new balance ${data.balance}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setBusy(false);
    }
  }

  const current = users?.find((u) => u.id === selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grant credits</CardTitle>
        <p className="text-sm text-muted-foreground">
          Extra generations, added to a user&apos;s free-gen pool — the pool referral rewards pay into, drawn
          down once the plan&apos;s monthly cap is used up. Your own account is first in the list.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        {note && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">{note}</div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            User
            <select
              className="mt-1 block w-72 max-w-full rounded-md border bg-background px-2 py-2 text-sm normal-case tracking-normal"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!users}
            >
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name ?? u.email) + (u.id === operatorId ? " (you)" : "")} — {u.plan} · balance {u.freeGenBalance}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Credits
            <input
              type="number"
              min={1}
              max={100000}
              className="mt-1 block w-28 rounded-md border bg-background px-2 py-2 text-sm normal-case tracking-normal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <Button onClick={grant} disabled={busy || !users || !selected}>
            {busy ? "Granting…" : "Grant credits"}
          </Button>
          {current && (
            <span className="text-xs text-muted-foreground pb-2">
              Current balance: <strong>{current.freeGenBalance}</strong> credits
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
