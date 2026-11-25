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

export function bridgeToolAllowedByTables(name: string, freeTools: Set<string>, generatingCosts: Record<string, number>): boolean {
  return freeTools.has(name) || Object.hasOwn(generatingCosts, name);
}
