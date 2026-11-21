import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeBindHouseSummary,
  groupBindings,
  truncateMiddle,
  userDisplayName,
  type EnrichedLink,
  type EnrichedWallet,
} from "./bindings-view.ts";

const HOUSE_EVM = "0x2416d6c32c75e58d436e598be3773a4c722053bc";
const HOUSE_SOL = "4AQ5dEqEFMZZQbdBw4jqs2RyX2D2d2vcSwzSL51rEhRU";

function link(partial: Partial<EnrichedLink> & { kind: string; value: string }): EnrichedLink {
  return {
    userId: "op1",
    userName: "Dave",
    isOperator: true,
    verifiedAt: "2026-11-21T00:00:00.000Z",
    ...partial,
  };
}

function wallet(partial: Partial<EnrichedWallet>): EnrichedWallet {
  return {
    agentId: "barry1",
    userId: "op1",
    chain: "evm",
    address: HOUSE_EVM,
    source: "bankr",
    verifiedAt: "2026-11-21T00:00:00.000Z",
    agentName: "BTC Barry",
    agentSlug: "btc-barry",
    ownerName: "Dave",
    ...partial,
  };
}

describe("userDisplayName", () => {
  it("prefers name, then whopUsername, then email prefix", () => {
    assert.equal(userDisplayName({ name: "Dave N", whopUsername: "dave", email: "d@x.io" }), "Dave N");
    assert.equal(userDisplayName({ name: null, whopUsername: "dave", email: "d@x.io" }), "dave");
    assert.equal(userDisplayName({ name: "  ", whopUsername: null, email: "dave@x.io" }), "dave");
    assert.equal(userDisplayName(null), "Whop Army member");
  });
});

describe("truncateMiddle", () => {
  it("truncates long addresses and leaves short values alone", () => {
    assert.equal(truncateMiddle(HOUSE_EVM), "0x2416d6c3…2053bc");
    assert.equal(truncateMiddle("7FBFB6T6-BNKR"), "7FBFB6T6-BNKR");
  });
});

describe("groupBindings", () => {
  it("splits the operator's own links by kind and flags the house wallet", () => {
    const view = groupBindings({
      links: [
        link({ kind: "wallet_evm", value: HOUSE_EVM }),
        link({ kind: "wallet_solana", value: HOUSE_SOL }),
        link({ kind: "bankr_ref", value: "7FBFB6T6-BNKR" }),
        link({ kind: "wallet_evm", value: "0x000000000000000000000000000000000000babe", userId: "u2", userName: "Other", isOperator: false }),
      ],
      wallets: [],
      operatorUserId: "op1",
      houseEvm: HOUSE_EVM,
    });
    assert.equal(view.yours.evm?.value, HOUSE_EVM);
    assert.equal(view.yours.solana?.value, HOUSE_SOL);
    assert.equal(view.yours.bankrRef?.value, "7FBFB6T6-BNKR");
    assert.equal(view.yours.isHouse, true);
    assert.equal(view.yours.hasAny, true);
    assert.equal(view.others.length, 1);
    assert.equal(view.others[0].userName, "Other");
  });

  it("reports an unbound operator plainly", () => {
    const view = groupBindings({ links: [], wallets: [], operatorUserId: "op1", houseEvm: HOUSE_EVM });
    assert.equal(view.yours.hasAny, false);
    assert.equal(view.yours.isHouse, false);
    assert.deepEqual(view.agents, []);
  });

  it("groups agent wallets by agent with names, sorted by agent name", () => {
    const view = groupBindings({
      links: [],
      wallets: [
        wallet({ chain: "solana", address: HOUSE_SOL }),
        wallet({ chain: "evm", address: HOUSE_EVM }),
        wallet({ agentId: "scout1", agentName: "Scout", agentSlug: null, address: "0x000000000000000000000000000000000000babe" }),
      ],
      operatorUserId: "op1",
      houseEvm: HOUSE_EVM,
    });
    assert.equal(view.agents.length, 2);
    assert.equal(view.agents[0].agentName, "BTC Barry");
    assert.equal(view.agents[0].agentSlug, "btc-barry");
    assert.equal(view.agents[0].ownerName, "Dave");
    assert.equal(view.agents[0].wallets.length, 2);
    assert.equal(view.agents[1].agentName, "Scout");
  });
});

describe("describeBindHouseSummary", () => {
  it("reports bound identity + Barry wallets", () => {
    const lines = describeBindHouseSummary({
      identity: [
        { kind: "wallet_evm", value: HOUSE_EVM, status: "bound" },
        { kind: "bankr_ref", value: "7FBFB6T6-BNKR", status: "existing" },
      ],
      agent: {
        agentId: "barry1",
        agentName: "BTC Barry",
        wallets: [
          { chain: "evm", status: "bound" },
          { chain: "solana", status: "existing" },
        ],
      },
      agentSkipped: null,
    });
    assert.match(lines[0], /EVM wallet .* bound ✓/);
    assert.match(lines[1], /already bound/);
    assert.match(lines[2], /BTC Barry · evm payout wallet: bound ✓/);
    assert.match(lines[3], /BTC Barry · solana payout wallet: already bound/);
  });

  it("surfaces the Barry skip reason instead of hiding it", () => {
    const lines = describeBindHouseSummary({
      identity: [{ kind: "wallet_evm", value: HOUSE_EVM, status: "bound" }],
      agent: null,
      agentSkipped: "no BTC Barry agent row for this operator yet — user bindings only",
    });
    assert.equal(lines.length, 2);
    assert.match(lines[1], /Barry skipped — no BTC Barry agent row/);
  });

  it("surfaces conflict reasons", () => {
    const lines = describeBindHouseSummary({
      identity: [
        { kind: "wallet_evm", value: HOUSE_EVM, status: "conflict", reason: "address already bound to a different user" },
      ],
      agent: null,
      agentSkipped: null,
    });
    assert.match(lines[0], /conflict — address already bound to a different user/);
  });
});
