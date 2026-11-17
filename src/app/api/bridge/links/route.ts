import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getBridgeState, saveBridgeLinks } from "@/lib/bridge";

/**
 * The bridge: the member's own partner referral links.
 * GET  — partners + saved links + first-save state.
 * PUT  — upsert links; the first save pays the referrer's free
 *        generations (see lib/bridge.ts).
 */

export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ bridge: await getBridgeState(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your links" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { links?: Record<string, unknown> };
    if (!body.links || typeof body.links !== "object") {
      return NextResponse.json({ error: "Send { links: { partner: url } }" }, { status: 400 });
    }
    const result = await saveBridgeLinks(user.id, body.links);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      bridge: result.state,
      firstSave: result.firstSave,
      referrerPaid: result.referrerPaid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your links" },
      { status: 500 },
    );
  }
}
