import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE_FREE_TOOLS, bridgeToolAllowedByTables, filterBridgeTools, withMissingBridgeTools } from "./bridge-tool-policy.ts";

const memberUnlockTools = [
  "check_my_unlock",
  "list_my_offers",
  "save_my_offer",
  "delete_my_offer",
  "save_my_key",
  "delete_my_key",
];

test("member unlock and key tools are allowed by the week scope without cost entries", () => {
  const weekCosts = {
    create_demo_pack: 115,
    create_before_pitch: 50,
    generate_ad_creative: 60,
    generate_multilanguage_ads: 60,
  };
  for (const name of memberUnlockTools) {
    assert.equal(bridgeToolAllowedByTables(name, BRIDGE_FREE_TOOLS, weekCosts), true, `${name} should be allowed`);
    assert.equal(Object.hasOwn(weekCosts, name), false, `${name} must not require a cost entry`);
  }
});

test("tools/list filtering keeps offered member unlock tools and still refuses publishing", () => {
  const engineTools = [
    ...memberUnlockTools.map((name) => ({ name, description: `${name} description` })),
    { name: "publish_clip" },
    { name: "request_mp4" },
    { description: "malformed tool without a name" },
  ];

  const weekCosts = { create_demo_pack: 115 };
  const filtered = filterBridgeTools(engineTools, (name) => bridgeToolAllowedByTables(name, BRIDGE_FREE_TOOLS, weekCosts));
  assert.deepEqual(filtered.map((tool) => tool.name), memberUnlockTools);
});

test("missing allowed account and demo tools are synthesized with useful schemas", () => {
  const tools = withMissingBridgeTools([{ name: "get_usage" }], ["get_account", "create_demo_pack"]);
  const account = tools.find((tool) => tool.name === "get_account")!;
  const pack = tools.find((tool) => tool.name === "create_demo_pack")!;
  assert.match(String(account.description), /remaining credits, usage and pricing path/);
  assert.deepEqual(account.inputSchema, { type: "object", properties: {}, additionalProperties: false });
  assert.match(String(pack.description), /5 memes, an iMessage, a Top 10 and a slideshow/);
  assert.match(String(pack.description), /115 credits at list.*refunded.*Drafts only/);
  assert.deepEqual(Object.keys((pack.inputSchema as { properties: object }).properties), ["campaign_id", "input", "product", "language"]);
  assert.equal((pack.inputSchema as { additionalProperties: boolean }).additionalProperties, false);
});

test("present tools are not duplicated and non-allowlisted names are never synthesized", () => {
  const existing = { name: "get_account", description: "upstream" };
  const tools = withMissingBridgeTools([existing], ["get_account", "create_demo_pack"]);
  assert.equal(tools.filter((tool) => tool.name === "get_account").length, 1);
  assert.equal(tools.some((tool) => tool.name === "publish_clip"), false);
});
