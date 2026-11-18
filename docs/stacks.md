# Self-funding stacks — personal agents with memory, in niches that pay for them

Status, 2026-11-18. Design doc, written after the Clipper build
(`feat/clipping-app`) and the brief/on-ramp work. The assessment rubric in this
doc is implemented and tested in `src/lib/clips/assessment.ts` (9 tests).

## The premise

An agent that remembers is worth more than an agent that generates, and both
are worth little if nobody pays. So every stack here has to answer one question
before it gets built:

> **Does one delivered cycle cost less than one customer's smallest payment?**

At $0.005 a render and three agent turns a clip, the answer is "yes" in almost
any niche with a budget. That is the opportunity — and the trap, because a niche
with no budget is free work at scale.

## The components, and what each one is for

| Piece | Job | Why this one |
|---|---|---|
| **Muse** (Meta) | orchestrator: holds the brief, calls tools, asks before acting | the member's own agent on their own Secure VM; the free lane |
| **Agent37** | runtime: queues, crons, MCP, scheduled work | schedules live outside the container, so a sleeping instance still fires |
| **mnemos** | memory: voice, clients, rejected work, history | the moat. Everything else is a commodity; taste is not |
| **Cloudflare** | edge: Workers (webhooks, cron hooks), R2 (clips), Queues (jobs), Pages/D1 (the public face) | no server to babysit, and hosting is not where the cost is |
| **whoparmy** | identity, entitlement, the review desk, the Box Trade, credit ledger | where a human says yes, and where money is accounted |
| **P&R MCP** | the renderer: clips, memes, slideshows | never reimplemented; a cent a call on the member's key |

Cost reality: hosting is noise next to renders, and renders are noise next to
the plan price. **The scarce things are taste (memory) and attention (a human
approving), not compute.** Every stack below is designed to spend our money on
the cheap things and the customer's attention on as little as possible.

---

## Stack A — The Clip Desk (local service businesses)

*Plumber, dentist, gym, salon, garage, estate agent with 2–20 staff.*

