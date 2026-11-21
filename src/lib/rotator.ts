import "server-only";
import { db } from "@/lib/db";
import { getActiveCatalog, partnerNameSync } from "@/lib/offer-catalog";
import { filterPlacementsByTrafficPool, getPlacementAgentAttribution } from "@/lib/traffic-pool";
import { pickGroupedDestination, rotatorV2Enabled } from "@/lib/rotator-v2-core";
import { getForfeitedAgentIds, resolveAgentRotatorDestination } from "@/lib/rotator-v2";

/**
 * ─── THE DAILY ROTATOR — auctioned, admin controlled ───────────────
 *
 * Dave's direction (2026-11-17): traffic that arrives WITHOUT a sign
 * up link (no referrer) goes to one destination per ET day, and that
 * slot is an AUCTION, admin controlled.
 *
 * - Members bid FREE GENERATIONS to feature one of their own saved
 *   bridge links for a day. One bid per member per day (re-bidding
 *   updates it). Bids are promises, not payments: nothing is deducted
 *   until an admin confirms a winner.
 * - An operator (admin) opens days, confirms the winner (default:
 *   highest bid; the admin may pick any bid), or cancels a day.
 *   Confirming snapshots the winner's CURRENT saved URL for the bid
 *   partner — the featured URL always comes from the member's saved
 *   EngineLink, never from bid input — and deducts the bid from the
 *   winner's freeGenBalance. Cancelling a confirmed day refunds.
 * - Resolution for a day: a CONFIRMED auction wins. Otherwise the
 *   house fallback rotates Dave's own partner links deterministically
 *   by day-of-year, so unsold days still land somewhere exact and the
 *   pick is recomputable from the date alone.
 *
 * Attribution: the day record IS the attribution. Every no-ref click
 * through /api/bridge/rotator/go on a given ET date went to the URL
 * stored (or computable) for that date — nothing else, all day.
 */

const ET = "America/New_York";

export function etDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function etTomorrowString(): string {
  return etDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function dayOfYearET(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86400000) + 1;
}

/** House fallback pool: Dave's own partner links (real URLs only),
 *  read from the active offer catalog (P&R MCP steps) per call so a
 *  catalog refresh lands without a restart. */
function housePool() {
  return getActiveCatalog()
    .filter((p) => p.example.startsWith("http"))
    .map((p) => ({ partner: p.key, name: p.name, url: p.example }));
}

export interface RotatorPoolEntry {
  url: string;
  partner: string;
  partnerName: string;
  source: "auction" | "free";
  userId: string | null;
  agentId?: string | null;
}

export interface RotatorDestination {
  date: string;
  url: string;
  partner: string;
  partnerName: string;
  source: "auction" | "free" | "mixed" | "house";
  winnerUserId: string | null;
  /** Owner of the link being served right now (the hourly pick); null for house. */
  pickUserId: string | null;
  poolSize: number;
  pool: RotatorPoolEntry[];
  agentId?: string | null;
  agentRotatorId?: string | null;
  agentRotatorLinkId?: string | null;
}

function etHour(d = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hourCycle: "h23" }).format(d),
  );
}

/**
 * The day's featured pool: the confirmed auction winner (if any)
 * PLUS every free placement earned for that day (Dave, 2026-11-17:
 * signing up for an offer earns 24 hours free in the rotator for
 * that offer — see RotatorPlacement in lib/bridge.ts). A placement
 * serves the URL snapshotted when the day was earned (later edits
 * don't rewrite an earned day); legacy rows without a snapshot fall
 * back to the current link, and a deleted link drops out entirely.
 */
