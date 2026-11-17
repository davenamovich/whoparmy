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
const tables = db.query("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number };
console.log(`[boot] schema applied to ${path} — ${tables.n} tables present`);
db.close();
