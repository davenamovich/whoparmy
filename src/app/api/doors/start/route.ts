import { NextRequest, NextResponse } from "next/server";
import { startGame } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Start today's game: pick your caller and the door you'll keep.
 *  One game per member per game day — a second start is a 409. */
export async function POST(req: NextRequest) {
  try {
    const { user, locale } = await doorsContext();
    const body = (await req.json()) as { caller?: unknown; keeperDoor?: unknown };
    return NextResponse.json(await startGame(user, body, locale));
  } catch (err) {
    return doorsError(err);
  }
}
