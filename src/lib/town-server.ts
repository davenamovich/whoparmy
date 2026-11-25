import "server-only";
import { db } from "@/lib/db";
import { getFreeDay } from "@/lib/free-day-server";
import { FREE_DAY_BILLBOARD, freeDayTickerEvent } from "@/lib/free-day-core";
import { placedPaidSlot } from "@/lib/paid-slots-server";
import { loadMarketToday, type MarketTodayView } from "@/lib/rotator-market-server";
import { addDaysToEtDate, spotWindowFor, type MarketPlacement } from "@/lib/rotator-market";
import { etDateString } from "@/lib/rotator";
import { buildTownPlots, etDayPhase, mergeTicker, nextPlotRent, type TownTickerEvent } from "@/lib/town";

type ViewerDistrict = {
  agents: Array<{ id: string; name: string; slug: string | null; createdAt: Date }>;
  paidSlots: Array<{ id: string; partner: string; date: string; priceCents: number; createdAt: Date }>;
  applications: Array<{ id: string; name: string; slug: string; createdAt: Date }>;
};

const emptyMarket = (): MarketTodayView => ({
  date: etDateString(),
  closesAt: new Date().toISOString(),
  dayEndsAt: new Date().toISOString(),
  inventory: [],
  placements: [],
  stats: { countedImpressions: 0, countedLaunches: 0 },
});

