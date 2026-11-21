import "server-only";
import { db } from "@/lib/db";
import { partnerNameSync } from "@/lib/offer-catalog";
import { spotAllotmentPerAgent } from "@/lib/traffic-pool-core";
import { addDaysToEtDate, spotWindowFor } from "@/lib/rotator-market";
import {
  classifyTokenAddress,
  clickWindows,
  parseProceedsPreference,
  summarizeClicks,
  type AgentCardStats,
  type ProceedsPreference,
} from "@/lib/agent-card-core";

/**
 * ─── AGENT CARD — server layer ──────────────────────────────────────
 *
 * Backs GET/PUT /api/agents/[id]/card (owner session only).
 *
 * Spots come from AgentTrafficDay rows (the pool's recorded per-day
 * outcome). Clicks come from LinkClick, which joins at MEMBER level
 * (ownerUserId + partner) — there is no per-agent click attribution
 * in the data, so the stats are the owner's link clicks and the card
 * labels them as such. Nothing here invents a join that doesn't
 * exist.
 *
 * The Bankr fields are owner records only: a paste-and-save token
 * address and a proceeds→buy-coin preference. No Bankr API calls, no
 * wallet writes — execution stays in Bankr by the owner's own hand.
 */

export class AgentCardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function ownedAgent(userId: string, agentId: string) {
  const agent = await db.hiredAgent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new AgentCardError("Agent not found.", 404);
  return agent;
}

function proceedsOf(agent: {
  proceedsToCoin: boolean;
  proceedsToCoinPct: number;
  proceedsToCoinTarget: string;
}): ProceedsPreference {
  return {
    enabled: agent.proceedsToCoin,
    pct: agent.proceedsToCoinPct,
    target: agent.proceedsToCoinTarget === "TOKEN" ? "TOKEN" : "BTC",
  };
}

export async function getAgentCardStats(userId: string, agentId: string): Promise<AgentCardStats> {
  const agent = await ownedAgent(userId, agentId);
  const now = new Date();
  const w = clickWindows(now);

  // Spots live on the 23:50 ET spot-window clock (2026-11-21):
  // AgentTrafficDay rows are keyed by window key, so "today" reads
  // the CURRENT window's row and the 7-day sum reads the last 7
  // window keys. Clicks below stay ET-calendar — LinkClick rows are
  // instants, not window records.
  const window = spotWindowFor(now);
  const last7WindowKeys = Array.from({ length: 7 }, (_, i) => addDaysToEtDate(window.key, i - 6));

  const [trafficRows, clickRows, clicksTotal] = await Promise.all([
    db.agentTrafficDay.findMany({
      where: { agentId: agent.id, date: { in: last7WindowKeys } },
      select: { date: true, slotsUsed: true },
    }),
    db.linkClick.findMany({
      where: { ownerUserId: userId, createdAt: { gte: w.monthStart } },
      select: { partner: true, createdAt: true },
    }),
    db.linkClick.count({ where: { ownerUserId: userId } }),
  ]);

  const summary = summarizeClicks(clickRows, now);
  const todayRow = trafficRows.find((r) => r.date === window.key);

  return {
    agentId: agent.id,
    spots: {
      todayUsed: todayRow?.slotsUsed ?? 0,
      // The flat policy value (traffic-pool-core's policy point);
      // demand inputs are not re-measured on this owner read path.
      todayTotal: spotAllotmentPerAgent({ activeAgents: 0, countedHops7d: 0 }),
      last7DaysUsed: trafficRows.reduce((sum, r) => sum + r.slotsUsed, 0),
    },
    clicks: {
      scope: "member",
      total: clicksTotal,
      today: summary.today,
      last7Days: summary.last7Days,
      last30Days: summary.last30Days,
      topLink: summary.topPartner
        ? {
            partner: summary.topPartner.partner,
            name: partnerNameSync(summary.topPartner.partner),
            clicks: summary.topPartner.clicks,
          }
        : null,
    },
    bankr: {
      tokenAddress: agent.bankrTokenAddress,
      tokenChain: agent.bankrTokenChain === "EVM" || agent.bankrTokenChain === "SOLANA" ? agent.bankrTokenChain : null,
      proceeds: proceedsOf(agent),
    },
  };
}

export interface BankrSettingsInput {
  /** undefined = leave unchanged; null = clear; string = paste-and-save. */
  tokenAddress?: string | null;
  /** undefined = leave unchanged. */
  proceeds?: unknown;
}

/**
 * Save the owner-only Bankr fields on one of the owner's agents.
 * Returns the fresh stats so the card re-renders from the same read.
 * Validation is total: a rejected save writes nothing.
 */
export async function saveAgentBankrSettings(
  userId: string,
  agentId: string,
  input: BankrSettingsInput,
): Promise<AgentCardStats> {
  const agent = await ownedAgent(userId, agentId);
  const data: {
    bankrTokenAddress?: string | null;
    bankrTokenChain?: string | null;
    proceedsToCoin?: boolean;
    proceedsToCoinPct?: number;
    proceedsToCoinTarget?: string;
  } = {};

  // Resolve the token state AFTER this save first — the proceeds
  // TOKEN target depends on it.
  let nextTokenAddress = agent.bankrTokenAddress;
  if (input.tokenAddress === null) {
    nextTokenAddress = null;
    data.bankrTokenAddress = null;
    data.bankrTokenChain = null;
  } else if (typeof input.tokenAddress === "string") {
    const classified = classifyTokenAddress(input.tokenAddress);
    if (!classified) {
      throw new AgentCardError(
        "That doesn't look like a token contract address — paste an EVM (0x…) or Solana (base58) address.",
      );
    }
    nextTokenAddress = classified.address;
    data.bankrTokenAddress = classified.address;
    data.bankrTokenChain = classified.chain;
  } else if (input.tokenAddress !== undefined) {
    throw new AgentCardError("Token address must be a string.");
  }

  if (input.proceeds !== undefined) {
    const parsed = parseProceedsPreference(input.proceeds, nextTokenAddress !== null);
    if (!parsed.ok) throw new AgentCardError(parsed.error);
    data.proceedsToCoin = parsed.value.enabled;
    data.proceedsToCoinPct = parsed.value.pct;
    data.proceedsToCoinTarget = parsed.value.target;
  } else if (input.tokenAddress === null && agent.proceedsToCoinTarget === "TOKEN") {
    // Clearing the token out from under a TOKEN proceeds target would
    // leave a preference pointing at nothing — refuse, in the open.
    throw new AgentCardError(
      "This agent's proceeds target is its token — switch the target to BTC before clearing the token address.",
    );
  }

  if (Object.keys(data).length > 0) {
    await db.hiredAgent.update({ where: { id: agent.id }, data });
  }
  return getAgentCardStats(userId, agentId);
}
