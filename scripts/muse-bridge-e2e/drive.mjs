// E2E driver: real HTTP against the built Whoparmy server + mock bot.
// Asserts the whole member journey and the bridge's guard rails.
const APP = "http://127.0.0.1:3100";
const BOT = "http://127.0.0.1:4100";
const cookie = process.env.SESSION_COOKIE;
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
async function call(method, url, { headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, json, text };
}
const auth = { Cookie: `pr_session=${cookie}` };
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, params });

// 1. Account view: connected, mock balance, brand carried.
let r = await call("GET", `${APP}/api/bridge/account`, { headers: auth });
check("account 200", r.status === 200, r.text.slice(0, 200));
check("account connected", r.json?.account?.connected === true, JSON.stringify(r.json).slice(0, 200));
check("account credits 1000", r.json?.account?.credits === 1000);
check("account granted 1000", r.json?.account?.granted === 1000);
check("account brand website", r.json?.account?.brand?.website === "https://example.com");
check("account week budget 805", r.json?.account?.weekBudgetCredits === 805);
check("account leaks no key", !JSON.stringify(r.json).includes("prl_agent"));

// 2. Code generation.
r = await call("POST", `${APP}/api/bridge/code`, { headers: auth, body: {} });
check("code 200", r.status === 200, r.text.slice(0, 200));
const code = r.json?.code;
check("code shape", /^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/.test(code ?? ""), code);
check("code budget 805", r.json?.budgetCredits === 805);

// 3. Bad code refused; good code exchanges exactly once.
r = await call("POST", `${APP}/api/bridge/exchange`, { body: { code: "0000-0000-0000-0000" } });
check("bad code 400", r.status === 400);
r = await call("POST", `${APP}/api/bridge/exchange`, { body: { code } });
check("exchange 200", r.status === 200, r.text.slice(0, 200));
const token = r.json?.bridge_token;
check("token prefix prb_", typeof token === "string" && token.startsWith("prb_"));
check("exchange scope connected", r.json?.scope === "connected");
check("exchange mcp url", r.json?.mcp_url === "https://whop.plunderandriffle.com/api/bridge/mcp");
r = await call("POST", `${APP}/api/bridge/exchange`, { body: { code } });
check("code single-use (second exchange 400)", r.status === 400);

const bearer = { Authorization: `Bearer ${token}` };
const mcp = (id, method, params) => call("POST", `${APP}/api/bridge/mcp`, { headers: bearer, body: rpc(id, method, params) });

// 4. MCP without a token is refused.
r = await call("POST", `${APP}/api/bridge/mcp`, { body: rpc(1, "tools/list", {}) });
check("mcp no-token 401", r.status === 401);

// 5. initialize + tools/list filtered to the allowlist.
r = await mcp(1, "initialize", { protocolVersion: "2025-03-26" });
check("initialize ok", r.json?.result?.serverInfo?.name === "plunder-riffle-whop-bridge");
r = await mcp(2, "tools/list", {});
const names = (r.json?.result?.tools ?? []).map((t) => t.name);
check("tools/list has demo_pack", names.includes("create_demo_pack"));
check("tools/list excludes publish_clip", !names.includes("publish_clip"));
check("tools/list excludes request_mp4", !names.includes("request_mp4"));

// 6. Free tools pass and charge nothing.
r = await mcp(3, "tools/call", { name: "research_brand", arguments: { url: "https://example.com" } });
check("research_brand ok", r.json?.result?.isError !== true, JSON.stringify(r.json).slice(0, 200));
r = await mcp(4, "tools/call", { name: "get_account", arguments: {} });
check("get_account credits 1000", r.json?.result?.structuredContent?.credits === 1000, JSON.stringify(r.json).slice(0, 200));

// 7. Publishing is refused at the bridge and never reaches the bot.
r = await mcp(5, "tools/call", { name: "publish_clip", arguments: {} });
check("publish_clip refused as tool error", r.json?.result?.isError === true);
let state = await (await fetch(`${BOT}/state`)).json();
check("bot saw zero publish attempts", state.publishAttempts === 0);

// 8. The week: 7 demo packs succeed (7 × 115 = 805 = budget), the 8th is refused pre-spend.
for (let i = 1; i <= 7; i++) {
  r = await mcp(10 + i, "tools/call", { name: "create_demo_pack", arguments: { input: "https://example.com" } });
  check(`demo_pack ${i} ok`, r.json?.result?.isError !== true && !!r.json?.result?.structuredContent?.jobId, JSON.stringify(r.json).slice(0, 160));
}
r = await mcp(30, "tools/call", { name: "create_demo_pack", arguments: { input: "https://example.com" } });
check("8th demo_pack refused (budget)", r.json?.result?.isError === true && /budget/i.test(JSON.stringify(r.json)));
state = await (await fetch(`${BOT}/state`)).json();
check("bot balance 195 after week (1000-805)", state.users["user_e2e12345"] === 195, JSON.stringify(state.users));

// 9. Account view now shows the token's spend.
r = await call("GET", `${APP}/api/bridge/account`, { headers: auth });
const tok = (r.json?.account?.tokens ?? [])[0];
check("account token spent 805", tok?.spentCredits === 805, JSON.stringify(tok));
check("account token active", tok?.active === true);
const tokenId = tok?.id;

// 10. Member revokes; the token dies immediately.
r = await call("POST", `${APP}/api/bridge/revoke`, { headers: auth, body: { tokenId } });
check("revoke ok", r.json?.ok === true);
r = await mcp(40, "tools/list", {});
check("mcp after revoke 401", r.status === 401);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
