import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateIntakeInput } from "./intake.ts";

const base = { name: "Sam Rivera", businessName: "Rivera Roofing", websiteUrl: "riveraroofing.com", intent: "content_pack" };

describe("validateIntakeInput", () => {
  it("accepts a complete claim and normalizes it", () => {
    const r = validateIntakeInput(base);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.name, "Sam Rivera");
    assert.equal(r.value.businessName, "Rivera Roofing");
    assert.equal(r.value.websiteUrl, "https://riveraroofing.com/");
    assert.equal(r.value.noWebsite, false);
    assert.equal(r.value.intent, "content_pack");
    assert.equal(r.value.refCode, null);
    assert.equal(r.value.source, null);
  });

  it("trims surrounding whitespace from name and business", () => {
    const r = validateIntakeInput({ ...base, name: "  Sam  ", businessName: "  Rivera Roofing  " });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.name, "Sam");
    assert.equal(r.value.businessName, "Rivera Roofing");
  });

  it("rejects a missing or blank name", () => {
    assert.equal(validateIntakeInput({ ...base, name: "" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, name: "   " }).ok, false);
    assert.equal(validateIntakeInput({ ...base, name: undefined }).ok, false);
  });

  it("rejects an over-long name and business name", () => {
    assert.equal(validateIntakeInput({ ...base, name: "x".repeat(81) }).ok, false);
    assert.equal(validateIntakeInput({ ...base, businessName: "x".repeat(121) }).ok, false);
    assert.equal(validateIntakeInput({ ...base, name: "x".repeat(80), businessName: "x".repeat(120) }).ok, true);
  });

  it("rejects a missing business name", () => {
    assert.equal(validateIntakeInput({ ...base, businessName: "" }).ok, false);
  });

  it("requires a website unless noWebsite is set", () => {
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, websiteUrl: undefined }).ok, false);
  });

  it("noWebsite bypasses the website and stores null", () => {
    const r = validateIntakeInput({ ...base, websiteUrl: "", noWebsite: true });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.noWebsite, true);
    assert.equal(r.value.websiteUrl, null);
  });

  it("noWebsite ignores a stray website value", () => {
    const r = validateIntakeInput({ ...base, websiteUrl: "not a url", noWebsite: true });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.websiteUrl, null);
  });

  it("prepends https:// when the scheme is missing", () => {
    const r = validateIntakeInput({ ...base, websiteUrl: "www.rivera-roofing.com/contact" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.websiteUrl, "https://www.rivera-roofing.com/contact");
  });

  it("keeps an explicit http:// URL", () => {
    const r = validateIntakeInput({ ...base, websiteUrl: "http://rivera.example.com" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.websiteUrl, "http://rivera.example.com/");
  });

  it("rejects a bad URL", () => {
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "not a url" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "https://" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "localhost" }).ok, false);
  });

  it("rejects a non-http(s) scheme", () => {
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "ftp://rivera.example.com" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, websiteUrl: "javascript:alert(1)" }).ok, false);
  });

  it("accepts exactly the four intents", () => {
    for (const intent of ["content_pack", "seo_audit", "ceo_experience", "just_agent"]) {
      assert.equal(validateIntakeInput({ ...base, intent }).ok, true, intent);
    }
  });

  it("rejects a bad or missing intent", () => {
    assert.equal(validateIntakeInput({ ...base, intent: "seo_3_dollar" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, intent: "" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, intent: undefined }).ok, false);
  });

  it("uppercases a valid refCode", () => {
    const r = validateIntakeInput({ ...base, refCode: "dave-1a2b" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.refCode, "DAVE-1A2B");
  });

  it("treats a blank refCode as absent", () => {
    const r = validateIntakeInput({ ...base, refCode: "  " });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.refCode, null);
  });

  it("rejects a malformed refCode", () => {
    assert.equal(validateIntakeInput({ ...base, refCode: "bad code!" }).ok, false);
    assert.equal(validateIntakeInput({ ...base, refCode: "x".repeat(65) }).ok, false);
    assert.equal(validateIntakeInput({ ...base, refCode: "code/with/slash" }).ok, false);
  });

  it("keeps a short source and caps a long one at 64 chars", () => {
    const r = validateIntakeInput({ ...base, source: "town" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.source, "town");
    const long = validateIntakeInput({ ...base, source: "s".repeat(100) });
    assert.equal(long.ok, true);
    if (!long.ok) return;
    assert.equal(long.value.source?.length, 64);
  });
});
