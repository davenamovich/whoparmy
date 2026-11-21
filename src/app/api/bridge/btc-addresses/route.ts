import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getBtcAddresses, saveBtcAddresses } from "@/lib/btc-addresses";
import { getCollectBtcAddresses } from "@/lib/btc-payouts";
import { bridgeBtcMode } from "@/lib/btc-payouts-logic";

/**
 * The member's BTC receive addresses (BTC Experiment, Flow v2).
 * GET — the two saved public addresses + their network labels.
 * PUT — save/clear them; every non-empty value is checksum-validated
 *       server-side (lib/btc-address). Public addresses only — a seed
 *       phrase or private key can never pass validation.
 */

export async function GET() {
  try {
    const user = await getWhopUser();
    const [addresses, collectOn] = await Promise.all([getBtcAddresses(user.id), getCollectBtcAddresses()]);
    // collectMode drives the /bridge presentation (Real BTC toggle,
    // 2026-11-21): "optional" is the historical block; "collect"
    // presents the same fields as required payout collection.
    return NextResponse.json({ addresses, collectMode: bridgeBtcMode(collectOn) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your BTC addresses" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as {
      btcReceiveAddress?: unknown;
      agentBtcAddress?: unknown;
    };
    const result = await saveBtcAddresses(user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ addresses: result.addresses });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your BTC addresses" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
