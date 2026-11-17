// Mock P&R bot for the Muse bridge E2E: the Whop bridge key endpoint
// + the MCP endpoint, with a per-user credit balance that demo_pack drains.
import http from "node:http";

const BRIDGE_KEY = "test-bridge-key";
const users = new Map(); // whopUserId -> { key, credits }
let publishAttempts = 0;

function keyFor(whopUserId) {
  return "prl_agent_mock_" + Buffer.from(whopUserId).toString("hex").slice(0, 16);
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    let parsed = {};
    try { parsed = JSON.parse(body || "{}"); } catch { /* keep {} */ }

    if (req.url === "/state") {
      return json(200, { publishAttempts, users: Object.fromEntries([...users].map(([k, v]) => [k, v.credits])) });
    }

    if (req.url === "/api/bridge/whop/key") {
      if (req.headers["x-brain-key"] !== BRIDGE_KEY) return json(401, { ok: false, error: "unauthorized" });
      const { whopUserId, plan } = parsed;
      let u = users.get(whopUserId);
      if (!u) {
        u = { key: keyFor(whopUserId), credits: 1000 };
        users.set(whopUserId, u);
        return json(200, { ok: true, key: u.key, plan, credits: u.credits, granted: 1000, period: "paid:2026-11-01" });
      }
      return json(200, { ok: true, key: u.key, plan, credits: u.credits, granted: 0, period: "paid:2026-11-01" });
    }

    if (req.url === "/api/mcp") {
      const auth = req.headers.authorization || "";
      const key = auth.replace(/^Bearer\s+/i, "");
      const u = [...users.values()].find((x) => x.key === key);
      if (!u) return json(401, { error: "bad key" });
      const { method, params } = parsed;
      if (method === "tools/list") {
        return json(200, {
          jsonrpc: "2.0", id: parsed.id,
          result: { tools: [
            { name: "research_brand", description: "free", inputSchema: { type: "object" } },
            { name: "create_campaign_from_research", description: "free", inputSchema: { type: "object" } },
            { name: "create_demo_pack", description: "a day of posts", inputSchema: { type: "object" } },
            { name: "get_job_status", description: "free", inputSchema: { type: "object" } },
            { name: "get_account", description: "free", inputSchema: { type: "object" } },
            { name: "publish_clip", description: "must be filtered out", inputSchema: { type: "object" } },
            { name: "request_mp4", description: "must be filtered out", inputSchema: { type: "object" } },
          ] },
        });
      }
      if (method === "tools/call") {
        const name = params?.name;
        const tool = (structuredContent, isError = false) => json(200, {
          jsonrpc: "2.0", id: parsed.id,
          result: { structuredContent, ...(isError ? { isError: true } : {}) },
        });
        if (name === "get_account") return tool({ credits: u.credits, pricingPath: "list" });
        if (name === "research_brand") return tool({ ok: true, brandProfile: { name: "E2E Biz" } });
        if (name === "create_campaign_from_research") return tool({ ok: true, campaignId: "cmp_1" });
        if (name === "get_job_status") return tool({ terminal: true, status: "done", pageUrl: "https://bot.plunderandriffle.com/m/TESTPAGE" });
        if (name === "create_demo_pack") {
          if (u.credits < 115) return tool({ error: "Out of credits" }, true);
          u.credits -= 115;
          return tool({ jobId: "job_" + Math.random().toString(36).slice(2, 8), creditCost: 115, creditsRemaining: u.credits });
        }
        if (name === "publish_clip" || name === "request_mp4") { publishAttempts++; return tool({ ok: true }); }
        return tool({ error: "unknown tool" }, true);
      }
      return json(400, { error: "bad method" });
    }

    return json(404, { error: "not found" });
  });
});

server.listen(4100, "127.0.0.1", () => console.log("mock bot on 4100"));
