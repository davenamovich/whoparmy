import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendRefToGameUrl,
  BTC_EXPERIMENT_URL,
  DH_MEDIA_FALLBACK_URL,
  houseDestinations,
  isBtcGameUrl,
  pickHouseDestination,
  validRefCode,
} from "./rotator-house.ts";

/**
 * Dave's rule (2026-11-24): the rotator's house fallback sends users
 * to dh.media or the BTC Experiment — nothing else. Regression proof
 * for the live defect where /api/bridge/rotator/go 302'd to Temu
 * because the house pool rotated the whole offer catalog.
 */
describe("rotator house destinations (Dave, 2026-11-24)", () => {
  it("the house pool is exactly two destinations: DH Media + BTC Experiment", () => {
    const pool = houseDestinations("https://dh.media/?affid=Vesselprotocol");
    assert.equal(pool.length, 2);
    assert.deepEqual(
      pool.map((p) => p.partner),
      ["salarium", "the-btc-experiment"],
    );
    assert.equal(pool[0].url, "https://dh.media/?affid=Vesselprotocol");
    assert.equal(pool[1].url, BTC_EXPERIMENT_URL);
  });

  it("the BTC Experiment destination is the on-site game at /play", () => {
    assert.equal(BTC_EXPERIMENT_URL, "https://whop.plunderandriffle.com/play");
  });

  it("every day of the year picks one of the two — never a catalog offer", () => {
    const allowed = new Set(houseDestinations(null).map((p) => p.url));
    for (let day = 1; day <= 366; day++) {
      const pick = pickHouseDestination(day, "https://dh.media/?affid=Vesselprotocol");
      assert.ok(
        pick.url === "https://dh.media/?affid=Vesselprotocol" || allowed.has(pick.url),
        `day ${day} picked ${pick.url}`,
      );
      assert.ok(!/temu|agent37|bankr|whop\.com|railway|fish\.audio|upload-post/.test(pick.url), `day ${day} leaked a catalog offer: ${pick.url}`);
    }
  });

  it("the two destinations alternate across consecutive days", () => {
    const picks = [1, 2, 3, 4].map((d) => pickHouseDestination(d, null).partner);
    assert.deepEqual(picks, ["salarium", "the-btc-experiment", "salarium", "the-btc-experiment"]);
  });

  it("a missing or non-URL catalog entry falls back to the saved house DH Media link", () => {
    assert.equal(houseDestinations(null)[0].url, DH_MEDIA_FALLBACK_URL);
    assert.equal(houseDestinations("")[0].url, DH_MEDIA_FALLBACK_URL);
    assert.equal(houseDestinations("not a url")[0].url, DH_MEDIA_FALLBACK_URL);
  });

  it("a refreshed catalog DH Media link is used verbatim", () => {
    assert.equal(houseDestinations("https://dh.media/?affid=NewCode")[0].url, "https://dh.media/?affid=NewCode");
  });
});

describe("referrer carry-through (Dave, 2026-11-24)", () => {
  it("the referrer's code rides into the BTC Experiment game URL", () => {
    assert.equal(
      appendRefToGameUrl(BTC_EXPERIMENT_URL, "DAVE-AB12"),
      "https://whop.plunderandriffle.com/play?ref=DAVE-AB12",
    );
  });

  it("offer destinations are never touched — they carry the owner's own affiliate id", () => {
    assert.equal(appendRefToGameUrl("https://dh.media/?affid=Vesselprotocol", "DAVE-AB12"), "https://dh.media/?affid=Vesselprotocol");
    assert.equal(appendRefToGameUrl("https://temu.to/k/pgxcro0opym", "DAVE-AB12"), "https://temu.to/k/pgxcro0opym");
    assert.equal(appendRefToGameUrl("https://whop.plunderandriffle.com/build", "DAVE-AB12"), "https://whop.plunderandriffle.com/build");
  });

  it("an existing ref on the game URL is never overwritten", () => {
    assert.equal(
      appendRefToGameUrl("https://whop.plunderandriffle.com/play?ref=FIRST-1", "SECOND-2"),
      "https://whop.plunderandriffle.com/play?ref=FIRST-1",
    );
  });

  it("invalid or missing codes change nothing", () => {
    assert.equal(appendRefToGameUrl(BTC_EXPERIMENT_URL, null), BTC_EXPERIMENT_URL);
    assert.equal(appendRefToGameUrl(BTC_EXPERIMENT_URL, ""), BTC_EXPERIMENT_URL);
    assert.equal(appendRefToGameUrl(BTC_EXPERIMENT_URL, "bad code!"), BTC_EXPERIMENT_URL);
    assert.equal(validRefCode("DAVE-AB12"), "DAVE-AB12");
    assert.equal(validRefCode("bad code!"), null);
    assert.equal(validRefCode(null), null);
  });

  it("only the game path counts as the BTC Experiment", () => {
    assert.equal(isBtcGameUrl(BTC_EXPERIMENT_URL), true);
    assert.equal(isBtcGameUrl("https://whop.plunderandriffle.com/play?x=1"), true);
    assert.equal(isBtcGameUrl("https://whop.plunderandriffle.com/players"), false);
    assert.equal(isBtcGameUrl("https://dh.media/"), false);
  });
});
