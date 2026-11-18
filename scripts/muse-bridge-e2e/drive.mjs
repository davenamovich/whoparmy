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

// 0. The gate: a Starter (CREATOR) member sees the offer but cannot
// use it — account view not eligible, code generation refused 403.
const starterCookie = process.env.STARTER_COOKIE;
if (starterCookie) {
  const sauth = { Cookie: `pr_session=${starterCookie}` };
  let sr = await call("GET", `${APP}/api/bridge/account`, { headers: sauth });
  check("starter account eligible=false", sr.json?.account?.eligible === false, JSON.stringify(sr.json).slice(0, 200));
  check("starter account errorCode NOT_ELIGIBLE", sr.json?.account?.errorCode === "NOT_ELIGIBLE");
  check("starter account not connected (engine untouched)", sr.json?.account?.connected === false);
  sr = await call("POST", `${APP}/api/bridge/code`, { headers: sauth, body: {} });
  check("starter code refused 403 NOT_ELIGIBLE", sr.status === 403 && sr.json?.code === "NOT_ELIGIBLE", `${sr.status} ${sr.text.slice(0, 120)}`);
}

// 1. Account view: connected, mock balance, brand carried.
let r = await call("GET", `${APP}/api/bridge/account`, { headers: auth });
check("account 200", r.status === 200, r.text.slice(0, 200));
check("account eligible (Operator)", r.json?.account?.eligible === true);
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
check("tools/list excludes create_sitdown (week scope)", !names.includes("create_sitdown"));
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

// 11. The Taste: a 115-credit token funds exactly one pack.
r = await call("POST", `${APP}/api/bridge/code`, { headers: auth, body: { offer: "taste" } });
check("taste code budget 115", r.json?.budgetCredits === 115 && r.json?.offer === "taste", JSON.stringify(r.json).slice(0, 160));
r = await call("POST", `${APP}/api/bridge/exchange`, { body: { code: r.json?.code } });
check("taste exchange budget 115", r.json?.budget_credits === 115);
const tasteBearer = { Authorization: `Bearer ${r.json?.bridge_token}` };
const tasteMcp = (id, method, params) => call("POST", `${APP}/api/bridge/mcp`, { headers: tasteBearer, body: rpc(id, method, params) });
r = await tasteMcp(50, "tools/call", { name: "create_demo_pack", arguments: { input: "https://example.com" } });
check("taste pack 1 ok", r.json?.result?.isError !== true && !!r.json?.result?.structuredContent?.jobId);
r = await tasteMcp(51, "tools/call", { name: "create_demo_pack", arguments: { input: "https://example.com" } });
check("taste pack 2 refused (budget spent)", r.json?.result?.isError === true && /budget/i.test(JSON.stringify(r.json)));

// 12. Week + Opener mints at 855 (7 packs + the 50-credit pitch reserve).
r = await call("POST", `${APP}/api/bridge/code`, { headers: auth, body: { offer: "opener" } });
check("opener code budget 855", r.json?.budgetCredits === 855 && r.json?.offer === "opener", JSON.stringify(r.json).slice(0, 160));

// 13. Clips lane (Clip Factory): the SAME Starter member refused the
// week offer in §0 mints a clips code on their own credits — any plan
// with a linked account. The clips token runs create_sitdown at its
// 25 list price and is refused the week offer's tools; a week token
// is refused create_sitdown. Scope isolation holds both ways.
if (starterCookie) {
  const sauth = { Cookie: `pr_session=${starterCookie}` };
  let sr = await call("POST", `${APP}/api/bridge/code`, { headers: sauth, body: { scope: "clips" } });
  check("starter clips code 200", sr.status === 200, `${sr.status} ${sr.text.slice(0, 160)}`);
  check("starter clips code scope clips", sr.json?.scope === "clips");
  check("starter clips budget = own balance 1000", sr.json?.budgetCredits === 1000, JSON.stringify(sr.json).slice(0, 160));
  sr = await call("POST", `${APP}/api/bridge/exchange`, { body: { code: sr.json?.code } });
  check("starter clips exchange 200", sr.status === 200, sr.text.slice(0, 160));
  check("clips exchange scope clips", sr.json?.scope === "clips" && sr.json?.purpose === "clips");
  const clipsBearer = { Authorization: `Bearer ${sr.json?.bridge_token}` };
  const clipsMcp = (id, method, params) => call("POST", `${APP}/api/bridge/mcp`, { headers: clipsBearer, body: rpc(id, method, params) });
  let cr = await clipsMcp(60, "tools/list", {});
  const cnames = (cr.json?.result?.tools ?? []).map((t) => t.name);
  check("clips tools/list has create_sitdown", cnames.includes("create_sitdown"), cnames.join(","));
  check("clips tools/list excludes create_demo_pack", !cnames.includes("create_demo_pack"));
  cr = await clipsMcp(61, "tools/call", { name: "create_sitdown", arguments: { clip: "https://example.com/source.mp4", video_style: "captions" } });
  check("clips create_sitdown ok", cr.json?.result?.isError !== true && !!cr.json?.result?.structuredContent?.jobId, JSON.stringify(cr.json).slice(0, 200));
  cr = await clipsMcp(62, "tools/call", { name: "create_demo_pack", arguments: { input: "https://example.com" } });
  check("clips token create_demo_pack refused", cr.json?.result?.isError === true, JSON.stringify(cr.json).slice(0, 200));
  state = await (await fetch(`${BOT}/state`)).json();
  check("starter bot balance 975 (1000-25 sitdown only)", state.users["user_e2e67890"] === 975, JSON.stringify(state.users));
  sr = await call("GET", `${APP}/api/bridge/account`, { headers: sauth });
  const ctok = (sr.json?.account?.tokens ?? [])[0];
  check("clips token spent settled 25", ctok?.spentCredits === 25, JSON.stringify(ctok));
  check("clips token scope recorded", ctok?.scope === "clips", JSON.stringify(ctok));
  check("starter account clipsEligible true", sr.json?.account?.clipsEligible === true, JSON.stringify(sr.json?.account).slice(0, 200));
  const wr = await tasteMcp(63, "tools/call", { name: "create_sitdown", arguments: { clip: "https://example.com/source.mp4" } });
  check("week token create_sitdown refused", wr.json?.result?.isError === true, JSON.stringify(wr.json).slice(0, 200));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
