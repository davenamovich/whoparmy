# The BTC Experiment: BTC or No BTC — Game Spec v1
**Dave's brief:** 2026-11-19 12:51 ET (this chat). **Build as a Whop Army game, not another website.** TheBTCExperiment.com = front door → game = attraction → Whop Army = everything behind it.

## Why this is a reskin, not a greenfield (verified 2026-11-19)
PICK A PHONE shipped TODAY (board chat, Dave's go): server-side boards in Whoparmy (`src/lib/doors/pickaphone.ts` + `/api/doors/pickaphone/{session,pick,decide,finish}`), commitment hash shown before picking, Vault Token board (550 VT), predetermined offers, TAKE IT pays via the existing claim bridge (`mintClaimToken`, mint-once), funnel events, live game site at muse-doors.pages.dev, live smoke test passed (session → offer → claim → +6 gens). The BTC game reuses that machine: session/pick/decide/finish, claim bridge, VT currency (Dave's locked denomination: Vault Tokens, NOT P&R credits, NOT Muse tokens; 23 VT = 1 free generation on the Doors/Pickaphone rails), finite-pool thinking, published offers.

## Dave's design, mapped to issuable reality
- **26 cases** (Dave) vs Pickaphone's 12 phones — board size is config; rounds: pick your case, open 5, Banker offer, open more, offer, final reveal. Offers predetermined + published, like Pickaphone.
- **Banker = Jobless Joe** — character + lines (Fish voice ID for Joe locked: 35811cf8e3b641caad9ee5dcfa0d7c73 for any audio; v1 = text lines). NOTE: Pickaphone deliberately used zero "Banker"/"Deal or No Deal" strings (IP caution, Muse as host). Dave first named it "DEAL OR NO DEAL?" then renamed it himself at 12:54 ET to **"BTC or No BTC"** — buttons are BTC (take the offer) / NO BTC (keep playing). This also retires the IP flag: the shipped client contains no "Deal or No Deal" strings, same as Pickaphone.
- **Prize table (Dave's 10) → what can actually be issued in v1:**
  | Dave's prize | v1 issuance |
  |---|---|
  | Free Muse agent setup | **Every finisher** — the BTC stack prompt (the twist, below) |
  | P&R token bonus | Vault Tokens → free generations via claim bridge (funded, mintable today) |
  | Traffic pool credits / Sponsored rotator placement | Rotator free-placement grant exists (`grantFreePlacement`) — fulfillment wiring needed |
  | Extra meme campaign / Premium P&R prompt | Engine job / prompt — fulfillment wiring needed (same known gap as Pickaphone's Scout/Architect perks: recorded on session, must be wired before promotion) |
  | Bonus agent day / Multi-agent setup / Agent marketplace access / BTC Experiment VIP | **Not issuable today** — v1 board pays VT/gens + agent setup only; these stay off the published board until they exist |
- **Banker offers** in VT, labeled illustrative until claimed: e.g. "1,000,000" in Dave's sketch = VT face (1M VT ≈ 43,478 gens at 23 VT/gen is NOT fundable as a routine offer — offers must follow the Pickaphone pattern: small, predetermined, published, pool-funded). v1 offers: 2 gens / 5 gens / 9 gens pattern scaled to a 26-case board, published on the page.
- **The twist (every game):** the player's own case always ends with: "YOU DIDN'T WIN A BITCOIN. YOU WON THE OPPORTUNITY TO PUT AN AGENT TO WORK. WELCOME TO THE BTC EXPERIMENT." → CTA: activate via Whop Army BTC stack → DH Media is a **separate, optional** third-party purchase ($10 pack per dh.media), never required to claim, never affects odds.

## Funnel (Dave's 5 steps, wired to real surfaces)
Play free (game) → Win your agent reward (claim link + BTC prompt) → Activate (Whop Army; DH Media separate/optional) → Paste prompt, connect P&R (bridge) → Invite (referral link + rotator). `?ref=` propagates through game → claim → Whop Army (Pickaphone already propagates ref on share/invite).

## Multiplayer (v2+, NOT v1)
Daily Banker, agent leaderboard (verified referrals/traffic/commissions only), Japan vs USA, community case, agent battles. The live Bitcoin scoreboard shows **actual verified commissions only** — v1 shows none (no verified commissions exist; confirmed revenue $0).

## Legal / honesty gates (Dave's own §6 + locked Token Vault decisions)
Free to play · no purchase necessary · purchase never improves odds or is required to claim · published rules, eligibility, odds (pattern: ~/workspace/doors-game/RULES-AND-ODDS-DRAFT.md) · **legal review ( esp. Japan + token prizes) and Dave's final-rules approval gate any public promotion/launch** · build + staging play do not need the gate; promotion does.

## Localization
EN first (Dave, 2026-11-19 12:42). JA = **first localized version** (Dave, this brief) — in-client toggle like the landing; JA copy is a working draft pending native review.

## Build sequence
1. **Now:** static game client (fork of doors-game PICK A PHONE client patterns) in ~/workspace/btc-experiment/game/ — 26 cases, Joe Banker, EN/JA, BTC funnel CTAs, API adapter pointed at a new `/api/doors/btcgame` namespace with a clearly-labeled local demo board when the API isn't live yet (no fake minting: demo finishes show the twist + CTA, no claim code).
2. **After the BTC stack deploy lands** (Whoparmy repo is mid-deploy — do not collide): server namespace in Whoparmy modeled on pickaphone.ts (26-case board config, VT denominations, offers, funnel events game_id=btcgame), tests, merge, deploy.
3. **Then:** staging play-through on the real pair, rules page published, Dave's promotion/legal gate.
