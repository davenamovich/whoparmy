# The BTC Experiment — Architecture Report
**Date:** 2026-11-19 · **Status:** Audit complete (code + docs + primary sources). Live deployment not HTTP-verified in this audit.
**Frame (Dave, 2026-11-19):** English first · a Muse play riding the Japan wave · monetize with web2 offers + knowledge · homepage = one beveled phone, very few words, localization in the content · the product is the Agent Instructions.

## Thesis, restated in our stack's terms
Crypto was made for agents. Whop Army already gives a member an agent (Day-1 prompt + bridge). P&R already gives that agent tools and offers. The BTC Experiment is a **vertical skin + one stack entry + one prompt variant** on that machine — not a new platform.

## REUSE — already built, verified in code (`~/workspace/whoparmy/Whoparmy/src/`)
| Piece | Where | BTC use |
|---|---|---|
| One-ask onboarding (website or CTA link → research → handoff) | `components/factory/agent-start.tsx` | BTC entry asks the same one thing |
| Day-1 setup prompt generation (Ralph-crafted, from approved Blueprint) | `lib/setup-prompt.ts` | Template source for the BTC prompt variant |
| Bridge token `prb_` — 7-day, hash-stored, revocable, budget-capped, **content-only (never publishes)** | `lib/muse-bridge.ts`, `api/bridge/*` | Agent's P&R access; posting stays on member's in-app approve tap |
| **Stacks registry — adding a stack is a one-entry change** | `lib/stacks.ts` | `btc-experiment` stack entry (see SPEC) |
| Daily Rotator — auctioned, admin-controlled, hourly rotation, public 302 `/rotator/go` | `lib/rotator.ts`, `api/bridge/rotator/*` | The shared BTC traffic pool v1 = this rotator, BTC-partner filter |
| Free rotator placement for saving a partner link (24h) | `lib/bridge.ts: grantFreePlacement()` | BTC onboarding hook: save your DH Media link → placement |
| Partner-link saving (10 partners incl. **dh-media**) | `app/bridge/page.tsx`, `lib/bridge.ts` | Member's own DH Media referral link lives here |
| Referral attribution — set once, never overwritten, self-referral excluded, `?ref=` stashed across Whop connect | `lib/referrals.ts`, `lib/ref-stash.ts` | TheBTCExperiment.com → Whop Army attribution |
| Agent catalog (13 templates) + control center (Overview/Activity/Research/Memory/Tools/Settings, kill switch, memory export) | `lib/agents.ts`, `components/factory/agents.tsx` | "My Agents" v1 = this flat hire list; no marketplace build yet |
| P&R MCP engine — memes, hybrids, packs, 23-language generation | `lib/engine.ts` | The Meme Engine lane; localization = content language, incl. JA |
| Whop auth / entitlements / hosted checkout; plans ENGINE-METER $0/29/79/199, **agents unlimited**, BYOK 1 credit ($0.01)/call past allowance | `lib/whop.ts`, `lib/plans.ts` | All monetization stays in Whop Army. No new payments, no new user DB |
| Upload-Post member lane — member's own key, posting only on approve tap | `lib/upload-post.ts` | Distribution lane |
| UI i18n scaffold en/es/ja/ru (Muse drafts, native review pending) | `src/i18n/` | JA shell when needed; page shell is word-light by design |
| Knowledge products | AI Assessments Whop product `prod_375J8KgxlSmT1` ($999, hidden); 1% Project | The "knowledge" monetization leg |

