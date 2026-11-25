import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BTC_EXPERIMENT_URL,
  DH_MEDIA_FALLBACK_URL,
  houseDestinations,
  pickHouseDestination,
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
