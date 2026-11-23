import { db } from "@/lib/db";
import { PACK_PLANS } from "@/lib/credit-packs";
import { applyPayment, findUserByWhopId, type PaymentPayload } from "@/lib/whop-payments";
import { whopListWebhookDeliveries, whopListWebhooks } from "@/lib/whop";

export interface WhopReconcileDependencies {
  listWebhooks: typeof whopListWebhooks;
  listDeliveries: typeof whopListWebhookDeliveries;
  applyPayment: typeof applyPayment;
  findUserByWhopId: typeof findUserByWhopId;
  findGrant: (externalId: string) => Promise<{ amount: number } | null>;
}

const defaultDependencies: WhopReconcileDependencies = {
  listWebhooks: whopListWebhooks,
  listDeliveries: whopListWebhookDeliveries,
  applyPayment,
  findUserByWhopId,
  findGrant: (externalId) => db.creditGrant.findUnique({ where: { externalId } }),
};

export async function reconcileWhopPayments(deps: WhopReconcileDependencies = defaultDependencies) {
  const hooks = (await deps.listWebhooks()).filter((h) => h.enabled && h.url.includes("whop.plunderandriffle.com") && h.url.endsWith("/api/whop/webhook"));
  const summary = { hooks: hooks.length, deliveries: 0, paidPayments: 0, packPayments: 0, granted: [] as Array<{ paymentId: string; amount: number }>, alreadyGranted: 0, skippedNotPaid: 0, unknownUser: 0, errors: [] as Array<{ paymentId: string; message: string }> };
  for (const hook of hooks) {
    let deliveries;
    try { deliveries = await deps.listDeliveries(hook.id); } catch (err) { summary.errors.push({ paymentId: hook.id, message: err instanceof Error ? err.message : String(err) }); continue; }
    summary.deliveries += deliveries.length;
    for (const delivery of deliveries) {
      if (delivery.event !== "payment.succeeded") continue;
      const payment = (delivery.request_body as { data?: PaymentPayload } | null)?.data;
      if (!payment || payment.status !== "paid" || !payment.id) { summary.skippedNotPaid++; continue; }
      summary.paidPayments++;
      const planId = payment.variant_id ?? payment.plan?.id ?? "";
      const amount = PACK_PLANS[planId];
      if (amount) summary.packPayments++;
      try {
        const existing = await deps.findGrant(payment.id);
        if (existing) summary.alreadyGranted++;
        await deps.applyPayment(payment);
        const after = await deps.findGrant(payment.id);
        if (!existing && after) summary.granted.push({ paymentId: payment.id, amount: after.amount });
        if (amount && !after) {
          const user = await deps.findUserByWhopId(payment.user?.id);
          if (!user) summary.unknownUser++;
        }
      } catch (err) { summary.errors.push({ paymentId: payment.id, message: err instanceof Error ? err.message : String(err) }); }
    }
  }
  return summary;
}
