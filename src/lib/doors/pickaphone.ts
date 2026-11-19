import "server-only";

import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { mintClaimToken } from "@/lib/claims";
import {
  assetById,
  drawBoard,
  gensForTokens,
  isSlot,
  OFFER_MILESTONES,
  offerAt,
  payoutTokens,
  PICKAPHONE_PHONE_COUNT,
  RARITY_TOKENS,
  tokensPerGen,
} from "./pickaphone-logic";

export class PickaphoneError extends Error {
  constructor(public code: string, public status: number = 400) {
    super(code);
  }
}

const fail = (code: string, status = 400): never => {
  throw new PickaphoneError(code, status);
};

const processSecret = randomInt(0x7fffffff).toString(16);
const pickaphoneDb = db as any;

function pickaphoneSecret(): string {
  // PRODUCTION MUST SET PICKAPHONE_SECRET or DOORS_SECRET — the fallback keeps
  // dev/test self-consistent without ever logging or returning the value.
  return process.env.PICKAPHONE_SECRET || process.env.DOORS_SECRET || processSecret;
}

export function commitmentFor(sessionId: string, assignment: string[]): string {
  return createHash("sha256")
    .update(`${sessionId}:${JSON.stringify(assignment)}:${pickaphoneSecret()}`)
    .digest("hex");
}

async function logEvent(sessionId: string, type: string, payload?: unknown): Promise<void> {
  try {
    await pickaphoneDb.pickaphoneEvent.create({ data: { sessionId, type, payload: payload as object } });
  } catch (err) {
    console.error("[pickaphone] event logging failed", err);
  }
}

function boardReveal(assignment: string[]) {
  return assignment.map((assetId, slot) => {
    const asset = assetById(assetId) ?? fail("board_corrupt", 500);
    return { slot, assetId, rarity: asset.rarity, tokens: RARITY_TOKENS[asset.rarity] };
  });
}

function finishPayload(session: {
  commitmentHash: string;
  assignment: unknown;
  finalTokens: number | null;
  gensAwarded: number;
  claimToken: string | null;
}) {
  const assignment = session.assignment as string[];
  return {
    state: "finished" as const,
    finalTokens: session.finalTokens ?? 0,
    gensAwarded: session.gensAwarded,
    tokensPerGen: tokensPerGen(),
    claimUrl: session.claimToken
      ? `https://whop.plunderandriffle.com/claim?code=${session.claimToken}`
      : null,
    commitmentHash: session.commitmentHash,
    board: boardReveal(assignment),
  };
}

export async function createPickaphoneSession() {
  const assignment = drawBoard((n) => randomInt(n));
  // The commitment needs the final Prisma-generated id, so create first and update second.
  const session = await pickaphoneDb.pickaphoneSession.create({
    data: { assignment, commitmentHash: "pending" },
  });
  const commitmentHash = commitmentFor(session.id, assignment);
  await pickaphoneDb.pickaphoneSession.update({ where: { id: session.id }, data: { commitmentHash } });
  await logEvent(session.id, "game_start");
  return {
    sessionId: session.id,
    commitmentHash,
    phoneCount: PICKAPHONE_PHONE_COUNT,
    tokensPerGen: tokensPerGen(),
    boardTotalTokens: assignment.reduce((sum, id) => sum + RARITY_TOKENS[assetById(id)!.rarity], 0),
    offers: OFFER_MILESTONES.map((offer) => ({
      afterReveals: offer.afterReveals,
      gens: offer.gens,
      perks: offer.perks,
      tokensValue: offer.gens * tokensPerGen(),
    })),
  };
}

