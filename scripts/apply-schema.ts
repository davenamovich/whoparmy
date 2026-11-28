// Boot-time schema applier — the engine-independent way to make sure the
// SQLite tables exist. `prisma db push` needs the Prisma schema engine
// binary, which may be missing from the runtime image (bun install skips
// dependency postinstall scripts unless they are trusted). Bun ships a
// built-in SQLite driver, so this script needs nothing but bun itself.
//
// It applies prisma/schema.sql (generated from schema.prisma) with
// IF NOT EXISTS semantics: an empty database gets every table; an
// existing database is left untouched. Additive schema changes still go
// through `prisma db push`, which the boot command runs afterwards as a
// best-effort step.
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { agentgamePurgeFromEnv } from "./agentgame-purge";

const url = process.env.DATABASE_URL ?? "file:/data/custom.db";
const path = url.replace(/^file:/, "").split("?")[0];

const sql = readFileSync(new URL("../prisma/schema.sql", import.meta.url), "utf8")
  .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
  .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");

const db = new Database(path, { create: true });
// Never let one bad statement in schema.sql kill the whole boot
// step: the additive columns below are the part existing databases
// actually depend on. (2026-11-18: a baked-in IF NOT EXISTS in the
// TelegramPairCode block double-transformed into a syntax error and
// silently stopped every additive column after it.)
try {
  db.exec(sql);
} catch (err) {
  console.error("[boot] schema.sql exec hit an error — continuing to additive columns:", err);
}

