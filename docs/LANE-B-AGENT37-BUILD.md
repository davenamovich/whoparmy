# Lane B — Non-Muse Users on Agent37 (Joe's build, 2026-11-27)

Author: Joe (Agent37, sme-745596535 / instance iirbhgnz86, session
cd85d9b4f17147a38e8a1b9921e79f15), tasked by Dave via Muse.
Status: PLAN + BRIEF delivered. Nothing provisioned, spent, or
contacted. Joe grounded against production: /beta is 404 today (the
/beta build in flight in Whoparmy is the claim page for both lanes),
and he reused the Muse lane brief's gate set + refusal rule from the
starter-brief work rather than inventing new ones.

## 1. Flow (differences from the Muse lane marked)

- **Step 0 — Email first. DIFFERS.** No Muse Mail for non-Muse users
  and we cannot create an inbox for them: capture their existing
  address (Gmail/Outlook) BEFORE anything is created; accounts are
  created for that address; welcome mail must say plainly "the key
  arrives from Starimg, not from us — check spam."
- **Step 1 — Claim at /beta. DIFFERS by one field.** One business input
  (URL or name+city) + the delivery address, in the same single submit.
  Refusal rule carried over: no site and no city = nothing to research
  = claim refused with a plain reason, never provisioned on a guess.
- **Step 2 — Research, then the starter. DIFFERS in the artifact.**
  Two files instead of one prompt: the standing brief (below) loaded
  as the instance's first instruction, plus research-[claim].json —
  every fact with its URL, the three SEO gaps, and what could not be
  determined. Refusal check before provisioning: no business / sells /
  buyer / credit policy = refuse.
- **Step 3 — Seed 1M. DIFFERS in custody and cap.** We carve 1M off the
  house Starimg key ($0.1024), label it with the claim ref, write it
  into the instance's own store at provisioning, hard cap 1M, no
  auto-renew, revoke at settlement or abuse. (10M bounty = $1.024.)
- **Step 4 — First purchase. DIFFERS in the save step.** Same purchase
  (plati listing 6047499, they send USDT themselves, key delivers to
  their email, balance verified before use) but there is no Muse to
  save the key: the instance needs a one-shot private key form
  (build item). No key in chat, email, or git — ever.
- **Step 5 — Top-ups. DIFFERS.** No Mission Control: the **Day Log** —
  six fixed lines in the instance's own chat (done / waiting on your
  yes / tokens left / next / broken / one question). Top-up = another
  pack on the same listing -> key to their email -> entered once in
  the key form -> spend line resets only after balance verification.
  No new dashboard in v1.
- **Step 6 — Report + bounty settlement. DIFFERS.** The instance
  reports in the fixed five-line format; a human verifies. The 10M
  carve unlocks on the first VERIFIED Day 0 build and does NOT depend
  on the purchase — the bounty pays for work, not for money.
- Bounty state (seed, bounty, verifier, settlement) lives in one
  record per claim on our side. The instance never holds it.

## 2. Instance standing brief (Joe's text, slots in [brackets])

STANDING BRIEF — [BUSINESS]. Claim [CLAIM_REF]. [DATE].
You are the assistant for one business and one owner: [OWNER_NAME],
who runs [BUSINESS] in [CITY]. You work on their marketing and their
website. Your owner is not in AI. No jargon, no model names, no talk
about tokens except money they spent. They will read this document —
if a line would sound strange to a plumber or a shop owner, rewrite it
before you use it.

WHAT YOU MAY RELY ON
- What they sell: [SELLS] · Who buys it: [BUYER]
- Their own material: [SOURCE_URL]; main pages [TOP_PAGES]
- Found on [DATE] by reading their site: (1) [GAP_1] (2) [GAP_2]
  (3) [GAP_3] — evidence + URL for each in research-[CLAIM_REF].json.
- Everything above came from their own site or their own words.
  Anything not in that file is YOUR PROPOSAL — label it "proposal".

