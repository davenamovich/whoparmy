import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  BRIDGE_KEY_CLAIM_TTL_MS, KEY_CLAIM_REFUSAL, KeyClaimError, exchangeKeyClaim,
  handOutKeyClaim, handOutUpdateToken, hashKeyClaimCode, revokeKeyClaimCredentials,
  type ClaimCommit,
} from "./key-claim-core.ts";

const USER = "user_owner";
const SECRET = "handout-test-secret";
const ENGINE = { key: "engine-test-key" };
const NOW = Date.parse("2026-11-25T12:00:00Z");

function fixture(context: TestContext) {
  type Store = Parameters<typeof handOutKeyClaim>[0];
  const claims: (Parameters<Store["createClaim"]>[0] & { usedAt: Date | null })[] = [];
  const tokens: (Parameters<Store["createToken"]>[0] & { revokedAt: Date | null })[] = [];
  const log = context.mock.method(console, "warn", () => undefined);
  let now = NOW;
  const store: Store = {
    findLiveToken: async (userId) => tokens.find((row) => row.userId === userId && !row.revokedAt) ?? null,
    findLiveClaim: async (userId, at) => claims.find((row) => row.userId === userId && !row.usedAt && row.expiresAt > at) ?? null,
    revokeTokens: async (userId, at) => {
      const live = tokens.filter((row) => row.userId === userId && !row.revokedAt);
      for (const row of live) row.revokedAt = at;
      return live.length;
    },
    retireClaims: async (userId, at) => {
      for (const row of claims) if (row.userId === userId && !row.usedAt && row.expiresAt > at) row.usedAt = at;
    },
    createClaim: async (row) => { claims.push({ ...row, usedAt: null }); },
    createToken: async (row) => { tokens.push({ ...row, revokedAt: null }); },
  };
  const exchangeStore = {
    findToken: async (hash: string) => tokens.find((row) => row.tokenHash === hash) ?? null,
    findClaim: async (hash: string) => claims.find((row) => row.codeHash === hash) ?? null,
    findMember: async (userId: string) => ({ userId }),
    fetchEngineKey: async () => ENGINE,
    consume: async (claimId: string, tokenId: string, userId: string): Promise<ClaimCommit> => {
      if (!tokens.some((row) => row.id === tokenId && row.userId === userId && !row.revokedAt)) return "token_revoked";
      const claim = claims.find((row) => row.id === claimId && row.userId === userId);
      if (!claim || claim.usedAt) return "claim_race_lost";
      if (claim.expiresAt.getTime() <= now) return "claim_expired";
      claim.usedAt = new Date(now);
      return "claimed";
    },
  };
  return {
    store, exchangeStore, claims, tokens, log,
    advance: (ms: number) => { now += ms; },
    handout: (userId = USER) => handOutKeyClaim(store, userId, SECRET, new Date(now)),
    token: (userId = USER) => handOutUpdateToken(store, userId, SECRET, new Date(now)),
    revoke: () => revokeKeyClaimCredentials(store, USER, new Date(now)),
    exchange: (code: string, token: string | null) => exchangeKeyClaim(exchangeStore, code, token, () => now),
  };
}

async function expectRefusal(state: ReturnType<typeof fixture>, attempt: Promise<unknown>, reason: KeyClaimError["reason"], status = 401) {
  await assert.rejects(attempt, (error) => {
    assert.ok(error instanceof KeyClaimError);
    assert.equal(error.reason, reason);
    assert.equal(error.status, status);
    if (status === 401) assert.equal(error.message, KEY_CLAIM_REFUSAL);
    else assert.notEqual(error.message, KEY_CLAIM_REFUSAL);
    return true;
  });
  assert.deepEqual(state.log.mock.calls.at(-1)?.arguments, ["[bridge:key-claim]", { reason }]);
}

test("claim handout stores SHA-256 only and sets a 24-hour TTL", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  assert.match(pair.code, /^prk_[A-Za-z0-9_-]{43}$/);
  assert.match(pair.token, /^pru_[A-Za-z0-9_-]{43}$/);
  assert.equal(pair.expiresAt.getTime(), NOW + BRIDGE_KEY_CLAIM_TTL_MS);
  assert.match(state.claims[0].codeHash, /^[a-f0-9]{64}$/);
  assert.equal(state.claims[0].codeHash, hashKeyClaimCode(pair.code));
  assert.equal(state.tokens[0].tokenHash, hashKeyClaimCode(pair.token));
  const stored = JSON.stringify([state.claims, state.tokens]);
  assert.ok(!stored.includes(pair.code) && !stored.includes(pair.token));
});

