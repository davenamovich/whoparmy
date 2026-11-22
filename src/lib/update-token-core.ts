export type UpdateTokenStatus = { active: boolean; createdAt: Date | null; lastUsedAt: Date | null };
export type BridgeCredentialKind = "spend" | "update";

export function tokenKind(raw: string | null): BridgeCredentialKind | null {
  if (raw?.startsWith("pru_")) return "update";
  if (raw?.startsWith("prb_")) return "spend";
  return null;
}

export function canUseForMcp(kind: BridgeCredentialKind | null): boolean {
  return kind === "spend";
}

export function publicUpdateTokenStatus(row: { createdAt: Date; lastUsedAt: Date | null } | null): UpdateTokenStatus {
  return row ? { active: true, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt } : { active: false, createdAt: null, lastUsedAt: null };
}