// Additive columns for tables that already exist (schema.sql only
// creates missing tables). Keep this list in step with schema.prisma:
// each entry is applied only when the column is absent, so it is safe
// on every boot and never touches existing data.
const ADDITIVE_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "BetaTester", column: "deliveryEmail", ddl: 'ALTER TABLE "BetaTester" ADD COLUMN "deliveryEmail" TEXT NOT NULL DEFAULT \'\'' },
  { table: "BetaTester", column: "day0VerifiedBy", ddl: 'ALTER TABLE "BetaTester" ADD COLUMN "day0VerifiedBy" TEXT NOT NULL DEFAULT \'\'' },
  { table: "BetaTester", column: "day0VerifiedAt", ddl: 'ALTER TABLE "BetaTester" ADD COLUMN "day0VerifiedAt" DATETIME' },
  { table: "BetaTester", column: "offerText", ddl: 'ALTER TABLE "BetaTester" ADD COLUMN "offerText" TEXT NOT NULL DEFAULT \'\'' },
  { table: "Application", column: "handoutOptIn", ddl: 'ALTER TABLE "Application" ADD COLUMN "handoutOptIn" BOOLEAN NOT NULL DEFAULT false' },
  { table: "MarketplaceSale", column: "source", ddl: 'ALTER TABLE "MarketplaceSale" ADD COLUMN "source" TEXT' },
  { table: "PaidRotatorSlot", column: "source", ddl: 'ALTER TABLE "PaidRotatorSlot" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'paid\'' },
  { table: "PaidRotatorSlot", column: "expiresAt", ddl: 'ALTER TABLE "PaidRotatorSlot" ADD COLUMN "expiresAt" DATETIME' },
  { table: "PaidRotatorSlot", column: "redeemedAt", ddl: 'ALTER TABLE "PaidRotatorSlot" ADD COLUMN "redeemedAt" DATETIME' },
  { table: "Application", column: "videoUrl", ddl: 'ALTER TABLE "Application" ADD COLUMN "videoUrl" TEXT' },
  { table: "Application", column: "priceCents", ddl: 'ALTER TABLE "Application" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0' },
  { table: "Application", column: "currency", ddl: "ALTER TABLE \"Application\" ADD COLUMN \"currency\" TEXT NOT NULL DEFAULT 'USD'" },
  { table: "Application", column: "category", ddl: 'ALTER TABLE "Application" ADD COLUMN "category" TEXT' },
  { table: "Application", column: "demoKind", ddl: 'ALTER TABLE "Application" ADD COLUMN "demoKind" TEXT' },
  { table: "Application", column: "buyUrl", ddl: 'ALTER TABLE "Application" ADD COLUMN "buyUrl" TEXT' },
  { table: "Application", column: "skillsyncUrl", ddl: 'ALTER TABLE "Application" ADD COLUMN "skillsyncUrl" TEXT' },
  { table: "Application", column: "replicationManifest", ddl: 'ALTER TABLE "Application" ADD COLUMN "replicationManifest" TEXT' },
  { table: "Application", column: "listingStatus", ddl: 'ALTER TABLE "Application" ADD COLUMN "listingStatus" TEXT NOT NULL DEFAULT \'DRAFT\'' },
  { table: "Application", column: "feeStatus", ddl: 'ALTER TABLE "Application" ADD COLUMN "feeStatus" TEXT NOT NULL DEFAULT \'UNPAID\'' },
  { table: "Application", column: "whopProductId", ddl: 'ALTER TABLE "Application" ADD COLUMN "whopProductId" TEXT' },
  { table: "Application", column: "whopPlanId", ddl: 'ALTER TABLE "Application" ADD COLUMN "whopPlanId" TEXT' },
  { table: "Application", column: "whopProductError", ddl: 'ALTER TABLE "Application" ADD COLUMN "whopProductError" TEXT' },
  { table: "Asset", column: "pageUrl", ddl: 'ALTER TABLE "Asset" ADD COLUMN "pageUrl" TEXT' },
  { table: "Asset", column: "engineRef", ddl: 'ALTER TABLE "Asset" ADD COLUMN "engineRef" TEXT' },
  { table: "BrandProfile", column: "researchJson", ddl: 'ALTER TABLE "BrandProfile" ADD COLUMN "researchJson" TEXT' },
  { table: "User", column: "freeGenBalance", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenBalance" INTEGER NOT NULL DEFAULT 0' },
  { table: "User", column: "freeGenMonth", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenMonth" TEXT' },
  { table: "User", column: "freeGenApplied", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenApplied" INTEGER NOT NULL DEFAULT 0' },
  { table: "User", column: "linksSavedAt", ddl: 'ALTER TABLE "User" ADD COLUMN "linksSavedAt" DATETIME' },
  { table: "HiredAgent", column: "role", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "role" TEXT' },
  { table: "HiredAgent", column: "instructions", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "instructions" TEXT' },
  { table: "HiredAgent", column: "toolsJson", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "toolsJson" TEXT' },
  { table: "HiredAgent", column: "source", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'RENTAL\'' },
  { table: "HiredAgent", column: "slug", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "slug" TEXT' },
  { table: "HiredAgent", column: "publicProfile", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false' },
  { table: "HiredAgent", column: "avatarUrl", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "avatarUrl" TEXT' },
  { table: "HiredAgent", column: "description", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "description" TEXT' },
  { table: "HiredAgent", column: "category", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "category" TEXT' },
  { table: "HiredAgent", column: "capabilitiesJson", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "capabilitiesJson" TEXT' },
  { table: "HiredAgent", column: "demoUrl", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "demoUrl" TEXT' },
  { table: "HiredAgent", column: "appUrl", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "appUrl" TEXT' },
  { table: "HiredAgent", column: "gitUrl", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "gitUrl" TEXT' },
  { table: "HiredAgent", column: "buildPrompt", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "buildPrompt" TEXT' },
  { table: "HiredAgent", column: "spaceUrl", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "spaceUrl" TEXT' },
  { table: "HiredAgent", column: "expiresAt", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "expiresAt" DATETIME' },
  { table: "HiredAgent", column: "bankrTokenAddress", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "bankrTokenAddress" TEXT' },
  { table: "HiredAgent", column: "bankrTokenChain", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "bankrTokenChain" TEXT' },
  { table: "HiredAgent", column: "proceedsToCoin", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "proceedsToCoin" BOOLEAN NOT NULL DEFAULT false' },
  { table: "HiredAgent", column: "proceedsToCoinPct", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "proceedsToCoinPct" INTEGER NOT NULL DEFAULT 0' },
  { table: "HiredAgent", column: "proceedsToCoinTarget", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "proceedsToCoinTarget" TEXT NOT NULL DEFAULT \'BTC\'' },
  { table: "BridgeCode", column: "scope", ddl: 'ALTER TABLE "BridgeCode" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'week\'' },
  { table: "BridgeToken", column: "scope", ddl: 'ALTER TABLE "BridgeToken" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'week\'' },
  { table: "BridgeToken", column: "pendingCredits", ddl: 'ALTER TABLE "BridgeToken" ADD COLUMN "pendingCredits" INTEGER NOT NULL DEFAULT 0' },
  { table: "BridgeToken", column: "pendingSince", ddl: 'ALTER TABLE "BridgeToken" ADD COLUMN "pendingSince" DATETIME' },
  { table: "ClipJob", column: "bridgeTokenId", ddl: 'ALTER TABLE "ClipJob" ADD COLUMN "bridgeTokenId" TEXT' },
  { table: "RotatorPlacement", column: "url", ddl: 'ALTER TABLE "RotatorPlacement" ADD COLUMN "url" TEXT' },
  { table: "CampaignListing", column: "jobId", ddl: 'ALTER TABLE "CampaignListing" ADD COLUMN "jobId" TEXT' },
  { table: "DoorsSession", column: "version", ddl: 'ALTER TABLE "DoorsSession" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0' },
  { table: "ClipJob", column: "fundingLane", ddl: 'ALTER TABLE "ClipJob" ADD COLUMN "fundingLane" TEXT' },
  { table: "ClipJob", column: "grantId", ddl: 'ALTER TABLE "ClipJob" ADD COLUMN "grantId" TEXT' },
  { table: "User", column: "btcReceiveAddress", ddl: 'ALTER TABLE "User" ADD COLUMN "btcReceiveAddress" TEXT' },
  { table: "User", column: "agentBtcAddress", ddl: 'ALTER TABLE "User" ADD COLUMN "agentBtcAddress" TEXT' },
  { table: "PickaphoneSession", column: "streak", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "streak" INTEGER NOT NULL DEFAULT 0' },
  { table: "PickaphoneSession", column: "bestStreak", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "bestStreak" INTEGER NOT NULL DEFAULT 0' },
  { table: "PickaphoneSession", column: "peeksBanked", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "peeksBanked" INTEGER NOT NULL DEFAULT 0' },
  { table: "PickaphoneSession", column: "peeksUsed", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "peeksUsed" TEXT NOT NULL DEFAULT \'[]\'' },
  { table: "PickaphoneSession", column: "sweatArmed", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "sweatArmed" BOOLEAN NOT NULL DEFAULT false' },
  { table: "PickaphoneSession", column: "calls", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "calls" TEXT NOT NULL DEFAULT \'[]\'' },
  { table: "PickaphoneSession", column: "readGuess", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "readGuess" TEXT' },
  { table: "PickaphoneSession", column: "pendingOfferTokens", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "pendingOfferTokens" INTEGER' },
  { table: "PickaphoneSession", column: "pendingOfferSweat", ddl: 'ALTER TABLE "PickaphoneSession" ADD COLUMN "pendingOfferSweat" BOOLEAN NOT NULL DEFAULT false' },
  { table: "EngineLink", column: "source", ddl: 'ALTER TABLE "EngineLink" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'manual\'' },
  { table: "EngineLink", column: "externalRef", ddl: 'ALTER TABLE "EngineLink" ADD COLUMN "externalRef" TEXT' },
  // Agent rotator offer policy (2026-11-22): owner-picked offers + pool.
  { table: "AgentRotator", column: "offersJson", ddl: 'ALTER TABLE "AgentRotator" ADD COLUMN "offersJson" TEXT' },
  { table: "AgentRotator", column: "pool", ddl: 'ALTER TABLE "AgentRotator" ADD COLUMN "pool" TEXT NOT NULL DEFAULT \'OWNER\'' },
  // Pricing rebuild (2026-11-23): $20/mo marketplace listing entitlement
  // persisted on the user. Missed in the first ship — the columns were in
  // schema.sql's CREATE TABLE only, which never alters an existing table,
  // and sign-in broke in production until they landed here.
  { table: "User", column: "listingActive", ddl: 'ALTER TABLE "User" ADD COLUMN "listingActive" BOOLEAN NOT NULL DEFAULT false' },
  { table: "User", column: "listingCheckedAt", ddl: 'ALTER TABLE "User" ADD COLUMN "listingCheckedAt" DATETIME' },
  { table: "User", column: "marketplaceBundleAt", ddl: 'ALTER TABLE "User" ADD COLUMN "marketplaceBundleAt" DATETIME' },
  { table: "User", column: "freeAgentListingUsed", ddl: 'ALTER TABLE "User" ADD COLUMN "freeAgentListingUsed" BOOLEAN NOT NULL DEFAULT false' },
  { table: "MarketplaceSubmission", column: "reviewApproved", ddl: 'ALTER TABLE "MarketplaceSubmission" ADD COLUMN "reviewApproved" BOOLEAN NOT NULL DEFAULT false' },
  { table: "MarketplaceSubmission", column: "publishedAt", ddl: 'ALTER TABLE "MarketplaceSubmission" ADD COLUMN "publishedAt" DATETIME' },
];
for (const { table, column, ddl } of ADDITIVE_COLUMNS) {
  const cols = db.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === column)) {
    db.exec(ddl);
    console.log(`[boot] added column ${table}.${column}`);
  }
}

// ─── Offers-from-MCP partner-key migration (2026-11-21) ────────────
// EngineLink.partner (and every partner-key reference) used to store
// INVENTED keys from the old hardcoded catalog (fish-audio, dh-media,
// upload-post…). The canonical key is now the P&R MCP `step`
// (lib/offer-catalog.ts PARTNER_KEY_MIGRATION). This rewrites legacy
// rows in place, idempotently, on every boot:
//   - EngineLink @@unique(userId, partner): when a member somehow has
//     BOTH the old and the step row, the row with the newest
//     updatedAt survives (ties keep the step row) and the other is
//     deleted — the newest link is never lost.
//   - RotatorPlacement @@unique(userId, partner) is the
//     once-per-offer-ever grant record: same treatment, keeping the
//     earliest earned date (then earliest createdAt).
//   - RotatorBid.partner / RotatorDay.winnerPartner carry no unique
//     constraint on partner — a plain rename.
// AppSetting holds no partner-key bookkeeping (checked: traffic-pool
// and rotator state live in their own tables), so nothing else moves.
const PARTNER_KEY_MIGRATIONS: Array<[string, string]> = [
  ["fish-audio", "fishaudio"],
  ["agent37", "agent37_ref"],
  ["dh-media", "salarium"],
  ["upload-post", "uploadpost"],
  ["whop", "whop_ref"],
  ["railway", "railway_ref"],
  ["bankr", "bankr_ref"],
];
function tableExists(name: string): boolean {
  const row = db
    .query("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { n: number };
  return row.n > 0;
}
try {
  if (tableExists("EngineLink")) {
    for (const [oldKey, newKey] of PARTNER_KEY_MIGRATIONS) {
      // Old row loses when a step row exists that is at least as new.
      db.exec(
        `DELETE FROM "EngineLink" WHERE "partner" = '${oldKey}' AND EXISTS (
           SELECT 1 FROM "EngineLink" n
           WHERE n."userId" = "EngineLink"."userId" AND n."partner" = '${newKey}'
             AND n."updatedAt" >= "EngineLink"."updatedAt")`,
      );
      // Step row loses when the old row is strictly newer.
      db.exec(
        `DELETE FROM "EngineLink" WHERE "partner" = '${newKey}' AND EXISTS (
           SELECT 1 FROM "EngineLink" o
           WHERE o."userId" = "EngineLink"."userId" AND o."partner" = '${oldKey}'
             AND o."updatedAt" > "EngineLink"."updatedAt")`,
      );
      db.exec(`UPDATE "EngineLink" SET "partner" = '${newKey}' WHERE "partner" = '${oldKey}'`);
    }
  }
  if (tableExists("RotatorPlacement")) {
    for (const [oldKey, newKey] of PARTNER_KEY_MIGRATIONS) {
      db.exec(
        `DELETE FROM "RotatorPlacement" WHERE "partner" = '${oldKey}' AND EXISTS (
           SELECT 1 FROM "RotatorPlacement" n
           WHERE n."userId" = "RotatorPlacement"."userId" AND n."partner" = '${newKey}'
             AND (n."date" < "RotatorPlacement"."date"
               OR (n."date" = "RotatorPlacement"."date" AND n."createdAt" <= "RotatorPlacement"."createdAt")))`,
      );
      db.exec(
        `DELETE FROM "RotatorPlacement" WHERE "partner" = '${newKey}' AND EXISTS (
           SELECT 1 FROM "RotatorPlacement" o
           WHERE o."userId" = "RotatorPlacement"."userId" AND o."partner" = '${oldKey}'
             AND (o."date" < "RotatorPlacement"."date"
               OR (o."date" = "RotatorPlacement"."date" AND o."createdAt" < "RotatorPlacement"."createdAt")))`,
      );
      db.exec(`UPDATE "RotatorPlacement" SET "partner" = '${newKey}' WHERE "partner" = '${oldKey}'`);
    }
  }
  if (tableExists("RotatorBid")) {
    for (const [oldKey, newKey] of PARTNER_KEY_MIGRATIONS) {
      db.exec(`UPDATE "RotatorBid" SET "partner" = '${newKey}' WHERE "partner" = '${oldKey}'`);
    }
  }
  if (tableExists("RotatorDay")) {
    for (const [oldKey, newKey] of PARTNER_KEY_MIGRATIONS) {
      db.exec(`UPDATE "RotatorDay" SET "winnerPartner" = '${newKey}' WHERE "winnerPartner" = '${oldKey}'`);
    }
  }
  console.log("[boot] partner-key migration applied (legacy keys → MCP steps)");
} catch (err) {
  console.error("[boot] partner-key migration failed — continuing:", err);
}

// ─── Spot-window key remap for AgentTrafficDay (2026-11-21) ────────
// Pool spots moved from the ET calendar day to the 23:50 ET spot
// window (lib/traffic-pool-core.ts): AgentTrafficDay.date now stores
// the WINDOW KEY, and a placement dated D is governed by window D−1.
// Rows written before this change carry the PLACEMENT date, so each
// stored date shifts back one day into the window that governed it.
// This is a ONE-TIME remap — unlike the partner-key migration above
// it is NOT idempotent (a second run would shift dates again), so it
// is guarded by an AppSetting marker and runs exactly once. The
// two-step prefix dance keeps the (agentId, date) unique index safe:
// step 1 prefixes every date (all keys stay distinct), step 2
// un-prefixes with the −1 day shift (distinct inputs stay distinct,
// and shifted values can never collide with still-prefixed rows).
try {
  if (tableExists("AgentTrafficDay") && tableExists("AppSetting")) {
    const marker = db
      .query("SELECT count(*) AS n FROM \"AppSetting\" WHERE \"key\" = 'spot-window-migration:v1'")
      .get() as { n: number };
    if (marker.n === 0) {
      db.exec(`UPDATE "AgentTrafficDay" SET "date" = 'win:' || "date"`);
      db.exec(`UPDATE "AgentTrafficDay" SET "date" = date(substr("date", 5), '-1 day')`);
      db.exec(
        `INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('spot-window-migration:v1', 'AgentTrafficDay dates shifted to 23:50 ET spot-window keys', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      );
      console.log("[boot] spot-window remap applied (AgentTrafficDay dates → window keys)");
    }
  }
} catch (err) {
  console.error("[boot] spot-window remap failed — continuing:", err);
}

// Env-gated one-shot purge of agent-game test agents (voids their
// claim nonces first, then deletes the agents). A no-op unless
// AGENTGAME_PURGE_HANDLES is set; never allowed to block boot.
try {
  agentgamePurgeFromEnv(db);
} catch (err) {
  console.error("[boot] agentgame purge failed — continuing:", err);
}

const tables = db.query("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number };
console.log(`[boot] schema applied to ${path} — ${tables.n} tables present`);
db.close();
