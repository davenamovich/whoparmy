import { getLeaderboard } from "@/lib/agentgame/agentgame";
import { agError, agJson, agOptions } from "@/lib/agentgame/agentgame-route";

export async function GET(req: Request) {
  try { return agJson(req, await getLeaderboard()); } catch (err) { return agError(req, err); }
}
export function OPTIONS(req: Request) { return agOptions(req); }
