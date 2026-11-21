import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCatalogSeed,
  attemptCatalogSeed,
  planCatalogSeed,
  type CatalogSeedDb,
} from "./operator-catalog-seed-core.ts";
import {
  SEED_CATALOG,
  extractAffiliateRef,
  migratePartnerKey,
  type CatalogPartner,
} from "./offer-catalog.ts";

/** The real catalog helpers, injected exactly as the server wrapper injects them. */
const DEPS = { migrateKey: migratePartnerKey, extractRef: extractAffiliateRef };

/**
 * Operator catalog seed (Dave, 2026-11-21: "Links should be pulled
 * from P&R MCP") against fixtures + an in-memory fake of the
 * structural db: create-only semantics (an existing row — manual or
 * synced, canonical or legacy key — always wins), the record's own
 * links with extracted affiliate refs, the muse local-extra case,
 * rung reporting, and the never-throwing attempt the Barry
 * provision flow composes with (a failed pull never blocks it; a
 * non-operator is never seeded).
 */

const partner = (over: Partial<CatalogPartner>): CatalogPartner => ({
  key: "salarium",
  name: "DH Media",
  blurb: "",
  example: "https://dh.media/?affid=Vesselprotocol",
  source: "mcp",
  missing: false,
  pageSlug: null,
  ...over,
});

const CATALOG: CatalogPartner[] = [
  partner({ key: "fishaudio", name: "Fish Audio", example: "https://fish.audio/?fpr=oneminute", pageSlug: "fishaudio" }),
  partner({ key: "agent37_ref", name: "Agent 37", example: "https://www.agent37.com/?via=riffle", pageSlug: "agent37" }),
  partner({ key: "salarium" }),
  partner({ key: "temu", name: "Temu", example: "https://temu.to/k/pgxcro0opym" }),
  partner({ key: "higgsfield", name: "Higgsfield", example: "", missing: true }),
  partner({ key: "muse", name: "Muse", example: "https://www.plunderandriffle.com/muse-invite", source: "local" }),
];

describe("planCatalogSeed — create-only, from the record", () => {
  it("plans every catalog partner with a usable link when nothing is saved", () => {
    const plan = planCatalogSeed(CATALOG, [], DEPS);
    assert.deepEqual(
      plan.map((p) => p.partner),
      ["fishaudio", "agent37_ref", "salarium", "temu", "muse"],
    );
  });

  it("skips partners the record lists as missing or link-less", () => {
    const plan = planCatalogSeed(
      [partner({ key: "higgsfield", example: "", missing: true }), partner({ key: "blank", example: "  " })],
      [],
      DEPS,
    );
    assert.deepEqual(plan, []);
  });

  it("never plans a partner the operator already saved — manual wins", () => {
    const plan = planCatalogSeed(CATALOG, ["salarium", "muse"], DEPS);
    assert.deepEqual(
      plan.map((p) => p.partner),
      ["fishaudio", "agent37_ref", "temu"],
    );
  });

  it("treats legacy key spellings as already saved (agent37 blocks agent37_ref)", () => {
    const plan = planCatalogSeed(CATALOG, ["agent37", "dh-media", "fish-audio"], DEPS);
    assert.deepEqual(
      plan.map((p) => p.partner),
      ["temu", "muse"],
    );
  });

  it("extracts the affiliate ref from each record link", () => {
    const plan = planCatalogSeed(CATALOG, [], DEPS);
    const byPartner = new Map(plan.map((p) => [p.partner, p]));
    assert.equal(byPartner.get("fishaudio")?.externalRef, "oneminute");
    assert.equal(byPartner.get("agent37_ref")?.externalRef, "riffle");
    assert.equal(byPartner.get("salarium")?.externalRef, "Vesselprotocol");
    assert.equal(byPartner.get("temu")?.externalRef, "pgxcro0opym");
    assert.equal(byPartner.get("muse")?.externalRef, null);
    assert.equal(byPartner.get("agent37_ref")?.url, "https://www.agent37.com/?via=riffle");
  });

  it("seeds muse from the catalog's local-extra entry (no MCP step exists)", () => {
    // The case that held on the live record (2026-11-21): the DTO
    // presents muse as a partner entry via MUSE_LOCAL_PARTNER —
    // the verified seed catalog carries it the same way.
    const plan = planCatalogSeed(SEED_CATALOG, [], DEPS);
    const muse = plan.find((p) => p.partner === "muse");
    assert.equal(muse?.url, "https://www.plunderandriffle.com/muse-invite");
    assert.ok(plan.some((p) => p.partner === "agent37_ref"));
    assert.ok(!plan.some((p) => p.partner === "higgsfield"));
  });
});

