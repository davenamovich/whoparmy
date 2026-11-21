// ─── DAILY JOB: rotator settlement drafts (2026-11-21) ────────────
// Run:  bun --conditions=react-server scripts/settlement-drafts.ts
//
// Creates a DRAFT settlement for every CONFIRMED rotator day that
// doesn't have one yet (lib/settlement.ts — idempotent, safe to run
// repeatedly; a day that already has a settlement in ANY status is
// left untouched). Drafts are SIMULATED ledger records at gross 0 —
// the auction settles in free generations today; no money moves and
// nothing here talks to Bankr.
//
// Scheduling: the repo has no in-app scheduler for this — run it
// from the same external cron that drives the other daily jobs
// (e.g. after the 23:50 ET rotator close), or by hand; the
// operator-only POST /api/admin/settlements { action:
// "create-drafts" } does the same thing from the admin UI.
import { db } from "../src/lib/db";
import {
  createDraftsForConfirmedDays,
  type SettlementDb,
} from "../src/lib/settlement";
import { HOUSE_BANKR } from "../src/lib/wallet-bind";

const result = await createDraftsForConfirmedDays(db as unknown as SettlementDb, {
  houseEvmAddress: HOUSE_BANKR.evm,
});
console.log(
  `[settlement-drafts] created: ${result.created.join(", ") || "none"} · already existed: ${result.existing.join(", ") || "none"}`,
);
process.exit(0);
