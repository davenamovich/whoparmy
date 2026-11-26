export const BRIDGE_FREE_TOOLS = new Set([
  "research_brand",
  "create_campaign_from_research",
  "get_job_status",
  "get_account",
  "get_usage",
  "get_free_day",
  "claim_free_day",
  "list_ad_options",
  "list_services",
  "check_my_unlock",
  "list_my_offers",
  "save_my_offer",
  "delete_my_offer",
  "save_my_key",
  "delete_my_key",
]);

export function filterBridgeTools<T extends { name?: unknown }>(
  tools: T[],
  allowed: (name: string) => boolean,
): T[] {
  return tools.filter((tool) => typeof tool.name === "string" && allowed(tool.name));
}

export interface BridgeListedTool { name?: unknown; description?: unknown; inputSchema?: unknown }

/** Keep the advertised list aligned with the bridge allowlist even when
 * an upstream engine hides a callable tool from tools/list. */
export function withMissingBridgeTools<T extends { name?: unknown }>(tools: T[], allowedNames: Iterable<string>): Array<T | BridgeListedTool> {
  const present = new Set(tools.map((tool) => tool.name).filter((name): name is string => typeof name === "string"));
  const synthesize = [...new Set(allowedNames)].filter((name) => !present.has(name)).map((name): BridgeListedTool => {
    if (name === "get_account") return { name, description: "Show the member's remaining credits, usage and pricing path through this connection.", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
    if (name === "create_demo_pack") return { name, description: "Create a day of posts for one company: 5 memes, an iMessage, a Top 10 and a slideshow. Costs 115 credits at list; failed pieces are refunded. Drafts only.", inputSchema: { type: "object", properties: { campaign_id: { type: "string" }, input: { type: "string" }, product: { type: "string" }, language: { type: "string" } }, additionalProperties: false } };
    return { name, description: "Plunder & Riffle engine tool, available through the Muse bridge.", inputSchema: { type: "object", properties: {} } };
  });
  return [...tools, ...synthesize];
}

export function bridgeToolAllowedByTables(name: string, freeTools: Set<string>, generatingCosts: Record<string, number>): boolean {
  return freeTools.has(name) || Object.hasOwn(generatingCosts, name);
}
