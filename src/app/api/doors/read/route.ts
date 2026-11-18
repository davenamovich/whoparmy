import { NextRequest, NextResponse } from "next/server";
import { readGuess } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Read the Banker: lock your one guess of your keeper door's band
 *  (dud/low/high/jackpot) any time before the game finishes. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { sessionId?: unknown; band?: unknown };
    return NextResponse.json(await readGuess(user, body));
  } catch (err) {
    return doorsError(err);
  }
}
