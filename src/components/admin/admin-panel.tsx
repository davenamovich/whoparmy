"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GrantCredits } from "@/components/admin/grant-credits";
import type { GateState } from "@/lib/site-gate";
import type { Stack, StackStatus } from "@/lib/stacks";

// LLM Control lives in /admin now (Dave, 2026-11-18 — it left the
// member app's sidebar). Loaded lazily, same as before; its API
// route stays operator-gated server-side.
const LlmConsole = dynamic(
  () => import("@/components/factory/llm-console").then((m) => m.LlmConsole),
  { ssr: false },
);

interface StackRow extends Stack {
  statusSource: "registry" | "dashboard";
}

const STATUS_ORDER: StackStatus[] = ["draft", "building", "live"];

export function AdminPanel({ gate, stacks }: { gate: GateState; stacks: StackRow[] }) {
  const [gateState, setGateState] = useState(gate);
  const [rows, setRows] = useState(stacks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<Record<string, { prompt: string; expiresAt: string; budgetCredits: number }>>({});
  // BTC Experiment gate (Flow v2): stack ids whose last launch was
  // refused because no DH Media link is saved yet — the card shows a
  // save-your-link prompt linking to /bridge instead of a prompt.
  const [needsDhLink, setNeedsDhLink] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
    return data;
  }

  async function toggleGate() {
    setBusy("gate");
    setError(null);
    try {
      const data = await post("/api/admin/gate", { on: !gateState.on });
      setGateState(data.gate as GateState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gate toggle failed");
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(id: string, status: StackStatus) {
    setBusy(`status:${id}`);
    setError(null);
    try {
      await post("/api/admin/stacks/status", { id, status });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, statusSource: "dashboard" } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusy(null);
    }
  }

  async function launch(stack: StackRow) {
    setBusy(`launch:${stack.id}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stackId: stack.id }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (data.code === "NEEDS_DH_MEDIA_LINK") {
          setNeedsDhLink((prev) => ({ ...prev, [stack.id]: true }));
          return;
        }
        throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
      }
      setNeedsDhLink((prev) => ({ ...prev, [stack.id]: false }));
      setLaunched((prev) => ({
        ...prev,
        [stack.id]: {
          prompt: String(data.prompt),
          expiresAt: String(data.expiresAt),
          budgetCredits: Number(data.budgetCredits),
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(null);
    }
  }

  async function copyPrompt(id: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setError("Copy failed — select the prompt text and copy it manually.");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Site gate
            <Badge variant={gateState.on ? "destructive" : "secondary"}>
              {gateState.on ? "ON — operators only" : "OFF — site open"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            While the gate is on, every page requires a designated-operator session; everyone else lands on
            /gate. API routes (bridge, OAuth, webhooks) are never gated. State source:{" "}
            <strong>{gateState.source}</strong>
            {gateState.source === "env" && " — SITE_GATE is set on this deployment, so the toggle is disabled."}
            {gateState.source === "default" && " — no DB row yet; the dashboard toggle writes the first one."}
          </p>
          <Button onClick={toggleGate} disabled={busy === "gate" || gateState.source === "env"} variant={gateState.on ? "secondary" : "destructive"}>
            {busy === "gate" ? "Working…" : gateState.on ? "Open the site" : "Close the site (gate on)"}
          </Button>
        </CardContent>
      </Card>

      <GrantCredits />

      <Card>
        <CardContent className="pt-6">
          <LlmConsole />
        </CardContent>
      </Card>

      {rows.map((stack) => (
        <Card key={stack.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3">
              {stack.name}
              <Badge variant={stack.status === "live" ? "default" : "secondary"}>{stack.status}</Badge>
              {stack.bridgeScope && <Badge variant="outline">bridge: {stack.bridgeScope}</Badge>}
              {!stack.bridgeScope && <Badge variant="outline">no bridge</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{stack.blurb}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{stack.infraNotes}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
                <select
                  className="ml-2 rounded-md border bg-background px-2 py-1.5 text-sm normal-case tracking-normal"
                  value={stack.status}
                  disabled={busy === `status:${stack.id}`}
                  onChange={(e) => changeStatus(stack.id, e.target.value as StackStatus)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-muted-foreground">({stack.statusSource})</span>
              {stack.entryPath && (
                <a href={stack.entryPath} className="text-sm text-primary underline underline-offset-2">
                  Open {stack.entryPath}
                </a>
              )}
              {stack.promptTemplate && stack.bridgeScope && (
                <Button size="sm" onClick={() => launch(stack)} disabled={busy === `launch:${stack.id}`}>
                  {busy === `launch:${stack.id}` ? "Minting code…" : "Mint code & build prompt"}
                </Button>
              )}
            </div>
            {needsDhLink[stack.id] && (
              <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-4">
                <p className="text-sm font-medium">Save your DH Media link first.</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The BTC Experiment agent build unlocks when a DH Media link is saved — and follows your
                  current saved link, so the prompt always carries the link you have saved now. No bridge code
                  was minted.
                </p>
                <a href="/bridge" className="text-sm text-primary underline underline-offset-2">
                  Save your DH Media link on the bridge page
                </a>
              </div>
            )}
            {launched[stack.id] && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Fresh code filled in · budget {launched[stack.id].budgetCredits} credits · code expires{" "}
                    {new Date(launched[stack.id].expiresAt).toLocaleTimeString()} · minting retired any previous
                    unused code on your account
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => copyPrompt(stack.id, launched[stack.id].prompt)}>
                    {copied === stack.id ? "Copied" : "Copy prompt"}
                  </Button>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-xs leading-relaxed">
                  {launched[stack.id].prompt}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Fine print: stack status here is a release label for the operator. Member-surface enforcement of stack
        status (hiding a draft stack&apos;s pages from members) is not wired yet — flipping a status changes this
        dashboard, not what members can reach. The site gate is the switch that controls member reach today.
      </p>
    </div>
  );
}
