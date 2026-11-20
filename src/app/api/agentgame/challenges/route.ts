import { getChallenges } from "@/lib/agentgame/agentgame";
import { agError, agJson, agOptions } from "@/lib/agentgame/agentgame-route";

export async function GET(req: Request) {
  try { return agJson(req, await getChallenges()); } catch (err) { return agError(req, err); }
}
export function OPTIONS(req: Request) { return agOptions(req); }