export async function pickPickaphonePhone(sessionId: unknown, slot: unknown) {
  if (typeof sessionId !== "string" || !sessionId) fail("invalid_pick");
  if (!isSlot(slot)) fail("invalid_pick");
  const session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "finished") fail("game_finished");
  if (session.state === "offer") fail("offer_pending");

  const pickSlot = slot as number;
  const picks = (session.picks as number[]) ?? [];
  if (picks.includes(pickSlot)) fail("already_picked");
  const assignment = session.assignment as string[];
  const assetId = assignment[pickSlot]!;
  const asset = assetById(assetId) ?? fail("board_corrupt", 500);
  const tokens = RARITY_TOKENS[asset.rarity];
  const newPicks = [...picks, pickSlot];
  const newBanked = session.bankedTokens + tokens;
  const milestone = offerAt(newPicks.length);
  const nextState = milestone ? "offer" : "playing";
  const pendingOffer = nextState === "offer" && milestone ? milestone.index : null;
  const claim = await pickaphoneDb.pickaphoneSession.updateMany({
    where: { id: session.id, version: session.version },
    data: { picks: newPicks, bankedTokens: newBanked, state: nextState, pendingOffer, version: { increment: 1 } },
  });
  if (claim.count !== 1) fail("stale_state");

  await logEvent(session.id, "phone_pick", { slot: pickSlot });
  await logEvent(session.id, "reveal", { slot: pickSlot, assetId, rarity: asset.rarity, tokens });
  if (milestone && nextState === "offer") {
    await logEvent(session.id, "offer_presented", { milestone: milestone.index, gens: milestone.milestone.gens });
  }
  const revealPayload = {
    slot: pickSlot,
    asset: { id: asset.id, file: asset.file, type: asset.type, caption: asset.caption, category: asset.category },
    rarity: asset.rarity,
    tokens,
    bankedTokens: newBanked,
    picksCount: newPicks.length,
    state: nextState,
    offer: milestone && nextState === "offer"
      ? { index: milestone.index, afterReveals: milestone.milestone.afterReveals, gens: milestone.milestone.gens, perks: milestone.milestone.perks, tokensValue: milestone.milestone.gens * tokensPerGen() }
      : null,
    finished: null as ReturnType<typeof finishPayload> | null,
  };
  if (newPicks.length === PICKAPHONE_PHONE_COUNT) {
    return { ...revealPayload, finished: await finishPickaphoneSession(session.id, null) };
  }
  return revealPayload;
}

export async function decidePickaphoneOffer(sessionId: unknown, take: unknown) {
  if (typeof sessionId !== "string" || !sessionId || typeof take !== "boolean") fail("invalid_decision");
  const session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state !== "offer" || session.pendingOffer === null) fail("no_offer_now");
  const milestone = OFFER_MILESTONES[session.pendingOffer];
  if (!milestone) fail("board_corrupt", 500);
  const offers = [...((session.offers as unknown[]) ?? []), { milestone: session.pendingOffer, gens: milestone.gens, decision: take ? "take_it" : "keep_playing" }];
  const claim = await pickaphoneDb.pickaphoneSession.updateMany({
    where: { id: session.id, version: session.version },
    data: { offers, pendingOffer: null, state: "playing", version: { increment: 1 } },
  });
  if (claim.count !== 1) fail("stale_state");
  await logEvent(session.id, take ? "offer_accepted" : "offer_declined", { milestone: session.pendingOffer, gens: milestone.gens });
  if (take) return { decision: "take_it" as const, finished: await finishPickaphoneSession(session.id, milestone.gens) };
  return { decision: "keep_playing" as const, state: "playing" as const, bankedTokens: session.bankedTokens, picksCount: (session.picks as number[]).length, finished: null };
}

export async function finishPickaphoneSession(sessionId: string, acceptedOfferGens: number | null) {
  let session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "finished") return finishPayload(session);
  if (session.state === "offer") fail("offer_pending");
  const finalTokens = payoutTokens(session.bankedTokens, acceptedOfferGens);
  const gens = gensForTokens(finalTokens);
  let token: string | null = null;
  let nonce: string | null = null;
  if (gens >= 1) {
    try {
      token = mintClaimToken({ amount: gens, source: `pickaphone:${sessionId}` });
      nonce = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()).nonce;
    } catch (err) {
      if (err instanceof Error && err.message === "CLAIM_NOT_CONFIGURED") fail("claims_not_configured", 503);
      throw err;
    }
  }
  const result = await db.$transaction(async (tx) => {
    const transactionDb = tx as any;
    return transactionDb.pickaphoneSession.updateMany({
      where: { id: session.id, state: { not: "finished" }, version: session.version },
      data: { state: "finished", finalTokens, gensAwarded: gens, claimNonce: nonce, claimToken: token, finishedAt: new Date(), version: { increment: 1 } },
    });
  });
  if (result.count !== 1) {
    session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
    if (session?.state === "finished") return finishPayload(session);
    fail("stale_state");
  }
  session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  await logEvent(session.id, "game_finish", { finalTokens, gensAwarded: gens, acceptedOfferGens });
  if (token) await logEvent(session.id, "claim_minted", { gens });
  return finishPayload(session);
}

export async function bankPickaphoneSession(sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId) fail("session_not_found", 404);
  const session = await pickaphoneDb.pickaphoneSession.findUnique({ where: { id: sessionId } });
  if (!session) fail("session_not_found", 404);
  if (session.state === "offer") fail("offer_pending");
  return finishPickaphoneSession(sessionId as string, null);
}
