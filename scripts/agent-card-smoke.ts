// ─── SCRATCH-DB SMOKE: Agent card extras (spots / clicks / Bankr) ──
// Run:  bun --conditions=react-server scripts/agent-card-smoke.ts
//
// Builds a throwaway SQLite DB with the REAL boot script
// (scripts/apply-schema.ts — which also proves the new HiredAgent
// columns land through the additive-column path), seeds an owner, a
// stranger, one agent, traffic-day rows and member-level link clicks,
// then exercises the real service layer (src/lib/agent-card.ts):
//   - spots: today used/total + last-7-ET-days sum (older rows out)
//   - clicks: member-level totals + today/7d/30d windows + top link,
//     with another member's clicks never leaking in
//   - token save: EVM + Solana shapes stored with their chain,
//     garbage rejected and nothing written
//   - proceeds: TOKEN target needs a saved token; clearing the token
//     under a TOKEN target is refused; defaults are off/0/BTC
//   - ownership: a stranger's reads and writes 404
// Nothing touches a real database: DATABASE_URL points at a temp
// file that is deleted on exit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const scratch = mkdtempSync(join(process.cwd(), ".smoke-agentcard-"));
const dbFile = join(scratch, "smoke.db");
process.env.DATABASE_URL = `file:${dbFile}`;

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "So11111111111111111111111111111111111111112";

try {
  execFileSync("bun", ["scripts/apply-schema.ts"], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "pipe",
  });

  const { db } = await import("../src/lib/db");
  const svc = await import("../src/lib/agent-card");
  const core = await import("../src/lib/agent-card-core");

  const owner = await db.user.create({ data: { email: "owner@smoke.test", name: "Owner Smoke" } });
  const stranger = await db.user.create({ data: { email: "stranger@smoke.test", name: "Stranger Smoke" } });
  const agent = await db.hiredAgent.create({
    data: { userId: owner.id, templateKey: "btc-barry", name: "Barry Smoke", tokenBudget: 1000 },
  });

  // Spots: today 3, yesterday 4, three days ago 2, ten days ago 9 (out of window).
  const todayEt = core.etDateStringFrom(new Date());
  const days: Array<[string, number]> = [
    [todayEt, 3],
    [core.addDaysToEtDate(todayEt, -1), 4],
    [core.addDaysToEtDate(todayEt, -3), 2],
    [core.addDaysToEtDate(todayEt, -10), 9],
  ];
  for (const [date, slotsUsed] of days) {
    await db.agentTrafficDay.create({ data: { agentId: agent.id, userId: owner.id, date, slotsUsed } });
  }

  // Clicks (member-level): 2 today, 1 more inside 7d, 1 more inside
  // 30d, 1 older than 30d (all-time only), plus a stranger's click.
  const w = core.clickWindows(new Date());
  const at = (base: Date, ms: number) => new Date(base.getTime() + ms);
  const H = 3600_000;
  const clicks: Array<{ ownerUserId: string; partner: string; createdAt: Date }> = [
    { ownerUserId: owner.id, partner: "fish", createdAt: at(w.todayStart, H) },
    { ownerUserId: owner.id, partner: "fish", createdAt: at(w.todayStart, 2 * H) },
    { ownerUserId: owner.id, partner: "dh-media", createdAt: at(w.weekStart, H) },
    { ownerUserId: owner.id, partner: "fish", createdAt: at(w.monthStart, H) },
    { ownerUserId: owner.id, partner: "dh-media", createdAt: at(w.monthStart, -H) },
    { ownerUserId: stranger.id, partner: "fish", createdAt: at(w.todayStart, H) },
  ];
  for (const c of clicks) {
    await db.linkClick.create({ data: { ...c, source: "rotator" } });
  }

  // ── Stats ────────────────────────────────────────────────────────
  const stats = await svc.getAgentCardStats(owner.id, agent.id);
  assert.equal(stats.spots.todayUsed, 3, "spots today");
  assert.equal(stats.spots.todayTotal, 10, "spots total = v1 daily allotment");
  assert.equal(stats.spots.last7DaysUsed, 9, "spots 7d excludes the 10-day-old row");
  assert.equal(stats.clicks.scope, "member");
  assert.equal(stats.clicks.total, 5, "all-time clicks are the owner's only");
  assert.equal(stats.clicks.today, 2);
  assert.equal(stats.clicks.last7Days, 3);
  assert.equal(stats.clicks.last30Days, 4);
  assert.equal(stats.clicks.topLink?.partner, "fish");
  assert.equal(stats.clicks.topLink?.clicks, 3);
  assert.equal(stats.bankr.tokenAddress, null, "token defaults empty");
  assert.deepEqual(stats.bankr.proceeds, { enabled: false, pct: 0, target: "BTC" }, "proceeds defaults");

  // ── Token save: validation ───────────────────────────────────────
  await assert.rejects(() => svc.saveAgentBankrSettings(owner.id, agent.id, { tokenAddress: "garbage!!" }), /contract address/);
  let after = await svc.getAgentCardStats(owner.id, agent.id);
  assert.equal(after.bankr.tokenAddress, null, "rejected save wrote nothing");

  const evmSaved = await svc.saveAgentBankrSettings(owner.id, agent.id, { tokenAddress: EVM });
  assert.equal(evmSaved.bankr.tokenAddress, EVM);
  assert.equal(evmSaved.bankr.tokenChain, "EVM");

  // ── Proceeds rules ───────────────────────────────────────────────
  const tokenTarget = await svc.saveAgentBankrSettings(owner.id, agent.id, {
    proceeds: { enabled: true, pct: 40, target: "TOKEN" },
  });
  assert.deepEqual(tokenTarget.bankr.proceeds, { enabled: true, pct: 40, target: "TOKEN" });

  await assert.rejects(
    () => svc.saveAgentBankrSettings(owner.id, agent.id, { tokenAddress: null }),
    /switch the target to BTC/,
    "clearing the token under a TOKEN target is refused",
  );

  await svc.saveAgentBankrSettings(owner.id, agent.id, { proceeds: { enabled: true, pct: 40, target: "BTC" } });
  const cleared = await svc.saveAgentBankrSettings(owner.id, agent.id, { tokenAddress: null });
  assert.equal(cleared.bankr.tokenAddress, null);
  assert.equal(cleared.bankr.tokenChain, null);

  await assert.rejects(
    () => svc.saveAgentBankrSettings(owner.id, agent.id, { proceeds: { enabled: true, pct: 10, target: "TOKEN" } }),
    /token address/,
    "TOKEN target without a saved token is refused",
  );
  await assert.rejects(
    () => svc.saveAgentBankrSettings(owner.id, agent.id, { proceeds: { enabled: true, pct: 101, target: "BTC" } }),
    /0 to 100/,
  );

  const solSaved = await svc.saveAgentBankrSettings(owner.id, agent.id, { tokenAddress: SOL });
  assert.equal(solSaved.bankr.tokenChain, "SOLANA");

  // ── Ownership ────────────────────────────────────────────────────
  await assert.rejects(
    () => svc.getAgentCardStats(stranger.id, agent.id),
    (err: unknown) => err instanceof svc.AgentCardError && err.status === 404,
  );
  await assert.rejects(
    () => svc.saveAgentBankrSettings(stranger.id, agent.id, { tokenAddress: EVM }),
    (err: unknown) => err instanceof svc.AgentCardError && err.status === 404,
  );

  console.log("agent-card smoke: ALL ASSERTIONS PASSED");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
