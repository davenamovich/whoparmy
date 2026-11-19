import "server-only";

import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { mintClaimToken } from "@/lib/claims";
import {
  boardDisplay,
  boardTokens,
  BTCGAME_CASE_COUNT,
  drawBoard,
  gensForTokens,
  isSlot,
  OFFER_MILESTONES,
  offerAt,
  payoutTokens,
  tileById,
  tokensPerGen,
} from "./btcgame-logic";

export class BtcgameError extends Error {
  constructor(public code: string, public status: number = 400) {
    super(code);
  }
}

const fail = (code: string, status = 400): never => {
  throw new BtcgameError(code, status);
};

const processSecret = randomInt(0x7fffffff).toString(16);
const btcgameDb = db as any;

function btcgameSecret(): string {
  // PRODUCTION MUST SET BTCGAME_SECRET or DOORS_SECRET — the fallback keeps
  // dev/test self-consistent without ever logging or returning the value.
  return process.env.BTCGAME_SECRET || process.env.DOORS_SECRET || processSecret;
}

export function commitmentFor(sessionId: string, assignment: string[]): string {
  return createHash("sha256")
    .update(`${sessionId}:${JSON.stringify(assignment)}:${btcgameSecret()}`)
    .digest("hex");
}

async function logEvent(sessionId: string, type: string, payload?: unknown): Promise<void> {
  try {
    await btcgameDb.btcgameEvent.create({ data: { sessionId, type, payload: payload as object } });
  } catch (err) {
    console.error("[btcgame] event logging failed", err);
  }
}

function boardReveal(assignment: string[]) {
  return assignment.map((tileId, slot) => {
    const tile = tileById(tileId) ?? fail("board_corrupt", 500);
    return { slot, tileId, type: tile.type, vt: tile.vt, kind: tile.kind };
  });
}

function finishPayload(session: {
  commitmentHash: string;
  assignment: unknown;
  finalTokens: number | null;
  gensAwarded: number;
  claimToken: string | null;
  perks: unknown;
}) {
  const assignment = session.assignment as string[];
  return {
    state: "finished" as const,
    finalTokens: session.finalTokens ?? 0,
    gensAwarded: session.gensAwarded,
    tokensPerGen: tokensPerGen(),
    perks: (session.perks as unknown[]) ?? [],
    claimUrl: session.claimToken
      ? `https://whop.plunderandriffle.com/claim?code=${session.claimToken}`
      : null,
    commitmentHash: session.commitmentHash,
    board: boardReveal(assignment),
  };
}

export async function createBtcgameSession() {
  const assignment = drawBoard((n) => randomInt(n));
  // The commitment needs the final Prisma-generated id, so create first and update second.
  const session = await btcgameDb.btcgameSession.create({
    data: { assignment, commitmentHash: "pending" },
  });
  const commitmentHash = commitmentFor(session.id, assignment);
  await btcgameDb.btcgameSession.update({ where: { id: session.id }, data: { commitmentHash } });
  await logEvent(session.id, "game_start");
  return {
    sessionId: session.id,
    commitmentHash,
    caseCount: BTCGAME_CASE_COUNT,
    tokensPerGen: tokensPerGen(),
    boardTotalTokens: boardTokens(assignment),
    boardTiles: boardDisplay(),
    offers: OFFER_MILESTONES.map((offer) => ({
      afterOpens: offer.afterOpens,
      gens: offer.gens,
      perks: offer.perks,
      tokensValue: offer.gens * tokensPerGen(),
    })),
  };
}

