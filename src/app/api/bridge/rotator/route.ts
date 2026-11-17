import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getRotatorState, placeRotatorBid } from "@/lib/rotator";

/**
 * The daily rotator auction — member surface.
 * GET  — today's destination + my balance/links + the biddable days.
 * POST — place or update my bid { date, partner, amount } (free gens;
 *        nothing is deducted unless an admin confirms me the winner).
 */

export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ rotator: await getRotatorState(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the rotator" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { date?: unknown; partner?: unknown; amount?: unknown };
    const result = await placeRotatorBid(user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ rotator: await getRotatorState(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not place that bid" },
      { status: 500 },
    );
  }
}
