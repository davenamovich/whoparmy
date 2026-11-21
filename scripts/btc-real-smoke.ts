// ─── SCRATCH-DB SMOKE: Real BTC rails (funding, algo runs, batches) ──
// Run:  bun --conditions=react-server scripts/btc-real-smoke.ts
//
// Builds a throwaway SQLite DB with the REAL boot script
// (scripts/apply-schema.ts), seeds three members (two with a saved
// payout address, one without), and exercises the real service layer
// (src/lib/btc-payouts.ts) end to end:
//   - collection toggle defaults OFF, flips ON/OFF via AppSetting
//   - the algo refuses an empty pool (no crash, no zero-line batch)
//   - funding entries drive the balance (funded − PAID)
//   - preview == create: the plan the admin sees is the run created
//   - address snapshot: a member changing their address after run
//     creation never rewrites the run's lines
//   - state machine: no DRAFT→PAID, PAID requires a txid,
//     double-approve blocked, cancel works from APPROVED
//   - line edits validate the prospective total against the balance
//   - CSV export carries address, amount_btc, amount_sats, member
//   - marking PAID debits the balance
// Nothing touches a real database: DATABASE_URL points at a temp
// file that is deleted on exit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const scratch = mkdtempSync(join(process.cwd(), ".smoke-btc-"));
const dbFile = join(scratch, "smoke.db");
process.env.DATABASE_URL = `file:${dbFile}`;

const ADDR_A = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const ADDR_A_NEW = "bc1qrp33g8q5c5txsp9arysrvm4gjc4zl9vy3082c";
const ADDR_B = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";

try {
  execFileSync("bun", ["scripts/apply-schema.ts"], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "pipe",
  });

  const { db } = await import("../src/lib/db.ts");
  const svc = await import("../src/lib/btc-payouts.ts");

  // Seed members: A and B with payout addresses, C without.
  const a = await db.user.create({
    data: { email: "a@smoke.test", name: "Alice Smoke", btcReceiveAddress: ADDR_A },
  });
  const b = await db.user.create({
    data: { email: "b@smoke.test", name: "Bob Smoke", btcReceiveAddress: ADDR_B },
  });
  await db.user.create({ data: { email: "c@smoke.test", name: "Carol Smoke" } });

  // Toggle: default OFF, flips both ways.
  assert.equal(await svc.getCollectBtcAddresses(), false, "toggle defaults OFF");
  assert.equal(await svc.setCollectBtcAddresses(true), true);
  assert.equal(await svc.getCollectBtcAddresses(), true);
  assert.equal(await svc.setCollectBtcAddresses(false), false);

  // Empty pool: the algo refuses cleanly.
  const emptyPreview = await svc.previewRun(5000);
  assert.equal(emptyPreview.ok, false, "empty pool preview refuses");
  await assert.rejects(() => svc.createBatch({ payoutBps: 5000 }), /pool is empty/);

  // Fund the pool: 1,000,000 + 500 sats.
  await svc.addFundingEntry({ amountSats: 1_000_000, txid: "fundtx1", note: "seed" });
  await svc.addFundingEntry({ amountSats: 500 });
  let ledger = await svc.getLedgerState();
  assert.deepEqual(ledger, { fundedSats: 1_000_500, paidOutSats: 0, balanceSats: 1_000_500 });

  // Roster: 2 with (masked), 1 without.
  const roster = await svc.getRoster();
  assert.equal(roster.withAddress.length, 2);
  assert.equal(roster.withoutAddress.length, 1);
  assert.equal(roster.withAddress[0]?.maskedAddress, "bc1qxy2k…hx0wlh");

  // Preview at 50%: distributable 500,250 → 250,125 each, remainder 0.
  const preview = await svc.previewRun(5000);
  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.plan.distributableSats, 500_250);
    assert.equal(preview.plan.perLineSats, 250_125);
    assert.equal(preview.plan.remainderSats, 0);
    assert.equal(preview.plan.memberCount, 2);
  }

  // Create the run — exactly the previewed plan, DRAFT, snapshots in.
  const { batch, plan } = await svc.createBatch({ payoutBps: 5000, note: "smoke win" });
  assert.equal(batch.status, "DRAFT");
  assert.equal(batch.totalSats, plan.distributedSats);
  assert.equal(batch.lines.length, 2);
  assert.ok(batch.lines.every((l) => l.amountSats === 250_125));

  // Snapshot rule: A changes address → the run still pays the old one.
  await db.user.update({ where: { id: a.id }, data: { btcReceiveAddress: ADDR_A_NEW } });
  const detail1 = await svc.getBatchDetail(batch.id);
  assert.equal(detail1.lines.find((l) => l.userId === a.id)?.address, ADDR_A);

  // State machine: no DRAFT→PAID, even with a txid.
  await assert.rejects(() => svc.markBatchPaid(batch.id, "sometx"), /cannot be marked PAID/);
  // Approve → double-approve blocked → PAID requires a txid.
  await svc.approveBatch(batch.id);
  await assert.rejects(() => svc.approveBatch(batch.id), /cannot be approved/);
  await assert.rejects(() => svc.markBatchPaid(batch.id, ""), /txid is required/);
  await assert.rejects(() => svc.markBatchPaid(batch.id, "   "), /txid is required/);

  // CSV of the APPROVED batch.
  const csv = await svc.getBatchCsv(batch.id);
  assert.match(csv, /^address,amount_btc,amount_sats,member\n/);
  assert.ok(csv.includes(`${ADDR_A},0.00250125,250125,Alice Smoke`));
  assert.ok(csv.includes(`${ADDR_B},0.00250125,250125,Bob Smoke`));

  // Mark PAID with the txid → balance debits.
  const paid = await svc.markBatchPaid(batch.id, "payouttx123");
  assert.equal(paid.status, "PAID");
  assert.ok(paid.paidAt instanceof Date);
  ledger = await svc.getLedgerState();
  assert.equal(ledger.balanceSats, 500_250);
  assert.equal(ledger.paidOutSats, 500_250);

  // Second run at 100% of what remains; line-edit guard bites.
  const run2 = await svc.createBatch({ payoutBps: 10_000, note: "smoke win 2" });
  assert.equal(run2.batch.totalSats, 500_250);
  const lineB = run2.batch.lines.find((l) => l.userId === b.id);
  assert.ok(lineB);
  // Raising B's line by 1 sat would push the batch past the balance.
  await assert.rejects(() => svc.editLine(run2.batch.id, lineB.id, lineB.amountSats + 1), /balance/);
  // The rejected edit left the batch untouched.
  const detail2 = await svc.getBatchDetail(run2.batch.id);
  assert.equal(detail2.totalSats, 500_250);
  // A legal edit + a removal recompute the total.
  await svc.editLine(run2.batch.id, lineB.id, 200_000);
  const afterEdit = await svc.getBatchDetail(run2.batch.id);
  assert.equal(afterEdit.totalSats, 250_125 + 200_000);
  const lineA2 = afterEdit.lines.find((l) => l.userId === a.id);
  assert.ok(lineA2);
  await svc.removeLine(run2.batch.id, lineA2.id);
  const afterRemove = await svc.getBatchDetail(run2.batch.id);
  assert.equal(afterRemove.totalSats, 200_000);
  assert.equal(afterRemove.lines.length, 1);
  // Cancel from DRAFT works; a cancelled batch refuses approval.
  await svc.cancelBatch(run2.batch.id);
  await assert.rejects(() => svc.approveBatch(run2.batch.id), /cannot be approved/);

  console.log("BTC REAL SMOKE: all assertions passed");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
