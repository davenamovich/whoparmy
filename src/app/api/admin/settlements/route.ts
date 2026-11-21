import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildSettlementForDay,
  buildSettlementPacket,
  createDraftsForConfirmedDays,
  type SettlementDb,
} from "@/lib/settlement";
import { HOUSE_BANKR } from "@/lib/wallet-bind-server";

export const runtime = "nodejs";

/**
 * OPERATOR ONLY — rotator split settlements (Bankr connection,
 * 2026-11-21). The ledger half of settlement: draft → confirm →
 * packet → settle. Money stays SIMULATED (gross is 0 until a paid
 * placement exists) and NOTHING here moves money: confirming only
 * produces the Bankr instruction packet, and "settle" only records
 * the refs of an execution the operator ran outside the server
 * (via Muse's Bankr connector, after Dave's per-run approval).
 */
const sdb = db as unknown as SettlementDb;

async function requireOperator() {
  const { user, mode } = await getWhopUserWithMode();
  if (mode !== "operator") return { error: "Operator only" as const, status: 403 as const };
  return { user };
}

function failure(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Settlement action failed" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const gate = await requireOperator();
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const settlements = await db.settlement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lines: true },
    });
    return NextResponse.json({ settlements });
  } catch (err) {
    return failure(err);
  }
}

interface SettlementAction {
  action?: string;
  date?: string;
  id?: string;
  bankrJobId?: string;
  txRef?: string;
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireOperator();
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const body = (await req.json().catch(() => ({}))) as SettlementAction;
    const opts = { houseEvmAddress: HOUSE_BANKR.evm };

    switch (body.action) {
      case "create-draft": {
        if (!body.date) {
          return NextResponse.json({ error: "date is required" }, { status: 400 });
        }
        const result = await buildSettlementForDay(sdb, body.date, opts);
        if (!result) {
          return NextResponse.json(
            { error: "No CONFIRMED rotator day with a winner for that date — nothing to settle" },
            { status: 404 },
          );
        }
        return NextResponse.json({ ok: true, created: result.created, settlement: result.settlement });
      }
      case "create-drafts": {
        const result = await createDraftsForConfirmedDays(sdb, opts);
        return NextResponse.json({ ok: true, ...result });
      }
      case "confirm": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const current = await db.settlement.findUnique({ where: { id: body.id } });
        if (!current) return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
        if (current.status !== "DRAFT") {
          return NextResponse.json(
            { error: `Only a DRAFT can be confirmed (this one is ${current.status})` },
            { status: 409 },
          );
        }
        const settlement = await db.settlement.update({
          where: { id: body.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
          include: { lines: true },
        });
        return NextResponse.json({ ok: true, settlement });
      }
      case "packet": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const packet = await buildSettlementPacket(sdb, body.id);
        if (!packet.ok) {
          const status = packet.reason === "not-found" ? 404 : 409;
          return NextResponse.json(
            {
              error:
                packet.reason === "unbound"
                  ? `Packet refused — no wallet bound for: ${packet.missingRoles.join(", ")}`
                  : packet.reason === "not-confirmed"
                    ? "Packet is only available for a CONFIRMED settlement"
                    : "Settlement not found",
              reason: packet.reason,
              missingRoles: packet.missingRoles,
            },
            { status },
          );
        }
        return NextResponse.json({ ok: true, text: packet.text, packet: packet.json });
      }
      case "settle": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const bankrJobId = body.bankrJobId?.trim() || null;
        const txRef = body.txRef?.trim() || null;
        if (!bankrJobId && !txRef) {
          return NextResponse.json(
            { error: "Record the Bankr job id or tx ref from the external execution first" },
            { status: 400 },
          );
        }
        const current = await db.settlement.findUnique({ where: { id: body.id } });
        if (!current) return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
        if (current.status !== "CONFIRMED") {
          return NextResponse.json(
            { error: `Only a CONFIRMED settlement can be settled (this one is ${current.status})` },
            { status: 409 },
          );
        }
        const settlement = await db.settlement.update({
          where: { id: body.id },
          data: { status: "SETTLED", bankrJobId, txRef, settledAt: new Date() },
          include: { lines: true },
        });
        return NextResponse.json({ ok: true, settlement });
      }
      case "void": {
        if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const current = await db.settlement.findUnique({ where: { id: body.id } });
        if (!current) return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
        if (current.status === "SETTLED") {
          return NextResponse.json({ error: "A SETTLED settlement cannot be voided" }, { status: 409 });
        }
        const settlement = await db.settlement.update({
          where: { id: body.id },
          data: { status: "VOID" },
          include: { lines: true },
        });
        return NextResponse.json({ ok: true, settlement });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return failure(err);
  }
}
