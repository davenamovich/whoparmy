# BTC Experiment — Entry Flow v2 (Dave, 2026-11-19 13:02 ET)

## The funnel, step by step
1. **PAGE 1 — TheBTCExperiment.com** (live at thebtcexperiment.pages.dev): beveled phone, very few words. CTA no longer goes straight to Whop Army — it goes to the video.
2. **THE VIDEO — "The Offer, Explained"** (script: VIDEO-SCRIPT.md): ~75 seconds, Joe. What the experiment is, what DH Media is (tools + crypto-paying affiliate program), what the agent does, what it costs (free agent; DH Media's own $10 Launch pack is theirs, optional and separate), what happens next. Ends: "Save your link. Get your agent."
3. **SAVE YOUR LINK — entry into Whop Army.** The member signs in to Whop Army and saves their DH Media referral link on /bridge (their own link; Dave's is the placeholder example until saved). **The save is the gate**: it already triggers +25 free generations for saver and referrer (existing mechanics). The link can be changed later — agent-build access follows the *current* saved link.
4. **BTC ADDRESSES — collected in Whop Army, receive-only:**
   - `btcReceiveAddress` — the address the member uses to receive BTC.
   - `agentBtcAddress` — a dedicated address from the member's **own self-custody wallet**, designated for the agent; this is the payout address they enter when they register their DH Media account, so the agent's earnings land in an address set aside for the agent.
   - Validation: BTC address format + network label; explicit copy at the field: "Public receive address only. Never enter a seed phrase or private key — we will never ask for one." Editable (their DH Media payout changeability is governed by DH Media — unverified; we warn to confirm there).
   - We never generate wallets, never hold keys, never custody funds.
5. **FREE AGENT BUILD unlocks** (requires: a saved offer link). The member gets the BTC stack prompt (Whop Army /admin + member launcher, bridge code minted as today).
6. **MUSE RUNS THE ONBOARDING** — the prompt (BTC-AGENT-PROMPT-EN.md v2) walks the member inside their own Muse: confirm saved links → confirm both BTC addresses → get their Plunder & Riffle key (guided acquisition + pairing code / bridge — key never pasted) → register DH Media themselves with the agent address → research → first meme pack → rotator → weekly reporting.

## Build order (repo-collision safe)
- Game server build is IN Whoparmy now — no parallel Whoparmy edits.
- Next Whoparmy change (one commit, after game lands): (a) BTC address fields on profile + /bridge UI block, (b) agent-build gate = saved dh-media link, (c) stacks.ts prompt → v2 text, (d) landing CTA → video page, video page → Whop Army /bridge.
- Video production: script locked first (VIDEO-SCRIPT.md); produce via the Joe video engine lane; QA frames + listen before it ships (house rules). The video page ships with the video — no placeholder video, no labeled-simulation substitution without Dave's word.

## v3 amendment (Dave, 2026-11-19 13:40 ET) — GAME sits between video and link
Corrected order: **landing → video → GAME (BTC or No BTC) → save link in Whop Army /bridge → agent build.** The game is the hook after the video; the link save comes after play. Wiring shipped same hour: watch page CTA → btc-or-no-btc.pages.dev (ref preserved); game twist CTA "ACTIVATE YOUR AGENT" → whop.plunderandriffle.com/bridge?ref= (was Whop Army home). Claim flow unchanged (claim button still goes to the claim URL when generations were won).
