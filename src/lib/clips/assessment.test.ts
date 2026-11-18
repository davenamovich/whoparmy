import { test } from "node:test";
import assert from "node:assert/strict";

import { CRITERIA, KILL_RULES, assess, normaliseScore, summarise } from "./assessment.ts";

test("weights: the rubric adds up to exactly one", () => {
  const sum = CRITERIA.reduce((s, c) => s + c.weight, 0);
  assert.equal(Number(sum.toFixed(6)), 1);
});

test("scoring: a missing sub-score is a 1, not an average of what was supplied", () => {
  assert.equal(normaliseScore(undefined), 1);
  assert.equal(normaliseScore(0), 1);
  assert.equal(normaliseScore(9), 5);
  assert.equal(normaliseScore(3.4), 3);
});

test("verdict: a strong niche is a build", () => {
  const a = assess({
    vertical: "local service businesses",
    buyer: "plumber / electrician with 2-10 staff",
    scores: { buyerBudget: 5, sourceMaterial: 4, distribution: 4, costRatio: 5, memoryMoat: 4, rightsRisk: 4 },
  });
  assert.equal(a.verdict, "build");
  assert.ok(a.total >= 4);
  assert.deepEqual(a.killedBy, []);
});

test("verdict: a middling niche earns a two-week test, not a build", () => {
  const a = assess({
    vertical: "niche hobby communities",
    buyer: "etsy seller",
    scores: { buyerBudget: 3, sourceMaterial: 3, distribution: 3, costRatio: 4, memoryMoat: 3, rightsRisk: 4 },
  });
  assert.equal(a.verdict, "test");
  assert.match(a.reason, /two-week/);
});

test("kill: rights risk overrides a high total", () => {
  const a = assess({
    vertical: "sports highlight clips",
    buyer: "fan pages",
    scores: { buyerBudget: 5, sourceMaterial: 5, distribution: 5, costRatio: 5, memoryMoat: 4, rightsRisk: 2 },
  });
  assert.equal(a.verdict, "pass");
  assert.match(a.killedBy[0], /Rights risk/);
  assert.ok(a.total > 4, "the total can be high and the verdict still pass — that is the point");
});

test("kill: no budget means free work, whatever else scores", () => {
  const a = assess({
    vertical: "student creators",
    buyer: "students",
    scores: { buyerBudget: 1, sourceMaterial: 5, distribution: 5, costRatio: 5, memoryMoat: 3, rightsRisk: 5 },
  });
  assert.equal(a.verdict, "pass");
  assert.match(a.killedBy[0], /pays for content/);
});

test("kill: an unreachable audience dies even with money in it", () => {
  const a = assess({
    vertical: "enterprise procurement",
    buyer: "fortune 500",
    scores: { buyerBudget: 5, sourceMaterial: 4, distribution: 1, costRatio: 5, memoryMoat: 4, rightsRisk: 5 },
  });
  assert.equal(a.verdict, "pass");
  assert.match(a.killedBy[0], /channel without ad spend/);
});

test("every kill rule is reachable by at least one score set", () => {
  // A rubric nobody can fail is decoration.
  const probe = { buyerBudget: 5, sourceMaterial: 5, distribution: 5, costRatio: 5, memoryMoat: 5, rightsRisk: 5 };
  for (const rule of KILL_RULES) {
    const key = rule.why.includes("Rights") ? "rightsRisk"
      : rule.why.includes("pays for content") ? "buyerBudget"
      : rule.why.includes("channel") ? "distribution"
      : "costRatio";
    const fired = assess({ vertical: "probe", buyer: "probe", scores: { ...probe, [key]: 1 } });
    assert.equal(fired.verdict, "pass", rule.why);
    assert.ok(fired.killedBy.length > 0);
  }
});

test("summary: names the weakest criterion so the fix is obvious", () => {
  const a = assess({
    vertical: "local service businesses",
    buyer: "plumber",
    scores: { buyerBudget: 5, sourceMaterial: 4, distribution: 4, costRatio: 5, memoryMoat: 2, rightsRisk: 4 },
  });
  assert.match(summarise(a), /Weakest: Memory compounds \(2\)/);
});
