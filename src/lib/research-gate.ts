export type ResearchGateState = "done" | "running" | "failed" | "none";

export function researchGateState(input: {
  hasDoneResearch: boolean;
  hasRunningResearch: boolean;
  hasFailedResearch: boolean;
}): ResearchGateState {
  if (input.hasDoneResearch) return "done";
  if (input.hasRunningResearch) return "running";
  if (input.hasFailedResearch) return "failed";
  return "none";
}
