// ─── SCRATCH-DB SMOKE: agent-game purge + claim voiding ─────────────
// Run:  bun --conditions=react-server scripts/agentgame-purge-smoke.ts
//
// Builds a throwaway SQLite DB with the REAL boot script
// (scripts/apply-schema.ts), seeds a fake QA agent holding 4 minted
// claim codes (1+2+3+3 = 9 gens, the claude-qa-test footprint) plus an
// innocent bystander agent, then runs the purge through the real boot
// path (AGENTGAME_PURGE_HANDLES through apply-schema) and asserts:
//   - the target agent is gone from the leaderboard, bystander stays
//   - its 4 nonces are on the ClaimVoidedNonce denylist
//   - redeeming a purged code fails with the voided error
//   - redeeming an unrelated code still pays out
//   - the daily pool usage returns to 0
//   - a second boot with the variable still set is a no-op (idempotent)
// Nothing here touches a real database: DATABASE_URL is pointed at a
// temp file that is deleted on exit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const SECRET = "smoke-secret-0123456789abcdef";
const scratch = mkdtempSync(join(process.cwd(), ".smoke-purge-"));
const dbFile = join(scratch, "smoke.db");
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.CLAIM_BRIDGE_SECRET = SECRET;
delete process.env.AGENTGAME_PURGE_HANDLES;

function runBoot(extraEnv: Record<string, string> = {}): string {
  return execFileSync("bun", ["scripts/apply-schema.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
}

function nonceOf(token: string): string {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()).nonce;
}

try {
  // 1. Schema via the real boot script (no purge variable yet).
  runBoot();
  console.log("SMOKE: schema applied to scratch DB");

  const { db } = await import("../src/lib/db");
  const claims = await import("../src/lib/claims");
  const ag = await import("../src/lib/agentgame/agentgame");
  const agDb = db as any;

  // 2. Seed: a member, the purge target (4 solves, 9 gens, real W1
  //    codes), and a bystander whose code must survive.
  const user = await db.user.create({ data: { email: "smoke@test.local", name: "Smoke" } });
  const target = await agDb.agentGameAgent.create({
    data: { handle: "purge-target", name: "Purge Target", secretHash: "0".repeat(64) },
  });
  const challenges: Array<[string, number]> = [
    ["hidden-signal", 1],
    ["satoshi-trail", 2],
    ["human-paradox", 3],
    ["website-that-lies", 3],
  ];
  const targetTokens: string[] = [];
  for (const [challengeId, gens] of challenges) {
    const token = claims.mintClaimToken({ amount: gens, source: `agentgame:${challengeId}` });
    targetTokens.push(token);
    await agDb.agentGameSolve.create({
      data: { agentId: target.id, challengeId, gensAwarded: gens, claimNonce: nonceOf(token), claimToken: token },
    });
  }
  const bystander = await agDb.agentGameAgent.create({
    data: { handle: "bystander", name: "Bystander", secretHash: "1".repeat(64) },
  });
  await agDb.agentGameSolve.create({
    data: { agentId: bystander.id, challengeId: "hidden-signal", gensAwarded: 0, claimNonce: null, claimToken: null },
  });
  const bystanderToken = claims.mintClaimToken({ amount: 5, source: "smoke-bystander" });

  // 3. Pre-purge state: target leads the board, pool shows 9, and the
  //    target's code is a perfectly valid token (so a later rejection
  //    can only be the denylist talking).
  const boardBefore = await ag.getLeaderboard();
  assert.equal(boardBefore.leaderboard[0]?.agentId, "purge-target");
  assert.equal(boardBefore.leaderboard[0]?.score, 90);
  assert.equal((await ag.getManifest()).rewards.poolUsedToday, 9);
  assert.equal(claims.verifyClaimToken(targetTokens[0]!).ok, true);
  console.log("SMOKE: seeded — target on the board, pool at 9, code valid");

  // 4. Purge through the real boot path.
  const bootOut = runBoot({ AGENTGAME_PURGE_HANDLES: "purge-target" });
  assert.match(bootOut, /agentgame purge: removed agent purge-target — 4 claim nonce\(s\) voided/);
  assert.match(bootOut, /agentgame purge: done — 1 agent\(s\) removed, 4 nonce\(s\) voided/);
  console.log("SMOKE: boot purge ran — 1 agent removed, 4 nonces voided");

  // 5. Post-purge state.
  const boardAfter = await ag.getLeaderboard();
  assert.deepEqual(boardAfter.leaderboard.map((r: any) => r.agentId), ["bystander"]);
  assert.equal((await ag.getManifest()).rewards.poolUsedToday, 0);
  assert.equal((await ag.getManifest()).stats.agentsRegistered, 1);
  assert.equal(await agDb.claimVoidedNonce.count(), 4);
  console.log("SMOKE: leaderboard clean, pool back to 0, denylist holds 4 nonces");

  // 6. Redemption: purged code dies with the voided error (twice — it
  //    must not degrade into 'already claimed'), unrelated code pays.
  const dead = await claims.redeemClaim(user.id, targetTokens[0]!);
  assert.equal(dead.ok, false);
  assert.match(dead.ok === false ? dead.error : "", /voided/i);
  const deadAgain = await claims.redeemClaim(user.id, targetTokens[1]!);
  assert.equal(deadAgain.ok, false);
  assert.match(deadAgain.ok === false ? deadAgain.error : "", /voided/i);
  const alive = await claims.redeemClaim(user.id, bystanderToken);
  assert.equal(alive.ok, true);
  assert.equal(alive.ok === true ? alive.amount : 0, 5);
  console.log("SMOKE: purged codes rejected as voided; unrelated code redeemed +5 gens");

  // 7. Idempotency: boot again with the variable still set.
  const bootOut2 = runBoot({ AGENTGAME_PURGE_HANDLES: "purge-target" });
  assert.match(bootOut2, /agentgame purge: done — 0 agent\(s\) removed, 0 nonce\(s\) voided/);
  assert.equal(await agDb.claimVoidedNonce.count(), 4);
  console.log("SMOKE: second boot is a no-op — purge is idempotent");

  await db.$disconnect();
  console.log("SMOKE PASS: agent-game purge + claim voiding verified end to end");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