test("repeat handouts while the first pair is in flight preserve that pair", async (context) => {
  const state = fixture(context);
  const first = await state.handout();
  state.advance(1_000);
  assert.equal((await state.token()).token, first.token);
  assert.deepEqual(await state.handout(), first);
  assert.equal(state.claims.length, 1);
  assert.equal(state.tokens.length, 1);
  assert.deepEqual(await state.exchange(first.code, first.token), { member: ENGINE, userId: USER });
});

test("explicit revocation retires the claim and the replacement pair exchanges", async (context) => {
  const state = fixture(context);
  const first = await state.handout();
  assert.equal(await state.revoke(), 1);
  const next = await state.handout();
  assert.notEqual(next.token, first.token);
  assert.notEqual(next.code, first.code);
  await expectRefusal(state, state.exchange(first.code, first.token), "token_revoked");
  await expectRefusal(state, state.exchange(first.code, next.token), "claim_used");
  await state.exchange(next.code, next.token);
});

test("revocation during the engine fetch prevents key delivery", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  state.exchangeStore.fetchEngineKey = async () => { await state.revoke(); return ENGINE; };
  await expectRefusal(state, state.exchange(pair.code, pair.token), "token_revoked");
});

test("expired claim is refused and replaced without rotating the update token", async (context) => {
  const state = fixture(context);
  const first = await state.handout();
  state.advance(BRIDGE_KEY_CLAIM_TTL_MS);
  const next = await state.handout();
  await expectRefusal(state, state.exchange(first.code, first.token), "claim_expired");
  assert.notEqual(first.code, next.code);
  assert.equal(first.token, next.token);
  await state.exchange(next.code, next.token);
});

test("expiry during the engine fetch prevents key delivery", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  state.exchangeStore.fetchEngineKey = async () => { state.advance(BRIDGE_KEY_CLAIM_TTL_MS); return ENGINE; };
  await expectRefusal(state, state.exchange(pair.code, pair.token), "claim_expired");
  assert.equal(state.claims[0].usedAt, null);
});

test("legacy hash-only credentials exchange until a new handout replaces them once", async (context) => {
  const state = fixture(context);
  const code = "prk_legacy";
  const token = "pru_legacy";
  const createdAt = new Date(NOW);
  const expiresAt = new Date(NOW + BRIDGE_KEY_CLAIM_TTL_MS);
  await state.store.createToken({ id: "legacy-token", userId: USER, tokenHash: hashKeyClaimCode(token), createdAt });
  await state.store.createClaim({ id: "legacy-claim", userId: USER, codeHash: hashKeyClaimCode(code), expiresAt });
  await state.exchange(code, token);
  await state.store.createClaim({ id: "legacy-pending", userId: USER, codeHash: hashKeyClaimCode("prk_legacy_pending"), expiresAt });
  const next = await state.handout();
  await expectRefusal(state, state.exchange("prk_legacy_pending", token), "token_revoked");
  assert.deepEqual(await state.handout(), next);
  await state.exchange(next.code, next.token);
});

test("used claim is refused and replaced without rotating the update token", async (context) => {
  const state = fixture(context);
  const first = await state.handout();
  await state.exchange(first.code, first.token);
  await expectRefusal(state, state.exchange(first.code, first.token), "claim_used");
  const next = await state.handout();
  assert.notEqual(first.code, next.code);
  assert.equal(first.token, next.token);
  await state.exchange(next.code, next.token);
});

test("an update token belonging to another member is refused", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  const other = await state.token("user_other");
  await expectRefusal(state, state.exchange(pair.code, other.token), "member_mismatch");
  await state.exchange(pair.code, pair.token);
});

test("engine failure is 502, logs no secret, and leaves a retryable claim", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  state.exchangeStore.fetchEngineKey = async () => { throw new Error(ENGINE.key); };
  await expectRefusal(state, state.exchange(pair.code, pair.token), "engine_fetch_failed", 502);
  assert.equal(state.claims[0].usedAt, null);
  state.exchangeStore.fetchEngineKey = async () => ENGINE;
  await state.exchange(pair.code, pair.token);
});

test("concurrent exchanges allow one key delivery and log the lost claim race", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  const result = await Promise.allSettled([state.exchange(pair.code, pair.token), state.exchange(pair.code, pair.token)]);
  assert.equal(result.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const loser = result.find((attempt) => attempt.status === "rejected");
  assert.ok(loser);
  await expectRefusal(state, Promise.reject(loser.reason), "claim_race_lost");
});

test("unrecognized claim, malformed claim, and invalid token log distinct reasons", async (context) => {
  const state = fixture(context);
  const pair = await state.handout();
  await expectRefusal(state, state.exchange("prk_unknown", pair.token), "claim_unknown");
  await expectRefusal(state, state.exchange("wrong_format", pair.token), "claim_invalid");
  await expectRefusal(state, state.exchange(pair.code, "pru_unknown"), "token_invalid");
});
