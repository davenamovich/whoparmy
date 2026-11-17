import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifyWhopWebhook, getWhopConfig, whopCheckAccess, isWhopApiConfigured } from "@/lib/whop";

export const runtime = "nodejs";

/**
 * POST /api/whop/webhook — Whop event receiver.
 *
 * Contract per docs.whop.com (Standard Webhooks spec):
 *   - Signature verified with @whop/sdk unwrapWebhook (HMAC-SHA256 over
 *     "{webhook-id}.{webhook-timestamp}.{raw body}" with the ws_ secret,
 *     5-minute replay window enforced by the helper).
 *   - Respond 2xx in <5s; identical webhook-id may be delivered more than
 *     once → WebhookEvent rows give hard idempotency.
 *   - Event order is not guaranteed → cancel paths re-derive the plan from
 *     the live API when WHOP_API_KEY is configured.
 *
 * Plan mapping: env-configured Whop product ids (prod_xxx) per tier —
 *   WHOP_PRODUCT_ID_CREATOR / WHOP_PRODUCT_ID_PRO / WHOP_PRODUCT_ID_AGENCY
 *   (optional variant-level: WHOP_PLAN_ID_CREATOR / _PRO / _AGENCY)
 * Nothing is hardcoded: if a membership matches no configured id, it is
 * recorded but does not change entitlements.
 */

interface MembershipPayload {
  id?: string;
  user_id?: string | null;
  product_id?: string;
  variant_id?: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
}

interface PaymentPayload {
  id?: string;
  user?: { id?: string } | null;
  membership_id?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  status?: string;
  customer_email?: string | null;
  metadata?: Record<string, unknown> | null;
}

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due", "completed"]);
const CLOSED_STATUSES = new Set(["canceled", "expired", "unresolved", "drafted"]);

/** Map a Whop product/variant id to our plan tier from env configuration. */
function resolveTier(productId?: string | null, variantId?: string | null): string | null {
  const cfg = getWhopConfig();
  const pairs: { tier: string; productId: string | null; planId: string | null }[] = [
    { tier: "CREATOR", productId: cfg.productIds.CREATOR, planId: process.env.WHOP_PLAN_ID_CREATOR?.trim() || null },
    { tier: "PRO", productId: cfg.productIds.PRO, planId: process.env.WHOP_PLAN_ID_PRO?.trim() || null },
    { tier: "AGENCY", productId: cfg.productIds.AGENCY, planId: process.env.WHOP_PLAN_ID_AGENCY?.trim() || null },
  ];
  for (const p of pairs) {
    if ((productId && p.productId && productId === p.productId) || (variantId && p.planId && variantId === p.planId)) {
      return p.tier;
    }
  }
  return null;
}

const TIER_RANK: Record<string, number> = { FREE: 0, CREATOR: 1, PRO: 2, AGENCY: 3 };

async function findUserByWhopId(whopUserId?: string | null) {
  if (!whopUserId) return null;
  return db.user.findUnique({ where: { whopId: whopUserId } });
}

/** Re-derive the plan from the live Whop API (authoritative on out-of-order events). */
async function rederivePlanFromApi(user: { id: string; whopId: string | null; plan: string }): Promise<string> {
  const cfg = getWhopConfig();
  if (!user.whopId || !cfg.apiKey) return user.plan;

  const candidates: { tier: string; resourceId: string | null }[] = [
    { tier: "AGENCY", resourceId: cfg.productIds.AGENCY },
    { tier: "PRO", resourceId: cfg.productIds.PRO },
    { tier: "CREATOR", resourceId: cfg.productIds.CREATOR },
  ];
  for (const c of candidates) {
    if (!c.resourceId) continue;
    try {
      const access = await whopCheckAccess(user.whopId, c.resourceId);
      if (access.has_access) return c.tier;
    } catch {
      // API hiccup — keep the current plan rather than downgrading on a failure.
      return user.plan;
    }
  }
  return "FREE";
}

async function applyMembership(membership: MembershipPayload, eventType: string): Promise<void> {
  const user = await findUserByWhopId(membership.user_id);
  if (!user) return; // not signed in here yet — entitlement sync on login catches up

  const tier = resolveTier(membership.product_id, membership.variant_id);
  const status = membership.status ?? "";

  if (ACTIVE_STATUSES.has(status)) {
    if (tier && TIER_RANK[tier] > TIER_RANK[user.plan]) {
      await db.user.update({
        where: { id: user.id },
        data: { plan: tier, planSource: "whop_membership", planUpdatedAt: new Date() },
      });
    }
    return;
  }

  if (CLOSED_STATUSES.has(status)) {
    // Only act if the closed membership is the one backing the current plan.
    if (!tier || tier !== user.plan) return;
    if (isWhopApiConfigured()) {
      // Event order is not guaranteed — re-derive from the live API so a
      // downgrade (PRO → AGENCY upgrade) never wipes the higher tier.
      const derived = await rederivePlanFromApi(user);
      await db.user.update({
        where: { id: user.id },
        data: { plan: derived, planSource: "whop_membership", planUpdatedAt: new Date() },
      });
    } else {
      // Without the API key, the conservative, honest default is FREE —
      // never keep a paid plan that Whop just closed.
      await db.user.update({
        where: { id: user.id },
        data: { plan: "FREE", planSource: "whop_membership", planUpdatedAt: new Date() },
      });
    }
  }
}

async function applyPayment(payment: PaymentPayload, eventType: string): Promise<void> {
  if (eventType !== "payment.succeeded") return;

  // Prefer our own metadata mapping when present (API-created checkouts).
  const metaUserId = typeof payment.metadata?.prUserId === "string" ? payment.metadata.prUserId : null;
  const whopUserId = metaUserId ?? payment.user?.id ?? null;

  const user =
    (await findUserByWhopId(whopUserId)) ??
    (payment.customer_email ? await db.user.findUnique({ where: { email: payment.customer_email } }) : null);
  if (!user) return;

  const tier = resolveTier(payment.product_id, payment.variant_id);
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

    // Hard idempotency: Whop retries keep the same webhook-id.
    if (event.id) {
      try {
        await db.webhookEvent.create({ data: { id: event.id, type: event.type, payload: rawBody.slice(0, 20_000) } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return NextResponse.json({ received: true, duplicate: true });
        }
        throw err; // storage failure ≠ duplicate — surface it (Whop will retry)
      }
    }

    switch (event.type) {
      case "membership.activated":
      case "membership.updated":
        await applyMembership(event.data as MembershipPayload, event.type);
        break;
      case "payment.succeeded":
      case "payment.failed":
        await applyPayment(event.data as PaymentPayload, event.type);
        break;
      case "member.created":
      case "member.updated":
        // Informational — membership events above drive entitlements.
        break;
      default:
        // Recorded (idempotency row) but no behavior — future-proof.
        break;
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
