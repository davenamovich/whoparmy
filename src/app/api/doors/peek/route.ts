import { NextRequest, NextResponse } from "next/server";
import { peekDoor } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Spend a banked Peek on an unopened door: learn its band
 *  (dud/low/high/jackpot), never its exact prize. Keeper allowed. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { sessionId?: unknown; door?: unknown };
    return NextResponse.json(await peekDoor(user, body));
  } catch (err) {
    return doorsError(err);
  }
}
