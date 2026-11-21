import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CATEGORIES,
  capabilitiesFromJson,
  capabilitiesToJson,
  isAgentCategory,
  isHttpUrl,
  isValidSlug,
  serializePublicProfile,
  slugify,
  uniqueSlug,
  type PublicProfileAgentRow,
} from "./agent-profile.ts";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(slugify("BTC Barry"), "btc-barry");
    assert.equal(slugify("  Meme   Smith!! "), "meme-smith");
    assert.equal(slugify("Agent 37 — Runner"), "agent-37-runner");
  });

  it("strips accents and collapses junk", () => {
    assert.equal(slugify("Café Lead Générator"), "cafe-lead-generator");
    assert.equal(slugify("!!!"), "");
    assert.equal(slugify(""), "");
  });

  it("caps length at 60 without a trailing hyphen", () => {
    const slug = slugify("a".repeat(50) + " " + "b".repeat(50));
    assert.ok(slug.length <= 60);
    assert.ok(!slug.endsWith("-"));
  });
});

describe("isValidSlug", () => {
  it("accepts profile slugs and rejects the rest", () => {
    assert.equal(isValidSlug("btc-barry"), true);
    assert.equal(isValidSlug("a1"), true);
    assert.equal(isValidSlug("BTC Barry"), false);
    assert.equal(isValidSlug("-barry"), false);
    assert.equal(isValidSlug("barry-"), false);
    assert.equal(isValidSlug("a"), false);
    assert.equal(isValidSlug(""), false);
    assert.equal(isValidSlug(null), false);
    assert.equal(isValidSlug(42), false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    const slug = await uniqueSlug("BTC Barry", async () => false);
    assert.equal(slug, "btc-barry");
  });

  it("suffixes -2, -3 on collision", async () => {
    const taken = new Set(["btc-barry", "btc-barry-2"]);
    const slug = await uniqueSlug("btc-barry", async (s) => taken.has(s));
    assert.equal(slug, "btc-barry-3");
  });

  it("falls back to 'agent' for an unusable name", async () => {
    const slug = await uniqueSlug("!!!", async () => false);
    assert.equal(slug, "agent");
  });
});

describe("capabilities JSON round-trip", () => {
  it("dedupes, trims and drops empties", () => {
    const json = capabilitiesToJson([" Marketing ", "Marketing", "", "Research"]);
    assert.deepEqual(capabilitiesFromJson(json), ["Marketing", "Research"]);
  });

  it("survives garbage in the column", () => {
    assert.deepEqual(capabilitiesFromJson(null), []);
    assert.deepEqual(capabilitiesFromJson("not json"), []);
    assert.deepEqual(capabilitiesFromJson('{"a":1}'), []);
    assert.deepEqual(capabilitiesFromJson('["Ok", 42, null, " Fine "]'), ["Ok", "Fine"]);
  });
});

describe("categories + urls", () => {
  it("knows the 2.0 category list", () => {
    assert.equal(AGENT_CATEGORIES.length, 15);
    assert.equal(isAgentCategory("Marketing"), true);
    assert.equal(isAgentCategory("Personal Assistant"), true);
    assert.equal(isAgentCategory("Wizardry"), false);
    assert.equal(isAgentCategory(null), false);
  });

  it("allows only http/https urls", () => {
    assert.equal(isHttpUrl("https://example.com/app"), true);
    assert.equal(isHttpUrl("http://example.com"), true);
    assert.equal(isHttpUrl("javascript:alert(1)"), false);
    assert.equal(isHttpUrl("data:text/html;base64,x"), false);
    assert.equal(isHttpUrl("/relative/path"), false);
    assert.equal(isHttpUrl(""), false);
    assert.equal(isHttpUrl(null), false);
  });
});

const agentRow: PublicProfileAgentRow & Record<string, unknown> = {
  name: "BTC Barry",
  slug: "btc-barry",
  avatarUrl: null,
  description: "Runs the BTC Experiment.",
  category: "Marketing",
  capabilitiesJson: '["Marketing","Research"]',
  demoUrl: null,
  appUrl: "https://thebtcexperiment.com/",
  gitUrl: null,
  buildPrompt: "Build it.",
  spaceUrl: null,
  agent37Ref: "sess_123",
  status: "ACTIVE",
  createdAt: new Date("2026-11-21T00:00:00Z"),
  // Private fields that must NEVER leak through the serializer:
  tokenBudget: 999999,
  tokensUsed: 123,
  instructions: "secret instructions",
  toolsJson: '[{"id":"memes"}]',
  userId: "user-secret",
};

describe("serializePublicProfile", () => {
  it("exposes only the public shape", () => {
    const profile = serializePublicProfile(agentRow, { name: "Dave", whopUsername: "dave", refCode: "DAVE1234" });
    assert.equal(profile.name, "BTC Barry");
    assert.equal(profile.slug, "btc-barry");
    assert.deepEqual(profile.capabilities, ["Marketing", "Research"]);
    assert.equal(profile.agent37Connected, true); // presence only
    assert.equal(profile.owner.displayName, "Dave");
    assert.equal(profile.owner.refCode, "DAVE1234");
    assert.equal(profile.profileUrl, "https://whop.plunderandriffle.com/agent/btc-barry");
    assert.equal(profile.referralUrl, "https://whop.plunderandriffle.com/?ref=DAVE1234");
    const flat = JSON.stringify(profile);
    for (const leaked of ["999999", "secret instructions", "user-secret", "sess_123", "tokenBudget", "toolsJson"]) {
      assert.ok(!flat.includes(leaked), `leaked: ${leaked}`);
    }
  });

  it("handles a missing refCode and Agent37 ref honestly", () => {
    const profile = serializePublicProfile(
      { ...agentRow, agent37Ref: null },
      { name: null, whopUsername: null, refCode: null },
    );
    assert.equal(profile.agent37Connected, false);
    assert.equal(profile.referralUrl, null);
    assert.equal(profile.owner.displayName, "Whop Army member");
  });
});
