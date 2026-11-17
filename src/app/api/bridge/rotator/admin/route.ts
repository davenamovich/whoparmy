import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { adminCancelDay, adminConfirmWinner, listRotatorDaysForAdmin } from "@/lib/rotator";

/**
 * The daily rotator auction — ADMIN surface (operators only).
 * GET  — recent days with every bid.
 * POST — { action: "confirm", date, userId? } confirms a winner
 *        (default highest bid; deducts the winner's free gens and
 *        snapshots their saved URL), { action: "cancel", date }
 *        cancels a day (refunding a confirmed winner).
 */

async function requireOperator() {
  const { user, mode } = await getWhopUserWithMode();
  if (mode !== "operator") throw new Error("Operator only");
  return user;
}

export async function GET() {
  try {
    await requireOperator();
    return NextResponse.json({ days: await listRotatorDaysForAdmin() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load auctions" },
      { status: 403 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOperator();
    const body = (await req.json()) as { action?: string; date?: string; userId?: string };
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
