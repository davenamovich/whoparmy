import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { getWalletState } from "@/lib/agents";

export const runtime = "nodejs";

/** Campaign marketplace: open listings from all members + your own. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const listings = await db.campaignListing.findMany({
      where: { OR: [{ status: "OPEN" }, { posterId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { poster: { select: { name: true, whopUsername: true } } },
    });
    return NextResponse.json({ listings, myUserId: user.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load marketplace" }, { status: 500 });
  }
}

/** Post a campaign to the marketplace: reserve the bounty from your wallet. */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { title?: string; description?: string; bountyTokens?: number };
    const title = body.title?.trim();
    const description = body.description?.trim();
    if (!title || !description) {
      return NextResponse.json({ error: "A campaign needs a title and a brief." }, { status: 400 });
    }
    // Bounties are denominated in memes (the member-facing unit).
    // The bountyTokens column stores the count; tokens stay internal.
    const bounty = Math.floor(Number(body.bountyTokens ?? 0));
    if (!Number.isFinite(bounty) || bounty < 10) {
      return NextResponse.json({ error: "Bounty must be at least 10 memes." }, { status: 400 });
    }
    const wallet = await getWalletState(user.id, user.plan);
    if (bounty > wallet.available) {
      return NextResponse.json(
        { error: `That bounty is more than your plan can reserve right now. Lower it or upgrade.` },
        { status: 402 },
      );
    }
    const listing = await db.campaignListing.create({
      data: { posterId: user.id, title: title.slice(0, 120), description: description.slice(0, 2000), bountyTokens: bounty },
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Posting failed" }, { status: 500 });
  }
}