export async function pickBtcgameCase(sessionId: unknown, slot: unknown) {
  if (typeof sessionId !== "string" || !sessionId) fail("invalid_pick");
  if (!isSlot(slot)) fail("invalid_pick");
  const session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "finished") fail("game_finished");
  if (session.state === "offer") fail("offer_pending");

  const pickSlot = slot as number;
  const picks = (session.picks as number[]) ?? [];
  if (picks.includes(pickSlot)) fail("already_picked");
  const assignment = session.assignment as string[];
  const tileId = assignment[pickSlot]!;
  const tile = tileById(tileId) ?? fail("board_corrupt", 500);
  const tokens = tile.vt;
  const newPicks = [...picks, pickSlot];
  const newBanked = session.bankedTokens + tokens;
  const perks = [...((session.perks as unknown[]) ?? [])];
  if (tile.type === "boost" && tile.kind) perks.push({ kind: tile.kind, slot: pickSlot });
  const milestone = offerAt(newPicks.length);
  const nextState = milestone ? "offer" : "playing";
  const pendingOffer = nextState === "offer" && milestone ? milestone.index : null;
  const claim = await btcgameDb.btcgameSession.updateMany({
    where: { id: session.id, version: session.version },
    data: { picks: newPicks, bankedTokens: newBanked, perks, state: nextState, pendingOffer, version: { increment: 1 } },
  });
  if (claim.count !== 1) fail("stale_state");

  await logEvent(session.id, "case_pick", { slot: pickSlot });
  await logEvent(session.id, "reveal", { slot: pickSlot, tileId, type: tile.type, vt: tile.vt, kind: tile.kind });
  if (milestone && nextState === "offer") {
    await logEvent(session.id, "offer_presented", { milestone: milestone.index, gens: milestone.milestone.gens });
  }
  const revealPayload = {
    slot: pickSlot,
    prize: { type: tile.type, vt: tile.vt, kind: tile.kind },
    tileId,
    bankedTokens: newBanked,
    perks,
    picksCount: newPicks.length,
    state: nextState,
    offer: milestone && nextState === "offer"
      ? { index: milestone.index, afterOpens: milestone.milestone.afterOpens, gens: milestone.milestone.gens, perks: milestone.milestone.perks, tokensValue: milestone.milestone.gens * tokensPerGen() }
      : null,
    finished: null as ReturnType<typeof finishPayload> | null,
  };
  if (newPicks.length === BTCGAME_CASE_COUNT) {
    return { ...revealPayload, finished: await finishBtcgameSession(session.id, null) };
  }
  return revealPayload;
}

export async function decideBtcgameOffer(sessionId: unknown, take: unknown) {
  if (typeof sessionId !== "string" || !sessionId || typeof take !== "boolean") fail("invalid_decision");
  const session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state !== "offer" || session.pendingOffer === null) fail("no_offer_now");
  const milestone = OFFER_MILESTONES[session.pendingOffer];
  if (!milestone) fail("board_corrupt", 500);
  const offers = [...((session.offers as unknown[]) ?? []), { milestone: session.pendingOffer, gens: milestone.gens, decision: take ? "take_it" : "keep_playing" }];
  const claim = await btcgameDb.btcgameSession.updateMany({
    where: { id: session.id, version: session.version },
    data: { offers, pendingOffer: null, state: "playing", version: { increment: 1 } },
  });
  if (claim.count !== 1) fail("stale_state");
  await logEvent(session.id, take ? "offer_accepted" : "offer_declined", { milestone: session.pendingOffer, gens: milestone.gens });
  if (take) return { decision: "take_it" as const, finished: await finishBtcgameSession(session.id, milestone.gens) };
  return { decision: "keep_playing" as const, state: "playing" as const, bankedTokens: session.bankedTokens, picksCount: (session.picks as number[]).length, finished: null };
}

export async function finishBtcgameSession(sessionId: string, acceptedOfferGens: number | null) {
  let session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "finished") return finishPayload(session);
  if (session.state === "offer") fail("offer_pending");
  const finalTokens = payoutTokens(session.bankedTokens, acceptedOfferGens);
  const gens = gensForTokens(finalTokens);
  let token: string | null = null;
  let nonce: string | null = null;
  if (gens >= 1) {
    try {
      token = mintClaimToken({ amount: gens, source: `btcgame:${sessionId}` });
      nonce = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()).nonce;
    } catch (err) {
      if (err instanceof Error && err.message === "CLAIM_NOT_CONFIGURED") fail("claims_not_configured", 503);
      throw err;
    }
  }
  const result = await db.$transaction(async (tx) => {
    const transactionDb = tx as any;
    return transactionDb.btcgameSession.updateMany({
      where: { id: session.id, state: { not: "finished" }, version: session.version },
      data: { state: "finished", finalTokens, gensAwarded: gens, claimNonce: nonce, claimToken: token, finishedAt: new Date(), version: { increment: 1 } },
    });
  });
  if (result.count !== 1) {
    session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
    if (session?.state === "finished") return finishPayload(session);
    fail("stale_state");
  }
  session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  await logEvent(session.id, "game_finish", { finalTokens, gensAwarded: gens, acceptedOfferGens });
  if (token) await logEvent(session.id, "claim_minted", { gens });
  return finishPayload(session);
}

export async function bankBtcgameSession(sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId) fail("session_not_found", 404);
  const session = await btcgameDb.btcgameSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "offer") fail("offer_pending");
  return finishBtcgameSession(sessionId as string, null);
}
