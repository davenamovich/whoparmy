import { NextRequest, NextResponse } from "next/server";
import { decide } from "@/lib/doors/game";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Deal or No Deal. A finish pays free generations to your balance in
 *  the same transaction (credits / 23, rounded down). */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { sessionId?: unknown; decision?: unknown };
    return NextResponse.json(await decide(user, body));
  } catch (err) {
    return doorsError(err);
  }
}
