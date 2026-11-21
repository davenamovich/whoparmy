import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_KEY_MIGRATION,
  SEED_CATALOG,
  catalogEntrySync,
  extractAffiliateRef,
  migratePartnerKey,
  normalizeOffersPayload,
  normalizedHost,
  partnerNameSync,
  partnerPageUrl,
  verifyLinkHost,
  type CatalogPartner,
} from "./offer-catalog.ts";

// Fixture matching the LIVE list_my_offers shape verified 2026-11-21
// (trimmed to the steps the assertions exercise).
const LIVE_FIXTURE = {
  offers: [
    { step: "fishaudio", name: "Fish Audio affiliate link", why: "People you invite sign up to Fish Audio through your link.", link: "https://fish.audio/?fpr=oneminute" },
    { step: "uploadpost", name: "Upload Post referral link", why: "People you invite sign up to Upload Post through your link.", link: "https://upload-post.com/?ref=VESSEL" },
    { step: "agent37_ref", name: "Agent37 referral link", why: "People you invite sign up to Agent37 through your link.", link: "https://www.agent37.com/?via=riffle" },
    { step: "salarium", name: "DH Media affiliate link", why: "People you invite sign up to DH Media through your link.", link: "https://dh.media/?affid=Vesselprotocol" },
  ],
  missing: [{ step: "higgsfield", name: "Higgsfield referral link" }],
  pages: [
    { slug: "fishaudio", name: "Fish Audio", note: "n", url: "https://www.plunderandriffle.com/fishaudio", button: "house", yourLink: null, saveAs: "fishaudio", views: 0, visitors: 0, clicks: 0 },
    { slug: "agent37", name: "Agent 37", note: "n", url: "https://www.plunderandriffle.com/agent37", button: "house", yourLink: null, saveAs: "agent37_ref", views: 0, visitors: 0, clicks: 0 },
  ],
};

test("normalize: steps keyed, names cleaned/page-joined, missing flagged, muse appended", () => {
  const cat = normalizeOffersPayload(LIVE_FIXTURE);
  assert.deepEqual(
    cat.map((p) => p.key),
    ["fishaudio", "uploadpost", "agent37_ref", "salarium", "higgsfield", "muse"],
  );
  const fish = cat.find((p) => p.key === "fishaudio")!;
  assert.equal(fish.name, "Fish Audio"); // page name wins
  assert.equal(fish.pageSlug, "fishaudio");
  assert.equal(fish.example, "https://fish.audio/?fpr=oneminute");
  assert.equal(fish.source, "mcp");
  assert.equal(fish.missing, false);
  const a37 = cat.find((p) => p.key === "agent37_ref")!;
  assert.equal(a37.name, "Agent 37"); // page name, not "Agent37"
  const dh = cat.find((p) => p.key === "salarium")!;
  assert.equal(dh.name, "DH Media"); // cleaned offers name
  const higgs = cat.find((p) => p.key === "higgsfield")!;
  assert.equal(higgs.missing, true);
  assert.equal(higgs.example, "");
  const muse = cat[cat.length - 1];
  assert.equal(muse.key, "muse");
  assert.equal(muse.source, "local");
});

test("normalize: junk payload degrades to just the local extra", () => {
  const cat = normalizeOffersPayload({ offers: "nope", missing: null });
  assert.deepEqual(cat.map((p) => p.key), ["muse"]);
});

test("seed: carries the 11 verified steps + higgsfield missing + muse local", () => {
  const keys = SEED_CATALOG.map((p) => p.key);
  for (const step of ["fishaudio", "freebuff", "uploadpost", "railway_ref", "bankr_ref", "polyshares", "amelia", "agent37_ref", "temu", "whop_ref", "salarium"]) {
    assert.ok(keys.includes(step), `seed missing ${step}`);
  }
  assert.equal(SEED_CATALOG.find((p) => p.key === "higgsfield")?.missing, true);
  assert.equal(SEED_CATALOG.find((p) => p.key === "muse")?.source, "local");
  assert.equal(SEED_CATALOG.find((p) => p.key === "salarium")?.name, "DH Media");
});

test("migration map: every legacy bridge key lands on its MCP step", () => {
  assert.deepEqual(PARTNER_KEY_MIGRATION, {
    "fish-audio": "fishaudio",
    agent37: "agent37_ref",
    "dh-media": "salarium",
    "upload-post": "uploadpost",
    whop: "whop_ref",
    railway: "railway_ref",
    bankr: "bankr_ref",
    freebuff: "freebuff",
    polyshares: "polyshares",
    amelia: "amelia",
    temu: "temu",
    muse: "muse",
  });
  assert.equal(migratePartnerKey("dh-media"), "salarium");
  assert.equal(migratePartnerKey("salarium"), "salarium"); // already canonical
  assert.equal(migratePartnerKey("unknown-thing"), "unknown-thing");
});

