import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getAgentRotator, updateAgentRotator } from "@/lib/rotator-v2";
import { rotatorV2Enabled } from "@/lib/rotator-v2-core";

/**
 * The member's agent rotator settings.
 * GET  — load this agent's rotator and saved links.
 * PUT  — update settings and replace its link set after validation.
 */

export async function GET(_req: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  if (!rotatorV2Enabled(process.env)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const user = await getWhopUser();
    const { agentId } = await context.params;
    const rotator = await getAgentRotator(user.id, agentId);
    return rotator
      ? NextResponse.json({ rotator })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load rotator" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  if (!rotatorV2Enabled(process.env)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const user = await getWhopUser();
    const { agentId } = await context.params;
    const result = await updateAgentRotator(user.id, agentId, await req.json());
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 400 });
    }

    return NextResponse.json({ rotator: await getAgentRotator(user.id, agentId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update rotator" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
