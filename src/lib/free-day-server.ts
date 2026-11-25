import "server-only";
import type { Application, FreeDay, FreeDayClaim, Prisma } from "@prisma/client";
import { HOUSE_SPACE } from "@/lib/application";
import { db } from "@/lib/db";
import { FREE_DAY_SOURCE, freeDayClaimKey, isExcludedFreeDaySpace, pickFreeDaySpace } from "@/lib/free-day-core";
import { resolveHouseUserId } from "@/lib/house-owner";
import { grantMarketplaceBundle, hasActiveWhopKit, MarketplaceError, readMarketplaceKit, recordMarketplaceGrant } from "@/lib/marketplace-server";
import { mintFreeDaySlotCredit } from "@/lib/paid-slots-server";
import { etDateStringFrom, etDayEndsAt } from "@/lib/rotator-market";

const catalogSpaceId = `catalog:${HOUSE_SPACE.slug}`;
const catalogListingSlug = `~${catalogSpaceId}`;
const agentIdentity = { select: { name: true, slug: true } } as const;

async function freeDayTransaction<T>(run: (store: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(run); }
    catch (error) {
      if (attempt >= 3 || !error || typeof error !== "object" || !("code" in error) || !["P1008", "P2002", "P2034"].includes(String(error.code))) throw error;
    }
  }
}

async function catalogAgent(store: Prisma.TransactionClient, userId: string) {
  const agents = await store.hiredAgent.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, ...agentIdentity.select } });
  const eligible = agents.filter((agent) => !isExcludedFreeDaySpace(agent.name, agent.slug));
  return eligible.find((agent) => agent.slug === HOUSE_SPACE.slug) ?? eligible[0];
}

function spaceMode(space: Application & { agent: { name: string; slug: string | null } }, houseId: string | null) {
  if (!space.public || isExcludedFreeDaySpace(space.slug, space.name, space.agent.slug, space.agent.name)) return null;
  if (space.userId === houseId) return "HOUSE";
  return space.handoutOptIn ? "HANDOUT" : null;
}

async function ensureFreeDay(store: Prisma.TransactionClient, date: string, now: Date) {
  const existing = await store.freeDay.findUnique({ where: { date } });
  if (existing) return existing;
  const houseId = await resolveHouseUserId(store);
  const rows = await store.application.findMany({ where: { public: true, OR: [{ userId: houseId ?? "" }, { handoutOptIn: true }] }, include: { agent: agentIdentity } });
  const pool = rows.flatMap((row) => {
    const mode = spaceMode(row, houseId);
    return mode ? [{ id: row.id, slug: row.slug, name: row.name, mode }] : [];
  });
  if (houseId && !rows.some((row) => row.slug === HOUSE_SPACE.slug) && !await store.application.findFirst({ where: { slug: HOUSE_SPACE.slug, public: true }, select: { id: true } }) && await catalogAgent(store, houseId)) {
    pool.push({ id: catalogSpaceId, slug: HOUSE_SPACE.slug, name: HOUSE_SPACE.name, mode: "HOUSE" });
  }
  if (!pool.length) return null;
  const history = await store.freeDay.groupBy({ by: ["spaceId"], where: { date: { lt: date }, spaceId: { in: pool.map((space) => space.id) } }, _max: { date: true } });
  const picked = pickFreeDaySpace(pool, new Map(history.map((row) => [row.spaceId, row._max.date!])), date)!;
  return store.freeDay.create({ data: { date, spaceId: picked.id, slug: picked.slug, name: picked.name, mode: picked.mode, createdAt: now } });
}

async function validatePick(store: Prisma.TransactionClient, day: FreeDay) {
  const houseId = await resolveHouseUserId(store);
  if (day.spaceId === catalogSpaceId) {
    if (!houseId) return null;
    if (await store.application.findFirst({ where: { slug: HOUSE_SPACE.slug, public: true }, select: { id: true } })) return null;
    const listing = await store.application.findUnique({ where: { slug: catalogListingSlug } });
    if (listing && (listing.userId !== houseId || listing.public || listing.listingStatus !== "CATALOG")) return null;
    const agent = await catalogAgent(store, houseId);
    return agent ? { listing, houseId, catalogAgentId: agent.id } : null;
  }
  const listing = await store.application.findUnique({ where: { id: day.spaceId }, include: { agent: agentIdentity } });
  return listing && listing.slug === day.slug && spaceMode(listing, houseId) === day.mode ? { listing, houseId, catalogAgentId: null } : null;
}

