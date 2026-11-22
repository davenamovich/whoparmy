import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { adminCancelDay, adminConfirmWinner, listRotatorDaysForAdmin } from "@/lib/rotator";
import { applyEnforcement, liftEnforcement, listActiveEnforcements, getRotatorHopDayReport } from "@/lib/rotator-v2";
import { rotatorV2Enabled } from "@/lib/rotator-v2-core";
import { getAffiliateOverview } from "@/lib/bridge";

/**
 * The daily rotator auction — ADMIN surface (operators only).
 * GET  — recent days with every bid.
 * POST — { action: "confirm", date, userId? } confirms a winner
 *        (default highest bid; burns the winner's Bid Points and
 *        snapshots their saved URL), { action: "cancel", date }
 *        cancels a day (refunding a confirmed winner).
 */

async function requireOperator() {
  const { user, mode } = await getWhopUserWithMode();
  if (mode !== "operator") throw new Error("Operator only");
  return user;
}

export async function GET(req: NextRequest) {
  try {
    await requireOperator();
    const response: Record<string, unknown> = {
      days: await listRotatorDaysForAdmin(),
      affiliate: await getAffiliateOverview(),
    };
    if (rotatorV2Enabled(process.env)) {
      response.enforcements = await listActiveEnforcements();
      const date = req.nextUrl.searchParams.get("date");
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) response.hopReport = await getRotatorHopDayReport(date);
    }
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load auctions" },
      { status: 403 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireOperator();
    const body = (await req.json()) as { action?: string; date?: string; userId?: string; scope?: unknown; scopeId?: unknown; level?: unknown; reason?: unknown; id?: unknown };
    if (body.action === "enforce" || body.action === "liftEnforcement") {
      if (!rotatorV2Enabled(process.env)) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const result = body.action === "enforce"
        ? await applyEnforcement({ scope: body.scope, scopeId: body.scopeId, level: body.level, reason: body.reason }, user.id)
        : await liftEnforcement(body.id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ detail: result.detail, enforcements: await listActiveEnforcements() });
    }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "Send a date as yyyy-mm-dd" }, { status: 400 });
    }
    const result =
      body.action === "confirm"
        ? await adminConfirmWinner(body.date, body.userId)
        : body.action === "cancel"
          ? await adminCancelDay(body.date)
          : null;
    if (!result) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ detail: result.detail, days: await listRotatorDaysForAdmin() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Admin action failed" },
      { status: 403 },
    );
  }
}