**Loop.** Onboarding: nine answers (the clipping agent's own page setup) → a
standing brief → 20 clips a month → owner approves on their phone → they post.
The owner's only recurring job is saying yes or no.

**Who pays.** The owner, $29–199/mo, out of a budget that already exists — the
editor they half-use, the ads they hate, the nephew who "does the socials".

**Cost per cycle.** 20 renders = **$0.10**. Three turns a clip. Nothing else
scales with them.

**What memory buys.** Their voice (which words they'd never say), their offers
(seasonal, local), their rejections ("no stock photos", "no text over my face").
By month three the agent stops proposing things they will refuse — that is the
product, and it is not portable to a competitor without the history.

**First twenty.** One vertical, one town. Walk in with five finished clips about
that business, made before asking for anything. At $0.005 a clip that is a $0.03
sales call.

**Why it can't be copy-pasted.** A big tool sells the same model to everyone;
this sells a memory of *this* shop. The niche is small enough to serve by hand
and large enough to repeat.

---

## Stack B — The Niche Wire (fan and news pages with a product behind them)

*GTA 6, a football club, a local scene, a hobby with a release calendar.*

**Loop.** The page runs itself on a cadence: three clips a day, a weekly recap,
a countdown. Every clip credits its creator, and every caption points at the
page's own thing — a $9 guide, a paid Discord, a sponsor slot.

**Who pays.** The audience, through the product; sponsors, through the slot. Not
the page owner — which is why this stack suits an operator running five pages,
not a shop owner.

**Cost per cycle.** 90 renders a month = **$0.45**. The binding constraint is not
cost, it is rights: fan pages live and die on credit conventions and takedown
behaviour.

**What memory buys.** Series continuity (running jokes, episode numbers), what
the audience actually engaged with — from real numbers only, never inferred —
and a takedown ledger that blocks a creator everywhere, permanently.

**Honest failure mode.** If the clips are other people's footage, we are one
angry rights-holder from losing the page. That is why `rightsRisk` can kill a
vertical outright in the rubric, and why this stack only proceeds with a credit
convention the operator will actually keep.

---

## Stack C — The Client Factory (agencies and solo consultants)

*One person serving 3–5 small clients.*

**Loop.** Per client: a weekly pack (clips + captions + a one-page "what we ran
and why"), produced from that client's brief and memory, reviewed by the
consultant, delivered as files or a shared page.

**Who pays.** The clients, $300–1000/mo each. The consultant keeps the margin,
which is enormous: 20 clips a client costs **$0.10**.

**What memory buys.** Per-client isolation above all — a client's voice must
never bleed into another's. Scopes are keyed by user and client, and the
cross-tenant leak is the one unacceptable bug in the whole system.

**Why it is a good wedge.** The consultant already has the clients and the
invoice; we are replacing their evenings, not their judgement. And the consultant
becomes a BYOK customer the moment volume matters.

---

## Stack D — The Assessment Floe (the thing that sells the other three)

*Any small business, before they buy anything.*

**Loop.** A public page takes a business URL, produces an honest one-page
assessment — what their content is doing, three specific fixes, three clip briefs
written for their business — and offers the first five clips.

**Who pays.** Nobody, directly. It converts into A, B, C or BYOK. Its cost is
one page load and one brief.

**Why it works.** It is the only marketing that is also the product: the
assessment is a real artifact made by the same engine, and its three briefs are
the sales pitch. No claims, no promises — the work is the argument.

**What memory buys.** The assessment history. Second visit knows what they fixed
and what they ignored, which is exactly what a good consultant remembers.

---

## The team that generates these

Five roles, one weekly loop. Each has a single output, so a bad week is visible.

| Agent | Job | Output | Cadence |
|---|---|---|---|
| **@scout** | find verticals: who has budget, what public material exists, where the audience already is | 10 candidates with sources | weekly, Friday |
| **@analyst** | score them with the rubric, keep the scorecard, track what actually converted | ranked list + kill reasons | weekly, Monday |
| **@maker** | turn the top vertical into a buildable stack: schema deltas, routes, brief template, Cloudflare layout | one spec per week, not five | weekly, Tuesday |
| **@promoter** | price it, write the "pays for itself" maths, plan the first twenty customers | offer sheet + channel plan | weekly, Wednesday |
| **@joe** | sequencing, the honesty gate, shipping | one built stack at a time | continuous |

**The rule that keeps this from becoming a deck factory:** one stack in build at
a time, and nothing new starts until the current one has a paying customer or is
killed. A team that can produce ten ideas a week and ship none is the most
expensive thing in this document.

## The rubric (implemented, tested)

Six criteria, weighted to 1.0: buyer budget (.20), public source material (.20),
distribution without ad spend (.20), cost-to-price ratio (.15), memory moat
(.15), rights risk (.10). A model supplies 1–5 sub-scores with a one-line
reason each; **the arithmetic runs in code** (`src/lib/clips/assessment.ts`), a
missing sub-score is a 1, and four hard stops override the total:

- rights risk ≤ 2 → kill
- buyer budget = 1 → kill
- distribution = 1 → kill
- cost ratio = 1 → kill

Verdicts: ≥ 4.0 build · 3.0–3.99 two-week test with one real buyer · < 3 pass.

Nine tests, including one that proves every kill rule is reachable — a rubric
nobody can fail is decoration.

## Sequence

1. **A** — the Clip Desk, because the Clipper already exists and one local
   business proves the loop end to end.
2. **D** — the Assessment Floe, because it feeds A and costs a page.
3. **C** — the Client Factory, because it is A with tenants.
4. **B** — the Niche Wire last: highest upside, highest rights risk, and it needs
   the takedown memory to be battle-tested first.

## What would make me abandon this

- A niche where the buyer wants *volume* and not *judgement*: the agent cannot
  help someone who will post anything.
- A rights environment where crediting is not enough (sports, film, music).
- Anyone who says the agent should post without a human yes. That single rule is
  what makes the rest of this sellable.
