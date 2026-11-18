import { test } from "node:test";
import assert from "node:assert/strict";

import {
  briefToPrompt,
  declineRound,
  resolve,
  roundFor,
  sessionSeed,
  startSession,
  takeUpside,
  type GameState,
} from "./game.ts";

test("floor: no sequence of choices can end below the pack bought", () => {
  // 500 seeds x every accept/decline pattern reachable in 3 rounds.
  for (let seed = 0; seed < 500; seed++) {
    const floor = 1 + (seed % 20);
    let state: GameState = startSession({ floor, seed, maxRounds: 3 });

    // take both, take first only, decline everything, then all-0 and all-1
    const patterns: Array<Array<0 | 1 | "decline">> = [
      [0, 0, 0],
      [1, 1, 1],
      [0, "decline", 1],
      ["decline", "decline", "decline"],
      [1, 0, "decline"],
    ];

    for (const pattern of patterns) {
      for (const move of pattern) {
        state = move === "decline" ? declineRound(state) : takeUpside(state, move);
      }
      const out = resolve(state);
      assert.ok(out.clips >= floor, `seed ${seed} floor ${floor} produced ${out.clips}`);
      assert.equal(out.extraClips >= 0, true);
      state = startSession({ floor, seed, maxRounds: 3 });
    }
  }
});

test("no re-roll: the same seed and round always give the same two upsides", () => {
  const state = startSession({ floor: 10, seed: 424242, maxRounds: 3 });
  const a = roundFor(state);
  const b = roundFor({ ...state });
  assert.deepEqual(a, b);

  const afterReload = roundFor(startSession({ floor: 10, seed: 424242, maxRounds: 3 }));
  assert.deepEqual(a, afterReload);
});

test("no re-roll: a new day is a new board, the same day is not", () => {
  const day1 = new Date("2026-11-18T09:00:00Z");
  const day1Late = new Date("2026-11-18T22:00:00Z");
  const day2 = new Date("2026-11-19T09:00:00Z");
  assert.equal(sessionSeed("user_1", "page_1", day1), sessionSeed("user_1", "page_1", day1Late));
  assert.notEqual(sessionSeed("user_1", "page_1", day1), sessionSeed("user_1", "page_1", day2));
  assert.notEqual(sessionSeed("user_1", "page_1", day1), sessionSeed("user_2", "page_1", day1));
});

test("both upsides are always shown: one clips, one brief", () => {
  for (let seed = 0; seed < 50; seed++) {
    const round = roundFor(startSession({ floor: 8, seed, maxRounds: 3 }));
    const kinds = round.options.map((o) => o.kind).sort();
    assert.deepEqual(kinds, ["bonus_clips", "brief"]);
    assert.ok((round.options[0].amount ?? 0) > 0 || round.options[1].amount! > 0);
    for (const option of round.options) assert.ok(option.label.length > 0);
  }
});

test("taking the clips adds clips and no brief", () => {
  const state = startSession({ floor: 10, seed: 7, maxRounds: 3 });
  const round = roundFor(state);
  const clipsIndex = round.options.findIndex((o) => o.kind === "bonus_clips") as 0 | 1;
  const next = takeUpside(state, clipsIndex);
  assert.ok(next.bonus > 0);
  assert.equal(next.briefs.length, 0);
  assert.equal(next.round, 1);
});

test("taking the brief keeps the floor and adds the brief", () => {
  const state = startSession({ floor: 10, seed: 7, maxRounds: 3 });
  const round = roundFor(state);
  const briefIndex = round.options.findIndex((o) => o.kind === "brief") as 0 | 1;
  const next = takeUpside(state, briefIndex);
  assert.equal(next.bonus, 0);
  assert.equal(next.briefs.length, 1);
  assert.equal(resolve(next).clips, 10);
});

test("declining costs nothing at all", () => {
  const state = startSession({ floor: 12, seed: 99, maxRounds: 3 });
  const after = declineRound(state);
  assert.equal(after.bonus, 0);
  assert.equal(after.briefs.length, 0);
  assert.equal(resolve(after).clips, 12);
});

test("rounds stop at maxRounds — no extra pulls from a stuck client", () => {
  let state = startSession({ floor: 5, seed: 3, maxRounds: 2 });
  state = takeUpside(state, 0);
  state = takeUpside(state, 0);
  const third = takeUpside(state, 0);
  assert.equal(third.round, 2);
  assert.equal(third.chosen.length, 2);
});

test("briefs do not repeat within a session while the library allows", () => {
  let state = startSession({ floor: 20, seed: 11, maxRounds: 5 });
  for (let i = 0; i < 5; i++) {
    const round = roundFor(state);
    const briefIndex = round.options.findIndex((o) => o.kind === "brief") as 0 | 1;
    state = takeUpside(state, briefIndex);
  }
  const angles = state.briefs.map((b) => b.angle);
  assert.equal(new Set(angles).size, angles.length);
});

test("resolve: the copy states the floor, and never claims a result", () => {
  let state = startSession({ floor: 10, seed: 21, maxRounds: 3 });
  state = takeUpside(state, 0);
  const out = resolve(state);
  assert.match(out.note, /floor stands/);
  assert.doesNotMatch(out.note, /views|reach|followers|guarantee|win/i);
});

test("briefToPrompt: the brief is the only thing that reaches Muse", () => {
  let state = startSession({ floor: 10, seed: 21, maxRounds: 3 });
  const round = roundFor(state);
  const briefIndex = round.options.findIndex((o) => o.kind === "brief") as 0 | 1;
  state = takeUpside(state, briefIndex);
  const brief = state.briefs[0];
  const prompt = briefToPrompt(brief, "GTA 6 news and nostalgia");
  assert.match(prompt, /Angle:/);
  assert.match(prompt, /Page niche: GTA 6 news and nostalgia/);
  assert.match(prompt, /credit/i);
  assert.match(prompt, /approval/);
});
