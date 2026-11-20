import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { btcTxDeltaForAddress, satsToBtc, type EsploraTx } from "./btc-activity-core.ts";

const ADDR = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const OTHER = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

describe("btcTxDeltaForAddress", () => {
  it("counts a pure receive", () => {
    const tx: EsploraTx = {
      txid: "a",
      vout: [{ scriptpubkey_address: ADDR, value: 50_000 }],
      vin: [{ prevout: { scriptpubkey_address: OTHER, value: 60_000 } }],
    };
    assert.equal(btcTxDeltaForAddress(tx, ADDR), 50_000);
  });

  it("counts a spend with change back", () => {
    const tx: EsploraTx = {
      txid: "b",
      vin: [{ prevout: { scriptpubkey_address: ADDR, value: 50_000 } }],
      vout: [
        { scriptpubkey_address: OTHER, value: 30_000 },
        { scriptpubkey_address: ADDR, value: 19_000 },
      ],
    };
    assert.equal(btcTxDeltaForAddress(tx, ADDR), -31_000);
  });

  it("is zero for an unrelated tx", () => {
    const tx: EsploraTx = { txid: "c", vout: [{ scriptpubkey_address: OTHER, value: 1 }] };
    assert.equal(btcTxDeltaForAddress(tx, ADDR), 0);
  });
});

describe("satsToBtc", () => {
  it("formats whole and fractional amounts", () => {
    assert.equal(satsToBtc(100_000_000), "1");
    assert.equal(satsToBtc(50_000), "0.0005");
    assert.equal(satsToBtc(1), "0.00000001");
    assert.equal(satsToBtc(-31_000), "-0.00031");
    assert.equal(satsToBtc(0), "0");
  });
});