export async function loadTown(viewerUserId: string | null, now = new Date()) {
  const today = etDateString(now);
  const windowKey = spotWindowFor(now).key;
  const activityDates = Array.from({ length: 7 }, (_, i) => addDaysToEtDate(windowKey, i - 6));
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [agentRows, marketResult, hourParts, freeDay] = await Promise.all([
    db.hiredAgent.findMany({
      where: { publicProfile: true, slug: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, userId: true },
    }).catch(() => []),
    loadMarketToday(now).catch(() => ({ view: emptyMarket(), internal: [] })),
    Promise.resolve(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(now)),
    getFreeDay(now).catch((error) => { console.error("[town] Free-Day flip failed:", error); return null; }),
  ]);

  const ownerIds = [...new Set(agentRows.map((agent) => agent.userId))];
  const ownerRows = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, whopUsername: true } }).catch(() => [])
    : [];
  const ownerNames = new Map(ownerRows.map((owner) => [owner.id, owner.name ?? owner.whopUsername ?? null]));
  const agentIds = agentRows.map((agent) => agent.id);
  const activityByAgentId: Record<string, { slotsUsed7d: number; countedLaunches7d: number }> = {};
  for (const id of agentIds) activityByAgentId[id] = { slotsUsed7d: 0, countedLaunches7d: 0 };

  const [trafficRows, hopRows] = await Promise.all([
    agentIds.length
      ? db.agentTrafficDay.findMany({ where: { agentId: { in: agentIds }, date: { in: activityDates } }, select: { agentId: true, slotsUsed: true } }).catch(() => [])
      : Promise.resolve([]),
    agentIds.length
      ? db.rotatorHop.groupBy({
          by: ["agentId"],
          where: { agentId: { in: agentIds }, counted: true, filtered: false, ts: { gte: since, lte: now } },
          _count: { _all: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  for (const row of trafficRows) activityByAgentId[row.agentId].slotsUsed7d += row.slotsUsed;
  for (const row of hopRows) if (row.agentId) activityByAgentId[row.agentId].countedLaunches7d = row._count._all;

  const plots = buildTownPlots(agentRows.map((agent) => ({
    id: agent.id,
    name: agent.name,
    slug: agent.slug!,
    ownerName: ownerNames.get(agent.userId) ?? null,
  })), activityByAgentId);

  const tickerEvents: TownTickerEvent[] = [];
  const readTicker = async <T>(query: () => Promise<T[]>, project: (row: T) => TownTickerEvent) => {
    try { tickerEvents.push(...(await query()).map(project)); } catch { /* This ledger may not exist in every deployment yet. */ }
  };
  await Promise.all([
    readTicker<{ createdAt: Date; priceCents: number; partner: string }>(() => db.paidRotatorSlot.findMany({ where: { source: "paid" }, orderBy: { createdAt: "desc" }, take: 12, select: { createdAt: true, priceCents: true, partner: true } }), (r) => ({ ts: r.createdAt, kind: "slot", text: `Paid slot bought: ${r.partner} · $${(r.priceCents / 100).toFixed(2)}` })),
    readTicker(() => db.freeDay.findMany({ orderBy: { createdAt: "desc" }, take: 12 }), (r) => freeDayTickerEvent(r, r.mode)),
    readTicker(() => db.freeDayClaim.findMany({ orderBy: { createdAt: "desc" }, take: 12 }), (r) => freeDayTickerEvent(r, r.kind)),
    readTicker(() => db.rotatorBid.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { day: { select: { date: true } } } }), (r) => ({ ts: r.createdAt, kind: "bid", text: `Bid placed for ${r.day.date}` })),
    readTicker(() => db.rotatorDay.findMany({ where: { status: "CONFIRMED", confirmedAt: { not: null } }, orderBy: { confirmedAt: "desc" }, take: 12, select: { confirmedAt: true, winnerPartner: true, date: true } }), (r) => ({ ts: r.confirmedAt!, kind: "confirmed", text: `Rotator confirmed: ${r.winnerPartner ?? "winner"} · ${r.date}` })),
    readTicker(() => db.application.findMany({ where: { public: true }, orderBy: { createdAt: "desc" }, take: 12, select: { createdAt: true, name: true } }), (r) => ({ ts: r.createdAt, kind: "space", text: `Space listed: ${r.name}` })),
    readTicker(() => db.hiredAgent.findMany({ where: { publicProfile: true, slug: { not: null } }, orderBy: { createdAt: "desc" }, take: 12, select: { createdAt: true, name: true } }), (r) => ({ ts: r.createdAt, kind: "agent", text: `Agent moved in: ${r.name}` })),
    readTicker(() => db.rotatorHop.findMany({ where: { counted: true, filtered: false, ts: { gte: since }, linkId: { startsWith: "market-click:" } }, orderBy: { ts: "desc" }, take: 12, select: { ts: true, linkId: true } }), (r) => ({ ts: r.ts, kind: "launch", text: `Counted launch: ${(r.linkId ?? "").slice("market-click:".length)}` })),
  ]);

  let viewerDistrict: ViewerDistrict | null = null;
  if (viewerUserId) {
    const [agents, paidSlots, applications] = await Promise.all([
      db.hiredAgent.findMany({ where: { userId: viewerUserId, publicProfile: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true, createdAt: true } }).catch(() => []),
      db.paidRotatorSlot.findMany({ where: { userId: viewerUserId, date: { gte: today, lte: addDaysToEtDate(today, 2) }, ...placedPaidSlot }, orderBy: { date: "asc" }, select: { id: true, partner: true, date: true, priceCents: true, createdAt: true } }).catch(() => []),
      db.application.findMany({ where: { userId: viewerUserId, public: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, slug: true, createdAt: true } }).catch(() => []),
    ]);
    viewerDistrict = { agents, paidSlots, applications };
  }

  const hour = Number(hourParts);
  const banner: MarketPlacement[] = freeDay ? [{
    partner: FREE_DAY_BILLBOARD,
    partnerName: `${freeDay.mode === "HANDOUT" ? "Handout" : "Free Plot"} · ${freeDay.name}`,
    host: null,
    source: freeDay.mode === "HANDOUT" ? "free-placement" : "house",
    ownerName: null,
    lifecycle: "ACTIVE",
  }] : [];
  return {
    plots,
    nextRent: nextPlotRent(plots),
    freePlot: freeDay,
    billboard: { ...marketResult.view, placements: [...banner, ...marketResult.view.placements] },
    ticker: mergeTicker(tickerEvents),
    phase: etDayPhase(Number.isFinite(hour) ? hour : 0),
    viewerDistrict,
  };
}
