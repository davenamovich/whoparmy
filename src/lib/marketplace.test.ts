import { test } from "node:test";
import assert from "node:assert/strict";
import { runBattery, scanForSecrets, validateBundle, type BatteryInput, type Bundle } from "./marketplace.ts";

const goodBundle: Bundle = { files: [{ path: "BUILD-PROMPT.md", text: "Build the app" }, { path: "keys.md", text: "No keys committed" }] };
const base: BatteryInput = { bundle: goodBundle, manifest: { skills: ["known"], keys: ["Weather API"] }, listing: { name: "Demo", priceCents: 0, demoKind: null, videoUrl: null }, demoProbe: null, skillExists: (s) => s === "known", oneInput: "A topic" };
const check = (input: BatteryInput, id: string) => runBattery(input).checks.find((c) => c.id === id)!;

test("bundle limits and relative unique paths are enforced", () => {
  assert.equal(validateBundle(goodBundle).ok, true);
  assert.equal(validateBundle({ files: [{ path: "../bad", text: "x" }] }).ok, false);
  assert.equal(validateBundle({ files: [{ path: "a", text: "x" }, { path: "a", text: "y" }] }).ok, false);
});
test("sabotage fixture: planted OpenAI style key fails secrets", () => {
  const bundle = { files: [...goodBundle.files, { path: "src/config.ts", text: `const key = "sk-${"a".repeat(24)}"` }] };
  assert.ok(scanForSecrets(bundle).some((f) => f.kind === "openai-key"));
  assert.equal(check({ ...base, bundle }, "secrets").pass, false);
});
test("sabotage fixture: planted PEM private key fails secrets", () => {
  const bundle = { files: [...goodBundle.files, { path: "key.pem", text: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----" }] };
  assert.ok(scanForSecrets(bundle).some((f) => f.kind === "private-key"));
});
test("sabotage fixture: placeholders are not secret findings", () => {
  assert.deepEqual(scanForSecrets({ files: [{ path: "config.env", text: 'api_key = "YOUR_API_KEY"' }, { path: "sample", text: 'token="..." password="<key>"' }] }), []);
});
test("sabotage fixture: missing build prompt fails bundle-shape", () => {
  assert.equal(check({ ...base, bundle: { files: [{ path: "keys.md", text: "key" }] } }, "bundle-shape").pass, false);
});
test("sabotage fixture: unknown skill fails manifest", () => {
  assert.equal(check({ ...base, manifest: { skills: ["missing"], keys: ["service"] } }, "manifest").pass, false);
});
test("sabotage fixture: paid listing with unreachable demo fails", () => {
  assert.equal(check({ ...base, listing: { ...base.listing, priceCents: 1200, videoUrl: "https://demo.invalid/video" }, demoProbe: { reachable: false, contentType: null } }, "demo").pass, false);
});
test("sabotage fixture: free listing without video passes demo", () => {
  assert.equal(check(base, "demo").pass, true);
  assert.equal(runBattery(base).status, "READY");
});
