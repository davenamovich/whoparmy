"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * ─── YOUR REFERRAL LINK — homepage card (Dave, 2026-11-24) ─────────
 * "We need to provide users a referral link on the main page too."
 *
 * Members get their links in Muse; the main page hands them the
 * same link directly. Connected: fetch GET /api/referrals (which
 * lazily ensures the member's refCode) and show the link with a copy
 * button + how many people have joined through it. Signed out: the
 * honest version — connect and the link is yours. No earnings
 * figures here: commissions are SIMULATED until a real rail exists,
 * so the card promises attribution + Bid Points only (both real:
 * referredById is set-once, and referral joins fire BidPointEvents,
 * lib/doors/points.ts).
 */

interface ReferralState {
  link: string;
  code: string;
  recruitsCount: number;
}

export function ReferralLinkCard({ ready, connected }: { ready: boolean; connected: boolean }) {
  const [referral, setReferral] = useState<ReferralState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    void fetch("/api/referrals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { referrals?: ReferralState } | null) => {
        if (live && json?.referrals?.link) setReferral(json.referrals);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [connected]);

  if (!ready) return null;

  if (!connected) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-5">
        <h3 className="text-lg font-bold">Your referral link</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Connect and your personal referral link is yours to share — anyone who joins through it is credited to you.
        </p>
        <div className="mt-4">
          <Button asChild variant="outline">
            <a href="/api/auth/whop">Connect to get your link</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      <h3 className="text-lg font-bold">Your referral link</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Share it anywhere. Anyone who joins through it is credited to you, and their joins earn you Bid Points — the
        rotator&rsquo;s bidding currency. They&rsquo;ll get their own links in Muse.
      </p>
      {referral ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
              {referral.link}
            </code>
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(referral.link)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </Button>
          </div>
          {referral.recruitsCount > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {referral.recruitsCount} {referral.recruitsCount === 1 ? "person has" : "people have"} joined through your
              link so far.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Loading your link…</p>
      )}
    </div>
  );
}
