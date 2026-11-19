import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  getWhopConfig, getWhopTierIds, resolveTierFromMemberships, verifyWhopWebhook, whopListMemberships,
} from "@/lib/whop";

export const runtime = "nodejs";

/**
 * POST /api/whop/webhook — Whop event receiver.
 *
 * Contract per docs.whop.com (Standard Webhooks spec):
 *   - Signature verified with @whop/sdk unwrapWebhook (HMAC-SHA256 over
 *     "{webhook-id}.{webhook-timestamp}.{raw body}" with the ws_ secret,
 *     5-minute replay window enforced by the helper).
 *   - Deliveries may repeat; record the receipt only after handling succeeds.
 *   - Event order is not guaranteed → cancel paths re-derive the plan from
 *     the live API.
 *
 * Plan mapping: env-configured Whop product ids (prod_xxx) per tier —
 *   WHOP_PRODUCT_ID_CREATOR / WHOP_PRODUCT_ID_PRO / WHOP_PRODUCT_ID_AGENCY
 *   (optional variant-level: WHOP_PLAN_ID_CREATOR / _PRO / _AGENCY)
 */

interface MembershipPayload {
  user_id?: string | null;
  user?: { id?: string } | null;
  product_id?: string | null;
  product?: { id?: string } | null;
  variant_id?: string | null;
  plan?: { id?: string } | null;
  status?: string;
}

interface PaymentPayload {
  id?: string;
  user?: { id?: string } | null;
  product_id?: string | null;
  product?: { id?: string } | null;
  variant_id?: string | null;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
}

const CLOSED_STATUSES = new Set(["canceled", "expired", "unresolved", "drafted"]);

const TIER_RANK: Record<string, number> = { FREE: 0, CREATOR: 1, PRO: 2, AGENCY: 3 };

async function findUserByWhopId(whopUserId?: string | null) {
  if (!whopUserId) return null;
  return db.user.findUnique({ where: { whopId: whopUserId } });
}

async function applyMembership(membership: MembershipPayload, eventType: string): Promise<void> {
  const whopUserId = membership.user_id ?? membership.user?.id;
  if (!whopUserId) return;
  const user = await findUserByWhopId(whopUserId);
  if (!user) return;

  const ids = getWhopTierIds();
  const evidence = {
    productId: membership.product_id ?? membership.product?.id,
    planId: membership.variant_id ?? membership.plan?.id,
    status: membership.status,
  };
  let plan: string | null;

  if (eventType === "membership.deactivated" || CLOSED_STATUSES.has(evidence.status ?? "")) {
    if (![...Object.values(ids.planIds), ...Object.values(ids.productIds)].some(Boolean)) return;
    const memberships = await whopListMemberships();
    plan = resolveTierFromMemberships(memberships.filter((row) => row.userId === whopUserId), ids) ?? "FREE";
  } else {
    plan = resolveTierFromMemberships([evidence], ids);
    if (!plan || TIER_RANK[plan] <= TIER_RANK[user.plan]) return;
  }

  if (plan === user.plan) return;
  await db.user.update({
    where: { id: user.id },
    data: { plan, planSource: "whop_membership", planUpdatedAt: new Date() },
  });
}

async function applyPayment(payment: PaymentPayload): Promise<void> {
  const user = await findUserByWhopId(payment.user?.id);
  if (!user) return;

  const metaUserId = payment.metadata?.prUserId;
  if (typeof metaUserId === "string" && metaUserId !== user.id && metaUserId !== user.whopId) {
    console.warn("Whop payment prUserId does not match payer; ignoring metadata", { paymentId: payment.id });
  }

  const tier = resolveTierFromMemberships([{
    status: "active",
    productId: payment.product_id ?? payment.product?.id,
    planId: payment.variant_id ?? payment.plan?.id,
  }], getWhopTierIds());
  if (tier && TIER_RANK[tier] > TIER_RANK[user.plan]) {
    await db.user.update({
      where: { id: user.id },
      data: { plan: tier, planSource: "whop_membership", planUpdatedAt: new Date() },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers);

    // Signature verification happens first — an invalid request never
    // reaches the database or the plan logic.
    const event = verifyWhopWebhook(rawBody, headers);

    const { companyId } = getWhopConfig();
    if (companyId && event.accountId != null && event.accountId !== companyId) {
      return NextResponse.json({ error: "Whop webhook account does not match WHOP_COMPANY_ID" }, { status: 400 });
    }
    const id = event.id || headers["webhook-id"];

    switch (event.type) {
      case "membership.activated":
      case "membership.updated":
      case "membership.deactivated":
        await applyMembership(event.data as MembershipPayload, event.type);
        break;
      case "payment.succeeded":
        await applyPayment(event.data as PaymentPayload);
        break;
      default:
        // Recorded (idempotency row) but no behavior — future-proof.
        break;
    }

    try {
      await db.webhookEvent.create({ data: { id, type: event.type, payload: rawBody.slice(0, 20_000) } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw err;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Signature failures and malformed payloads must not 500-loop Whop's
    // retry schedule — 400 tells Whop this delivery is bad, not transient.
    const isSignatureError = err instanceof Error && err.name === "WebhookVerificationError";
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook processing failed" },
      { status: isSignatureError ? 400 : 500 },
    );
  }
}
