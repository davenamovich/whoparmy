import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";

const folder = mkdtempSync(join(tmpdir(), "whop-free-day-"));
const file = join(folder, "test.db");
process.env.DATABASE_URL = `file:${file}`;
process.env.HOUSE_BIND_USER_ID = "house";
(globalThis as typeof globalThis & { prisma: PrismaClient }).prisma = new PrismaClient();

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith(new URL("../", import.meta.url).href)) return nextResolve(`${specifier}.ts`, context);
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    return nextResolve(specifier, specifier === "server-only" ? { ...context, conditions: [...context.conditions, "react-server"] } : context);
  },
});

const { db } = await import("./db.ts");
const { HOUSE_SPACE } = await import("./application.ts");
const { claimFreeDay, getFreeDay, getHandoutAccess } = await import("./free-day-server.ts");
const { getKitForBuyer, getSellerBalance, submitAgent, submitSpace } = await import("./marketplace-server.ts");
const { getBridgeAccountView, proxyToolCall, proxyToolsList } = await import("./muse-bridge.ts");
const { redeemFreeDaySlotCredit, getPaidSlotPrices, listPaidSlotsForDate } = await import("./paid-slots-server.ts");
const { loadTown } = await import("./town-server.ts");

const beforeFlip = new Date("2026-10-31T03:59:59Z");
const afterFlip = new Date("2026-10-31T04:00:00Z");
const kit = { files: [{ path: "SKILL.md", text: "# Fixture kit" }] };

before(async () => {
  const sqlite = new DatabaseSync(file);
  sqlite.exec(readFileSync(new URL("../../prisma/schema.sql", import.meta.url), "utf8"));
  sqlite.close();
  await db.user.createMany({ data: ["house", "buyer", "prior-owner", "seller"].map((id) => ({ id, email: `${id}@test.invalid` })) });
  await db.hiredAgent.createMany({ data: [
    { id: "house-agent", userId: "house", templateKey: "custom", name: "House Agent", tokenBudget: 0 },
    { id: "seller-agent", userId: "seller", templateKey: "custom", name: "Seller Agent", slug: "seller-agent", category: "MARKETING", capabilitiesJson: '["seo_gaps"]', publicProfile: true, tokenBudget: 0 },
  ] });
  await db.application.createMany({ data: [
    { id: "house-space", userId: "house", agentId: "house-agent", slug: "alpha-house", name: "Alpha House", priceCents: 2000, public: true, listingStatus: "PUBLISHED" },
    { id: "member-space", userId: "seller", agentId: "seller-agent", slug: "zulu-member", name: "Zulu Member", priceCents: 4000, public: true, handoutOptIn: true, listingStatus: "PUBLISHED" },
    { id: "excluded", userId: "house", agentId: "house-agent", slug: "gated", name: "Senior Move Planner", public: true },
    { id: "not-public", userId: "house", agentId: "house-agent", slug: "private-space", name: "Private Space" },
    { id: "not-opted-in", userId: "seller", agentId: "seller-agent", slug: "not-opted-in", name: "Not opted in", public: true },
    { id: "catalog-collision", userId: "seller", agentId: "seller-agent", slug: "plunder-riffle-content-engine", name: "Catalog Shadow", public: true },
  ] });
  await db.marketplaceSubmission.create({ data: { userId: "house", kind: "SPACE", refId: "house-space", status: "PUBLISHED", kitJson: JSON.stringify(kit) } });
  await db.marketplaceSubmission.create({ data: { userId: "seller", kind: "SPACE", refId: "member-space", status: "PUBLISHED", kitJson: JSON.stringify(kit) } });
  await db.marketplaceSale.create({ data: { listingId: "house-space", buyerUserId: "prior-owner", sellerUserId: "house", rail: "BANKR", grossCents: 2000, sellerCents: 1400, platformCents: 300, referrerCents: 300 } });
});

after(async () => {
  await db.$disconnect();
  hooks.deregister();
  rmSync(folder, { recursive: true, force: true });
});

