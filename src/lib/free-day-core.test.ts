import assert from "node:assert/strict";
import { test } from "node:test";
import { isExcludedFreeDaySpace, pickFreeDaySpace } from "./free-day-core.ts";
import { addDaysToEtDate } from "./rotator-market.ts";

test("ET picks are stable across input order and never repeat before the pool cycles", () => {
  const pool = ["alpha", "bravo", "charlie"].map((slug) => ({ id: slug, slug }));
  const history = new Map<string, string>();
  const picked = Array.from({ length: 9 }, (_, offset) => {
    const date = addDaysToEtDate("2026-11-25", offset);
    const space = pickFreeDaySpace(pool, history, date)!;
    assert.equal(pickFreeDaySpace([...pool].reverse(), history, date), space);
    history.set(space.id, date);
    return space.id;
  });
  assert.equal(new Set(picked.slice(0, 3)).size, 3);
  assert.deepEqual(picked.slice(3, 6), picked.slice(0, 3));
  assert.deepEqual(picked.slice(6), picked.slice(0, 3));
  assert.equal(isExcludedFreeDaySpace("senior-move-planner"), true);
  assert.equal(isExcludedFreeDaySpace("Senior Move Planner"), true);
  assert.equal(isExcludedFreeDaySpace("Move Planner"), false);
});
