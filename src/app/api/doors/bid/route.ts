import { NextRequest, NextResponse } from "next/server";
import { placeBid } from "@/lib/doors/auction";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** Place or raise your bid in the weekly Key Auction. Raising refunds
 *  your previous stake before staking the new amount, atomically. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await doorsContext();
    const body = (await req.json()) as { points?: unknown };
    const points = typeof body.points === "number" ? body.points : NaN;
    return NextResponse.json(await placeBid(user.id, points));
  } catch (err) {
    return doorsError(err);
  }
}
