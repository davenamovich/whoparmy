import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Pause or resume one of your hired agents. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as { status?: string };
    if (body.status !== "ACTIVE" && body.status !== "PAUSED") {
      return NextResponse.json({ error: "Status must be ACTIVE or PAUSED." }, { status: 400 });
    }
    const hire = await db.hiredAgent.findFirst({ where: { id, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (hire.status === "DEPLETED" && body.status === "ACTIVE") {
      return NextResponse.json({ error: "This agent spent its full allocation. Hire a fresh budget to keep it working." }, { status: 400 });
    }
    const updated = await db.hiredAgent.update({ where: { id }, data: { status: body.status } });
    return NextResponse.json({ hire: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}
