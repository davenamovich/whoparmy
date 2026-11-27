"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { giftInviteNote } from "@/lib/gift-invite-core";

interface GiftInvite {
  id: string;
  code: string;
  recipientName: string;
  recipientEmail: string | null;
  tier: string;
  tokenCap: number;
  keyName: string;
  accountLabel: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

const STATUSES = ["draft", "ready", "handed_over", "exhausted", "revoked"] as const;
const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Gift invites (Dave, 2026-11-27) — operator-only panel on /admin for
 * the Starimg token gift lane (NOT LAUNCHED). Create draft invites for
 * a named recipient + tier, recording the serving Starimg sub-key by
 * NAME + account label only — a raw key value is never entered or
 * stored here. Renders nothing unless the operator-gated API answers.
 */
export function GiftInvitesPanel() {
  const [invites, setInvites] = useState<GiftInvite[] | null>(null);
  const [form, setForm] = useState({ recipientName: "", recipientEmail: "", tier: "1m", keyName: "", accountLabel: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/gift-invites");
      if (!res.ok) return;
      const data = (await res.json()) as { invites: GiftInvite[] };
      setInvites(data.invites);
    } catch {
      /* operator-gated: stay invisible on any failure */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (invites === null) return null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gift-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recipientEmail: form.recipientEmail || undefined, notes: form.notes || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setForm({ recipientName: "", recipientEmail: "", tier: "1m", keyName: "", accountLabel: "", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-invites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Status update failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  }

  async function copyNote(invite: GiftInvite) {
    try {
      await navigator.clipboard.writeText(giftInviteNote(invite));
      setCopied(invite.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copy failed — select the code manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gift invites — Starimg token lane (not launched)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Draft invites for named recipients: 1M or 10M Starimg tokens for builds in their Muse. The serving
          sub-key is recorded by <strong>name + account only</strong> — a raw key value is never entered or stored
          here; it lives in the Starimg cabinet and is saved by the recipient&apos;s own Muse at handover. Nothing
          on this panel sends or grants anything.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className={inputCls} placeholder="Recipient name" value={form.recipientName}
            onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
          <input className={inputCls} placeholder="Recipient email (optional)" value={form.recipientEmail}
            onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} />
          <select className={inputCls} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
            <option value="1m">1M tokens — trial build</option>
            <option value="10m">10M tokens — full build program</option>
          </select>
          <input className={inputCls} placeholder="Starimg sub-key NAME (reference only)" value={form.keyName}
            onChange={(e) => setForm({ ...form, keyName: e.target.value })} />
          <input className={inputCls} placeholder="Account label (e.g. Muse-email Starimg account)" value={form.accountLabel}
            onChange={(e) => setForm({ ...form, accountLabel: e.target.value })} />
          <input className={inputCls} placeholder="Notes (optional)" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create draft invite"}</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gift invites yet.</p>
        ) : (
          <ul className="space-y-3">
            {invites.map((inv) => (
              <li key={inv.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{inv.recipientName}</strong>
                  <span className="text-muted-foreground">
                    {inv.tokenCap.toLocaleString("en-US")} tokens · {inv.status} · {new Date(inv.createdAt).toLocaleDateString("en-US")}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Code <code>{inv.code}</code>
                  {inv.recipientEmail ? ` · ${inv.recipientEmail}` : ""} · Key: {inv.keyName} on {inv.accountLabel}
                  {inv.notes ? ` · ${inv.notes}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyNote(inv)}>
                    {copied === inv.id ? "Copied" : "Copy invite note"}
                  </Button>
                  {STATUSES.filter((s) => s !== inv.status).map((s) => (
                    <Button key={s} size="sm" variant="ghost" onClick={() => setStatus(inv.id, s)}>
                      Mark {s.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
