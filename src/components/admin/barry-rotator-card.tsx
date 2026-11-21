"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProvisionSummary {
  agentName: string | null;
  rotatorCreated: boolean;
  linksAdded: number;
  linksTotal: number;
  state: string;
  detail: string;
}

/**
 * Operator card: provision BTC Barry's rotator (Dave, 2026-11-21).
 * One tap runs POST /api/admin/provision-barry-rotator — find-or-
 * create Barry's AgentRotator and add-only sync its destinations
 * from the operator's saved EngineLinks, which is what turns the
 * Ride door on /agent/btc-barry live. Idempotent: re-running only
 * adds saved links that are missing, and the launch + agent-kit
 * wiring keeps it provisioned after this first tap. The summary
 * printed is the server's own plain-language result — no invented
 * state.
 */
export function BarryRotatorCard() {
  const [summary, setSummary] = useState<ProvisionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function provision() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/provision-barry-rotator", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Provisioning failed (${res.status})`);
      } else {
        setSummary(data as unknown as ProvisionSummary);
      }
    } catch {
      setError("Provisioning failed — network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Barry&apos;s rotator</CardTitle>
        <p className="text-sm text-muted-foreground">
          Provisions BTC Barry&apos;s agent rotator from your saved links — that is what turns the Ride door on{" "}
          <span className="font-mono">/agent/btc-barry</span> live. Links come only from your saved EngineLinks
          (never a typed-in URL), existing rotation state is kept, and re-running only adds what is missing.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void provision()}>
            {busy ? "Provisioning…" : "Provision Barry's rotator"}
          </Button>
          {summary && (
            <span>
              State: <strong>{summary.state}</strong> · links {summary.linksTotal} total
              {summary.linksAdded > 0 ? ` · ${summary.linksAdded} added` : ""}
              {summary.rotatorCreated ? " · rotator created" : ""}
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{error}</p>}
        {summary && <p className="mt-3 text-sm text-muted-foreground">{summary.detail}</p>}
      </CardContent>
    </Card>
  );
}