function dayView(day: FreeDay) {
  return { date: day.date, slug: day.slug, name: day.name, mode: day.mode, endsAt: etDayEndsAt(day.date), spaceUrl: `/spaces/${encodeURIComponent(day.slug)}` };
}

function claimView(claim: FreeDayClaim) {
  return { id: claim.id, date: claim.date, slug: claim.slug, kind: claim.kind, grantId: claim.grantId, expiresAt: claim.expiresAt, source: FREE_DAY_SOURCE };
}

async function hasActiveSale(store: Prisma.TransactionClient, listingId: string, userId: string) {
  return Boolean(await store.marketplaceSale.findFirst({ where: { listingId, buyerUserId: userId, status: "ACTIVE" }, select: { id: true } }));
}

export async function getFreeDay(now = new Date()) {
  return freeDayTransaction(async (store) => {
    const day = await ensureFreeDay(store, etDateStringFrom(now), now);
    return day && await validatePick(store, day) ? dayView(day) : null;
  });
}

export async function getFreeDayForUser(userId: string, now = new Date()) {
  const state = await freeDayTransaction(async (store) => {
    const day = await ensureFreeDay(store, etDateStringFrom(now), now);
    if (!day) return null;
    const pick = await validatePick(store, day);
    if (!pick) return null;
    const { date, name, slug, mode, endsAt } = dayView(day);
    const ownerKind = mode === "HOUSE" ? "house" as const : "member" as const;
    const listing = pick.listing;
    const claimKey = freeDayClaimKey(mode, day.spaceId, date);
    const claim = await store.freeDayClaim.findUnique({ where: { userId_date: { userId, date } } })
      ?? (mode === "HOUSE" ? await store.freeDayClaim.findUnique({ where: { userId_claimKey: { userId, claimKey } } }) : null);
    const owned = mode === "HOUSE" && (pick.houseId === userId || Boolean(listing && await hasActiveSale(store, listing.id, userId)));
    const whopPlan = mode === "HOUSE" && !owned && listing?.listingStatus === "PUBLISHED" && listing.priceCents > 0 ? listing.whopPlanId : null;
    const credit = claim?.kind === "CREDIT" && claim.grantId && claim.expiresAt ? { id: claim.grantId, expiresAt: claim.expiresAt } : null;
    return { view: { date, name, slug, ownerKind, mode, endsAt, claimed: Boolean(claim), owned, credit }, whopPlan };
  });
  if (!state) return null;
  if (state.whopPlan) state.view.owned = await hasActiveWhopKit(userId, state.whopPlan);
  return state.view;
}

function contentEngineKit() {
  return { kit: { files: [{ path: "BUILD.md", text: HOUSE_SPACE.buildPrompt! }] }, manifest: HOUSE_SPACE.replicationManifest, skillsyncUrl: HOUSE_SPACE.skillsyncUrl };
}

