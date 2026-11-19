import { bankPickaphoneSession } from "@/lib/doors/pickaphone";
import { papError, papJson, papOptions } from "@/lib/doors/pickaphone-route";

export async function POST(req: Request) {
  try { let body: { sessionId?: unknown }; try { body = await req.json(); } catch { return papJson(req, { error: "bad_json" }, 400); } return papJson(req, await bankPickaphoneSession(body.sessionId)); } catch (err) { return papError(req, err); }
}
export function OPTIONS(req: Request) { return papOptions(req); }
