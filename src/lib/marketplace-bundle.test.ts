import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith(new URL("../", import.meta.url).href)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});

const { scanForSecrets, validateBundle } = await import("./marketplace.ts");
const { BUNDLE_KIT_PATH, BUNDLE_SKILL_NAME, BUNDLE_SKILLS, bundleKit, canDownloadBundle } = await import("./marketplace-bundle.ts");
hooks.deregister();

test("bundle gate follows the grant flag, mirroring the M3 kit gate shape", () => {
  assert.equal(canDownloadBundle({ granted: true }), true);
  assert.equal(canDownloadBundle({ granted: false }), false);
});

test("bundle kit is a valid, secret-clean bundle carrying the real skill folder", () => {
  const kit = bundleKit();
  const validated = validateBundle(kit);
  assert.equal(validated.ok, true);
  assert.deepEqual(scanForSecrets(kit), []);
  assert.equal(kit.files.length, 1);
  assert.equal(kit.files[0].path, `${BUNDLE_SKILL_NAME}/SKILL.md`);
  assert.match(kit.files[0].text, /^---\nname: space-demo-and-replicate\n/);
  // Step 2 of the skill IS the demo-recording skill the bundle promises.
  assert.match(kit.files[0].text, /Step 2/);
});

test("bundle kit content byte-matches the source skill files", () => {
  const source = join(homedir(), "workspace/custom-skills/space-demo-and-replicate/SKILL.md");
  const kit = bundleKit();
  if (existsSync(source)) {
    assert.equal(kit.files[0].text, readFileSync(source, "utf8"));
  } else {
    // Source folder not readable in this environment: the embedded copy
    // must still carry the skill's declared name and both promised parts.
    assert.match(kit.files[0].text, /name: space-demo-and-replicate/);
    assert.match(kit.files[0].text, /replicat/i);
  }
});

test("bundle promises the replicator and the demo recording, served from the bridge kit path", () => {
  assert.deepEqual(BUNDLE_SKILLS.map((s) => s.name), [BUNDLE_SKILL_NAME, BUNDLE_SKILL_NAME]);
  assert.match(BUNDLE_SKILLS[0].note, /replicator/);
  assert.match(BUNDLE_SKILLS[1].note, /demo recording/);
  assert.equal(BUNDLE_KIT_PATH, "/api/bridge/marketplace/bundle/kit");
});
