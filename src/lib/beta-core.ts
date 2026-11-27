export type TesterState = { facebookPageRecorded: boolean; postsPosted: number; bountyUnlocked: boolean; boardHandle: string; fuelGranted: number; fuelUsed: number; bountyGranted: number; bountyUsed: number };
export type CampaignState = { fundedCents: number };
export type Approval = { campaign: CampaignState; tester: TesterState; bountyCents: number; ledger: { amountCents: number; kind: string; memo: string } };

export function validateBountyCents(value: number): number { if (!Number.isInteger(value) || value < 20) throw new Error("Bounty must be at least 20 cents."); return value; }
export function evaluateUnlock(t: TesterState): boolean { return t.facebookPageRecorded && t.postsPosted >= 1; }
export function validateSpend(t: TesterState, kind: "fuel" | "bounty", amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Spend must be a positive integer.");
  if (kind === "fuel" && amount > t.fuelGranted - t.fuelUsed) throw new Error("Fuel balance is insufficient.");
  if (kind === "bounty") { if (!t.bountyUnlocked) throw new Error("Bounty is locked until Day 0 is recorded."); if (!t.boardHandle.trim()) throw new Error("A Board handle is required."); if (amount > t.bountyGranted - t.bountyUsed) throw new Error("Bounty balance is insufficient."); }
}
export function approveReport(input: Approval): Approval & { campaign: CampaignState; tester: TesterState } {
  if (input.bountyCents > input.campaign.fundedCents) throw new Error("Campaign pool is insufficient.");
  return { ...input, campaign: { fundedCents: input.campaign.fundedCents - input.bountyCents }, ledger: { amountCents: input.bountyCents, kind: "micro_bounty", memo: input.ledger.memo } };
}
