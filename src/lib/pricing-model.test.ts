import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANS } from "./plans.ts";
import { PACK_PLANS } from "./credit-packs.ts";

test("every plan has the same 100 monthly generation allowance", () => {
  assert.deepEqual(PLANS.map((plan) => plan.monthlyItems), [100, 100, 100, 100]);
});

test("credit pack plan ids map to their configured balances", () => {
  assert.deepEqual(PACK_PLANS, {
    plan_ro5V6OiZJrHid: 1000,
    plan_Ldt5UzDhP45JC: 2500,
    plan_I7PCObvkA1ZUQ: 5000,
  });
});