export async function getRotatorPool(date = etDateString()): Promise<RotatorPoolEntry[]> {
  const pool: RotatorPoolEntry[] = [];
  const v2 = rotatorV2Enabled(process.env);
  const day = await db.rotatorDay.findUnique({ where: { date } });
  if (day?.status === "CONFIRMED" && day.winnerUrl) {
    pool.push({
      url: day.winnerUrl,
      partner: day.winnerPartner ?? "",
      partnerName: day.winnerPartner ? partnerNameSync(day.winnerPartner) : "",
      source: "auction",
      userId: day.winnerUserId,
      ...(v2 ? { agentId: null } : {}),
    });
  }
  const earned = await db.rotatorPlacement.findMany({
    where: { date },
    orderBy: { createdAt: "asc" },
  });
  // Traffic pool (Dave, 2026-11-19): a member's free placements are
  // worked by their agents, 10 slots per agent per day. Entries past
  // a member's agents' pools stop rotating for the day; members with
  // no working agent rotate exactly as before, and the auction entry
  // above is never filtered. Fail-open inside the filter.
  const placements = await filterPlacementsByTrafficPool(earned, date);
  const attribution = v2 ? await getPlacementAgentAttribution(placements, date) : new Map<string, string>();
  if (v2) {
    const forfeited = await getForfeitedAgentIds(placements);
    for (let i = placements.length - 1; i >= 0; i--) {
      const agentId = attribution.get(placements[i].id);
      if (agentId && forfeited.has(agentId)) placements.splice(i, 1);
    }
  }
  for (const pl of placements) {
    const link = await db.engineLink.findUnique({
      where: { userId_partner: { userId: pl.userId, partner: pl.partner } },
      select: { url: true },
    });
    if (!link) continue;
    pool.push({
      url: pl.url ?? link.url,
      partner: pl.partner,
      partnerName: partnerNameSync(pl.partner),
      source: "free",
      userId: pl.userId,
      ...(v2 ? { agentId: attribution.get(pl.id) ?? null } : {}),
    });
  }
  return pool;
}

export async function getRotatorDestination(date = etDateString()): Promise<RotatorDestination> {
  const pool = await getRotatorPool(date);
  if (pool.length) {
    // The rotator ROTATES: today's featured link changes hourly, so
    // every entry in the pool gets its share of the day's 24 hours.
    // (Other dates report the pool head — only today has a "now".)
    const today = date === etDateString();
    let pick = today ? pool[etHour() % pool.length] : pool[0];
    if (rotatorV2Enabled(process.env) && today) {
      const auction = pool.filter((entry) => entry.source === "auction").map((entry) => [entry]);
      const agentGroups = [...new Set(pool.filter((entry) => entry.source === "free" && entry.agentId).map((entry) => entry.agentId!))]
        .sort((a, b) => a.localeCompare(b))
        .map((agentId) => pool.filter((entry) => entry.source === "free" && entry.agentId === agentId));
      const legacy = pool.filter((entry) => entry.source === "free" && !entry.agentId);
      pick = pickGroupedDestination([...auction, ...agentGroups, ...(legacy.length ? [legacy] : [])], etHour()) ?? pick;
    }
    let served = { url: pick.url, partner: pick.partner, partnerName: pick.partnerName, agentId: null as string | null, agentRotatorId: null as string | null, agentRotatorLinkId: null as string | null };
    if (rotatorV2Enabled(process.env) && today && pick.source === "free" && pick.agentId) {
      const resolved = await resolveAgentRotatorDestination(pick.agentId);
      if (resolved) served = { url: resolved.url, partner: resolved.partner, partnerName: partnerNameSync(resolved.partner), agentId: pick.agentId, agentRotatorId: resolved.rotatorId, agentRotatorLinkId: resolved.linkId };
    }
    const hasAuction = pool.some((e) => e.source === "auction");
    const hasFree = pool.some((e) => e.source === "free");
    return {
      date,
      url: served.url,
      partner: served.partner,
      partnerName: served.partnerName,
      source: hasAuction && hasFree ? "mixed" : hasAuction ? "auction" : "free",
      winnerUserId: pool.find((e) => e.source === "auction")?.userId ?? null,
      pickUserId: pick.userId,
      poolSize: pool.length,
      pool,
      ...(rotatorV2Enabled(process.env)
        ? {
            agentId: served.agentId,
            agentRotatorId: served.agentRotatorId,
            agentRotatorLinkId: served.agentRotatorLinkId,
          }
        : {}),
    };
  }
  const pool0 = housePool();
  const pick = pool0[(dayOfYearET(date) - 1) % pool0.length];
  return {
    date,
    url: pick.url,
    partner: pick.partner,
    partnerName: pick.name,
    source: "house",
    winnerUserId: null,
    pickUserId: null,
    poolSize: 0,
    pool: [],
  };
}

