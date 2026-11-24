import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillDhMediaLink } from "./stack-prompt-core.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("BTC Barry DH Media prompt slot", () => {
  it("renders a complete runnable prompt without a saved link", () => {
    const source = readFileSync(fileURLToPath(new URL("./stacks.ts", import.meta.url)), "utf8");
    const template = source.slice(source.indexOf("const BTC_EXPERIMENT_PROMPT = `"), source.indexOf("`;\n\nexport const STACKS"));
    const rendered = fillDhMediaLink(template, null);
    assert.ok(!rendered.includes("{DH_MEDIA_LINK}"));
    assert.match(rendered, /optional offer and do not block other work/);
    assert.match(rendered, /If I pass, keep working the pool, rotation and reporting/);
    assert.match(rendered, /with my approval/);
    assert.doesNotMatch(rendered, /link.{0,50}(unlock|requirement)|unlock.{0,50}link/i);
  });

  it("uses the current saved link verbatim", () => {
    const rendered = fillDhMediaLink("Use {DH_MEDIA_LINK}", "https://dh.media/?affid=current");
    assert.equal(rendered, "Use https://dh.media/?affid=current");
  });
});
