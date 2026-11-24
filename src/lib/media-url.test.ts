import { test } from "node:test";
import assert from "node:assert/strict";
import { isVideoFileUrl } from "./media-url.ts";

test("isVideoFileUrl recognizes direct video files only", () => {
  assert.equal(isVideoFileUrl("https://x.example/demo.mp4"), true);
  assert.equal(isVideoFileUrl("https://x.example/demo.webm?dl=1"), true);
  assert.equal(isVideoFileUrl("https://x.example/watch?v=1"), false);
  assert.equal(isVideoFileUrl(null), false);
  assert.equal(isVideoFileUrl(undefined), false);
});
