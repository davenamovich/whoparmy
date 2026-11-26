import "server-only";
import { db } from "@/lib/db";
import { attributeReferral } from "@/lib/referrals";
import type { NormalizedIntake } from "@/lib/intake";

/**
 * ─── HOMEPAGE INTAKE — server write ──────────────────────────────────
 *
 * Creates the Intake row from validated input (lib/intake.ts). The
 * referral code the visitor arrived with is resolved to the member
 * who owns it (User.refCode) so the claim carries its referrer from
 * the start. When the submitter is already signed in and not yet
 * attributed, the existing one-shot attribution runs best-effort —
 * an attribution failure never fails the intake.
 */
export async function createIntake(input: NormalizedIntake, userId: string | null) {
  let referrerId: string | null = null;
  if (input.refCode) {
    const referrer = await db.user.findUnique({ where: { refCode: input.refCode }, select: { id: true } });
    referrerId = referrer?.id ?? null;
  }

  const row = await db.intake.create({
    data: {
      name: input.name,
      businessName: input.businessName,
      websiteUrl: input.websiteUrl,
      noWebsite: input.noWebsite,
      intent: input.intent,
      refCode: input.refCode,
      referrerId,
      userId,
      source: input.source,
    },
    select: { id: true, intent: true },
  });

  if (userId && referrerId && input.refCode) {
    // attributeReferral itself no-ops when the user is already
    // attributed or the code is theirs; swallow everything else too.
    await attributeReferral(userId, input.refCode).catch(() => {});
  }

  return row;
}
