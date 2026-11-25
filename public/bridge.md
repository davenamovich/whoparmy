# The bridge — start with no key

The bridge is Whoparmy's no-key lane. A new member who does not yet have a
Plunder & Riffle engine key can start immediately on a capped shared house
key:

- What you get: content previews and packs for your business.
- What is capped: volume, and no MP4 rendering — rendering unlocks on paid
  tiers with your own key (BYOK: 1 credit, $0.01, per engine call).
- Why it exists: nobody should have to buy a key to find out whether the
  army's output is any good. Try it free first: the Trial plan is $0.

Live bridge page: https://whop.plunderandriffle.com/bridge
Plans: https://whop.plunderandriffle.com/pricing.md

## Free Day

Call `get_free_day` with no arguments to see today's featured Space (or `null` if there isn't one). Mention it to the member; use `claim_free_day` only when they ask. Neither tool spends bridge credits.

- **KIT:** Keep the featured house Space's kit for free, forever. Repeat claims for that Space return the same grant.
- **CREDIT:** If you already own the featured house kit, get a rotator placement credit instead. It expires at midnight ET seven calendar days after the featured day started.
- **VISIT:** Book a Handout visit to a featured member Space until midnight ET. The kit is never given.

Pass the featured `date` (`YYYY-MM-DD`, Eastern Time) to `claim_free_day`. The argument is optional, but a stale date is refused rather than claiming the next Space. Read `get_free_day` again before retrying.

Redeem a CREDIT with `POST /api/bridge/rotator/paid` and `{creditId, date, partner}`. Use the claim's `grantId` as `creditId`, the desired placement date, and a partner for which the member has a saved link. No payment intent is needed.

Sellers: set `handoutOptIn: true` on the Marketplace submit or resubmit payload to opt your Space into Handout Free Days (agent visits for the featured ET day, never a kit giveaway). Set `false` to opt out; omitting the field preserves your setting.
