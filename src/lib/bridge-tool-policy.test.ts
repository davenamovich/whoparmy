import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE_FREE_TOOLS, bridgeToolAllowedByTables, filterBridgeTools } from "./bridge-tool-policy.ts";

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
