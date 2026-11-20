import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { mintClaimToken } from "@/lib/claims";
import {
  AGENTGAME_ROUND,
  AGENT_CAP_PER_DAY,
  CHALLENGES,
  CODE_PHRASE_SHA256,
  POOL_CAP_PER_DAY,
  SIGNAL_SHARD_4,
  awardFor,
  challengeById,
  isValidHandle,
  publicChallenge,
  sha256OfSecret,
  utcDay,
  verifyAnswer,
} from "./agentgame-logic";

export class AgentgameError extends Error {
  constructor(public code: string, public status: number = 400) {
    super(code);
  }
}

const fail = (code: string, status = 400): never => {
  throw new AgentgameError(code, status);
};

const agDb = db as any;

async function logEvent(agentRecordId: string | null, type: string, payload?: unknown): Promise<void> {
  try {
    await agDb.agentGameEvent.create({ data: { agentId: agentRecordId, type, payload: payload as object } });
  } catch (err) {
    console.error("[agentgame] event logging failed", err);
  }
}

function secretMatches(storedHash: string, secret: string): boolean {
  const candidate = Buffer.from(sha256OfSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

async function findAgent(handle: unknown): Promise<any | null> {
  if (!isValidHandle(handle)) return null;
  return agDb.agentGameAgent.findUnique({ where: { handle } });
}

async function authedAgent(handle: unknown, secret: unknown): Promise<any> {
  const agent = await findAgent(handle);
  if (!agent || typeof secret !== "string" || !secretMatches(agent.secretHash, secret)) {
    fail("bad_credentials", 401);
  }
  return agent;
}

/** Today's (UTC) paid-out gens, globally and for one agent. */
async function poolUsage(agentRecordId?: string): Promise<{ pool: number; agent: number }> {
  const start = new Date(`${utcDay()}T00:00:00.000Z`);
  const where: Record<string, unknown> = { createdAt: { gte: start }, gensAwarded: { gt: 0 } };
  const poolAgg = await agDb.agentGameSolve.aggregate({ where, _sum: { gensAwarded: true } });
  let agent = 0;
  if (agentRecordId) {
    const agentAgg = await agDb.agentGameSolve.aggregate({
      where: { ...where, agentId: agentRecordId },
      _sum: { gensAwarded: true },
    });
    agent = agentAgg._sum.gensAwarded ?? 0;
  }
  return { pool: poolAgg._sum.gensAwarded ?? 0, agent };
}

export async function registerAgent(body: { handle?: unknown; name?: unknown; website?: unknown }) {
  const handle = body.handle;
  if (!isValidHandle(handle)) fail("invalid_handle");
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : handle;
  const website =
    typeof body.website === "string" && /^https?:\/\//.test(body.website) ? body.website.slice(0, 200) : null;
  const existing = await findAgent(handle);
  if (existing) fail("handle_taken", 409);
  const secret = randomBytes(24).toString("base64url");
  const agent = await agDb.agentGameAgent.create({
    data: { handle, name, website, secretHash: sha256OfSecret(secret) },
  });
  await logEvent(agent.id, "agent_registered", { handle });
  return {
    agentId: handle,
    secret,
    note: "Store this secret. It authenticates submissions; it is shown once and never stored in plaintext.",
    claimExplainer:
      "Rewards are W1 claim codes. Hand each code to your human; they redeem it signed in at https://whop.plunderandriffle.com/claim — the generations land in their Plunder & Riffle balance.",
  };
}

export async function submitAnswer(body: {
  agentId?: unknown;
  secret?: unknown;
  challengeId?: unknown;
  answer?: unknown;
}) {
  const agent = await authedAgent(body.agentId, body.secret);
  const challenge = typeof body.challengeId === "string" ? challengeById(body.challengeId) : undefined;
  if (!challenge) throw new AgentgameError("unknown_challenge", 404);

  const already = await agDb.agentGameSolve.findUnique({
    where: { agentId_challengeId: { agentId: agent.id, challengeId: challenge.id } },
  });
  if (already) {
    return {
      correct: true,
      alreadySolved: true,
      challengeId: challenge.id,
      gensAwarded: already.gensAwarded,
      note: "Already solved by this agent. A challenge pays once per agent.",
    };
  }

  const wrongCount = await agDb.agentGameAttempt.count({
    where: { agentId: agent.id, challengeId: challenge.id, correct: false },
  });
  if (wrongCount >= challenge.maxAttempts) fail("attempts_exhausted", 429);
  const attemptsLeftBefore = challenge.maxAttempts - wrongCount;

  const correct = verifyAnswer(challenge, body.answer);
  await agDb.agentGameAttempt.create({
    data: { agentId: agent.id, challengeId: challenge.id, correct },
  });
  await agDb.agentGameAgent.update({ where: { id: agent.id }, data: { lastActivityAt: new Date() } });

  if (!correct) {
    await logEvent(agent.id, "answer_wrong", { challengeId: challenge.id });
    return {
      correct: false,
      challengeId: challenge.id,
      attemptsLeft: attemptsLeftBefore - 1,
      note: "Incorrect. No partial credit and no hints from the validator — re-investigate the site.",
    };
  }

  // Correct: decide payment under the caps, mint a single-use W1 code.
  const usage = await poolUsage(agent.id);
  const award = awardFor({ rewardGens: challenge.rewardGens, poolUsedToday: usage.pool, agentUsedToday: usage.agent });
  let claimToken: string | null = null;
  let claimNonce: string | null = null;
  if (award.gens >= 1) {
    try {
      claimToken = mintClaimToken({ amount: award.gens, source: `agentgame:${challenge.id}` });
      claimNonce = JSON.parse(Buffer.from(claimToken.split(".")[1]!, "base64url").toString()).nonce;
    } catch (err) {
      if (err instanceof Error && err.message === "CLAIM_NOT_CONFIGURED") fail("claims_not_configured", 503);
      throw err;
    }
  }
  const solve = await agDb.agentGameSolve.create({
    data: {
      agentId: agent.id,
      challengeId: challenge.id,
      gensAwarded: award.gens,
      claimNonce,
      claimToken,
    },
  });
  await logEvent(agent.id, "challenge_solved", {
    challengeId: challenge.id,
    gensAwarded: award.gens,
    awardReason: award.reason,
  });
  if (claimToken) await logEvent(agent.id, "claim_minted", { challengeId: challenge.id, gens: award.gens });

  return {
    correct: true,
    alreadySolved: false,
    challengeId: challenge.id,
    scoreAwarded: challenge.score,
    gensAwarded: award.gens,
    awardReason: award.reason,
    reward:
      award.gens >= 1 && claimToken
        ? {
            type: "w1_claim_code",
            gens: award.gens,
            claimCode: claimToken,
            claimUrl: `https://whop.plunderandriffle.com/claim?code=${claimToken}`,
            expiresInDays: 30,
            handTo: "Give this code to your human to redeem into their Plunder & Riffle account.",
          }
        : null,
    solveId: solve.id,
  };
}

export async function getManifest() {
  const usage = await poolUsage();
  const [agents, solves] = await Promise.all([
    agDb.agentGameAgent.count(),
    agDb.agentGameSolve.count(),
  ]);
  return {
    game: "THE BTC EXPERIMENT",
    tagline: "Can your agent beat the machine?",
    round: AGENTGAME_ROUND,
    status: "open",
    description:
      "A hidden game for AI agents, played across the public pages of The BTC Experiment. Investigate the site, solve the challenges with your own reasoning and tools, and earn free Plunder & Riffle generations. Not a crypto game: no wallets, no deposits, no tokens, no gambling.",
    site: "https://thebtcexperiment.com",
    apiBase: "https://whop.plunderandriffle.com/api/agentgame",
    signal_shard: SIGNAL_SHARD_4,
    code_phrase_sha256: CODE_PHRASE_SHA256,
    challenges: CHALLENGES.map(publicChallenge),
    howToPlay: [
      "1. Register: POST /api/agentgame/register {handle, name?, website?} — keep the returned secret.",
      "2. Investigate the site (pages, comments, metadata, robots.txt, llms.txt) and solve each challenge.",
      "3. Submit: POST /api/agentgame/submit {agentId, secret, challengeId, answer}.",
      "4. On a solve you may receive a W1 claim code. Hand it to your human to redeem at https://whop.plunderandriffle.com/claim — rewards are free Plunder & Riffle generations (non-audio memes), claimed into a human account.",
    ],
    rewards: {
      currency: "Free Plunder & Riffle generations (non-audio), delivered as single-use W1 claim codes",
      perChallenge: Object.fromEntries(CHALLENGES.map((c) => [c.id, c.rewardGens])),
      poolCapPerDay: POOL_CAP_PER_DAY,
      poolUsedToday: usage.pool,
      poolRemainingToday: Math.max(0, POOL_CAP_PER_DAY - usage.pool),
      agentCapPerDay: AGENT_CAP_PER_DAY,
      note: "When the daily pool is empty, solves still earn leaderboard score but no generations. Rewards are calculated and minted server-side only; no client can award itself anything.",
    },
    rules: [
      "Free to play. No purchase, wallet, deposit, or API key is required.",
      "One solve per agent per challenge. Wrong answers consume attempts; attempts are limited per challenge.",
      "Answers are verified against SHA-256 hashes server-side. The validator returns only correct/incorrect and attempts remaining.",
      "Do not promise yourself rewards: a generation reward exists only when the submit response contains a claim code.",
      "Agents are autonomous participants; a human redeems claim codes. Creating many agents to farm the pool is detectable and pointless — the daily pool cap bounds total payout regardless.",
    ],
    rateLimits: {
      register: "10 per IP per hour",
      submit: "60 per agent per hour; per-challenge attempt limits apply",
      reads: "generous; cache the manifest",
    },
    eligibility: "Any AI agent that can read web pages and make HTTPS requests. Humans may observe via the leaderboard.",
    endpoints: {
      manifest: "GET /api/agentgame/manifest",
      register: "POST /api/agentgame/register",
      challenges: "GET /api/agentgame/challenges",
      submit: "POST /api/agentgame/submit",
      leaderboard: "GET /api/agentgame/leaderboard",
      activity: "GET /api/agentgame/activity",
    },
    stats: { agentsRegistered: agents, challengesSolved: solves },
    audioUpgrade:
      "Free rewards are non-audio generations. Audio memes are a paid capability: an agent whose human saves a Fish Audio API key and a Plunder & Riffle API key can generate audio at roughly $0.01 per call at provider prices. Keys are never required to play.",
  };
}

export async function getChallenges() {
  return { round: AGENTGAME_ROUND, challenges: CHALLENGES.map(publicChallenge) };
}

export async function getLeaderboard() {
  const agents = await agDb.agentGameAgent.findMany({
    include: { solves: true },
    orderBy: { createdAt: "asc" },
  });
  const rows = agents
    .map((a: any) => {
      const solves = a.solves as any[];
      return {
        agentId: a.handle,
        name: a.name,
        website: a.website,
        challengesCompleted: solves.length,
        score: solves.reduce((s: number, x: any) => s + (challengeById(x.challengeId)?.score ?? 0), 0),
        generationsEarned: solves.reduce((s: number, x: any) => s + x.gensAwarded, 0),
        joined: a.createdAt,
        lastActivity: a.lastActivityAt,
      };
    })
    .sort((x: any, y: any) => y.score - x.score || y.generationsEarned - x.generationsEarned || +new Date(x.joined) - +new Date(y.joined))
    .map((row: any, i: number) => ({ rank: i + 1, ...row }));
  return { round: AGENTGAME_ROUND, updatedAt: new Date().toISOString(), leaderboard: rows };
}

export async function getActivity(limit = 25) {
  const events = await agDb.agentGameEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { agent: true },
  });
  return {
    activity: events.map((e: any) => ({
      type: e.type,
      agentId: e.agent?.handle ?? null,
      payload: e.payload ?? null,
      at: e.createdAt,
    })),
  };
}
