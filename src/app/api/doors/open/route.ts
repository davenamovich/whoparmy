import { NextRequest, NextResponse } from "next/server";
import { openDoor } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Open one door (never your keeper). Optional callBand is the Call It
 *  skill guess: "low" (<100) or "high" (>=100) for this door's prize. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { sessionId?: unknown; door?: unknown; callBand?: unknown };
    return NextResponse.json(await openDoor(user, body));
  } catch (err) {
    return doorsError(err);
  }
}
