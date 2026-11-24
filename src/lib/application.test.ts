import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanAppFields,
  groupSpacesByOwner,
  isHttpUrl,
  isValidSlug,
  serializePublicApplication,
  slugify,
  uniqueSlug,
  type PublicApplicationAgentRow,
  type PublicApplicationRow,
} from "./application.ts";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(slugify("Roofing Lead Finder"), "roofing-lead-finder");
    assert.equal(slugify("  Meme   Maker!! "), "meme-maker");
    assert.equal(slugify("Café Menu App"), "cafe-menu-app");
    assert.equal(slugify("!!!"), "");
  });

  it("caps length at 60 without a trailing hyphen", () => {
    const slug = slugify("a".repeat(50) + " " + "b".repeat(50));
    assert.ok(slug.length <= 60);
    assert.ok(!slug.endsWith("-"));
  });
});

describe("isValidSlug", () => {
  it("accepts app slugs and rejects the rest", () => {
    assert.equal(isValidSlug("roofing-lead-finder"), true);
    assert.equal(isValidSlug("a1"), true);
    assert.equal(isValidSlug("Roofing App"), false);
    assert.equal(isValidSlug("-app"), false);
    assert.equal(isValidSlug("a"), false);
    assert.equal(isValidSlug(""), false);
    assert.equal(isValidSlug(null), false);
    assert.equal(isValidSlug(42), false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    assert.equal(await uniqueSlug("Roofing Lead Finder", async () => false), "roofing-lead-finder");
  });

  it("suffixes -2, -3 on collision", async () => {
    const taken = new Set(["meme-maker", "meme-maker-2"]);
    assert.equal(await uniqueSlug("Meme Maker", async (s) => taken.has(s)), "meme-maker-3");
  });

  it("falls back to 'app' for an unusable name", async () => {
    assert.equal(await uniqueSlug("!!!", async () => false), "app");
  });
});

describe("isHttpUrl", () => {
  it("allows only http/https urls", () => {
    assert.equal(isHttpUrl("https://example.com/app"), true);
    assert.equal(isHttpUrl("http://example.com"), true);
    assert.equal(isHttpUrl("javascript:alert(1)"), false);
    assert.equal(isHttpUrl("data:text/html;base64,x"), false);
    assert.equal(isHttpUrl("/relative/path"), false);
    assert.equal(isHttpUrl(""), false);
    assert.equal(isHttpUrl(null), false);
    assert.equal(isHttpUrl(42), false);
  });
});

const appRow: PublicApplicationRow & Record<string, unknown> = {
  slug: "roofing-lead-finder",
  name: "Roofing Lead Finder",
  description: "Finds roofing companies that need leads.",
  liveUrl: "https://leads.example.com/",
  screenshotUrl: "https://leads.example.com/shot.png",
  repoUrl: "https://github.com/example/leads",
  buildPrompt: "Build a lead finder.",
  createdAt: new Date("2026-11-21T00:00:00Z"),
  updatedAt: new Date("2026-11-21T01:00:00Z"),
  // Private fields that must NEVER leak through the serializer:
  id: "app-secret-id",
  agentId: "agent-secret-id",
  userId: "user-secret-id",
  public: true,
  videoUrl: "https://media.example.com/demo.mp4", priceCents: 1299, currency: "USD", category: "Lead gen",
  demoKind: "video", buyUrl: "https://buy.example.com", replicationManifest: JSON.stringify({ skills: ["replicate_space"], keys: ["API key"], crons: ["daily"] }),
};

const agentRow: PublicApplicationAgentRow & Record<string, unknown> = {
  name: "BTC Barry",
  slug: "btc-barry",
  publicProfile: true,
  // Private agent fields that must NEVER leak:
  instructions: "secret instructions",
  tokenBudget: 999999,
  agent37Ref: "sess_123",
  userId: "user-secret-id",
};

describe("serializePublicApplication", () => {
  it("exposes only the public shape", () => {
    const app = serializePublicApplication(appRow, agentRow, { name: "Dave", whopUsername: "dave" });
    assert.equal(app.name, "Roofing Lead Finder");
    assert.equal(app.slug, "roofing-lead-finder");
    assert.equal(app.liveUrl, "https://leads.example.com/");
    assert.equal(app.videoUrl, "https://media.example.com/demo.mp4");
    assert.equal(app.priceCents, 1299);
    assert.equal(app.currency, "USD");
    assert.equal(app.category, "Lead gen");
    assert.equal(app.demoKind, "video");
    assert.deepEqual(app.replicationManifest, { skills: ["replicate_space"], keys: ["API key"], crons: ["daily"] });
    assert.equal(app.builtBy.agentName, "BTC Barry");
    assert.equal(app.builtBy.agentSlug, "btc-barry");
    assert.equal(app.builtBy.agentProfilePublic, true);
    assert.equal(app.owner.displayName, "Dave");
    assert.equal(app.appUrl, "https://whop.plunderandriffle.com/spaces/roofing-lead-finder");
    assert.equal(app.createdAt, "2026-11-21T00:00:00.000Z");
    const flat = JSON.stringify(app);
    for (const leaked of [
      "app-secret-id",
      "agent-secret-id",
      "user-secret-id",
      "secret instructions",
      "999999",
      "sess_123",
      "agentId",
      "userId",
      "tokenBudget",
    ]) {
      assert.ok(!flat.includes(leaked), `leaked: ${leaked}`);
    }
  });

  it("nulls invalid added URLs and defaults malformed manifests to empty lists", () => {
    const app = serializePublicApplication({ ...appRow, videoUrl: "javascript:bad", buyUrl: "nope", replicationManifest: "{" }, agentRow, { name: "Dave", whopUsername: null });
    assert.equal(app.videoUrl, null); assert.equal(app.buyUrl, null);
    assert.deepEqual(app.replicationManifest, { skills: [], keys: [], crons: [] });
  });
  it("unlinks the builder when the agent profile is not public", () => {
    const app = serializePublicApplication(
      appRow,
      { ...agentRow, publicProfile: false },
      { name: null, whopUsername: "dave" },
    );
    assert.equal(app.builtBy.agentName, "BTC Barry");
    assert.equal(app.builtBy.agentSlug, null);
    assert.equal(app.builtBy.agentProfilePublic, false);
    assert.equal(app.owner.displayName, "dave");
  });

  it("falls back honestly for a missing owner name and agent slug", () => {
    const app = serializePublicApplication(
      appRow,
      { ...agentRow, slug: null, publicProfile: true },
      { name: null, whopUsername: null },
    );
    assert.equal(app.builtBy.agentSlug, null);
    assert.equal(app.builtBy.agentProfilePublic, false);
    assert.equal(app.owner.displayName, "Whop Army member");
  });
});

describe("cleanAppFields", () => {
  it("requires a name on create, clamps and passes valid fields", () => {
    assert.deepEqual(cleanAppFields({}, false), { error: "Name is required." });
    assert.deepEqual(cleanAppFields({ name: "  " }, false), { error: "Name is required." });
    const ok = cleanAppFields(
      { name: "  Roofing Lead Finder ", liveUrl: "https://leads.example.com/", public: true },
      false,
    );
    assert.deepEqual(ok, { data: { name: "Roofing Lead Finder", liveUrl: "https://leads.example.com/", public: true } });
  });

  it("rejects non-http(s) urls and clears empty ones", () => {
    assert.deepEqual(cleanAppFields({ name: "X", liveUrl: "javascript:alert(1)" }, false), {
      error: "Live URL must be an http(s) URL.",
    });
    const cleared = cleanAppFields({ name: "X", repoUrl: "  " }, false);
    assert.deepEqual(cleared, { data: { name: "X", repoUrl: null } });
  });

  it("is partial-aware for PATCH: no name needed, untouched fields skipped", () => {
    assert.deepEqual(cleanAppFields({ description: "New line" }, true), { data: { description: "New line" } });
    assert.deepEqual(cleanAppFields({ name: "" }, true), { error: "Name is required." });
    assert.deepEqual(cleanAppFields({}, true), { data: {} });
  });
});


describe("groupSpacesByOwner", () => {
  it("groups in first owner appearance order and preserves item order", () => {
    const a = { slug: "a", owner: { displayName: "Alice" } };
    const b = { slug: "b", owner: { displayName: "Bob" } };
    const c = { slug: "c", owner: { displayName: "Alice" } };
    assert.deepEqual(groupSpacesByOwner([a, b, c]), [
      { ownerKey: "Alice", ownerName: "Alice", spaces: [a, c] },
      { ownerKey: "Bob", ownerName: "Bob", spaces: [b] },
    ]);
  });
});
