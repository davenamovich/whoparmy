import "server-only";
import { getReferralState } from "@/lib/referrals";
import { getAffiliateState } from "@/lib/bridge";
import { getRotatorState } from "@/lib/rotator";
import { getClickStats } from "@/lib/link-clicks";
import { getBtcActivity } from "@/lib/btc-activity";

/**
 * ─── MEMBER DASHBOARD ────────────────────────────────────────────────
 *
 * Dave (2026-11-19): one dashboard showing the member's referrals,
 * their rotator access, their clicks, and the BTC activity from
 * their wallet. Every number here is read from a live source of
 * truth at request time — referrals from lib/referrals, rotator
 * access from the Affiliate Manager + rotator state, clicks from the
 * LinkClick ledger (only clicks this app served), BTC from the
 * public chain for the member's saved receive addresses. Referral
 * earnings keep their SIMULATED label until payouts run on a real
 * rail (lib/referrals.ts).
 */
export async function getMemberDashboard(userId: string) {
  const [referrals, affiliate, rotator, clicks, btc] = await Promise.all([
    getReferralState(userId),
    getAffiliateState(userId),
    getRotatorState(userId),
    getClickStats(userId),
    getBtcActivity(userId),
  ]);
  return {
    referrals: {
      code: referrals.code,
      link: referrals.link,
      recruitsCount: referrals.recruitsCount,
      recruits: referrals.recruits.map((r) => ({
        label: r.whopUsername ?? r.name ?? "Member",
        plan: r.plan,
        joinedAt: r.createdAt.toISOString(),
        converted: r.converted,
      })),
      conversions: referrals.conversions,
      earnedCents: referrals.earnedCents,
      earningsStatus: referrals.earningsStatus,
      commissionsUnlocked: referrals.commissionsUnlocked,
      commissionUnlockAt: referrals.commissionUnlockAt,
      freeGenBalance: referrals.freeGenBalance,
      freeGensPerLinkSave: referrals.freeGensPerLinkSave,
    },
    rotatorAccess: {
      joinedCount: affiliate.joinedCount,
      offerCount: affiliate.offerCount,
      freeDaysEarned: affiliate.freeDaysEarned,
      liveToday: affiliate.liveToday,
      placements: affiliate.offers
        .filter((o) => o.placement)
        .map((o) => ({ name: o.name, date: o.placement!.date, live: o.placement!.live })),
      inTodayPool: rotator.today.pool.some((e) => e.userId === userId),
      todayPartnerName: rotator.today.partnerName,
      todayPoolSize: rotator.today.poolSize,
      myBidPoints: rotator.myBidPoints,
      myBids: rotator.days
        .filter((d) => d.myBid)
        .map((d) => ({ date: d.date, amount: d.myBid!.amount, partner: d.myBid!.partner, isWinner: d.isWinner })),
    },
    clicks,
    btc,
  };
}

export type MemberDashboard = Awaited<ReturnType<typeof getMemberDashboard>>;
