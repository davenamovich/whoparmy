import { test } from "node:test";
import assert from "node:assert/strict";
import { runBattery, scanForSecrets, validateBundle, publishGate, isTrustedSeller, splitSale, canDownloadKit, parseSkillsyncUrl, bundleSkillName, type BatteryInput, type Bundle } from "./marketplace.ts";

test("70/15/15 sale split preserves the gross, with referrer absorbing rounding", () => {
  assert.deepEqual(splitSale(2500), { sellerCents: 1750, platformCents: 375, referrerCents: 375 });
  for (const gross of [1, 3, 99, 101, 1999, 12345]) { const split = splitSale(gross); assert.equal(split.sellerCents + split.platformCents + split.referrerCents, gross); }
  assert.deepEqual(splitSale(0), { sellerCents: 0, platformCents: 0, referrerCents: 0 });
});
test("kit downloads require ownership, a free listing, or an active sale", () => {
  assert.equal(canDownloadKit({ isOwner: true, priceCents: 100, hasActiveSale: false }), true);
  assert.equal(canDownloadKit({ isOwner: false, priceCents: 0, hasActiveSale: false }), true);
  assert.equal(canDownloadKit({ isOwner: false, priceCents: 100, hasActiveSale: true }), true);
  assert.equal(canDownloadKit({ isOwner: false, priceCents: 100, hasActiveSale: false }), false);
});

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

test("publish gate matrix names each failing gate", () => {
  const ready = { batteryReady: true, feeStatus: "PAID" as const, reviewRequired: true, reviewApproved: true, isOperator: false };
  assert.deepEqual(publishGate({ ...ready, batteryReady: false }), { ok: false, reasons: ["Battery is not ready."] });
  assert.deepEqual(publishGate({ ...ready, feeStatus: "UNPAID" }), { ok: false, reasons: ["Listing fee is not paid."] });
  assert.deepEqual(publishGate({ ...ready, reviewApproved: false }), { ok: false, reasons: ["Operator review is not approved."] });
  assert.deepEqual(publishGate({ ...ready, feeStatus: "PENDING" }), { ok: false, reasons: ["Listing fee is not paid."] });
  assert.deepEqual(publishGate({ ...ready, batteryReady: false, feeStatus: "PENDING", reviewApproved: false }), { ok: false, reasons: ["Battery is not ready.", "Listing fee is not paid.", "Operator review is not approved."] });
});
test("operator bypasses publish gates and trusted seller count starts at three", () => {
  assert.deepEqual(publishGate({ batteryReady: true, feeStatus: "UNPAID", reviewRequired: true, reviewApproved: false, isOperator: true }), { ok: true, reasons: [] });
  assert.deepEqual(publishGate({ batteryReady: false, feeStatus: "UNPAID", reviewRequired: true, reviewApproved: false, isOperator: true }), { ok: false, reasons: ["Battery is not ready."] });
  assert.equal(isTrustedSeller(2), false);
  assert.equal(isTrustedSeller(3), true);
  assert.deepEqual(publishGate({ batteryReady: true, feeStatus: "WAIVED", reviewRequired: !isTrustedSeller(3), reviewApproved: false, isOperator: false }), { ok: true, reasons: [] });
});

// ─── Skillsync install lane (Lane A S3, 2026-11-24) ───────────────
const skillBundle: Bundle = { files: [...goodBundle.files, { path: "SKILL.md", text: "---\nname: my-skill\ndescription: A skill\n---\n# My Skill\n" }] };
const ssBase: BatteryInput = { ...base, bundle: skillBundle, skillsyncUrl: "https://app.skillsync.com/someowner/my-skill", skillsyncProbe: { outcome: "OK" } };

