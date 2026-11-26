import { createHash, createHmac, randomUUID } from "node:crypto";

export const BRIDGE_KEY_CLAIM_TTL_MS = 24 * 60 * 60_000;
export const KEY_CLAIM_PREFIX = "prk_";
export const UPDATE_TOKEN_PREFIX = "pru_";

export const hashKeyClaimCode = (code: string): string => createHash("sha256").update(code).digest("hex");
export const isKeyClaimCode = (code: string): boolean => code.startsWith(KEY_CLAIM_PREFIX);
export function isUsableKeyClaim(row: { userId: string; usedAt: Date | null; expiresAt: Date }, userId: string, now = Date.now()): boolean {
  return row.userId === userId && !row.usedAt && row.expiresAt.getTime() > now;
}

type ClaimRow = { id: string; userId: string; codeHash: string; usedAt: Date | null; expiresAt: Date };
type TokenRow = { id: string; userId: string; tokenHash: string; revokedAt: Date | null; createdAt: Date };

type HandoutStore = {
  findLiveToken(userId: string): Promise<TokenRow | null>;
  findLiveClaim(userId: string, now: Date): Promise<ClaimRow | null>;
  revokeTokens(userId: string, now: Date): Promise<number>;
  retireClaims(userId: string, now: Date): Promise<void>;
  createToken(row: Omit<TokenRow, "revokedAt">): Promise<void>;
  createClaim(row: Omit<ClaimRow, "usedAt">): Promise<void>;
};

function deriveCredential(secret: string, prefix: string, userId: string, id: string): string {
  return prefix + createHmac("sha256", secret)
    .update(JSON.stringify(["bridge-handout-v1", prefix, userId, id])).digest("base64url");
}

export async function handOutUpdateToken(store: HandoutStore, userId: string, secret: string, now: Date) {
  const live = await store.findLiveToken(userId);
  if (live) {
    const token = deriveCredential(secret, UPDATE_TOKEN_PREFIX, userId, live.id);
    if (hashKeyClaimCode(token) === live.tokenHash) return { token, createdAt: live.createdAt };
  }
  const id = randomUUID();
  const token = deriveCredential(secret, UPDATE_TOKEN_PREFIX, userId, id);
  await revokeKeyClaimCredentials(store, userId, now);
  await store.createToken({ id, userId, tokenHash: hashKeyClaimCode(token), createdAt: now });
  return { token, createdAt: now };
}

export async function handOutKeyClaim(store: HandoutStore, userId: string, secret: string, now: Date) {
  const { token } = await handOutUpdateToken(store, userId, secret, now);
  const live = await store.findLiveClaim(userId, now);
  if (live) {
    const code = deriveCredential(secret, KEY_CLAIM_PREFIX, userId, live.id);
    if (hashKeyClaimCode(code) === live.codeHash) return { code, expiresAt: live.expiresAt, token };
  }
  const id = randomUUID();
  const code = deriveCredential(secret, KEY_CLAIM_PREFIX, userId, id);
  const expiresAt = new Date(now.getTime() + BRIDGE_KEY_CLAIM_TTL_MS);
  await store.retireClaims(userId, now);
  await store.createClaim({ id, userId, codeHash: hashKeyClaimCode(code), expiresAt });
  return { code, expiresAt, token };
}

export async function revokeKeyClaimCredentials(store: Pick<HandoutStore, "revokeTokens" | "retireClaims">, userId: string, now: Date) {
  const count = await store.revokeTokens(userId, now);
  await store.retireClaims(userId, now);
  return count;
}

type ClaimFailure = "claim_invalid" | "claim_unknown" | "claim_used" | "claim_expired" | "token_invalid" |
  "token_revoked" | "member_mismatch" | "member_missing" | "engine_fetch_failed" | "claim_race_lost";

export function logKeyClaimFailure(reason: ClaimFailure | "request_invalid" | "foundation_write_failed" | "unexpected_error") {
  console.warn("[bridge:key-claim]", { reason });
}

export const KEY_CLAIM_REFUSAL = "That key claim is not valid.";

export class KeyClaimError extends Error {
  readonly status: 401 | 502;
  readonly reason: ClaimFailure;

  constructor(reason: ClaimFailure) {
    super(reason === "engine_fetch_failed" ? "The engine could not supply a durable key. Try again later." : KEY_CLAIM_REFUSAL);
    this.status = reason === "engine_fetch_failed" ? 502 : 401;
    this.reason = reason;
  }
}

function refuse(reason: ClaimFailure): never {
  logKeyClaimFailure(reason);
  throw new KeyClaimError(reason);
}

export type ClaimCommit = "claimed" | "token_revoked" | "claim_expired" | "claim_race_lost";

type ExchangeStore<Member, EngineResult> = {
  findToken(hash: string): Promise<TokenRow | null>;
  findClaim(hash: string): Promise<ClaimRow | null>;
  findMember(userId: string): Promise<Member | null>;
  fetchEngineKey(member: Member): Promise<EngineResult>;
  consume(claimId: string, tokenId: string, userId: string): Promise<ClaimCommit>;
};

export async function exchangeKeyClaim<Member, EngineResult>(
  store: ExchangeStore<Member, EngineResult>, rawCode: string, rawToken: string | null, clock = Date.now,
): Promise<{ member: EngineResult; userId: string }> {
  const code = rawCode.trim();
  if (!isKeyClaimCode(code)) refuse("claim_invalid");
  if (!rawToken?.startsWith(UPDATE_TOKEN_PREFIX)) refuse("token_invalid");
  const token = await store.findToken(hashKeyClaimCode(rawToken));
  if (!token) refuse("token_invalid");
  if (token.revokedAt) refuse("token_revoked");
  const claim = await store.findClaim(hashKeyClaimCode(code));
  if (!claim) refuse("claim_unknown");
  if (claim.userId !== token.userId) refuse("member_mismatch");
  if (claim.usedAt) refuse("claim_used");
  if (claim.expiresAt.getTime() <= clock()) refuse("claim_expired");
  const owner = await store.findMember(claim.userId);
  if (!owner) refuse("member_missing");
  let member: EngineResult;
  try { member = await store.fetchEngineKey(owner); }
  catch { refuse("engine_fetch_failed"); }
  const result = await store.consume(claim.id, token.id, token.userId);
  if (result !== "claimed") refuse(result);
  return { member, userId: claim.userId };
}
