export function plotRentDollars(plotNo: number): number {
  // Flat $25/mo for every plot (Dave, 2026-11-25 — the $10-doubling
  // ladder is retired: fill the town fast, occupancy is the asset).
  void plotNo;
  return 25;
}

/** Display scale only: this summarizes ledger activity and is not a traffic claim. */
export function activityLevel(slotsUsed7d: number, countedLaunches7d: number): number {
  const score = Math.max(0, slotsUsed7d) + Math.max(0, countedLaunches7d);
  if (score >= 40) return 4;
  if (score >= 15) return 3;
  if (score >= 5) return 2;
  if (score >= 1) return 1;
  return 0;
}

export interface TownAgent {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
}

export interface TownPlot {
  plotNo: number;
  rentDollars: number;
  status: "OCCUPIED" | "OPEN";
  agent: TownAgent | null;
  level: number;
}

export function plotCta(plot: TownPlot): { label: string; href: string } | null {
  return plot.status === "OPEN" ? { label: "For rent — start the five", href: "/build" } : null;
}

export function buildTownPlots(
  agents: TownAgent[],
  activityByAgentId: Record<string, { slotsUsed7d: number; countedLaunches7d: number }>,
): TownPlot[] {
  const count = Math.max(8, Math.ceil(agents.length / 4) * 4);
  return Array.from({ length: count }, (_, index) => {
    const agent = agents[index] ?? null;
    const activity = agent ? activityByAgentId[agent.id] : undefined;
    return {
      plotNo: index + 1,
      rentDollars: plotRentDollars(index + 1),
      status: agent ? "OCCUPIED" : "OPEN",
      agent,
      level: agent ? activityLevel(activity?.slotsUsed7d ?? 0, activity?.countedLaunches7d ?? 0) : 0,
    };
  });
}

export function nextPlotRent(plots: TownPlot[]): number {
  const firstOpen = plots.find((plot) => plot.status === "OPEN");
  return firstOpen?.rentDollars ?? plotRentDollars(plots.length + 1);
}

export interface TownTickerEvent {
  ts: Date | string;
  kind: string;
  text: string;
}

export function mergeTicker(events: TownTickerEvent[]): TownTickerEvent[] {
  return events
    .filter((event) => Number.isFinite(new Date(event.ts).getTime()))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 12);
}

export function etDayPhase(hourEt: number): "day" | "night" {
  return hourEt >= 7 && hourEt < 19 ? "day" : "night";
}
