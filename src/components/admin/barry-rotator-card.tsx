"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProvisionSummary {
  agentName: string | null;
  rotatorCreated: boolean;
  linksAdded: number;
  linksTotal: number;
  linksRemoved?: number;
  state: string;
  detail: string;
  profileRefreshed?: boolean;
  profileRefreshReason?: string;
  catalogSeeded?: number;
  catalogSource?: string;
}

/**
 * Operator card: provision BTC Barry's rotator (Dave, 2026-11-21;
 * DH-only rule 2026-11-22). One tap runs
 * POST /api/admin/provision-barry-rotator — find-or-create Barry's
 * AgentRotator and sync ONLY the operator's DH Media destination
 * into it (pruning any non-DH rows), which is what turns the Ride
 * door on /agent/btc-barry live. Idempotent, and the launch +
 * agent-kit wiring keeps it provisioned after this first tap. The
 * summary printed is the server's own plain-language result — no
 * invented state.
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
          Provisions BTC Barry&apos;s agent rotator — that is what turns the Ride door on{" "}
          <span className="font-mono">/agent/btc-barry</span> live. Barry&apos;s Ride is DH Media only: the
          rotation syncs only your saved DH Media link, and any non-DH link an earlier sync put in the rotation
          is removed. Your Muse, Agent37 and other links stay on Barry&apos;s profile CTA strip — they never
          ride the rotator. The same tap refreshes Barry&apos;s profile copy to the outcome-led defaults when
          it still carries the old house copy untouched.
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
              {summary.linksRemoved ? ` · ${summary.linksRemoved} non-DH removed` : ""}
              {summary.rotatorCreated ? " · rotator created" : ""}
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{error}</p>}
        {summary?.catalogSource &&
          (summary.catalogSource === "failed" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Links pull from your P&amp;R record failed — provisioned with the links already saved.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Links pulled from your P&amp;R record: {summary.catalogSeeded ?? 0} added (source:{" "}
              {summary.catalogSource}).
            </p>
          ))}
        {summary && <p className="mt-3 text-sm text-muted-foreground">{summary.detail}</p>}
        {summary?.profileRefreshReason && (
          <p className="mt-2 text-sm text-muted-foreground">Profile: {summary.profileRefreshReason}</p>
        )}
      </CardContent>
    </Card>
  );
}
