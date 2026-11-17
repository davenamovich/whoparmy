import { NextRequest, NextResponse } from "next/server";
import { BridgeError, proxyToolCall, proxyToolsList, verifyBridgeToken } from "@/lib/muse-bridge";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/bridge/mcp — the Muse bridge connector endpoint.
 *
 * A member's Muse speaks MCP (JSON-RPC) here with its 7-day bridge
 * token; every call is forwarded to the P&R MCP on the MEMBER's own
 * derived agent key (fetched server-to-server from the bot's Whop
 * bridge, never exposed here). Allowlist + week budget are enforced in
 * lib/muse-bridge.ts. Publishing and MP4 tools are refused.
 *
 * Works with any MCP client, including the published @plunderandriffle/mcp
 * stdio bridge: PLUNDER_MCP_URL=https://whop.plunderandriffle.com/api/bridge/mcp
 * and PLUNDER_KEY=<bridge token>.
 */

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function rpcError(id: RpcRequest["id"], code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] ?? null;

  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }
  const { id, method } = body;
  const isNotification = id === undefined || id === null;

  // Notifications (initialized, cancelled, …) need no answer.
  if (isNotification) return new NextResponse(null, { status: 202 });

  if (method === "ping") return rpcResult(id, {});
  if (method === "initialize") {
    const params = (body.params ?? {}) as { protocolVersion?: string };
    return rpcResult(id, {
      protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "plunder-riffle-whop-bridge", version: "1.0.0" },
    });
  }

  const session = await verifyBridgeToken(token);
  if (!session) {
    return rpcError(id, -32001, "Bridge token missing, expired or revoked. Generate a fresh code on /muse-week and exchange it again.", 401);
  }

  try {
    if (method === "tools/list") {
      return rpcResult(id, await proxyToolsList(session));
    }
    if (method === "tools/call") {
      const params = (body.params ?? {}) as { name?: unknown; arguments?: unknown };
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) return rpcError(id, -32602, "Missing tool name");
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      const { reply } = await proxyToolCall(session, name, args);
      if (reply.error) return rpcError(id, reply.error.code ?? -32603, reply.error.message ?? "Engine error");
      return rpcResult(id, reply.result ?? {});
    }
    return rpcError(id, -32601, `Method not supported by the bridge: ${method ?? ""}`);
  } catch (err) {
    if (err instanceof BridgeError) return rpcError(id, -32603, err.message);
    return rpcError(id, -32603, err instanceof Error ? err.message : "Bridge error");
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "This MCP endpoint is POST-only. See https://whop.plunderandriffle.com/muse-week" },
    { status: 405 },
  );
}
