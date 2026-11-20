import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  bridgeCall,
  bridgeCallResult,
  MemoryUnavailableError,
  mnemosCapture,
  mnemosExport,
  mnemosRecall,
  mnemosSnapshotResult,
} from "./mnemos-bridge.ts";

// The bridge is reached only through global fetch, so a fake fetch is the
// whole store. Each case pins one state that used to collapse into null.

const realFetch = globalThis.fetch;
let calls = 0;

function rpc(text: string, isError = false) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }], isError } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function useFetch(fn: (n: number) => Response | Promise<Response>) {
  calls = 0;
  globalThis.fetch = (async () => fn(++calls)) as typeof fetch;
}

beforeEach(() => {
  process.env.MNEMOS_BRIDGE_TOKEN = "test-token";
  process.env.MNEMOS_BRIDGE_URL = "http://bridge.test/mcp";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MNEMOS_BRIDGE_TOKEN;
  delete process.env.MNEMOS_BRIDGE_URL;
});

const FACTS = "## Durable memories:\n- [words: shop] Sells handmade candles. id=engram_1 kind=semantic confidence=0.9\n- Ships only in Canada.";

test("no token: unconfigured, and no request is made", async () => {
  delete process.env.MNEMOS_BRIDGE_TOKEN;
  useFetch(() => rpc("should not be called"));
  assert.deepEqual(await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" }), { ok: false, reason: "unconfigured" });
  assert.equal(calls, 0);
});

test("an empty answer is a success, not 'unavailable'", async () => {
  useFetch(() => rpc(""));
  assert.deepEqual(await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" }), { ok: true, text: "" });
  assert.equal(await mnemosRecall("member-u1", "x"), "");
  assert.equal(await bridgeCall("member-u1", "mnemos_recall", { query: "x" }), "");
});

test("a rejected token is unauthorized and is NOT retried", async () => {
  useFetch(() => new Response("nope", { status: 401 }));
  const r = await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" });
  assert.deepEqual(r, { ok: false, reason: "unauthorized", status: 401 });
  assert.equal(calls, 1);
});

test("a tool error is reported as such and is not retried", async () => {
  useFetch(() => rpc("bad args", true));
  const r = await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" });
  assert.deepEqual(r, { ok: false, reason: "tool_error" });
  assert.equal(calls, 1);
});

test("a dropped connection is retried once, and the retry can succeed", async () => {
  useFetch((n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return rpc("hello");
  });
  assert.deepEqual(await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" }), { ok: true, text: "hello" });
  assert.equal(calls, 2);
});

test("a 5xx is retried once, then reported with its status", async () => {
  useFetch(() => new Response("down", { status: 503 }));
  assert.deepEqual(await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" }), { ok: false, reason: "http", status: 503 });
  assert.equal(calls, 2);
});

test("a JSON-RPC error body is a failure, not an empty memory", async () => {
  useFetch(() => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no such tool" } }), { status: 200 }));
  const r = await bridgeCallResult("member-u1", "mnemos_recall", { query: "x" });
  assert.equal(r.ok, false);
});

test("capture is true only when the write was confirmed", async () => {
  useFetch(() => rpc("captured engram_9"));
  assert.equal(await mnemosCapture("member-u1", "Sells candles", "test"), true);
  useFetch(() => new Response("nope", { status: 401 }));
  assert.equal(await mnemosCapture("member-u1", "Sells candles", "test"), false);
});

test("export: an empty store returns [], an outage throws with the reason", async () => {
  useFetch(() => rpc(""));
  assert.deepEqual(await mnemosExport("member-u1"), []);

  useFetch(() => new Response("nope", { status: 401 }));
  await assert.rejects(mnemosExport("member-u1"), (err: unknown) => {
    assert.ok(err instanceof MemoryUnavailableError);
    assert.equal(err.reason, "unauthorized");
    return true;
  });
});

test("export: one failed query fails the whole export — no partial file passed off as whole", async () => {
  useFetch((n) => (n === 3 ? new Response("nope", { status: 403 }) : rpc(FACTS)));
  await assert.rejects(mnemosExport("member-u1"), MemoryUnavailableError);
});

test("export: facts are parsed and de-duplicated across the query battery", async () => {
  useFetch(() => rpc(FACTS));
  assert.deepEqual(await mnemosExport("member-u1"), ["Sells handmade candles.", "Ships only in Canada."]);
});

test("snapshot: ok, empty and unavailable are three different answers", async () => {
  useFetch(() => rpc(FACTS));
  const ok = await mnemosSnapshotResult("member-u1");
  assert.equal(ok.status, "ok");
  assert.ok(ok.status === "ok" && ok.text.includes("Sells handmade candles."));

  useFetch(() => rpc(""));
  assert.deepEqual(await mnemosSnapshotResult("member-u1"), { status: "empty" });

  delete process.env.MNEMOS_BRIDGE_TOKEN;
  assert.deepEqual(await mnemosSnapshotResult("member-u1"), { status: "unavailable", reason: "unconfigured" });
});
