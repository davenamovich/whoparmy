export type TesterState = { lane: string; facebookPageRecorded: boolean; postsPosted: number; bountyUnlocked: boolean; boardHandle: string; fuelGranted: number; fuelUsed: number; bountyGranted: number; bountyUsed: number };
export type CampaignState = { fundedCents: number };
export type Approval = { campaign: CampaignState; tester: TesterState; bountyCents: number; ledger: { amountCents: number; kind: string; memo: string } };

export type BetaLane = "muse" | "agent37";
export function validLane(value: unknown): BetaLane | null {
  return value === "muse" || value === "agent37" ? value : null;
}
export function enrollLane(param: string | null): BetaLane | null {
  // Exact match only — anything else is NO lane, never a silent Muse
  // default (Joe's fix-first review, item 1: "muse" for null/"other"/
  // "Agent37" at the client layer defeated the API's lane-less refusal).
  return validLane(param);
}
export function validEmailShape(value: unknown): boolean {
  // Basic shape only (local@domain.tld, no spaces) — the delivery address
  // is where the tester's key and accounts land, so a typo must not pass.
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export function agent37SwitchAction(storedDeliveryEmail: unknown): "commit" | "collect-email" {
  // Switching to Agent37 may commit in one click ONLY with an address the
  // tester already stored; the Whop login email is never written as the
  // delivery address automatically (Joe's fix-first review, item 2b).
  return typeof storedDeliveryEmail === "string" && storedDeliveryEmail.trim() ? "commit" : "collect-email";
}
export function day0Verifiable(lane: unknown): boolean {
  // Only the Agent37 lane unlocks by house verification; the Muse lane
  // unlocks by recording its Facebook Page + posts (the day0 action).
  return lane === "agent37";
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
