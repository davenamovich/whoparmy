import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getBridgeState, getMuseInviteForRef } from "@/lib/bridge";

export const runtime = "nodejs";

/**
 * GET /api/build-agent/muse-invite — the Muse invite code the /build
 * Step-0 card shows click-to-copy (Dave, 2026-11-24).
 *
 * Read-only and public by design (it is in middleware's public API
 * prefixes): an invite code is meant to be shared — the house code is
 * printed on the public /muse-invite splash page. Resolution is the
 * bridge's own, referrer-first with house fallback:
 *  - signed-in member → getBridgeState (their referrer's saved muse
 *    value, via referredById);
 *  - everyone else → getMuseInviteForRef with the ?ref= attribution
 *    code when one is present, house code otherwise.
 * Only the code and whose it is are returned — never a link list,
 * never any member data. Any failure degrades to a null code so the
 * card can fall back to its ask-your-referrer copy.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getWhopUser().catch(() => null);
    if (user) {
      const state = await getBridgeState(user.id);
      const muse = state.partners.find((p) => p.key === "muse");
      return NextResponse.json({ code: muse?.inviteCode ?? null, source: muse?.inviteCodeSource ?? null });
    }
    const invite = await getMuseInviteForRef(req.nextUrl.searchParams.get("ref"));
    return NextResponse.json(invite);
  } catch {
    return NextResponse.json({ code: null, source: null });
  }
}
