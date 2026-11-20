import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSignup } from "./bridge-signup.ts";

describe("resolveSignup — referrer first, house fallback", () => {
  it("uses the referrer's saved link when they have one", () => {
    const r = resolveSignup("https://dh.media/?affid=HOUSE", "https://dh.media/?affid=REFERRER");
    assert.equal(r.signupUrl, "https://dh.media/?affid=REFERRER");
    assert.equal(r.signupSource, "referrer");
  });

  it("falls back to the house example when the referrer saved none", () => {
    const r = resolveSignup("https://whop.com/?code=XIGEWN", "");
    assert.equal(r.signupUrl, "https://whop.com/?code=XIGEWN");
    assert.equal(r.signupSource, "house");
    assert.equal(resolveSignup("https://whop.com/?code=XIGEWN", null).signupSource, "house");
    assert.equal(resolveSignup("https://whop.com/?code=XIGEWN", undefined).signupSource, "house");
  });

  it("treats text placeholders as no sign-up link", () => {
    assert.deepEqual(resolveSignup("Your Freebuff referral link", null), {
      signupUrl: null,
      signupSource: null,
    });
    assert.deepEqual(resolveSignup("Your Railway referral link", "  "), {
      signupUrl: null,
      signupSource: null,
    });
  });

  it("a referrer link still wins when the house example is a placeholder", () => {
    const r = resolveSignup("Your Freebuff referral link", "https://freebuff.example/?ref=abc");
    assert.equal(r.signupUrl, "https://freebuff.example/?ref=abc");
    assert.equal(r.signupSource, "referrer");
  });

  it("ignores a non-URL referrer value and falls back to house", () => {
    const r = resolveSignup("https://agent37.com/?via=riffle", "not a link");
    assert.equal(r.signupUrl, "https://agent37.com/?via=riffle");
    assert.equal(r.signupSource, "house");
  });
});
