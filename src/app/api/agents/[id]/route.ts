import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { isGrantExpired } from "@/lib/bot-grants";
import { toolsFromJson, toolsToJson } from "@/lib/agent-architect-core";

export const runtime = "nodejs";

/** Pause/resume one of your hired agents, or update its Factory
 *  settings (name, role, instructions, tools) from the control
 *  center's Settings tab. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      name?: string;
      role?: string;
      instructions?: string;
      toolsJson?: string;
    };
    const hire = await db.hiredAgent.findFirst({ where: { id, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Bot not found." }, { status: 404 });

    // Settings update (no status in the body): name / role /
    // instructions / tools, each clamped and tool-validated.
    if (body.status === undefined) {
      const data: { name?: string; role?: string; instructions?: string; toolsJson?: string } = {};
      if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
      if (typeof body.role === "string") data.role = body.role.trim().slice(0, 300);
      if (typeof body.instructions === "string") data.instructions = body.instructions.trim().slice(0, 4000);
      if (typeof body.toolsJson === "string") {
        const tools = toolsFromJson(body.toolsJson);
        if (tools.length === 0) {
          return NextResponse.json({ error: "Pick at least one real tool for this agent." }, { status: 400 });
        }
        data.toolsJson = toolsToJson(tools);
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
      }
      const updated = await db.hiredAgent.update({ where: { id }, data });
      return NextResponse.json({ hire: updated });
    }

    if (body.status !== "ACTIVE" && body.status !== "PAUSED") {
      return NextResponse.json({ error: "Status must be ACTIVE or PAUSED." }, { status: 400 });
    }
    if (hire.status === "DEPLETED" && body.status === "ACTIVE") {
      return NextResponse.json({ error: "This bot has used up its fuel for the month. It refills with your plan — or connect your own key (BYOK) to run uncapped." }, { status: 400 });
    }
    if (body.status === "ACTIVE" && isGrantExpired(hire)) {
      await db.hiredAgent.update({ where: { id }, data: { status: "PAUSED" } });
      return NextResponse.json({ error: "Your 24-hour referral bot has expired — refer another member and have them save their links to earn it again, or rent a bot on your plan." }, { status: 400 });
    }
    const updated = await db.hiredAgent.update({ where: { id }, data: { status: body.status } });
    return NextResponse.json({ hire: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
