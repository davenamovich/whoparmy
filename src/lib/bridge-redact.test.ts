import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactBridgeSecrets } from "./bridge-redact.ts";

const CODE = "9F2A-41BC-DEAD-BEEF";
const TOKEN = `prb_${"a1".repeat(32)}`;

describe("redactBridgeSecrets", () => {
  it("masks bridge tokens anywhere", () => {
    const out = redactBridgeSecrets(`my token is ${TOKEN} ok`);
    assert.ok(!out.includes(TOKEN));
    assert.ok(out.includes("prb_[redacted]"));
  });

  it("masks codes inside /connect/ links even without the word connect nearby", () => {
    const out = redactBridgeSecrets(`open https://whop.plunderandriffle.com/connect/${CODE} now`);
    assert.ok(!out.includes(CODE));
    assert.ok(out.includes("/connect/[redacted-code]"));
  });

  it("masks bare codes in a connect context", () => {
    const out = redactBridgeSecrets(`Use this connect code with your Muse: ${CODE}`);
    assert.ok(!out.includes(CODE));
  });

  it("leaves bare hex quads alone without a connect context", () => {
    const innocent = "the build hash was 9F2A-41BC-DEAD-BEEF today";
    assert.equal(redactBridgeSecrets(innocent), innocent);
  });

  it("passes ordinary text through untouched", () => {
    assert.equal(redactBridgeSecrets("make me a meme about coffee"), "make me a meme about coffee");
    assert.equal(redactBridgeSecrets(""), "");
  });
});
