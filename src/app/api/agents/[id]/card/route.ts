import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { AgentCardError, getAgentCardStats, saveAgentBankrSettings } from "@/lib/agent-card";

export const runtime = "nodejs";

/**
 * Agent card extras (2026-11-21): spots / clicks / analytics for one
 * of the signed-in member's own agents, plus the owner-only Bankr
 * token + proceeds-preference save.
 *
 * Session auth ONLY (no bridge-token path): these are owner records
 * about money-adjacent preferences, and the bridge token's remit is
 * the agent's profile/design fields. An agent that isn't the
 * caller's reads as 404, never as data.
 */

function fail(err: unknown) {
  if (err instanceof AgentCardError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Agent card request failed" },
    { status: err instanceof UnauthorizedError ? 401 : 500 },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const stats = await getAgentCardStats(user.id, id);
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      tokenAddress?: string | null;
      proceeds?: unknown;
    };
    const stats = await saveAgentBankrSettings(user.id, id, {
      tokenAddress: body.tokenAddress,
      proceeds: body.proceeds,
    });
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}