export interface RotatorDayState {
  date: string;
  status: string;
  topBid: number | null;
  bidCount: number;
  myBid: { partner: string; amount: number } | null;
  isWinner: boolean;
}

export interface RotatorState {
  today: RotatorDestination;
  myFreeGenBalance: number;
  myPartners: Array<{ key: string; name: string; url: string }>;
  days: RotatorDayState[];
}

async function dayState(date: string, userId: string): Promise<RotatorDayState> {
  const day = await db.rotatorDay.findUnique({
    where: { date },
    include: { bids: { orderBy: { amount: "desc" } } },
  });
  if (!day) return { date, status: "UNOPENED", topBid: null, bidCount: 0, myBid: null, isWinner: false };
  const mine = day.bids.find((b) => b.userId === userId);
  return {
    date,
    status: day.status,
    topBid: day.bids.length ? day.bids[0].amount : null,
    bidCount: day.bids.length,
    myBid: mine ? { partner: mine.partner, amount: mine.amount } : null,
    isWinner: day.status === "CONFIRMED" && day.winnerUserId === userId,
  };
}

/** Member-facing state: today + tomorrow + the day after (biddable window). */
export async function getRotatorState(userId: string): Promise<RotatorState> {
  const [user, links, today] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { freeGenBalance: true } }),
    db.engineLink.findMany({ where: { userId }, select: { partner: true, url: true } }),
    getRotatorDestination(),
  ]);
  const dates = [0, 1, 2].map((n) => etDateString(new Date(Date.now() + n * 86400000)));
  const days = await Promise.all(dates.map((d) => dayState(d, userId)));
  const nameOf = (k: string) => partnerNameSync(k);
  return {
    today,
    myFreeGenBalance: user?.freeGenBalance ?? 0,
    myPartners: links.map((l) => ({ key: l.partner, name: nameOf(l.partner), url: l.url })),
    days,
  };
}

export type BidResult = { ok: true } | { ok: false; error: string };

export async function placeRotatorBid(
  userId: string,
  input: { date: unknown; partner: unknown; amount: unknown },
): Promise<BidResult> {
  const date = typeof input.date === "string" ? input.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Bad date." };
  const today = etDateString();
  if (date < today) return { ok: false, error: "That day is already gone." };
  const partner = typeof input.partner === "string" ? input.partner : "";
  const amount = typeof input.amount === "number" ? Math.floor(input.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: "Bid at least 1 free generation." };

  const [user, link, day] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { freeGenBalance: true } }),
    db.engineLink.findUnique({ where: { userId_partner: { userId, partner } } }),
    db.rotatorDay.findUnique({ where: { date } }),
  ]);
  if (!link) return { ok: false, error: "Save that partner link on the bridge first — the rotator only features saved links." };
  if (!user || amount > user.freeGenBalance) {
    return { ok: false, error: `You have ${user?.freeGenBalance ?? 0} free generations — a bid can't exceed your balance.` };
  }
  if (day && day.status !== "OPEN") return { ok: false, error: `That day is ${day.status.toLowerCase()} — bidding is closed.` };

  const openDay =
    day ??
    (await db.rotatorDay.create({ data: { date, status: "OPEN" } }));
  await db.rotatorBid.upsert({
    where: { dayId_userId: { dayId: openDay.id, userId } },
    create: { dayId: openDay.id, userId, partner, amount },
    update: { partner, amount },
  });
  return { ok: true };
}

