import { NextRequest, NextResponse } from "next/server";
import { getOffer } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** The Banker's current offer for your keeper door. Idempotent per
 *  round — calling again returns the same number. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { sessionId?: unknown };
    return NextResponse.json(await getOffer(user, body));
  } catch (err) {
    return doorsError(err);
  }
}
