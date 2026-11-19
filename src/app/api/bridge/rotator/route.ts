import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
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
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    // placeRotatorBid validates every field from `unknown`; a key
    // missing from the JSON body arrives as undefined and fails its
    // validation, so the required-keys shape is the honest cast.
    const body = (await req.json()) as { date: unknown; partner: unknown; amount: unknown };
    const result = await placeRotatorBid(user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ rotator: await getRotatorState(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not place that bid" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
