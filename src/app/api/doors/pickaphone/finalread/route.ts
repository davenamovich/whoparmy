import { lockPickaphoneFinalRead } from "@/lib/doors/pickaphone";
import { papError, papJson, papOptions } from "@/lib/doors/pickaphone-route";

export async function POST(req: Request) {
  try { let body: { sessionId?: unknown; guess?: unknown }; try { body = await req.json(); } catch { return papJson(req, { error: "bad_json" }, 400); } return papJson(req, await lockPickaphoneFinalRead(body.sessionId, body.guess)); } catch (err) { return papError(req, err); }
}
export function OPTIONS(req: Request) { return papOptions(req); }