export async function claimFreeDay(userId: string, expectedDate?: string, now = new Date()) {
  const date = etDateStringFrom(now);
  if (expectedDate !== undefined && expectedDate !== date) throw new MarketplaceError("Free Day has flipped. Read today's Space again.", 409);
  const day = await freeDayTransaction((store) => ensureFreeDay(store, date, now));
  if (!day) throw new MarketplaceError("No Space is featured today.", 404);
  const claimKey = freeDayClaimKey(day.mode, day.spaceId, date);
  let checkedWhopPlan: string | null = null;
  let whopOwned = false;
  if (day.mode === "HOUSE" && day.spaceId !== catalogSpaceId) {
    const prior = await db.freeDayClaim.findUnique({ where: { userId_claimKey: { userId, claimKey } } });
    if (prior) return claimView(prior);
    const listing = await db.application.findFirst({ where: { id: day.spaceId, public: true, listingStatus: "PUBLISHED", whopPlanId: { not: null }, priceCents: { gt: 0 } }, select: { userId: true, whopPlanId: true } });
    if (listing?.whopPlanId && listing.userId !== userId) {
      const recorded = await hasActiveSale(db, day.spaceId, userId);
      if (!recorded) {
        checkedWhopPlan = listing.whopPlanId;
        try { whopOwned = await hasActiveWhopKit(userId, checkedWhopPlan); }
        catch { throw new MarketplaceError("Could not check Whop kit ownership. Try again shortly.", 503); }
      }
    }
  }
  return freeDayTransaction(async (store) => {
    const todayClaim = await store.freeDayClaim.findUnique({ where: { userId_date: { userId, date } } });
    if (todayClaim) return claimView(todayClaim);
    const prior = day.mode === "HOUSE" ? await store.freeDayClaim.findUnique({ where: { userId_claimKey: { userId, claimKey } } }) : null;
    if (prior) return claimView(prior);
    const pick = await validatePick(store, day);
    if (!pick) throw new MarketplaceError("Today's Space is no longer available.", 404);
    const data = { userId, date, spaceId: day.spaceId, slug: day.slug, name: day.name, claimKey, createdAt: now };
    if (day.mode === "HANDOUT") {
      return claimView(await store.freeDayClaim.create({ data: { ...data, kind: "VISIT", expiresAt: new Date(etDayEndsAt(date)) } }));
    }

    const owned = pick.houseId === userId || (whopOwned && pick.listing?.whopPlanId === checkedWhopPlan)
      || (pick.listing && await hasActiveSale(store, pick.listing.id, userId));
    if (owned) {
      const claim = await store.freeDayClaim.create({ data: { ...data, kind: "CREDIT" } });
      const credit = await mintFreeDaySlotCredit(store, userId, date, claim.id, now);
      return claimView(await store.freeDayClaim.update({ where: { id: claim.id }, data: { grantId: credit.id, expiresAt: credit.expiresAt } }));
    }

    const listing = pick.listing ?? await store.application.create({ data: {
      agentId: pick.catalogAgentId!, userId: pick.houseId!, slug: catalogListingSlug, name: HOUSE_SPACE.name,
      listingStatus: "CATALOG", skillsyncUrl: HOUSE_SPACE.skillsyncUrl, replicationManifest: JSON.stringify(HOUSE_SPACE.replicationManifest),
    } });
    let kit = day.spaceId === catalogSpaceId
      ? contentEngineKit()
      : await readMarketplaceKit(store, listing, { includePublicBuildPrompt: true });
    if (!kit.kit && !kit.skillsyncUrl && listing.slug === HOUSE_SPACE.slug) kit = contentEngineKit();
    if (!kit.kit && !kit.skillsyncUrl) throw new MarketplaceError("Today's house Space has no published kit.", 409);
    const sale = await recordMarketplaceGrant(store, { listingId: listing.id, sellerUserId: listing.userId, buyerUserId: userId, grossCents: 0, rail: "FREE", source: FREE_DAY_SOURCE, createdAt: now });
    await grantMarketplaceBundle(store, userId, now);
    return claimView(await store.freeDayClaim.create({ data: { ...data, kind: "KIT", grantId: sale.id, kitJson: JSON.stringify(kit) } }));
  });
}

export async function getHandoutAccess(space: Application & { agent: { name: string; slug: string | null } }, userId: string | null, now = new Date()) {
  if (!space.public || !space.handoutOptIn || isExcludedFreeDaySpace(space.name, space.slug, space.agent.name, space.agent.slug)) return null;
  const date = etDateStringFrom(now);
  const [day, visit] = await Promise.all([
    getFreeDay(now),
    userId ? db.freeDayClaim.findFirst({ where: { userId, spaceId: space.id, date, kind: "VISIT", expiresAt: { gt: now } }, select: { expiresAt: true } }) : null,
  ]);
  if (day?.mode !== "HANDOUT" || day.slug !== space.slug) return null;
  return { endsAt: day.endsAt, canUse: Boolean(visit) };
}