test("skillsync URL parser accepts owner/slug links and refuses everything else", () => {
  assert.deepEqual(parseSkillsyncUrl("https://app.skillsync.com/iammagicdave/plunder-and-riffle"), { owner: "iammagicdave", slug: "plunder-and-riffle" });
  assert.deepEqual(parseSkillsyncUrl("https://app.skillsync.com/someowner/my-skill/"), { owner: "someowner", slug: "my-skill" });
  assert.equal(parseSkillsyncUrl("https://example.com/someowner/my-skill"), null);
  assert.equal(parseSkillsyncUrl("https://app.skillsync.com/onlyowner"), null);
  assert.equal(parseSkillsyncUrl("http://app.skillsync.com/someowner/my-skill"), null);
  assert.equal(parseSkillsyncUrl(null), null);
});
test("bundle skill name comes from SKILL.md frontmatter", () => {
  assert.equal(bundleSkillName(skillBundle), "my-skill");
  assert.equal(bundleSkillName(goodBundle), null);
  assert.equal(bundleSkillName({ files: [{ path: "skills/x/SKILL.md", text: "---\nname: 'quoted-name'\n---\n" }] }), "quoted-name");
});
test("listings without a skillsync link pass both skillsync checks as not-applicable", () => {
  assert.equal(check(base, "skillsync-link").pass, true);
  assert.equal(check(base, "skillsync-name").pass, true);
  assert.equal(runBattery(base).status, "READY");
});
test("skillsync link that resolves publicly and matches SKILL.md passes and can be READY", () => {
  assert.equal(check(ssBase, "skillsync-link").pass, true);
  assert.equal(check(ssBase, "skillsync-name").pass, true);
  assert.equal(runBattery(ssBase).status, "READY");
});
test("sabotage fixture: skillsync link returning 404 fails SKILLSYNC_LINK_UNRESOLVED", () => {
  const c = check({ ...ssBase, skillsyncProbe: { outcome: "NOT_FOUND" } }, "skillsync-link");
  assert.equal(c.pass, false);
  assert.match(c.reason, /^SKILLSYNC_LINK_UNRESOLVED:/);
  assert.equal(runBattery({ ...ssBase, skillsyncProbe: { outcome: "NOT_FOUND" } }).status, "NEEDS_WORK");
});
test("sabotage fixture: skillsync link behind a login is UNVERIFIED, never a pass", () => {
  const c = check({ ...ssBase, skillsyncProbe: { outcome: "UNVERIFIED" } }, "skillsync-link");
  assert.equal(c.pass, false);
  assert.match(c.reason, /^SKILLSYNC_LINK_UNVERIFIED:/);
  const noProbe = check({ ...ssBase, skillsyncProbe: null }, "skillsync-link");
  assert.equal(noProbe.pass, false);
  assert.match(noProbe.reason, /^SKILLSYNC_LINK_UNVERIFIED:/);
});
test("sabotage fixture: SKILL.md name that differs from the skillsync slug fails SKILLSYNC_NAME_MISMATCH", () => {
  const bundle = { files: [...goodBundle.files, { path: "SKILL.md", text: "---\nname: other-skill\n---\n" }] };
  const c = check({ ...ssBase, bundle }, "skillsync-name");
  assert.equal(c.pass, false);
  assert.match(c.reason, /^SKILLSYNC_NAME_MISMATCH:/);
});
test("skillsync name matching normalizes underscores like the skill registry", () => {
  const bundle = { files: [...goodBundle.files, { path: "SKILL.md", text: "---\nname: my_skill\n---\n" }] };
  assert.equal(check({ ...ssBase, bundle }, "skillsync-name").pass, true);
});
test("sabotage fixture: skillsync link without a SKILL.md in the bundle fails SKILLSYNC_SKILL_MD_MISSING", () => {
  const c = check({ ...ssBase, bundle: goodBundle }, "skillsync-name");
  assert.equal(c.pass, false);
  assert.match(c.reason, /^SKILLSYNC_SKILL_MD_MISSING:/);
});
test("sabotage fixture: malformed skillsync URL fails SKILLSYNC_URL_INVALID on both checks", () => {
  const bad = { ...ssBase, skillsyncUrl: "https://example.com/someowner/my-skill" };
  assert.match(check(bad, "skillsync-link").reason, /^SKILLSYNC_URL_INVALID:/);
  assert.equal(check(bad, "skillsync-link").pass, false);
  assert.match(check(bad, "skillsync-name").reason, /^SKILLSYNC_URL_INVALID:/);
  assert.equal(check(bad, "skillsync-name").pass, false);
});
