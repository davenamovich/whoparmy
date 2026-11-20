"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Trophy } from "lucide-react";
import type { AffiliateOverview } from "@/lib/bridge";
import type { AdminDayView } from "@/lib/rotator";

/**
 * Rotator admin — moved off the member's /bridge onto /admin with the
 * one-time-door overhaul (Dave, 2026-11-20). Unchanged otherwise: it
 * renders nothing unless /api/bridge/rotator/admin answers, and that
 * route checks the operator itself.
 */
/** Operator-only: renders nothing unless the admin API answers. */
export function RotatorAdmin() {
  const { toast } = useToast();
  const [days, setDays] = useState<AdminDayView[] | null>(null);
  const [overview, setOverview] = useState<AffiliateOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bridge/rotator/admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.days) setDays(data.days as AdminDayView[]);
        if (data?.affiliate) setOverview(data.affiliate as AffiliateOverview);
      })
      .catch(() => undefined);
  }, []);

  async function act(action: "confirm" | "cancel", date: string, userId?: string) {
    setBusy(`${action}:${date}`);
    try {
      const res = await fetch("/api/bridge/rotator/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, date, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setDays(data.days as AdminDayView[]);
      toast({ title: "Rotator admin", description: data.detail });
    } catch (err) {
      toast({
        title: "Admin action failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!days) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" /> Rotator admin
      </h2>
      <Card>
        <CardContent className="py-5 space-y-4">
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No auctions yet — days open automatically when the first bid lands.</p>
          ) : (
            days.map((d) => (
              <div key={d.date} className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-medium">{d.date}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{d.status}</span>
                  {d.status === "CONFIRMED" ? (
                    <span className="text-xs text-muted-foreground">
                      Winner: {d.winnerUrl} ({d.winningBid} gens)
                    </span>
                  ) : null}
                  {d.status !== "CANCELLED" ? (
                    <Button size="sm" variant="ghost" disabled={busy === `cancel:${d.date}`} onClick={() => void act("cancel", d.date)}>
                      Cancel day
                    </Button>
                  ) : null}
                </div>
                {d.status === "OPEN"
                  ? d.bids.map((b) => (
                      <div key={b.userId} className="flex items-center gap-3 text-xs text-muted-foreground pl-2">
                        <span>
                          {b.partner} — {b.amount} gens — {b.userId.slice(0, 8)}…
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `confirm:${d.date}`}
                          onClick={() => void act("confirm", d.date, b.userId)}
                        >
                          Confirm winner
                        </Button>
                      </div>
                    ))
                  : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {overview ? (
        <Card>
          <CardContent className="py-5 space-y-4">
            <p className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Affiliate overview
              <span className="text-xs font-normal text-muted-foreground">
                {overview.membersWithLinks} member{overview.membersWithLinks === 1 ? "" : "s"} with saved links
              </span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {overview.offerSignups.map((o) => (
                <span key={o.partner}>
                  {o.name}: <b className="text-foreground">{o.signups}</b>
                </span>
              ))}
            </div>
            {overview.placements.length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Free rotator days (earned by signups)</p>
                {overview.placements.map((pl) => (
                  <p key={`${pl.date}-${pl.userId}-${pl.partner}`} className="text-xs text-muted-foreground">
                    {pl.date} · {pl.partnerName} · {pl.userLabel} ·{" "}
                    {pl.url ? (
                      <a href={pl.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        link
                      </a>
                    ) : (
                      <span className="text-amber-500">link deleted — sits out</span>
                    )}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No free rotator days scheduled yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
