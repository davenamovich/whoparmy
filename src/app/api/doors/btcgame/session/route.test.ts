import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("BTC game on-site entry", () => {
  it("serves the current game with the same-origin session API path", async () => {
    const html = await readFile("public/play/index.html", "utf8");
    assert.match(html, /BTC or No BTC/);
    assert.match(html, /GAME_API:''/);
    assert.match(html, /apiCall\('\/api\/doors\/btcgame\/session'/);
    assert.doesNotMatch(html, /GAME_API:'https:\/\/whop\.plunderandriffle\.com'/);

  });
});