test("ET flip creates one real Town event and updates the Free Plot and billboard", async () => {
  const town = await loadTown(null, beforeFlip);
  assert.equal(town.freePlot?.slug, "alpha-house");
  assert.equal(town.freePlot?.date, "2026-10-30");
  assert.equal(town.billboard.placements[0]?.partnerName, "Free Plot · Alpha House");
  assert.equal(town.ticker.filter((event) => event.text === "Free Plot opened: Alpha House").length, 1);
  assert.deepEqual(await getFreeDay(beforeFlip), town.freePlot);
  const flipped = await loadTown(null, afterFlip);
  assert.equal(flipped.freePlot?.date, "2026-10-31");
  assert.equal(flipped.freePlot?.slug, "zulu-member");
  assert.equal(flipped.ticker.filter((event) => event.text === "Handout opened: Zulu Member").length, 1);
  assert.equal(await db.freeDay.count(), 2);
});

test("two simultaneous house claims return the same permanent grant and only one zero-revenue sale", async () => {
  const [first, second] = await Promise.all([claimFreeDay("buyer", "2026-10-30", beforeFlip), claimFreeDay("buyer", "2026-10-30", beforeFlip)]);
  assert.deepEqual(first, second);
  assert.equal(first.kind, "KIT");
  assert.equal(await db.freeDayClaim.count({ where: { userId: "buyer" } }), 1);
  const sale = await db.marketplaceSale.findUniqueOrThrow({ where: { id: first.grantId! } });
  assert.deepEqual([sale.rail, sale.source, sale.grossCents, sale.sellerCents, sale.platformCents, sale.referrerCents], ["FREE", "free_day", 0, 0, 0, 0]);
  assert.deepEqual((await getSellerBalance("house")).seller, { salesCount: 1, grossCents: 2000, sellerCents: 1400 });
  assert.deepEqual(await getKitForBuyer("buyer", "alpha-house"), { kit, manifest: null, skillsyncUrl: null });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: "buyer" } })).marketplaceBundleAt?.toISOString(), beforeFlip.toISOString());
  const town = await loadTown(null, beforeFlip);
  assert.equal(town.ticker.filter((event) => event.text === "Free-Day kit claimed: Alpha House").length, 1);
});

test("an already-own claim mints exactly one no-payment credit with a DST-safe +7 ET day expiry", async () => {
  const first = await claimFreeDay("prior-owner", "2026-10-30", beforeFlip);
  assert.deepEqual(await claimFreeDay("prior-owner", "2026-10-30", beforeFlip), first);
  assert.equal(first.kind, "CREDIT");
  assert.equal(first.expiresAt?.toISOString(), "2026-11-06T05:00:00.000Z");
  const credit = await db.paidRotatorSlot.findUniqueOrThrow({ where: { id: first.grantId! } });
  assert.equal(credit.source, "free_day");
  assert.equal(credit.priceCents, 0);
  assert.equal(await db.paidRotatorSlot.count(), 1);
  assert.deepEqual(await listPaidSlotsForDate("2026-10-30"), []);
  await db.engineLink.create({ data: { userId: "prior-owner", partner: "example", url: "https://example.test/link" } });
  const input = { creditId: credit.id, date: "2026-10-31", partner: "example" };
  await assert.rejects(redeemFreeDaySlotCredit("prior-owner", { ...input, date: "2026-11-06" }, first.expiresAt!), /expired/);
  const prices = await getPaidSlotPrices(beforeFlip);
  assert.equal((await redeemFreeDaySlotCredit("prior-owner", input, beforeFlip)).id, credit.id);
  await assert.rejects(redeemFreeDaySlotCredit("prior-owner", input, beforeFlip), /already used/);
  assert.equal((await listPaidSlotsForDate("2026-10-31"))[0]?.url, "https://example.test/link");
  assert.deepEqual(await getPaidSlotPrices(beforeFlip), prices);
});

