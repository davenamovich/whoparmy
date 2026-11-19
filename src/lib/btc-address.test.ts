import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBtcAddress, isValidBtcAddress } from "./btc-address.ts";

describe("checkBtcAddress", () => {
  it("accepts mainnet legacy (genesis address)", () => {
    const r = checkBtcAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.info.network, "mainnet");
      assert.equal(r.info.kind, "legacy");
    }
  });

  it("accepts mainnet P2SH (3…)", () => {
    const r = checkBtcAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.info.network, "mainnet");
      assert.equal(r.info.kind, "script");
    }
  });

  it("accepts mainnet bech32 SegWit (BIP-173 P2WPKH example)", () => {
    const r = checkBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.info.network, "mainnet");
      assert.equal(r.info.kind, "segwit");
    }
  });

  it("accepts uppercase bech32 (BIP-173 lists it as valid)", () => {
    assert.equal(isValidBtcAddress("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4"), true);
  });

  it("accepts mainnet taproot (BIP-350 P2TR example)", () => {
    const r = checkBtcAddress("bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.info.network, "mainnet");
      assert.equal(r.info.kind, "taproot");
    }
  });

  it("accepts testnet legacy (m…)", () => {
    const r = checkBtcAddress("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.info.network, "testnet");
  });

  it("accepts testnet bech32 (tb1…)", () => {
    // The BIP-173 witness program re-encoded for the tb HRP (checksum
    // verified against the BIP-173 reference algorithm).
    const r = checkBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.info.network, "testnet");
      assert.equal(r.info.kind, "segwit");
    }
  });

  it("trims surrounding whitespace", () => {
    assert.equal(isValidBtcAddress("  bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 \n"), true);
  });

  it("rejects a corrupted base58 checksum", () => {
    assert.equal(isValidBtcAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"), false);
  });

  it("rejects a corrupted bech32 checksum", () => {
    assert.equal(isValidBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), false);
  });

  it("rejects mixed-case bech32", () => {
    assert.equal(isValidBtcAddress("bc1Qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), false);
  });

  it("rejects another chain's address", () => {
    assert.equal(isValidBtcAddress("0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"), false);
  });

  it("rejects seed-phrase-like text and warns about it", () => {
    const r = checkBtcAddress("abandon ability able about above absent absorb abstract absurd abuse access accident");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /seed phrase/i);
  });

  it("rejects empty and too-short input", () => {
    assert.equal(isValidBtcAddress(""), false);
    assert.equal(isValidBtcAddress("bc1q"), false);
    assert.equal(isValidBtcAddress("1"), false);
  });
});
