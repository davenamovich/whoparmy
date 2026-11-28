export type TesterState = { lane: string; facebookPageRecorded: boolean; postsPosted: number; bountyUnlocked: boolean; boardHandle: string; fuelGranted: number; fuelUsed: number; bountyGranted: number; bountyUsed: number };
export type CampaignState = { fundedCents: number };
export type Approval = { campaign: CampaignState; tester: TesterState; bountyCents: number; ledger: { amountCents: number; kind: string; memo: string } };

export type BetaLane = "muse" | "agent37";
export function validLane(value: unknown): BetaLane | null {
  return value === "muse" || value === "agent37" ? value : null;
}
export function enrollLane(param: string | null): BetaLane {
  return param === "agent37" ? "agent37" : "muse";
}
export function enrollmentLaneWrite(value: unknown, existing: boolean): { create: BetaLane | null; update: BetaLane | undefined } {
  const lane = validLane(value);
  return { create: existing ? null : lane, update: lane ?? undefined };
}
export function deliveryEmailRequired(lane: unknown, value: unknown): boolean { return lane === "agent37" && (typeof value !== "string" || !value.trim()); }

export function validateBountyCents(value: number): number { if (!Number.isInteger(value) || value < 20) throw new Error("Bounty must be at least 20 cents."); return value; }
export function evaluateUnlock(t: TesterState): boolean { return t.lane === "agent37" ? t.bountyUnlocked : t.facebookPageRecorded && t.postsPosted >= 1; }
export function validateSpend(t: TesterState, kind: "fuel" | "bounty", amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Spend must be a positive integer.");
  if (kind === "fuel" && amount > t.fuelGranted - t.fuelUsed) throw new Error("Fuel balance is insufficient.");
  if (kind === "bounty") { if (!t.bountyUnlocked) throw new Error("Bounty is locked until Day 0 is recorded."); if (t.lane !== "agent37" && !t.boardHandle.trim()) throw new Error("A Board handle is required."); if (amount > t.bountyGranted - t.bountyUsed) throw new Error("Bounty balance is insufficient."); }
}
export function approveReport(input: Approval): Approval & { campaign: CampaignState; tester: TesterState } {
  if (input.bountyCents > input.campaign.fundedCents) throw new Error("Campaign pool is insufficient.");
  return { ...input, campaign: { fundedCents: input.campaign.fundedCents - input.bountyCents }, ledger: { amountCents: input.bountyCents, kind: "micro_bounty", memo: input.ledger.memo } };
}