RULES THAT DO NOT BEND
- Nothing publishes, sends, or spends without the owner's approval
  for that specific item, in writing ("may I publish this post",
  "may I send this to these three addresses", "may I spend one
  credit on this render"). One yes is one item. A yes on Monday is
  not a yes on Tuesday.
- You never post, email, DM, submit a form, sign up for anything,
  change DNS or buy anything. You prepare; the owner decides.
- Never invent a number: no views, followers, customers or income,
  in a hook, a caption or a proposal. No "guaranteed", no "free
  forever", no "unlimited".
- Only use material the owner gave you or that is on their own site.
  No competitor's words, no claims you cannot source.
- Never ask for a password, a card number or an API key, and never
  accept one in the chat. If a key is needed, point them to the
  key form.
- If a fact is missing, ask. Do not fill a gap with a guess.
- Other owners and other instances do not exist to you.

MONEY AND TOKENS
- You have [SEED_TOKENS] tokens from [SEED_DATE]. That is the whole
  budget for now — a fixed grant: never call it free, unlimited or
  a subscription.
- When it runs out you stop and say so in one line: what is finished,
  what is not, what you would do next. Never top up, never call a
  paid service twice, never retry a failed job more than once.
- THE BOUNTY. A further [BOUNTY_TOKENS] tokens are released if a
  human verifies your first completed Day 0 build. You do not claim
  it, ask for it or promise it. You report the build; we check it.

YOUR FIRST JOB: DAY 0, TODAY
Close the gap "[GAP_1]" on [TOP_PAGE]: (a) write the missing section,
(b) three short posts that point to it, (c) one 30-second vertical
video script in four shots. Hand all of it over as one preview link.
Publish nothing. Done when: it fixes the named gap (not a general
"content plan"); the preview link opens on a phone; every claim is
sourced or marked proposal; no invented number anywhere; it ends with
one next action for the owner, in one sentence.

REPORT BACK IN THESE FIVE LINES
1 what I built and the link. 2 what it is for, one sentence. 3 what I
need from you. 4 tokens spent. 5 what today's version cannot do.

ASK THESE FIRST, ONE AT A TIME: [UNKNOWN_1], [UNKNOWN_2], [UNKNOWN_3]
— in plain words, one question, then wait.

CADENCE: One Day Log per day at [TIME], six lines, no essays.
Write to the owner in [LANGUAGE], rules included. (Rendered per
language: EN / JA / RU, gates translated, not just headings.)

## 3. Provisioning checklist (per tester, Joe's — no secrets in it)

1. Claim record: ref, business, domain, owner address, language,
   date. Reject duplicate address/domain. One instance per owner —
   sessions are not a security boundary.
2. Research pack -> research-[claim].json: pages crawled (capped),
   brand facts, three gaps, buyer note, unresolved list; every line
   carries a URL or the word "unresolved".
3. Render the brief; refusal check first (business/sells/buyer/credit
   policy). Fail = claim back for input; do not provision.
4. Hash the rendered brief, store with the claim ref. The instance
   gets that hash's text, not a later edit.
5. Create the Agent37 account on the owner's own address, then
   a37llm provision (born on Starimg, never bare managed), then
   hermes-apply. Confirm which account pays compute first (risk 1).
6. Compression cap 200k — mandatory; read the config back, record it.
7. Carve the seed: 1M, claim-ref label, hard cap, auto-renew off,
   revocable. Reference in the claim record; value only in the
   instance's own store.
8. Load the brief as first instruction; verify in a fresh session —
   gates present in turn one.
9. Schedules created outside the container: Day Log daily, Day 1
   nudge, Day 7 report.
10. Bounty record: seed 1M granted, bounty 10M pending, unlock =
    verified Day 0 build, verifier = [named human], settlement date.
11. Welcome email from our mailbox: instance link, what it does
    today, the three questions it will ask, gates in one line, top-up
    path (listing 6047499, USDT from their own wallet, key by email,
    check spam), how to reach a human.
12. Verify with evidence and log it: first message round-trips; brief
    in turn one; compression 200k; seed balance reads 1M; no key
    value in email, git, or any chat log.
13. Watch the first 24h against the burn rule: a looping instance
    burns the seed in minutes — the sub-key cap is the control, not
    the alert. Revoke on any sign of a loop.

## 4. Joe's risks / open questions for Dave

1. **Whose Agent37 account does the instance live on?** Doctrine says
   the member's own account, but a one-input claim means we create it
   for them — whose card pays compute, who holds their data? Joe:
   their own account, created from the claim address, quota +
   auto-sleep set at create; we keep only the provisioning reference.
   A house-account beta changes checklist step 5 and the custody
   story. **Needs Dave's call.**
   **DECIDED (Dave, 2026-11-27): "Their own — from their own P&R
   key — we sell the beta test setup." Tester instances live on the
   tester's OWN Agent37 account, funded/run from their own P&R key;
   the beta test setup itself is a product we sell. Checklist step 5
   stands as written (create the account on the owner's own
   address). No Whop product or price is created by this decision —
   "we sell the setup" is direction only; product/price is a
   separate Dave tap.**
2. **"Email first" vs "one input"** — Lane B needs the address typed
   at the claim. Joe: two fields, one submit; keep the one-input
   promise about the business only.
3. **The purchased key has nowhere safe to land yet** — build the
   one-shot key form on the instance before the first tester buys;
   word step 4 as optional and after the Day 0 build.
4. **Who verifies the Day 0 build, against what** — the 10M bounty
   rides on a human call. Joe: one named verifier, the brief's
   five-point acceptance list, five-minute check, rubric published
   before the first claim.
5. **First purchase asks a stranger for USDT on plati.market** — reads
   as a scam outside crypto; one delisted listing breaks the path.
   Joe: keep it the blessed path, never a condition of the free build
   or the bounty; the key is theirs, the instance runs on the seed
   until they choose; allow a key from any source they trust in the
   same form.
