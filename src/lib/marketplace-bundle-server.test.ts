import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";

const folder = mkdtempSync(join(tmpdir(), "whop-bundle-"));
const file = join(folder, "test.db");
process.env.DATABASE_URL = `file:${file}`;
(globalThis as typeof globalThis & { prisma: PrismaClient }).prisma = new PrismaClient();

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith(new URL("../", import.meta.url).href)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, specifier === "server-only" ? { ...context, conditions: [...context.conditions, "react-server"] } : context);
  },
});

const { db } = await import("./db.ts");
const { getBundle, getBundleKit, skillExists } = await import("./marketplace-server.ts");
const { HOUSE_SPACE } = await import("./application.ts");

before(async () => {
  const sqlite = new DatabaseSync(file);
  sqlite.exec(readFileSync(new URL("../../prisma/schema.sql", import.meta.url), "utf8"));
  sqlite.close();
  await db.user.createMany({ data: [
    { id: "granted-buyer", email: "granted@test.invalid", marketplaceBundleAt: new Date("2026-11-25T00:00:00Z") },
    { id: "plain-member", email: "plain@test.invalid" },
  ] });
});

after(async () => {
  await db.$disconnect();
  hooks.deregister();
  rmSync(folder, { recursive: true, force: true });
});

test("granted buyer can download the real bundle skill files", async () => {
  const result = await getBundleKit("granted-buyer");
  assert.ok(!("error" in result), "granted buyer must not get an error result");
  if ("error" in result) return;
  assert.equal(result.kit.files.length, 1);
  assert.equal(result.kit.files[0].path, "space-demo-and-replicate/SKILL.md");
  const source = readFileSync(join(process.env.HOME ?? "", "workspace/custom-skills/space-demo-and-replicate/SKILL.md"), "utf8");
  assert.equal(result.kit.files[0].text, source);
  assert.equal(result.grantedAt?.toISOString(), "2026-11-25T00:00:00.000Z");
});

test("non-granted member cannot download the bundle files", async () => {
  const result = await getBundleKit("plain-member");
  assert.ok("error" in result, "non-granted member must get the not_granted result");
  if (!("error" in result)) return;
  assert.equal(result.error, "not_granted");
  assert.equal(JSON.stringify(result).includes("name: space-demo-and-replicate"), false);
  assert.equal(result.bundle.granted, false);
  assert.equal(result.bundle.kitPath, null);
});

test("unknown user cannot download the bundle files", async () => {
  const result = await getBundleKit("no-such-user");
  assert.ok("error" in result);
});

test("getBundle advertises the kit path only to granted buyers", async () => {
  const granted = await getBundle("granted-buyer");
  assert.equal(granted.granted, true);
  assert.equal(granted.kitPath, "/api/bridge/marketplace/bundle/kit");
  const plain = await getBundle("plain-member");
  assert.equal(plain.granted, false);
  assert.equal(plain.kitPath, null);
});

test("HOUSE_SPACE carries the real demo video on the site's public path", () => {
  assert.equal(HOUSE_SPACE.demoKind, "video");
  assert.equal(HOUSE_SPACE.videoUrl, "https://whop.plunderandriffle.com/demos/plunder-riffle-content-engine-demo.mp4");
});

test("HOUSE_SPACE manifest names only real skills the battery registry knows", () => {
  assert.ok(HOUSE_SPACE.replicationManifest.skills.length >= 1);
  for (const skill of HOUSE_SPACE.replicationManifest.skills) {
    assert.equal(skillExists(skill), true, `HOUSE_SPACE skill "${skill}" must pass the battery skillExists check`);
  }
});
