import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertMonthlyAllowance } from "@/lib/usage-server";
import { fetchAdSource, writeTeardown, agentCommand } from "@/lib/ad-teardown";

export const runtime = "nodejs";

/**
 * POST /api/ad-teardown { url } — read a competitor's post or ad
 * page for real, tear it down, spin angles for the member's
 * business, and return the ONE agent command that reruns the
 * whole thing in the member's agent. No engine generation happens
 * here — generation belongs in the agent, on the member's key
 * (Dave's agent-led direction, 2026-11-18/19).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Paste a full link to the post or ad page." }, { status: 400 });
    }

    const allowance = await assertMonthlyAllowance(user.id, user.plan, 1);
    if (!allowance.ok) return NextResponse.json(allowance, { status: 402 });

    const source = await fetchAdSource(url);
    if (!source) {
      return NextResponse.json(
        { error: "Could not read that link — it may be deleted, private, or blocking readers. Try the post's own URL." },
        { status: 422 },
      );
    }

    const brand = await db.brandProfile.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { name: true, website: true },
    });

    const teardown = await writeTeardown({
      source,
      businessName: brand?.name ?? null,
      businessUrl: brand?.website ?? null,
    });
    const command = agentCommand({ source, teardown, businessUrl: brand?.website ?? null });

    return NextResponse.json({ source: { kind: source.kind, label: source.label, url: source.url }, teardown, command });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Teardown failed." },
      { status: 500 },
    );
  }
}