test("a Whop kit owner without a local sale gets a credit without writing a paid sale", async (context) => {
  const previousKey = process.env.WHOP_API_KEY;
  const previousCompany = process.env.WHOP_COMPANY_ID;
  process.env.WHOP_API_KEY = "fake-key";
  process.env.WHOP_COMPANY_ID = "fake-company";
  context.after(async () => {
    if (previousKey === undefined) delete process.env.WHOP_API_KEY; else process.env.WHOP_API_KEY = previousKey;
    if (previousCompany === undefined) delete process.env.WHOP_COMPANY_ID; else process.env.WHOP_COMPANY_ID = previousCompany;
    await db.application.update({ where: { id: "house-space" }, data: { whopPlanId: null } });
  });
  context.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ id: "membership-fixture", status: "active", user_id: "whop-kit-owner", variant_id: "kit-plan" }], page_info: { has_next_page: false } }));
  const owner = await db.user.create({ data: { id: "whop-kit-owner", whopId: "whop-kit-owner", email: "whop-kit-owner@test.invalid" } });
  await db.application.update({ where: { id: "house-space" }, data: { whopPlanId: "kit-plan" } });
  context.mock.timers.enable({ apis: ["Date"], now: beforeFlip });
  assert.equal((await getBridgeAccountView(owner)).freeDay?.owned, true);
  const claim = await claimFreeDay(owner.id, "2026-10-30", beforeFlip);
  assert.equal(claim.kind, "CREDIT");
  assert.deepEqual((await getBridgeAccountView(owner)).freeDay?.credit, { id: claim.grantId, expiresAt: claim.expiresAt });
  assert.equal(await db.marketplaceSale.count({ where: { buyerUserId: "whop-kit-owner" } }), 0);
});