// ─── Admin (operator only — enforced in the route) ─────────────────

export interface AdminDayView {
  date: string;
  status: string;
  winnerUserId: string | null;
  winnerUrl: string | null;
  winningBid: number | null;
  bids: Array<{ userId: string; partner: string; amount: number }>;
}

export async function listRotatorDaysForAdmin(): Promise<AdminDayView[]> {
  const days = await db.rotatorDay.findMany({
    orderBy: { date: "desc" },
    take: 14,
    include: { bids: { orderBy: { amount: "desc" } } },
  });
  return days.map((d) => ({
    date: d.date,
    status: d.status,
    winnerUserId: d.winnerUserId,
    winnerUrl: d.winnerUrl,
    winningBid: d.winningBid,
    bids: d.bids.map((b) => ({ userId: b.userId, partner: b.partner, amount: b.amount })),
  }));
}

export type AdminResult = { ok: true; detail: string } | { ok: false; error: string };

export async function adminConfirmWinner(date: string, pickUserId?: string): Promise<AdminResult> {
  const day = await db.rotatorDay.findUnique({
    where: { date },
    include: { bids: { orderBy: { amount: "desc" } } },
  });
  if (!day) return { ok: false, error: "No auction exists for that date." };
  if (day.status === "CONFIRMED") return { ok: false, error: "That day already has a confirmed winner." };
  if (day.status === "CANCELLED") return { ok: false, error: "That day is cancelled." };
  const bid = pickUserId ? day.bids.find((b) => b.userId === pickUserId) : day.bids[0];
  if (!bid) return { ok: false, error: pickUserId ? "That member has no bid on this day." : "No bids on this day yet." };

  // The featured URL comes from the winner's SAVED link, right now.
  const link = await db.engineLink.findUnique({
    where: { userId_partner: { userId: bid.userId, partner: bid.partner } },
  });
  if (!link) return { ok: false, error: "The winning bidder no longer has that link saved — pick another bid." };
  const winner = await db.user.findUnique({ where: { id: bid.userId }, select: { freeGenBalance: true } });
  if (!winner || winner.freeGenBalance < bid.amount) {
    return { ok: false, error: "The winning bidder's balance no longer covers the bid — pick another bid." };
  }

  await db.user.update({
    where: { id: bid.userId },
    data: { freeGenBalance: { decrement: bid.amount } },
  });
  await db.rotatorDay.update({
    where: { id: day.id },
    data: {
      status: "CONFIRMED",
      winnerUserId: bid.userId,
      winnerPartner: bid.partner,
      winnerUrl: link.url,
      winningBid: bid.amount,
      gensDeducted: true,
      confirmedAt: new Date(),
    },
  });
  return { ok: true, detail: `Confirmed ${bid.partner} (${bid.amount} gens) for ${date}: ${link.url}` };
}

export async function adminCancelDay(date: string): Promise<AdminResult> {
  const day = await db.rotatorDay.findUnique({ where: { date } });
  if (!day) return { ok: false, error: "No auction exists for that date." };
  if (day.status === "CANCELLED") return { ok: false, error: "That day is already cancelled." };
  if (day.status === "CONFIRMED" && day.gensDeducted && day.winnerUserId && day.winningBid) {
    await db.user.update({
      where: { id: day.winnerUserId },
      data: { freeGenBalance: { increment: day.winningBid } },
    });
  }
  await db.rotatorDay.update({
    where: { id: day.id },
    data: { status: "CANCELLED", winnerUserId: null, winnerPartner: null, winnerUrl: null, winningBid: null, gensDeducted: false, confirmedAt: null },
  });
  return { ok: true, detail: `Cancelled ${date}${day.status === "CONFIRMED" ? " and refunded the winner" : ""}.` };
}
