import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { bindIdentityLink, type IdentityDb } from "@/lib/identity";
import {
  bindAgentWallet,
  bindUserWallet,
  normalizeChain,
  type WalletDb,
} from "@/lib/wallet-bind";
import { bindHouseBankr } from "@/lib/wallet-bind-server";
import { userDisplayName } from "@/lib/bindings-view";

export const runtime = "nodejs";

/**
 * OPERATOR ONLY — Bankr wallet binding (2026-11-21). Binds public
 * payout addresses to the attribution spine: IdentityLink (user
 * half) + AgentWallet (agent half, keyed by the agent's rotator
 * sub-ID). Binding is set-once: an address bound to another user or
 * another agent is refused (409), never silently rebound. This
 * route records ADDRESSES ONLY — no keys, no transfers, no Bankr
 * calls. Settlement execution happens outside the server.
 */
async function requireOperator() {
  const { user, mode } = await getWhopUserWithMode();
  if (mode !== "operator") return { error: "Operator only" as const, status: 403 as const };
  return { user };
}

function authFailure(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Wallet binding failed" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const gate = await requireOperator();
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const [links, wallets] = await Promise.all([
      db.identityLink.findMany({
        where: { kind: { in: ["wallet_evm", "wallet_solana", "bankr_ref"] } },
        orderBy: { createdAt: "asc" },
      }),
      db.agentWallet.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    // Enrichment (additive): display names so the admin card can
    // label whose wallet each binding is — the operator's own, and
    // each agent wallet's agent + owner — without extra calls.
    const userIds = [...new Set([...links.map((l) => l.userId), ...wallets.map((w) => w.userId)])];
    const agentIds = [...new Set(wallets.map((w) => w.agentId))];
    interface NameRow {
      id: string;
      name: string | null;
      whopUsername: string | null;
      email: string;
    }
    interface AgentRow {
      id: string;
      name: string;
      slug: string | null;
    }
    const users: NameRow[] = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, whopUsername: true, email: true },
        })
      : [];
    const agents: AgentRow[] = agentIds.length
      ? await db.hiredAgent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const userById = new Map<string, NameRow>(users.map((u): [string, NameRow] => [u.id, u]));
    const agentById = new Map<string, AgentRow>(agents.map((a): [string, AgentRow] => [a.id, a]));
    return NextResponse.json({
      links: links.map((l) => ({
        ...l,
        userName: userDisplayName(userById.get(l.userId)),
        isOperator: l.userId === gate.user.id,
      })),
      wallets: wallets.map((w) => ({
        ...w,
        agentName: agentById.get(w.agentId)?.name ?? "Unknown agent",
        agentSlug: agentById.get(w.agentId)?.slug ?? null,
        ownerName: userDisplayName(userById.get(w.userId)),
      })),
    });
  } catch (err) {
    return authFailure(err);
  }
}

interface BindBody {
  action?: string;
  agentId?: string;
  userId?: string;
  chain?: string;
  address?: string;
  kind?: string;
  refCode?: string;
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireOperator();
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const operator = gate.user;
    const body = (await req.json().catch(() => ({}))) as BindBody;

    if (body.action === "bind-house") {
      const summary = await bindHouseBankr(operator.id);
      return NextResponse.json({ ok: true, house: summary });
    }

    // Bankr referral-code binding: the arrival identity for Bankr
    // links — refCode → user, through the same set-once spine.
    if (body.kind === "bankr_ref" || (typeof body.refCode === "string" && body.refCode.trim())) {
      const refCode = (body.refCode ?? "").trim();
      if (!refCode) {
        return NextResponse.json({ error: "refCode is required" }, { status: 400 });
      }
      const res = await bindIdentityLink(db as unknown as IdentityDb, {
        userId: body.userId ?? operator.id,
        kind: "bankr_ref",
        value: refCode,
        verifiedAt: new Date(),
      });
      if (res.status === "conflict") {
        return NextResponse.json(
          { error: "That Bankr ref code is already bound to a different user" },
          { status: 409 },
        );
      }
      if (res.status === "invalid") {
        return NextResponse.json({ error: "Invalid ref code binding" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, status: res.status, link: res.link });
    }

    const chain = normalizeChain(body.chain);
    if (!chain || typeof body.address !== "string" || !body.address.trim()) {
      return NextResponse.json(
        { error: "chain (\"evm\" | \"solana\") and address are required" },
        { status: 400 },
      );
    }

    // Agent binding: owner is derived from the agent row.
    if (body.agentId) {
      const res = await bindAgentWallet(db as unknown as WalletDb, {
        agentId: body.agentId,
        chain,
        address: body.address,
        source: "bankr",
        verifiedAt: new Date(),
      });
      if (res.status === "conflict") {
        return NextResponse.json(
          { error: `Address refused: ${res.reason}` },
          { status: 409 },
        );
      }
      if (res.status === "invalid") {
        return NextResponse.json({ error: `Invalid binding: ${res.reason}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true, status: res.status, wallet: res.wallet });
    }

    // User-only binding (lib/wallet-bind normalizes + shape-checks).
    const res = await bindUserWallet(db as unknown as WalletDb, {
      userId: body.userId ?? operator.id,
      chain,
      address: body.address,
      verifiedAt: new Date(),
    });
    if (res.status === "conflict") {
      return NextResponse.json(
        { error: "That address is already bound to a different user" },
        { status: 409 },
      );
    }
    if (res.status === "invalid") {
      return NextResponse.json({ error: "Invalid address for that chain" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: res.status, link: res.link });
  } catch (err) {
    return authFailure(err);
  }
}
