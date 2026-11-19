import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getPanel, requestPanel } from "@/lib/panel";

export const runtime = "nodejs";

/**
 * /api/panel — the member's Expert Panel state. GET returns it;
 * POST queues their blueprint + Day-1 setup for the Board swarm.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ panel: await getPanel(user.id) });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ panel: await requestPanel(user) });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
