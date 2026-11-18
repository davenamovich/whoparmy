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

const url = process.env.DATABASE_URL ?? "file:/data/custom.db";
const path = url.replace(/^file:/, "").split("?")[0];

const sql = readFileSync(new URL("../prisma/schema.sql", import.meta.url), "utf8")
  .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
  .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");

const db = new Database(path, { create: true });
db.exec(sql);

// Additive columns for tables that already exist (schema.sql only
// creates missing tables). Keep this list in step with schema.prisma:
// each entry is applied only when the column is absent, so it is safe
// on every boot and never touches existing data.
const ADDITIVE_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "Asset", column: "pageUrl", ddl: 'ALTER TABLE "Asset" ADD COLUMN "pageUrl" TEXT' },
  { table: "Asset", column: "engineRef", ddl: 'ALTER TABLE "Asset" ADD COLUMN "engineRef" TEXT' },
  { table: "BrandProfile", column: "researchJson", ddl: 'ALTER TABLE "BrandProfile" ADD COLUMN "researchJson" TEXT' },
  { table: "User", column: "freeGenBalance", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenBalance" INTEGER NOT NULL DEFAULT 0' },
  { table: "User", column: "freeGenMonth", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenMonth" TEXT' },
  { table: "User", column: "freeGenApplied", ddl: 'ALTER TABLE "User" ADD COLUMN "freeGenApplied" INTEGER NOT NULL DEFAULT 0' },
  { table: "User", column: "linksSavedAt", ddl: 'ALTER TABLE "User" ADD COLUMN "linksSavedAt" DATETIME' },
  { table: "HiredAgent", column: "source", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "source" TEXT NOT NULL DEFAULT \'RENTAL\'' },
  { table: "HiredAgent", column: "expiresAt", ddl: 'ALTER TABLE "HiredAgent" ADD COLUMN "expiresAt" DATETIME' },
  { table: "BridgeCode", column: "scope", ddl: 'ALTER TABLE "BridgeCode" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'week\'' },
  { table: "BridgeToken", column: "scope", ddl: 'ALTER TABLE "BridgeToken" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'week\'' },
];
for (const { table, column, ddl } of ADDITIVE_COLUMNS) {
  const cols = db.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === column)) {
    db.exec(ddl);
    console.log(`[boot] added column ${table}.${column}`);
  }
}

const tables = db.query("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number };
console.log(`[boot] schema applied to ${path} — ${tables.n} tables present`);
db.close();
