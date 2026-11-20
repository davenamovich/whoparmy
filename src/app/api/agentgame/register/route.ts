import { registerAgent } from "@/lib/agentgame/agentgame";
import { agClientKey, agError, agJson, agOptions, agRateLimited } from "@/lib/agentgame/agentgame-route";

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return agJson(req, { error: "bad_json" }, 400); }
    if (agRateLimited(`register:${agClientKey(req)}`, 10, 60 * 60 * 1000)) {
      return agJson(req, { error: "rate_limited" }, 429);
    }
    return agJson(req, await registerAgent(body), 201);
  } catch (err) { return agError(req, err); }
}
export function OPTIONS(req: Request) { return agOptions(req); }
