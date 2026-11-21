/**
 * ─── PUBLIC AGENT STATS — pure core ─────────────────────────────────
 *
 * The wire shapes and pure aggregation behind the stats + rotator
 * access blocks on /agents, /agent/{slug} and /api/agents/public
 * (Dave, 2026-11-21: "more of his stats — and how users access
 * rotators and spots available"). The server half is
 * lib/agent-stats.ts. No imports: this core stays loadable by
 * `node --test` and typeable from client components.
 *
 * ─── Definitions (counted traffic only, nothing invented) ─────────
 * A hop counts ONLY when its RotatorHop row has counted=true — the
 * hop scorer (lib/rotator-v2-core.ts scoreHop) already filtered bot
 * user-agents, duplicates, velocity bursts and rate-limited traffic
 * into counted=false, and the server queries counted=true only.
 * Filtered hops never appear in any number below.
 *
 * - visitorsSent: counted hops served THROUGH this agent's rotator
 *   (rotatorId = the agent's AgentRotator row). Two surfaces produce
 *   them: AGENT (the agent's own /r/a rotator link served a visitor)
 *   and ALLOCATOR (the daily rotator served a destination resolved
 *   through this agent's rotator). Both are visitors this agent
 *   sent to a destination. Marketplace hops (surface ROTATOR_PAGE)
 *   also carry an agentId — the placement attribution — but they
 *   are the marketplace's own impressions/clicks with rotatorId
 *   null, NOT serves through the agent's rotator; they belong to
 *   the marketplace's stats and never count here. An impression is
 *   not a visitor sent.
 * - launches: counted hops on surface AGENT only — a visitor used
 *   the agent's OWN rotator link and was launched to the link the
 *   rotator picked. ALLOCATOR hops are the house rotator's serves,
 *   not launches via the agent's link, so they count as visitors
 *   sent but not as launches. Every AGENT hop records the link it
 *   launched to (linkId), so a launch is always a completed serve,
 *   never a page view.
 * - placementsRun: RotatorPlacement rows attributed to this agent
 *   by the traffic pool's own decision (lib/traffic-pool-core.ts
 *   decideTrafficPools — the same attribution the rotator serves
 *   with), summed over every placement date the owner has.
 *   placementsActiveToday is the subset dated today (ET).
 * - spots: the CURRENT 23:50 ET spot window (window math in
 *   lib/rotator-market.ts, allotment from traffic-pool-core's one
 *   policy point): used = placements attributed to this agent on
 *   the placement date the window funds, available = allotment −
 *   used (0 when the agent is not working — a paused/expired
 *   agent's pool is not in play).
 *
 * No agent-game score: AgentGameAgent has no stored link to a
 * HiredAgent (its claim flow redeems codes to a member, it does not
 * record which agent row it belongs to), so joining game score to a
 * profile would be fabrication. Omitted deliberately.
 */

import type { SpotWindow } from "./rotator-market.ts";

export interface PublicAgentStats {
  /** Counted hops attributed to this agent, all time. */
  visitorsSent: number;
  /** Counted hops attributed to this agent, trailing 7 days. */
  visitorsSent7d: number;
  /** Counted launches via the agent's own rotator link, all time. */
  launches: number;
  /** Counted launches via the agent's own rotator link, trailing 7 days. */
  launches7d: number;
  /** Placements attributed to this agent by the pool, all dates. */
  placementsRun: number;
  /** Attributed placements dated today (ET). */
  placementsActiveToday: number;
  spots: {
    /** Spot-window key (ET date the window opened, 23:50 ET). */
    windowKey: string;
    /** UTC instant the current window opened. */
    opensAt: string;
    /** UTC instant the window resets (next 23:50 ET). */
    resetsAt: string;
    /** Spots per the allotment policy for this window. */
    allotment: number;
    /** Spots consumed by placements the window funds. */
    used: number;
    /** allotment − used; 0 when the agent is not working. */
    available: number;
    /** Policy allotment read for the next window (recomputed when it opens). */
    nextWindowAllotment: number;
    /** Whether the agent is working (ACTIVE and unexpired). */
    active: boolean;
  };
}

/**
 * ─── House CTA — the platform's outcome pages (Dave, 2026-11-21) ──
 *
 * Every public agent profile routes visitors OFFSITE to Plunder &
 * Riffle: Muse (the workhouse) and Agent37 (the workforce). The
 * destinations are the owner's OWN P&R record links when they have
 * them — populated when their Muse connected via the bridge and
 * synced their offers (POST /api/bridge/links/sync from their
 * list_my_offers) — so the owner's attribution rides along. The
 * house URLs below are the fallback for owners with no such link
 * saved: the muse-invite page carries the house invite code by
 * design, and /agent37 is the P&R Agent37 partner page. Per-link
 * resolution: each of the two links resolves independently, and
 * each carries its source so consumers can tell whose link it is.
 */