test("partnerNameSync resolves step names and legacy keys, falls back to the key", () => {
  assert.equal(partnerNameSync("salarium"), "DH Media");
  assert.equal(partnerNameSync("dh-media"), "DH Media");
  assert.equal(partnerNameSync("fish-audio"), "Fish Audio");
  assert.equal(partnerNameSync("agent37_ref"), "Agent 37");
  assert.equal(partnerNameSync("nope"), "nope");
  assert.equal(catalogEntrySync("whop")?.key, "whop_ref");
});

test("extractAffiliateRef: one pattern per param family", () => {
  assert.equal(extractAffiliateRef("fishaudio", "https://fish.audio/?fpr=oneminute"), "oneminute");
  assert.equal(extractAffiliateRef("uploadpost", "https://upload-post.com/?ref=VESSEL"), "VESSEL");
  assert.equal(extractAffiliateRef("amelia", "https://ameliarobotics.com/referrals?via=21ff4c6135"), "21ff4c6135");
  assert.equal(extractAffiliateRef("salarium", "https://dh.media/?affid=Vesselprotocol"), "Vesselprotocol");
  assert.equal(extractAffiliateRef("whop_ref", "https://whop.com/?code=XIGEWN"), "XIGEWN");
  assert.equal(extractAffiliateRef("railway_ref", "https://railway.com/?referralCode=XO8ClD"), "XO8ClD");
  assert.equal(extractAffiliateRef("bankr_ref", "https://bankr.bot/terminal?refCode=7FBFB6T6-BNKR"), "7FBFB6T6-BNKR");
  assert.equal(extractAffiliateRef("freebuff", "https://freebuff.com/get-started?ref=ref-abc&referrer=x"), "ref-abc");
});

test("extractAffiliateRef: temu path segment, bare links, junk", () => {
  assert.equal(extractAffiliateRef("temu", "https://temu.to/k/pgxcro0opym"), "pgxcro0opym");
  assert.equal(extractAffiliateRef("fishaudio", "https://fish.audio/"), null);
  assert.equal(extractAffiliateRef("fishaudio", "not a url"), null);
});

const entry = (over: Partial<CatalogPartner>): CatalogPartner => ({
  key: "fishaudio",
  name: "Fish Audio",
  blurb: "",
  example: "https://fish.audio/?fpr=oneminute",
  source: "mcp",
  missing: false,
  pageSlug: null,
  ...over,
});

test("verifyLinkHost: accepts same host (www-insensitive), rejects foreign hosts", () => {
  assert.deepEqual(verifyLinkHost(entry({}), "https://fish.audio/?fpr=mine"), { ok: true });
  assert.deepEqual(verifyLinkHost(entry({ example: "https://www.agent37.com/?via=riffle" }), "https://agent37.com/?via=me"), { ok: true });
  const bad = verifyLinkHost(entry({}), "https://evil.example/?fpr=mine");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.expectedHost, "fish.audio");
  const bad2 = verifyLinkHost(entry({}), "not a url");
  assert.equal(bad2.ok, false);
});

test("verifyLinkHost: local extras, missing offers and host-less examples are exempt", () => {
  assert.deepEqual(verifyLinkHost(entry({ source: "local", example: "https://www.plunderandriffle.com/muse-invite" }), "https://anything.example/x"), { ok: true });
  assert.deepEqual(verifyLinkHost(entry({ missing: true, example: "" }), "https://higgsfield.ai/?ref=me"), { ok: true });
  assert.deepEqual(verifyLinkHost(entry({ example: "Your Freebuff referral link" }), "https://freebuff.com/get-started?ref=me"), { ok: true });
});

test("partnerPageUrl: the offsite P&R page from the record's slug, null without one", () => {
  const cat = normalizeOffersPayload(LIVE_FIXTURE);
  const a37 = cat.find((p) => p.key === "agent37_ref")!;
  assert.equal(partnerPageUrl(a37), "https://www.plunderandriffle.com/agent37");
  const dh = cat.find((p) => p.key === "salarium")!;
  assert.equal(partnerPageUrl(dh), null); // no page in the record for DH Media
  const muse = cat.find((p) => p.key === "muse")!;
  assert.equal(partnerPageUrl(muse), null); // local extra has no record page
});

test("normalizedHost strips www and rejects junk", () => {
  assert.equal(normalizedHost("https://www.Agent37.com/?via=x"), "agent37.com");
  assert.equal(normalizedHost("nope"), null);
});