## BUILD — the only new pieces
1. **Landing page** — TheBTCExperiment.com: one beveled phone, dark + BTC orange, very few words, phone loop = localized content (meme → webinar → post → report), one CTA into Whop Army with `?ref=` preserved. (Built locally in this workspace; domain/deploy = Dave's approval.)
2. **`btc-experiment` stack entry** in `lib/stacks.ts` + BTC prompt variant (EN master; JA variant follows, native review before use).
3. **BTC prompt's offer layer** — agent pulls offers dynamically via P&R (`list_my_offers` pattern / hub offers). **No hardcoded offer DB.** DH Media featured first; web2 offers are the monetization bench.
4. **BTC rotator scoping** — filter the existing global pool to BTC-participating partners for BTC entry traffic. Bid currency stays free generations in v1 (no BTC/money auction without Dave's call).
5. **Bitcoin payout-address step in the *prompt*, not the app** — the agent guides the member through DH Media's own registration; the member enters their address on DH Media itself. Whop Army stores **no** BTC address, no seed, no keys in v1. (No address field exists in code today — keep it that way until DH Media's address rules are confirmed.)

## DH MEDIA — verified facts only (2026-11-19, primary sources)
**Confirmed on dh.media:** $10 = 100 credits (Launch pack — *not* confirmed as a "registration fee"); 13 tools incl. Social Planner, Website/Funnel Builder, Booking, Automations, Email, Affiliate Manager; affiliates page runs a "2x2 Referral Engine Calculator" — first two referrals 25% each, next four 50% each, 25% cycle bonus — with its own disclaimer: *"does not guarantee earnings, income, or results."*
**NOT found on official pages:** Bitcoin named as the payout asset on the affiliates page (it says "crypto payouts"), payout-address rules/permanence, minimums/timing, any API, GoHighLevel, Japan eligibility, official affiliate agreement / promo-method rules.
**Third-party risk context (labelled):** De Hek (Substack, 2026-05-31) and BehindMLM (2026-07-06) characterize the DH Media / Salarium Life structure as a recruitment-focused matrix with unclear ownership. Dave's standing rule already covers this: **copy sells tools/workflow, never matrix math or earnings.**
→ **Build consequence:** the BTC prompt teaches the agent the *tools* story + "crypto-paying affiliate program, terms on dh.media/affiliates" and forbids earnings/matrix promises. Anything about BTC addresses is phrased as "enter it on DH Media during registration; confirm on their page whether it can be changed — we have not verified that it can."

## Conflicts flagged for Dave (not silently resolved)
1. **Japan-first (master prompt) → superseded by Dave 2026-11-19:** English first, Japan is the Muse wave. JA content generation exists (23 languages), but JA *hybrid renders* carry the known "THIS CONTENT IS NOT AVAILABLE" watermark defect — JA memes/packs fine, JA hybrids gated on the dev fix.
2. **SMB-owners-only target (2026-11-16)** vs BTC Experiment's consumer/agent-participant audience. This vertical is a consumer play by design — flagged, proceeding per this brief.
3. **Free Muse plan limits:** the Day-1/bridge model already assumes the member's own Muse; the BTC prompt must not promise unlimited background execution. It instructs session-based work + scheduled check-ins the member triggers.

## Status board
- **Built:** audits, this report, DECISIONS.md, SPEC + prompt (this folder), landing page (local)
- **Tested:** audit claims read from code/docs; DH Media claims read from live official pages
- **Connected:** nothing new — no Whop product, no stack entry deployed, no domain
- **Live:** nothing
- **Planned / gated on Dave:** stack entry code change + deploy, TheBTCExperiment.com domain + deploy, JA prompt native review, BTC-scoped rotator config, first demo campaign

## Appendix — P&R live offer pull (2026-11-19, verified by direct MCP call)
`list_my_offers` answered live (server up; tool list confirms 19+ tools incl. `list_my_offers`, `research_brand`, `create_funnel`, `generate_ad_creative`).
- **DH Media entry (verbatim):** step `salarium` · "People you invite sign up to DH Media through your link, and its Bitcoin-paid offers earn you commission." · link `https://dh.media/?affid=Vesselprotocol`
- **DH Media page (share this, not the raw link):** `https://www.plunderandriffle.com/dhmedia` — "Affiliate offers that pay out in Bitcoin." (button: house)
- **Full bench (11 offers, dynamic):** Fish Audio, Freebuff, Upload-Post, Railway, Bankr, Polyshares (6% fee stated), Amelia, Agent37, Temu, Whop, DH Media. Missing: Higgsfield only.
- Rule from the API itself: share `pages[].url` (our page, member's ref on it), use raw links exactly as written.
→ The BTC prompt's dynamic-offer requirement is **satisfied by the existing API** — no new offer plumbing.
