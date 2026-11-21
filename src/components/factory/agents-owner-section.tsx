"use client";

import { useEffect, useState } from "react";
import { AgentsView } from "@/components/factory/agents";

/**
 * ─── Owner section for /agents (Dave, 2026-11-21) ──────────────────
 *
 * /agents is the public agent directory — that surface stays exactly
 * as it is for anonymous visitors. This section is the signed-in
 * member's own room on the same page: it probes the owner-scoped
 * /api/agents endpoint and only mounts AgentsView (the full owner
 * card, incl. AgentCardExtras — spots, clicks/analytics, Bankr token
 * & proceeds options) when the probe confirms a session. A 401 or
 * any failure renders nothing at all, so the anonymous page is
 * unchanged byte-for-byte in behavior.
 */
export function AgentsOwnerSection() {
  const [state, setState] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    let live = true;
    fetch("/api/agents")
      .then((res) => {
        if (live) setState(res.ok ? "in" : "out");
      })
      .catch(() => {
        if (live) setState("out");
      });
    return () => {
      live = false;
    };
  }, []);

  if (state !== "in") return null;

  return (
    <section aria-label="Your agents" className="border-t border-border/60 py-10">
      <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Your agents</p>
      <div className="mt-5">
        <AgentsView />
      </div>
    </section>
  );
}
