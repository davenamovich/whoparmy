import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activityLevel, buildTownPlots, etDayPhase, mergeTicker, nextPlotRent, plotCta, plotRentDollars } from "./town.ts";

describe("town core", () => {
  it("uses a doubling dollar rent ladder", () => {
    assert.deepEqual([1, 2, 3, 4].map(plotRentDollars), [10, 20, 40, 80]);
  });

  it("maps activity thresholds to the display scale", () => {
    assert.deepEqual([0, 1, 5, 15, 40].map((n) => activityLevel(n, 0)), [0, 1, 2, 3, 4]);
    assert.equal(activityLevel(3, 2), 2);
  });

  it("builds open plots and assigns agents in order", () => {
    const empty = buildTownPlots([], {});
    assert.equal(empty.length, 8);
    assert.ok(empty.every((plot) => plot.status === "OPEN"));
    const agents = ["a", "b", "c"].map((id) => ({ id, name: id, slug: id, ownerName: null }));
    const plots = buildTownPlots(agents, {});
    assert.deepEqual(plots.slice(0, 3).map((plot) => [plot.plotNo, plot.agent?.id, plot.rentDollars]), [[1, "a", 10], [2, "b", 20], [3, "c", 40]]);
    assert.equal(plots.slice(3).every((plot) => plot.status === "OPEN"), true);
    assert.equal(nextPlotRent(plots), 80);
  });

  it("shows a CTA only for open plots", () => {
    const [occupied, open] = buildTownPlots(
      [{ id: "a", name: "A", slug: "a", ownerName: null }],
      {},
    );
    assert.equal(plotCta(occupied), null);
    assert.deepEqual(plotCta(open), { label: "For rent — start the five", href: "/build" });
  });

  it("sorts ticker events newest first, drops invalid timestamps, and caps at 12", () => {
    const events = Array.from({ length: 14 }, (_, i) => ({ ts: new Date(2026, 0, i + 1), kind: "event", text: `${i}` }));
    events.push({ ts: "bad-date" as unknown as Date, kind: "event", text: "invalid" });
    const merged = mergeTicker(events);
    assert.equal(merged.length, 12);
    assert.equal(merged[0].text, "13");
    assert.equal(merged[11].text, "2");
  });

  it("sets day/night phase at the ET boundaries", () => {
    assert.equal(etDayPhase(6), "night");
    assert.equal(etDayPhase(7), "day");
    assert.equal(etDayPhase(18), "day");
    assert.equal(etDayPhase(19), "night");
  });
});
