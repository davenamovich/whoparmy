import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArchitectConfig, sanitizeToolIds, toolsFromJson, toolsToJson } from "./agent-architect-core.ts";

test("sanitizeToolIds keeps only registry tools, deduped", () => {
  const tools = sanitizeToolIds(["memes", "MEMES", "teleport", "video", 42, null]);
  assert.deepEqual(
    tools.map((t) => t.id),
    ["memes", "video"],
  );
});

test("toolsToJson/toolsFromJson round-trip and drop unknown ids", () => {
  const tools = sanitizeToolIds(["scout", "campaigns"]);
  const back = toolsFromJson(toolsToJson(tools));
  assert.deepEqual(
    back.map((t) => t.id),
    ["scout", "campaigns"],
  );
  assert.deepEqual(toolsFromJson('[{"id":"nope"}]'), []);
  assert.deepEqual(toolsFromJson("not json"), []);
  assert.deepEqual(toolsFromJson(null), []);
});

test("parseArchitectConfig reads fenced JSON and validates tools", () => {
  const raw =
    'Here is your agent:\n```json\n{"name":"Roof Lead Finder","role":"Finds roofing prospects.","instructions":"Research each prospect.","tools":["research","teleport"],"defaultKind":"SCOUT","successMetric":"10 profiled prospects a week.","summary":"A researcher."}\n```';
  const cfg = parseArchitectConfig(raw, "I own a roofing company");
  assert.equal(cfg.name, "Roof Lead Finder");
  assert.deepEqual(
    cfg.tools.map((t) => t.id),
    ["research"],
  );
  // Custom agents default to CUSTOM unless an engine/bridge lane was picked.
  assert.equal(cfg.defaultKind, "CUSTOM");
});

test("parseArchitectConfig keeps a picked VIDEO lane", () => {
  const cfg = parseArchitectConfig(
    '{"name":"Clip Maker","role":"Makes videos.","instructions":"Do it.","tools":["video"],"defaultKind":"VIDEO"}',
    "make videos",
  );
  assert.equal(cfg.defaultKind, "VIDEO");
});

test("parseArchitectConfig falls back safely on garbage", () => {
  const cfg = parseArchitectConfig("no json at all", "I need help with marketing");
  assert.equal(cfg.name, "Custom AI Employee");
  assert.ok(cfg.tools.length >= 1);
  assert.ok(cfg.instructions.includes("I need help with marketing"));
  assert.equal(cfg.defaultKind, "CUSTOM");
});
