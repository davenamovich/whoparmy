// ─── OPERATOR SEED: house Bankr wallet binding (2026-11-21) ───────
// Run INSIDE the app environment (DATABASE_URL pointing at the app
// DB), once, by the operator:
//   bun --conditions=react-server scripts/seed-house-bankr.ts
//
// Binds the house Bankr wallet (PUBLIC receive addresses + the
// public ref code, lib/wallet-bind.ts HOUSE_BANKR) to the operator
// user through the shipped mechanism (lib/wallet-bind-server.ts
// bindHouseBankr — the same code POST /api/admin/wallet-bind
// { action: "bind-house" } runs for a signed-in operator):
//   IdentityLink wallet_evm + wallet_solana + bankr_ref → operator
//   AgentWallet (both chains) → the operator's BTC Barry agent row,
//     skipped gracefully when Barry doesn't exist yet.
// Idempotent: re-running reports "existing" and changes nothing. A
// binding that belongs to a DIFFERENT user is a hard conflict — the
// script prints it and exits non-zero; it never rebinds silently.
//
// Operator resolution: HOUSE_BIND_USER_ID (a User.id) wins; else the
// first OPERATOR_WHOP_IDS / OPERATOR_WHOP_USERNAMES entry (the same
// env the app uses to designate operators).
import { db } from "../src/lib/db";
import { bindHouseBankr } from "../src/lib/wallet-bind-server";
import { resolveHouseUserId } from "../src/lib/house-owner";

const userId = await resolveHouseUserId(db);
if (!userId) {
  console.error(
    "[seed-house-bankr] No operator user found. Set HOUSE_BIND_USER_ID, or OPERATOR_WHOP_IDS / OPERATOR_WHOP_USERNAMES to the operator's Whop identity.",
  );
  process.exit(1);
}

const summary = await bindHouseBankr(userId);
console.log("[seed-house-bankr] house Bankr binding:");
console.log(JSON.stringify(summary, null, 2));

const conflicts = [
  ...summary.identity.filter((i) => i.status === "conflict").map((i) => i.kind),
  ...(summary.agent?.wallets.filter((w) => w.status === "conflict").map((w) => `agent:${w.chain}`) ?? []),
];
if (conflicts.length > 0) {
  console.error(`[seed-house-bankr] CONFLICTS (bound to a different user/agent): ${conflicts.join(", ")}`);
  process.exit(1);
}
console.log("[seed-house-bankr] done — bindings are set-once; re-running is a no-op.");
process.exit(0);
