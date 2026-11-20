// ─── AGENT-GAME TEST-AGENT PURGE (boot-time, env-gated) ─────────────
//
// One-shot cleanup for QA/test agents in the BTC Experiment agent
// game, run from scripts/apply-schema.ts on every boot. It only acts
// when AGENTGAME_PURGE_HANDLES is set (comma-separated handles); with
// the variable unset it is a strict no-op, and it never touches an
// agent whose handle is not listed.
//
// For each listed handle that exists, IN THIS ORDER:
//   1. every solve's claimNonce is copied into the ClaimVoidedNonce
//      denylist — W1 claim codes are stateless signed tokens, so
//      voiding the nonce is the only way to kill an issued code
//      (lib/claims.ts rejects denylisted nonces at redemption);
//   2. the AgentGameAgent row is deleted, with its solves, attempts
//      and events (deleted explicitly rather than relying on the
//      ON DELETE CASCADE, so the purge does not depend on the
//      connection's foreign_keys pragma).
//
// Deleting the solves also returns their gens to the daily pool,
// which is summed live from today's solve rows. Idempotent: a listed
// handle that no longer exists is skipped, and INSERT OR IGNORE makes
// a re-run add no duplicate denylist rows. Keep the variable set only
// until the purge has run once in production, then unset it — the
// denylist rows (and the redemption check) stay forever.
import { Database } from "bun:sqlite";

export const AGENTGAME_PURGE_REASON = "qa-test-cleanup";

// Same handle shape the game itself accepts (agentgame-logic.ts).
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,23}$/;

export function parsePurgeHandles(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const handle = part.trim().toLowerCase();
    if (handle && HANDLE_RE.test(handle)) seen.add(handle);
  }
  return [...seen];
}

export function runAgentgamePurge(
  db: Database,
  handles: string[],
): { agentsRemoved: number; noncesVoided: number } {
  let agentsRemoved = 0;
  let noncesVoided = 0;
  if (handles.length === 0) return { agentsRemoved, noncesVoided };

  const denylist = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='ClaimVoidedNonce'")
    .get() as { name: string } | null;
  if (!denylist) {
    console.log("[boot] agentgame purge: ClaimVoidedNonce table missing — skipping purge");
    return { agentsRemoved, noncesVoided };
  }

  for (const handle of handles) {
    const agent = db
      .query('SELECT "id" FROM "AgentGameAgent" WHERE "handle" = ?')
      .get(handle) as { id: string } | null;
    if (!agent) continue;

    db.exec("BEGIN");
    try {
      const solves = db
        .query(
          'SELECT "claimNonce" FROM "AgentGameSolve" WHERE "agentId" = ? AND "claimNonce" IS NOT NULL',
        )
        .all(agent.id) as Array<{ claimNonce: string }>;
      let voidedHere = 0;
      for (const solve of solves) {
        const res = db
          .query('INSERT OR IGNORE INTO "ClaimVoidedNonce" ("nonce", "handle", "reason") VALUES (?, ?, ?)')
          .run(solve.claimNonce, handle, AGENTGAME_PURGE_REASON);
        voidedHere += res.changes;
      }
      db.query('DELETE FROM "AgentGameSolve" WHERE "agentId" = ?').run(agent.id);
      db.query('DELETE FROM "AgentGameAttempt" WHERE "agentId" = ?').run(agent.id);
      db.query('DELETE FROM "AgentGameEvent" WHERE "agentId" = ?').run(agent.id);
      db.query('DELETE FROM "AgentGameAgent" WHERE "id" = ?').run(agent.id);
      db.exec("COMMIT");
      agentsRemoved += 1;
      noncesVoided += voidedHere;
      console.log(
        `[boot] agentgame purge: removed agent ${handle} — ${voidedHere} claim nonce(s) voided`,
      );
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return { agentsRemoved, noncesVoided };
}

/** Boot entry point: read the gate variable, purge, log the totals. */
export function agentgamePurgeFromEnv(db: Database): void {
  const handles = parsePurgeHandles(process.env.AGENTGAME_PURGE_HANDLES);
  if (handles.length === 0) return;
  const { agentsRemoved, noncesVoided } = runAgentgamePurge(db, handles);
  console.log(
    `[boot] agentgame purge: done — ${agentsRemoved} agent(s) removed, ${noncesVoided} nonce(s) voided`,
  );
}
