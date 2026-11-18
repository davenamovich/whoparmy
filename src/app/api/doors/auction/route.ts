import { NextResponse } from "next/server";
import { getAuctionState, myBidFor, topBidsFor } from "@/lib/doors/auction";
import { pointsBalance } from "@/lib/doors/points";
import { doorsContext, doorsError } from "@/lib/doors/route";

export const runtime = "nodejs";

/** The weekly Key Auction: state, top-5 leaderboard, your bid and your
 *  Bid Point balance. Reading state lazily resolves a closed auction. */
export async function GET() {
  try {
    const { user } = await doorsContext();
    const auction = await getAuctionState();
    const [topBids, myBid, balance] = await Promise.all([
      topBidsFor(auction.auctionId, user.id),
      myBidFor(user.id, auction.auctionId),
      pointsBalance(user.id),
    ]);
    const minNextBid = auction.topBid > 0 ? auction.topBid + 10 : 50;
    return NextResponse.json({ auction, topBids, myBid, balance, minNextBid });
  } catch (err) {
    return doorsError(err);
  }
}
