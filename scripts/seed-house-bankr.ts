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

async function resolveOperatorUserId(): Promise<string | null> {
  const direct = process.env.HOUSE_BIND_USER_ID?.trim();
  if (direct) {
    const user = await db.user.findUnique({ where: { id: direct }, select: { id: true } });
    return user?.id ?? null;
  }
  const whopId = (process.env.OPERATOR_WHOP_IDS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)[0];
  if (whopId) {
    const user = await db.user.findUnique({ where: { whopId }, select: { id: true } });
    if (user) return user.id;
  }
  const username = (process.env.OPERATOR_WHOP_USERNAMES ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)[0];
  if (username) {
    // SQLite has no case-insensitive filter mode in Prisma — scan
    // the (small) set of users that have a Whop username at all.
    const candidates = await db.user.findMany({
      where: { whopUsername: { not: null } },
      select: { id: true, whopUsername: true },
    });
    const hit = candidates.find((u) => u.whopUsername?.toLowerCase() === username);
    if (hit) return hit.id;
  }
  return null;
}

const userId = await resolveOperatorUserId();
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
