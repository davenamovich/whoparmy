import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.ts";

test("retired member Barry endpoint returns 410 and directs members to build", async () => {
  const response = await POST();
  assert.equal(response.status, 410);
  assert.match(await response.text(), /Barry now works for the house only.*\/build/);
});
