import { NextResponse } from "next/server";
import { getToday } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Today's Doors game: callers ringing, the daily set in your language,
 *  your play state, Bid Points, free gens, and the auction summary. */
export async function GET() {
  try {
    const { user, locale } = await doorsContext();
    return NextResponse.json(await getToday(user, locale));
  } catch (err) {
    return doorsError(err);
  }
}
