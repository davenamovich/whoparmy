import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMuseInviteCode, resolveMuseInviteCode, resolveSignup } from "./bridge-signup.ts";

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

describe("extractMuseInviteCode — the engine stores codes, not links", () => {
  it("passes a bare code through as itself", () => {
    assert.equal(extractMuseInviteCode("AB12CD34"), "AB12CD34");
    assert.equal(extractMuseInviteCode("  AB12CD34  "), "AB12CD34");
  });

  it("extracts the code a pasted invite link carries", () => {
    assert.equal(extractMuseInviteCode("https://muse.ai/join?code=XY99ZZ88"), "XY99ZZ88");
    assert.equal(extractMuseInviteCode("https://www.plunderandriffle.com/muse-invite?invite=AB12CD34"), "AB12CD34");
    assert.equal(extractMuseInviteCode("https://muse.ai/invite/AB12CD34"), "AB12CD34");
  });

  it("a link with no code in it yields nothing — page names are not codes", () => {
    assert.equal(extractMuseInviteCode("https://www.plunderandriffle.com/muse-invite"), null);
    assert.equal(extractMuseInviteCode("https://muse.ai/join"), null);
  });

  it("rejects codes on foreign hosts and junk values", () => {
    assert.equal(extractMuseInviteCode("https://example.com/?code=AB12CD34"), null);
    assert.equal(extractMuseInviteCode("not a code at all"), null);
    assert.equal(extractMuseInviteCode(""), null);
    assert.equal(extractMuseInviteCode(null), null);
    assert.equal(extractMuseInviteCode(undefined), null);
  });
});

describe("resolveMuseInviteCode — referrer first, house fallback", () => {
  it("uses the referrer's bare code when they saved one", () => {
    assert.deepEqual(resolveMuseInviteCode("HOUSE123", "REF45678"), { code: "REF45678", source: "referrer" });
  });

  it("extracts the referrer's code from a pasted link", () => {
    assert.deepEqual(resolveMuseInviteCode("HOUSE123", "https://muse.ai/join?code=REF45678"), {
      code: "REF45678",
      source: "referrer",
    });
  });

  it("falls back to the house code — the live catalog serves it bare", () => {
    assert.deepEqual(resolveMuseInviteCode("HOUSE123", ""), { code: "HOUSE123", source: "house" });
    assert.deepEqual(resolveMuseInviteCode("HOUSE123", null), { code: "HOUSE123", source: "house" });
  });

  it("no code anywhere when neither side's value carries one", () => {
    assert.deepEqual(resolveMuseInviteCode("https://www.plunderandriffle.com/muse-invite", ""), {
      code: null,
      source: null,
    });
  });
});