export const HOUSE_CTA = {
  museUrl: "https://www.plunderandriffle.com/muse-invite",
  agent37Url: "https://www.plunderandriffle.com/agent37",
} as const;

export interface HouseCtaLink {
  url: string;
  /** "owner" = the agent owner's synced/saved P&R record link;
   *  "house" = the Plunder & Riffle platform fallback. */
  source: "owner" | "house";
}

export interface HouseCta {
  muse: HouseCtaLink;
  agent37: HouseCtaLink;
}

/** Owner-first resolution, per link: the owner's own link wins when
 *  present (non-empty), the house URL otherwise. */
export function resolveHouseCta(ownerLinks: {
  museUrl?: string | null;
  agent37Url?: string | null;
}): HouseCta {
  const muse = ownerLinks.museUrl?.trim();
  const agent37 = ownerLinks.agent37Url?.trim();
  return {
    muse: muse ? { url: muse, source: "owner" } : { url: HOUSE_CTA.museUrl, source: "house" },
    agent37: agent37
      ? { url: agent37, source: "owner" }
      : { url: HOUSE_CTA.agent37Url, source: "house" },
  };
}

export interface PublicAgentAccess {
  rotator: {
    /** live = serve URL present; disabled = owner turned it off;
     *  not-set-up = no rotator yet; unavailable = rotator exists and
     *  is enabled but serving is switched off platform-side, so no
     *  URL is shown rather than a dead link. */
    state: "live" | "disabled" | "not-set-up" | "unavailable";
    serveUrl: string | null;
  };
  /** The daily rotator marketplace. */
  dailyRotatorUrl: string;
  /** Where a visitor gets a rotator of their own. */
  ownRotatorUrl: string;
  /** Offsite Plunder & Riffle CTAs, resolved owner-first per link
   *  (see HOUSE_CTA above). */
  houseCta: HouseCta;
}

/** One surface's counted-hop totals for one agent, as grouped by the DB. */
export interface HopSurfaceGroup {
  surface: string;
  allTime: number;
  last7d: number;
}

/** The surface a launch through the agent's own rotator link records. */
export const AGENT_SERVE_SURFACE = "AGENT";

/** The surfaces that are serves through an agent's rotator: AGENT
 *  (its own /r/a link) and ALLOCATOR (the daily rotator resolving
 *  through it). Anything else — notably ROTATOR_PAGE marketplace
 *  impressions/clicks — is not a serve through the agent's rotator
 *  and never counts toward its stats. */
export const AGENT_ROTATOR_SURFACES: ReadonlySet<string> = new Set([AGENT_SERVE_SURFACE, "ALLOCATOR"]);

export function summarizeAgentHops(groups: HopSurfaceGroup[]): {
  visitorsSent: number;
  visitorsSent7d: number;
  launches: number;
  launches7d: number;
} {
  let visitorsSent = 0;
  let visitorsSent7d = 0;
  let launches = 0;
  let launches7d = 0;
  for (const g of groups) {
    if (!AGENT_ROTATOR_SURFACES.has(g.surface)) continue;
    visitorsSent += g.allTime;
    visitorsSent7d += g.last7d;
    if (g.surface === AGENT_SERVE_SURFACE) {
      launches += g.allTime;
      launches7d += g.last7d;
    }
  }
  return { visitorsSent, visitorsSent7d, launches, launches7d };
}

export function buildSpotBlock(input: {
  window: SpotWindow;
  allotment: number;
  nextWindowAllotment: number;
  used: number;
  active: boolean;
}): PublicAgentStats["spots"] {
  const used = Math.max(0, input.used);
  return {
    windowKey: input.window.key,
    opensAt: input.window.startUtc,
    resetsAt: input.window.endUtc,
    allotment: input.allotment,
    used,
    // A non-working agent's pool is not in play: its spots are not
    // available to anyone, whatever the raw arithmetic says.
    available: input.active ? Math.max(0, input.allotment - used) : 0,
    nextWindowAllotment: input.nextWindowAllotment,
    active: input.active,
  };
}

/** Pool-wide availability across a set of public agents (the
 *  /agents header line): total open spots in the current window. */
export interface PublicPoolSummary {
  windowKey: string;
  opensAt: string;
  resetsAt: string;
  /** Sum of available spots over working public agents. */
  totalAvailable: number;
  /** Public agents whose pool is in play this window. */
  activeAgents: number;
}

export function summarizePool(
  window: SpotWindow,
  spotsList: Array<PublicAgentStats["spots"]>,
): PublicPoolSummary {
  let totalAvailable = 0;
  let activeAgents = 0;
  for (const s of spotsList) {
    if (s.active) {
      activeAgents++;
      totalAvailable += s.available;
    }
  }
  return {
    windowKey: window.key,
    opensAt: window.startUtc,
    resetsAt: window.endUtc,
    totalAvailable,
    activeAgents,
  };
}
