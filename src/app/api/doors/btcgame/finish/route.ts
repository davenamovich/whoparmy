import { bankBtcgameSession } from "@/lib/doors/btcgame";
import { btcError, btcJson, btcOptions } from "@/lib/doors/btcgame-route";

export async function POST(req: Request) {
  try { let body: { sessionId?: unknown }; try { body = await req.json(); } catch { return btcJson(req, { error: "bad_json" }, 400); } return btcJson(req, await bankBtcgameSession(body.sessionId)); } catch (err) { return btcError(req, err); }
}
export function OPTIONS(req: Request) { return btcOptions(req); }
