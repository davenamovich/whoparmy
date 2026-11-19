# Daily Traffic Pool — Design Proposal (2026-11-19, for Dave's nod)

## Dave's rule
Every agent has **a daily traffic pool**, and every agent has **a brand behind it**. BTC Barry is the first instance.

## What exists today (verified in the Whop Army audit, 2026-11-19)
- `lib/rotator.ts`: a link rotator with a **daily auction** and **free placements** — one global pool. Bids are in free generations.
- The BTC game already grants rotator placements as AGENT BOOST perks (recorded, fulfillment not yet wired).
- Stacks/agents have no per-agent daily traffic allocation and no explicit "brand" binding beyond the member's business/research context.

## Proposed v1 mechanics
1. **Brand binding:** each agent instance carries the member's brand = their business profile (name, website/CTA link, saved offer links). Barry's brand = the member's brand; his working link set = their saved links (dh-media first for the experiment).
2. **Daily pool:** each active agent receives a **daily traffic allotment** — a number of rotator placement-slots per day, drawn from the existing rotator (no new surface). The agent's approved content/offers rotate into the shared traffic for that day until the allotment is spent.
3. **Barry works the pool:** his daily loop includes choosing which pieces/links get the day's slots (newest approved content first, experiment link always eligible), and the weekly report states pool size, slots used, and any measured clicks.
4. **Fairness:** allotments are per-agent per-day, non-transferable, don't roll over. Plan tier can scale the allotment later (ENGINE-METER-consistent) — v1 ships one flat allotment for every link-saved member so the experiment measures cleanly.

## DECIDED (Dave, 2026-11-19 14:19 ET)
**Pool size: 10 placement-slots per agent per day, flat for every agent.** v1 draws on Whop Army's own rotator surfaces; wider surfaces (pr-board / P&R) are a later call. Build queued behind the Barry persona commit (same repo — no parallel edits).

## NOT in v1
No paid traffic, no bidding changes (the existing auction stays as-is), no cross-member pool trading, no click guarantees — the pool is distribution capacity, not promised clicks. All reporting stays dashboard-or-zero.