test("Handout is a visit only; it doesn't change price, sell the kit, or continue past ET midnight", async () => {
  const space = await db.application.findUniqueOrThrow({ where: { id: "member-space" }, include: { agent: true } });
  assert.equal((await getHandoutAccess(space, "buyer", afterFlip))?.canUse, false);
  const visit = await claimFreeDay("buyer", "2026-10-31", afterFlip);
  assert.equal(visit.kind, "VISIT");
  assert.equal(visit.grantId, null);
  assert.equal(visit.expiresAt?.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal((await getHandoutAccess(space, "buyer", afterFlip))?.canUse, true);
  const nextDay = new Date("2026-11-01T04:00:00Z");
  assert.equal(await getHandoutAccess(space, "buyer", nextDay), null);
  assert.equal(await db.marketplaceSale.count({ where: { listingId: space.id } }), 0);
  const download = await getKitForBuyer("buyer", space.slug);
  assert.equal("error" in download && download.error, "not_purchased");
  assert.equal((await db.application.findUniqueOrThrow({ where: { id: space.id } })).priceCents, 4000);
  assert.equal((await claimFreeDay("buyer", "2026-11-01", nextDay)).kind, "KIT");
  assert.equal(await db.marketplaceSale.count({ where: { listingId: "house-space", buyerUserId: "buyer" } }), 1);
  await db.application.update({ where: { id: "house-space" }, data: { public: false } });
  assert.deepEqual(await getKitForBuyer("buyer", "alpha-house"), { kit, manifest: null, skillsyncUrl: null });
});

test("both Muse submission paths store an explicit opt-in and preserve it when omitted", async () => {
  const body = { name: "Muse Test Space", agentSlug: "seller-agent", bundle: kit };
  assert.equal((await submitSpace("seller", { ...body, handoutOptIn: true })).application.handoutOptIn, true);
  assert.equal((await submitSpace("seller", body)).application.handoutOptIn, true);
  const result = await submitAgent("seller", { agentSlug: "seller-agent", bundle: kit, handoutOptIn: false });
  assert.equal(result.application.handoutOptIn, false);
  await assert.rejects(submitAgent("seller", { agentSlug: "seller-agent", bundle: kit, handoutOptIn: "true" }), /must be a boolean/);
});

test("the built-in house catalog Space grants its public replication kit through a private backing row", async () => {
  await db.application.update({ where: { id: "catalog-collision" }, data: { public: false } });
  const now = new Date("2026-11-02T05:00:00Z");
  const day = await getFreeDay(now);
  assert.equal(day?.slug, "plunder-riffle-content-engine");
  const claim = await claimFreeDay("buyer", day?.date, now);
  const sale = await db.marketplaceSale.findUniqueOrThrow({ where: { id: claim.grantId! }, include: { listing: true } });
  assert.equal(sale.listing.userId, "house");
  assert.equal(sale.listing.public, false);
  assert.equal(sale.rail, "FREE");
  const download = await getKitForBuyer("buyer", day!.slug);
  assert.ok("skillsyncUrl" in download && download.skillsyncUrl && download.kit);
});

test("a first Content Engine KIT claim keeps public fulfillment when a house listing shadows the catalog", async () => {
  const now = new Date("2026-11-03T05:00:00Z");
  const listing = await db.application.update({ where: { id: "catalog-collision" }, data: {
    userId: "house", agentId: "house-agent", name: HOUSE_SPACE.name, public: true, listingStatus: "PUBLISHED",
  } });
  const day = await getFreeDay(now);
  assert.equal(day?.slug, HOUSE_SPACE.slug);
  assert.equal((await db.freeDay.findUniqueOrThrow({ where: { date: day!.date } })).spaceId, listing.id);
  const claim = await claimFreeDay("seller", day?.date, now);
  assert.equal(claim.kind, "KIT");
  const sale = await db.marketplaceSale.findUniqueOrThrow({ where: { id: claim.grantId! } });
  assert.equal(sale.listingId, listing.id);
  assert.equal(sale.rail, "FREE");
  const stored = await db.freeDayClaim.findUniqueOrThrow({ where: { id: claim.id } });
  assert.ok(stored.kitJson);
  const payload = JSON.parse(stored.kitJson);
  assert.deepEqual(payload.kit, { files: [{ path: "BUILD.md", text: HOUSE_SPACE.buildPrompt }] });
  assert.equal(payload.skillsyncUrl, HOUSE_SPACE.skillsyncUrl);
  assert.deepEqual(await getKitForBuyer("seller", listing.slug), payload);
});

async function bridgeSession(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return { tokenId: "free-day-token", user, scope: "week" as const, budgetCredits: 0, spentCredits: 0, expiresAt: new Date("2026-12-01T00:00:00Z") };
}

test("the bridge lists both native Free Day tools with or without the engine tools list", async (context) => {
  const previous = process.env.WHOP_BRIDGE_KEY;
  process.env.WHOP_BRIDGE_KEY = "engine-fixture";
  context.after(() => { if (previous === undefined) delete process.env.WHOP_BRIDGE_KEY; else process.env.WHOP_BRIDGE_KEY = previous; });
  const session = await bridgeSession("buyer");
  session.user.whopId = "user_fixture123";
  let unavailable = false;
  const methods: string[] = [];
  const fetchMock = context.mock.method(globalThis, "fetch", async (url: string, request: RequestInit) => {
    if (url.endsWith("/api/bridge/whop/key")) return Response.json({ ok: true, key: "engine-key" });
    assert.ok(url.endsWith("/api/mcp"));
    methods.push(JSON.parse(String(request.body)).method);
    if (unavailable) return new Response(null, { status: 503 });
    return Response.json({ result: { tools: [{ name: "get_account" }, { name: "claim_free_day", description: "upstream duplicate" }] } });
  });
  const online = await proxyToolsList(session);
  unavailable = true;
  const fallback = await proxyToolsList(session);
  for (const list of [online, fallback]) {
    const { tools } = list as { tools: Array<{ name: string; description?: string; inputSchema?: unknown }> };
    assert.ok(tools.some(({ name }) => name === "get_account"));
    const native = tools.filter(({ name }) => name === "get_free_day" || name === "claim_free_day");
    assert.deepEqual(native.map(({ name }) => name), ["get_free_day", "claim_free_day"]);
    assert.deepEqual(native[0].inputSchema, { type: "object", properties: {}, additionalProperties: false });
    assert.ok(native[1].description?.includes("Pass the date"));
  }
  assert.deepEqual(methods, ["tools/list", "tools/list"]);
  assert.equal(fetchMock.mock.callCount(), 3);
});

function bridgePayload({ reply, charged }: Awaited<ReturnType<typeof proxyToolCall>>) {
  assert.equal(charged, 0);
  assert.ok(!reply.result?.isError, reply.result?.content?.[0]?.text);
  assert.ok(reply.result?.content?.[0]?.text);
  return JSON.parse(reply.result.content[0].text);
}

test("native bridge calls read Free Day and dispatch KIT, CREDIT and VISIT without touching the engine", async (context) => {
  const previous = process.env.WHOP_BRIDGE_KEY;
  process.env.WHOP_BRIDGE_KEY = "engine-fixture";
  context.after(() => { if (previous === undefined) delete process.env.WHOP_BRIDGE_KEY; else process.env.WHOP_BRIDGE_KEY = previous; });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  context.mock.timers.enable({ apis: ["Date"], now: beforeFlip });
  await db.application.update({ where: { id: "house-space" }, data: { public: true } });
  await db.application.update({ where: { id: "member-space" }, data: { slug: "zulu-member", name: "Zulu Member", public: true, handoutOptIn: true } });
  const newcomer = await db.user.create({ data: { email: "bridge-kit@test.invalid", whopId: "user_freeDayKit" } });
  const owner = await db.user.create({ data: { email: "bridge-credit@test.invalid", whopId: "user_freeDayCredit" } });
  await db.marketplaceSale.create({ data: { listingId: "house-space", buyerUserId: owner.id, sellerUserId: "house", rail: "BANKR", grossCents: 2000, sellerCents: 1400, platformCents: 300, referrerCents: 300 } });
  const session = await bridgeSession(newcomer.id);
  const date = "2026-10-30";
  const preview = bridgePayload(await proxyToolCall(session, "get_free_day", {}));
  assert.deepEqual(preview.freeDay, { date, name: "Alpha House", slug: "alpha-house", mode: "HOUSE", endsAt: afterFlip.toISOString(), spaceUrl: "/spaces/alpha-house" });
  const { claim: granted } = bridgePayload(await proxyToolCall(session, "claim_free_day", { date }));
  assert.equal(granted.kind, "KIT");
  assert.equal(granted.expiresAt, null);
  assert.deepEqual(bridgePayload(await proxyToolCall(session, "claim_free_day", {})).claim, granted);
  assert.equal((await db.marketplaceSale.findUniqueOrThrow({ where: { id: granted.grantId } })).buyerUserId, newcomer.id);
  const { claim: credit } = bridgePayload(await proxyToolCall(await bridgeSession(owner.id), "claim_free_day", { date }));
  assert.equal(credit.kind, "CREDIT");
  assert.equal(credit.expiresAt, "2026-11-06T05:00:00.000Z");
  context.mock.timers.setTime(afterFlip.getTime());
  const stale = await proxyToolCall(session, "claim_free_day", { date });
  assert.equal(stale.charged, 0);
  assert.equal(stale.reply.result?.isError, true);
  assert.match(stale.reply.result?.content?.[0]?.text ?? "", /Free Day has flipped/);
  assert.equal(await db.freeDayClaim.count({ where: { userId: newcomer.id, date: "2026-10-31" } }), 0);
  const { claim: visit } = bridgePayload(await proxyToolCall(session, "claim_free_day", { date: "2026-10-31" }));
  assert.equal(visit.kind, "VISIT");
  assert.equal(visit.expiresAt, "2026-11-01T04:00:00.000Z");
  assert.equal(visit.grantId, null);
  assert.equal((await db.freeDayClaim.findUniqueOrThrow({ where: { id: visit.id } })).kitJson, null);
  assert.equal(fetchMock.mock.callCount(), 0);
  context.mock.timers.setTime(beforeFlip.getTime());
  const account = await getBridgeAccountView(owner);
  assert.deepEqual(account.freeDay, { date, name: "Alpha House", slug: "alpha-house", ownerKind: "house", mode: "HOUSE", endsAt: afterFlip.toISOString(), claimed: true, owned: true, credit: { id: credit.grantId, expiresAt: new Date(credit.expiresAt) } });
  context.mock.timers.setTime(Date.parse("2026-11-01T04:00:00Z"));
  assert.deepEqual((await getBridgeAccountView(newcomer)).freeDay, { ...account.freeDay, date: "2026-11-01", endsAt: "2026-11-02T05:00:00.000Z", credit: null });
});

test("the bridge account shows unclaimed and claimed Handout state, and null with no rotation", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: afterFlip });
  const user = await db.user.create({ data: { email: "bridge-handout@test.invalid" } });
  const day = { date: "2026-10-31", name: "Zulu Member", slug: "zulu-member", ownerKind: "member", mode: "HANDOUT", endsAt: "2026-11-01T04:00:00.000Z", claimed: false, owned: false, credit: null };
  assert.deepEqual((await getBridgeAccountView(user)).freeDay, day);
  await claimFreeDay(user.id, day.date);
  assert.deepEqual((await getBridgeAccountView(user)).freeDay, { ...day, claimed: true });
  process.env.HOUSE_BIND_USER_ID = "nonexistent-house";
  context.after(() => { process.env.HOUSE_BIND_USER_ID = "house"; });
  await db.application.updateMany({ data: { handoutOptIn: false } });
  context.mock.timers.setTime(Date.parse("2026-11-25T17:00:00Z"));
  assert.equal((await getBridgeAccountView(user)).freeDay, null);
  assert.deepEqual(bridgePayload(await proxyToolCall(await bridgeSession(user.id), "get_free_day", {})), { freeDay: null });
});
