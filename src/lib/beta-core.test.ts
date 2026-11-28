import test from "node:test"; import assert from "node:assert/strict"; import { validateBountyCents, evaluateUnlock, validateSpend, approveReport, validLane, enrollLane, enrollmentLaneWrite, deliveryEmailRequired } from "./beta-core.ts";
const tester = (x: Partial<Parameters<typeof evaluateUnlock>[0]> = {}) => ({ lane:"muse", facebookPageRecorded:false, postsPosted:0, bountyUnlocked:false, boardHandle:"", fuelGranted:100, fuelUsed:0, bountyGranted:100, bountyUsed:0, ...x });
test("bounty floor", () => assert.throws(() => validateBountyCents(19))); test("unlock requires page and post", () => { assert.equal(evaluateUnlock(tester({facebookPageRecorded:true})), false); assert.equal(evaluateUnlock(tester({facebookPageRecorded:true,postsPosted:1})), true); });
test("bounty spend requires unlock and handle", () => { assert.throws(() => validateSpend(tester(),"bounty",1)); assert.throws(() => validateSpend(tester({bountyUnlocked:true}),"bounty",1)); });
test("fuel overspend blocked", () => assert.throws(() => validateSpend(tester({fuelGranted:1}),"fuel",2)));
test("approval pays and writes ledger", () => { const r=approveReport({campaign:{fundedCents:50},tester:tester(),bountyCents:20,ledger:{amountCents:20,kind:"",memo:"ok"}}); assert.equal(r.campaign.fundedCents,30); assert.equal(r.ledger.amountCents,20); });
test("approval fails on insufficient pool", () => assert.throws(() => approveReport({campaign:{fundedCents:19},tester:tester(),bountyCents:20,ledger:{amountCents:20,kind:"",memo:""}})));
test("validLane accepts known lanes and rejects other values", () => {
  assert.equal(validLane("muse"), "muse");
  assert.equal(validLane("agent37"), "agent37");
  for (const value of ["", "Agent37", "other", null, undefined, 37]) assert.equal(validLane(value), null);
});
test("enrollLane maps only the Agent37 query param to Agent37", () => {
  assert.equal(enrollLane("agent37"), "agent37");
  for (const value of [null, "muse", "other", "Agent37"]) assert.equal(enrollLane(value), "muse");
});
test("enrollment lane writes valid values on create and update only", () => {
  assert.deepEqual(enrollmentLaneWrite(undefined, false), { create: null, update: undefined });
  assert.deepEqual(enrollmentLaneWrite("muse", false), { create: "muse", update: "muse" });
  assert.deepEqual(enrollmentLaneWrite("agent37", false), { create: "agent37", update: "agent37" });
  assert.deepEqual(enrollmentLaneWrite(undefined, true), { create: null, update: undefined });
  assert.deepEqual(enrollmentLaneWrite("muse", true), { create: null, update: "muse" });
  assert.deepEqual(enrollmentLaneWrite("agent37", true), { create: null, update: "agent37" });
  assert.deepEqual(enrollmentLaneWrite("invalid", false), { create: null, update: undefined });
  assert.deepEqual(enrollmentLaneWrite("invalid", true), { create: null, update: undefined });
});
test("Agent37 bounty unlock preserves human verified flag only", () => {
  assert.equal(evaluateUnlock(tester({ lane:"agent37", facebookPageRecorded:true, postsPosted:1 })), false);
  assert.equal(evaluateUnlock(tester({ lane:"agent37", bountyUnlocked:true })), true);
  assert.equal(evaluateUnlock(tester({ lane:"muse", facebookPageRecorded:true, postsPosted:1 })), true);
  assert.equal(evaluateUnlock(tester({ lane:"muse", facebookPageRecorded:true, postsPosted:0 })), false);
});
test("Agent37 bounty spend does not require a Board handle", () => {
  assert.doesNotThrow(() => validateSpend(tester({ lane:"agent37", bountyUnlocked:true }), "bounty", 1));
  assert.throws(() => validateSpend(tester({ lane:"agent37" }), "bounty", 1));
  assert.throws(() => validateSpend(tester({ lane:"muse", bountyUnlocked:true }), "bounty", 1));
});
test("delivery email is required only for Agent37", () => {
  assert.equal(deliveryEmailRequired("agent37", "  "), true);
  assert.equal(deliveryEmailRequired("agent37", " user@example.com "), false);
  assert.equal(deliveryEmailRequired("muse", ""), false);
});
