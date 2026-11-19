import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { architectAgent } from "@/lib/agent-architect";
import { toolsToJson } from "@/lib/agent-architect-core";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/agents/architect — the SMB Agent Factory's design step.
 * The owner describes the job; the architect returns a complete,
 * validated agent config for review. This writes NO agent and spends
 * nothing from the plan — installing is POST /api/agents with
 * templateKey "custom" and this config, the owner's explicit tap.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { brief?: string; website?: string };
    const brief = body.brief?.trim();
    if (!brief || brief.length < 10) {
      return NextResponse.json(
        { error: "Describe the job in a sentence or two — what should this employee do for your business?" },
        { status: 400 },
      );
    }
    const website = body.website?.trim() || undefined;
    if (website && !/^https?:\/\//i.test(website)) {
      return NextResponse.json({ error: "Website should start with https://" }, { status: 400 });
    }
    const { config, researched } = await architectAgent({ userId: user.id, brief, website });
    return NextResponse.json({
      config: {
        name: config.name,
        role: config.role,
        instructions: config.instructions,
        tools: config.tools.map((t) => ({ id: t.id, label: t.label, kind: t.kind })),
        toolsJson: toolsToJson(config.tools),
        defaultKind: config.defaultKind,
        successMetric: config.successMetric,
        summary: config.summary,
      },
      researched,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The architect couldn't design that agent — try again." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
