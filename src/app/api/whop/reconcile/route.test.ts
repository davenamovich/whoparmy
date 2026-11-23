import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(`${process.cwd()}/src/${specifier.slice(2)}.ts`).href, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, specifier === "server-only"
      ? { ...context, conditions: [...context.conditions, "react-server"] }
      : context);
  },
});
const { handleReconcileRequest } = await import("./route.ts").finally(() => hooks.deregister());

test("reconcile route requires the shared secret and returns the summary", async () => {
  process.env.RECONCILE_SECRET = "test-secret";
  const run = async (headers: HeadersInit) => handleReconcileRequest({ headers: new Headers(headers) }, async () => ({ hooks: 1 } as never));
  assert.equal((await run({})).status, 403);
  assert.equal((await run({ "x-reconcile-secret": "wrong" })).status, 403);
  const response = await run({ "x-reconcile-secret": "test-secret" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hooks: 1 });
});
