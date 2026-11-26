"use client";

import { useEffect, useState } from "react";
import { deriveWhopHeader, type WhopHeaderSessionLike } from "@/lib/whop-header";

/**
 * WhopConnect — the header's Whop OAuth status (Dave, 2026-11-26).
 *
 * Replaces the always-on "Connect" CTA in SiteHeader (and the Town
 * header) so a member can SEE their connection state on every page:
 *
 *   checking     → gray dot, "Checking…"
 *   disconnected → the amber Connect CTA (the OAuth start link)
 *   connected    → GREEN dot + green pill "Welcome, <First Name>"
 *                  + a Disconnect button (POST /api/auth/whop/logout,
 *                  then reload so every surface re-reads the session)
 *
 * State comes only from GET /api/auth/session — nothing invented.
 * A failed fetch reads as disconnected (the Connect CTA is the honest
 * next step), matching the homepage probe's fallback.
 */
export function WhopConnect({
  ctaHref = "/api/auth/whop",
  ctaLabel = "Connect",
  compact = false,
}: {
  ctaHref?: string;
  ctaLabel?: string;
  compact?: boolean;
}) {
  const [session, setSession] = useState<WhopHeaderSessionLike | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: WhopHeaderSessionLike) => {
        if (live) setSession({ connected: Boolean(s?.connected), user: s?.user ?? null });
      })
      .catch(() => {
        if (live) setSession({ connected: false, user: null });
      });
    return () => {
      live = false;
    };
  }, []);

  const state = deriveWhopHeader(session);

  if (state.tone === "checking") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
        Checking…
      </span>
    );
  }

  if (state.tone === "connected") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/10 font-semibold text-emerald-400 ${
            compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
          }`}
          aria-live="polite"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          {state.welcomeText}
        </span>
        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await fetch("/api/auth/whop/logout", { method: "POST" });
            } finally {
              window.location.reload();
            }
          }}
          className={`rounded-[8px] border border-border font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 ${
            compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
          }`}
        >
          {signingOut ? "Disconnecting…" : "Disconnect"}
        </button>
      </span>
    );
  }

  return (
    <a
      className="rounded-[8px] bg-primary px-3.5 py-2 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      href={ctaHref}
    >
      {ctaLabel}
    </a>
  );
}
