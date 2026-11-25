import { createHash } from "node:crypto";

export const hashKeyClaimCode = (code: string): string => createHash("sha256").update(code).digest("hex");
export const isKeyClaimCode = (code: string): boolean => code.startsWith("prk_");
export function isUsableKeyClaim(row: { userId: string; usedAt: Date | null; expiresAt: Date }, userId: string, now = Date.now()): boolean {
  return row.userId === userId && !row.usedAt && row.expiresAt.getTime() > now;
}
