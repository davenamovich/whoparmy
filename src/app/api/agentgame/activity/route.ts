import { getActivity } from "@/lib/agentgame/agentgame";
import { agError, agJson, agOptions } from "@/lib/agentgame/agentgame-route";

export async function GET(req: Request) {
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") || 25);
    return agJson(req, await getActivity(Number.isFinite(limit) ? limit : 25));
  } catch (err) { return agError(req, err); }
}
export function OPTIONS(req: Request) { return agOptions(req); }
