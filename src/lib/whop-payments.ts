import { db } from "@/lib/db";
import { PACK_PLANS } from "@/lib/credit-packs";
import { grantPack } from "@/lib/credit-grants";
import { getWhopTierIds, resolveTierFromMemberships } from "@/lib/whop";

export interface PaymentPayload {
  id?: string;
  status?: string;
  user?: { id?: string } | null;
  product_id?: string | null;
  product?: { id?: string } | null;
  variant_id?: string | null;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
}

const TIER_RANK: Record<string, number> = { FREE: 0, CREATOR: 1, PRO: 2, AGENCY: 3 };

export async function findUserByWhopId(whopUserId?: string | null) {
  if (!whopUserId) return null;
  return db.user.findUnique({ where: { whopId: whopUserId } });
}

export async function applyPayment(payment: PaymentPayload): Promise<void> {
  const user = await findUserByWhopId(payment.user?.id);
  if (!user) return;
  const packCredits = PACK_PLANS[payment.variant_id ?? payment.plan?.id ?? ""];
  if (packCredits && payment.id) await grantPack(user.id, payment.id, packCredits);

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