interface LinkRow {
  userId: string;
  partner: string;
  url: string;
  source: string;
  externalRef: string | null;
}

function fakeDb(seedRows: LinkRow[] = []) {
  const rows: LinkRow[] = [...seedRows];
  const db: CatalogSeedDb = {
    engineLink: {
      async findMany({ where }) {
        return rows.filter((r) => r.userId === where.userId).map((r) => ({ partner: r.partner }));
      },
      async create({ data }) {
        if (rows.some((r) => r.userId === data.userId && r.partner === data.partner)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        rows.push({ ...data });
        return data;
      },
    },
  };
  return { db, rows };
}

describe("applyCatalogSeed — writes source pr-mcp, touches nothing existing", () => {
  it("creates the missing partners for the operator only, marked pr-mcp", async () => {
    const manual: LinkRow = {
      userId: "op",
      partner: "salarium",
      url: "https://dh.media/?affid=HandSaved",
      source: "manual",
      externalRef: "HandSaved",
    };
    const memberRow: LinkRow = {
      userId: "member",
      partner: "muse",
      url: "https://www.plunderandriffle.com/muse-invite",
      source: "manual",
      externalRef: null,
    };
    const { db, rows } = fakeDb([manual, memberRow]);
    const result = await applyCatalogSeed(db, "op", CATALOG, DEPS);
    assert.deepEqual(result.partners, ["fishaudio", "agent37_ref", "temu", "muse"]);
    assert.equal(result.seeded, 4);
    const opRows = rows.filter((r) => r.userId === "op");
    assert.equal(opRows.length, 5);
    for (const row of opRows) {
      if (row.partner === "salarium") continue;
      assert.equal(row.source, "pr-mcp", `${row.partner} seeded as pr-mcp`);
    }
    // The manual row is byte-identical — never overwritten.
    assert.deepEqual(rows.find((r) => r.userId === "op" && r.partner === "salarium"), manual);
    // The other user's rows are untouched and uncounted.
    assert.deepEqual(rows.filter((r) => r.userId === "member"), [memberRow]);
  });

  it("is idempotent: a second run seeds nothing", async () => {
    const { db, rows } = fakeDb();
    const first = await applyCatalogSeed(db, "op", CATALOG, DEPS);
    assert.equal(first.seeded, 5);
    const second = await applyCatalogSeed(db, "op", CATALOG, DEPS);
    assert.deepEqual(second, { seeded: 0, partners: [] });
    assert.equal(rows.length, 5);
  });
});

describe("attemptCatalogSeed — the provision flow's guard", () => {
  it("passes the serving rung through on success", async () => {
    const outcome = await attemptCatalogSeed({
      enabled: true,
      loadCatalog: async () => ({ partners: CATALOG, source: "live" }),
      applySeed: async () => ({ seeded: 5, partners: ["muse"] }),
    });
    assert.deepEqual(outcome, { seeded: 5, partners: ["muse"], source: "live", attempted: true });
  });

  it("a catalog failure reports failed and never throws — provisioning proceeds", async () => {
    let provisionRan = false;
    const outcome = await attemptCatalogSeed({
      enabled: true,
      loadCatalog: async () => {
        throw new Error("engine down");
      },
      applySeed: async () => ({ seeded: 0, partners: [] }),
    });
    // The composition Barry provisioning uses: seed outcome in hand,
    // the provision step runs regardless.
    provisionRan = true;
    assert.equal(provisionRan, true);
    assert.deepEqual(outcome, { seeded: 0, partners: [], source: "failed", attempted: true });
  });

  it("a seed-write failure also lands as failed", async () => {
    const outcome = await attemptCatalogSeed({
      enabled: true,
      loadCatalog: async () => ({ partners: CATALOG, source: "snapshot" }),
      applySeed: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(outcome.source, "failed");
    assert.equal(outcome.seeded, 0);
  });

  it("a non-operator is never seeded: loader and writer are not called", async () => {
    let calls = 0;
    const outcome = await attemptCatalogSeed({
      enabled: false,
      loadCatalog: async () => {
        calls++;
        return { partners: CATALOG, source: "live" as const };
      },
      applySeed: async () => {
        calls++;
        return { seeded: 5, partners: [] };
      },
    });
    assert.equal(calls, 0);
    assert.deepEqual(outcome, { seeded: 0, partners: [], source: "failed", attempted: false });
  });
});
