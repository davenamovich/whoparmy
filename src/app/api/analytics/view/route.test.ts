import assert from "node:assert/strict";
import { test } from "node:test";
import { createPageViewHandler } from "../../../../lib/page-view-handler.ts";

test("page view endpoint stores only pathname and referrer host with coarse UA", async () => {
  let stored: unknown;
  const post = createPageViewHandler({
    getMemberId: async () => "member-1",
    shouldRecord: () => true,
    write: async (data) => { stored = data; },
  });
  const request = new Request("http://localhost/api/analytics/view", {
    method: "POST",
    headers: { referer: "https://news.example/story?secret=value", "user-agent": "Mozilla/5.0 (iPhone) Mobile" },
    body: JSON.stringify({ path: "/build?secret=value#part" }),
  });
  assert.equal((await post(request)).status, 204);
  assert.deepEqual(stored, { path: "/build", referrerHost: "news.example", userAgentClass: "mobile", memberId: "member-1" });
});

test("page view endpoint short circuits repeat submissions and rejects unsafe paths", async () => {
  let writes = 0;
  const post = createPageViewHandler({ getMemberId: async () => null, shouldRecord: () => false, write: async () => { writes++; } });
  const request = () => new Request("http://localhost/api/analytics/view", { method: "POST", body: JSON.stringify({ path: "/" }) });
  assert.equal((await post(request())).status, 204);
  assert.equal(writes, 0);
  const invalid = new Request("http://localhost/api/analytics/view", { method: "POST", body: JSON.stringify({ path: "https://evil.example/" }) });
  assert.equal((await post(invalid)).status, 400);
});
