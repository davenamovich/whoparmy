# The Clipper — clipping app inside whoparmy

Status: spec, 2026-11-18. Source: `.agents/skills/clipping-agent/SKILL.md` at
`834abb22` on `feat/clipping-agent` (meme-loop-engine). Target: `davenamovich/whoparmy`
(the Whop app: Next.js + Prisma/SQLite + Whop OAuth + entitlements + Muse bridge).

## What the skill already does

One clip in, one captioned vertical post out, no host:

| Step | Behaviour |
|---|---|
| Ingest | Public clip (YouTube / X / TikTok / direct mp4/mp3), trimmed 3–30s (`clip_seconds`, default 15), transcribed |
| Hook | First-second on-screen line — caller's `hook`, else derived from the clip's own title/opening words. **Never invented.** |
| Captions | The clip's own words, chunked, burned in; its own audio is the track, never re-voiced |
| Copy | Hook + creator credit on its own line; QA issues returned as `warnings` |
| Gates | preview first · credit before posting · publish only on explicit yes · public material only |

It is a *routine*. It has no memory of the page, no queue, no ledger, no billing,
and its four gates are prose a human is trusted to follow. An app has to make
those gates **structural**.

## The app: what the skill lacks

A clipping page is not one clip, it's a daily grind across weeks. The app is the
missing operational layer:

1. **Page profile** — the skill's "page setup" asks nine questions before the first
   clip. Stored once per page, never re-asked.
2. **Batch intake** — paste 20 links, get 20 jobs, each independently reviewable.
3. **Approval queue** — every clip lands in `draft` and cannot leave it without a
   human yes on *that* clip. The skill trusts a person; the app enforces it.
4. **Credit ledger** — the skill warns "🎬 @creator is a placeholder, not a
   credit". The app refuses to export without a real handle and source URL.
5. **Takedown memory** — a creator who asks to be removed is blocked globally and
   forever, not forgotten between sessions.
6. **Billing** — Whop entitlement per tier, engine credits per render, BYOK lift.

## Architecture (recommended)

```
whoparmy (Next.js)                        meme-loop-engine (bot)
──────────────────                        ─────────────────────
ClipPage / ClipJob / ClipCredit     →     POST /api/agent/sitdown
  prisma (SQLite)                          { clip, videoStyle:"captions" }
guards: public? credit? approved?          → poll get_job_status kind sitdown
  ↓                                        → pageUrl + caption + warnings
review queue (human yes)                   ↓
  ↓                                   POST .../mp4  (request_mp4)
export button ─────────────────────▶  MP4 H.264/AAC 1080×1920
```

whoparmy has **no ffmpeg, no video worker** (deps: `sharp`, `z-ai-web-dev-sdk`,
Prisma, `@whop/sdk`). Reimplementing caption rendering there means a new worker
plus the whole sit-down film. The engine already does it. Whop app = front desk,
engine = the studio.

Existing plumbing to reuse: `src/lib/muse-bridge.ts` already derives **one agent
key per Whop user server-to-server** (never exposed), and enforces a tool
allowlist with a credit budget. Clipping needs a second, narrower path:

- `clip:render` — `create_sitdown` with `video_style:"captions"` (in budget)
- `clip:export` — `request_mp4` for a clip job (separate, paid, per-clip)
- publishing stays **out** of the allowlist, as it is today

## Data model (additions to `prisma/schema.prisma`)

```prisma
model ClipPage {
  id            String   @id @default(cuid())
  userId        String
  name          String            // "GTA 6 Daily"
  handle        String            // @gtadaily6
  niche         String            // the one angle
  platforms     String            // json: ["tiktok","reels","shorts"]
  timezone      String
  approvalHours String            // "09:00-22:00"
  cadence       String            // json: {"tiktok":2,"reels":1}
  creatorAllow  String   @default("[]")
  creatorBlock  String   @default("[]")
  disclosure    String?           // "Not affiliated with Rockstar Games"
  voiceStyle    String   @default("captions")
  createdAt     DateTime @default(now())
  clips         ClipJob[]
}

model ClipJob {
  id             String   @id @default(cuid())
  userId         String
  pageId         String
  page           ClipPage @relation(fields: [pageId], references: [id])
  status         String   @default("draft")   // draft|rendering|ready|approved|exported|failed|blocked
  sourceUrl      String
  sourceKind     String                        // youtube|x|tiktok|mp4
  clipSeconds    Int      @default(15)
  hook           String?
  caption        String?
  warnings       String   @default("[]")
  pageUrl        String?                       // engine preview
  mp4Url         String?
  creditWho      String?
  creditUrl      String?
  spoiler        Boolean  @default(false)
  series         String?
  episode        Int?
  engineJobId    String?
  approvedAt     DateTime?
  exportedAt     DateTime?
  error          String?
  createdAt      DateTime @default(now())
}

model ClipCredit {
  id        String   @id @default(cuid())
  userId    String
  clipId    String
  who       String              // "@creator"
  url       String              // where the clip came from
  verified  Boolean  @default(false)
}

model ClipTakedown {
  id          String   @id @default(cuid())
  creator     String            // handle, lowercased
  sourceUrl   String?
  requestedAt DateTime @default(now())
  note        String?
}

model ClipPost {              // manual log, never scraped
  id          String   @id @default(cuid())
  userId      String
  clipId      String
  platform    String
  externalUrl String?
  postedAt    DateTime @default(now())
}
```

## Routes

| Route | Purpose |
|---|---|
| `GET/POST /api/clips/pages`, `PATCH /api/clips/pages/[id]` | page profile, once |
| `POST /api/clips` | batch intake (max 25 links), guard-checked, one engine job each |
| `GET /api/clips?status=`, `GET /api/clips/[id]` | queue |
| `POST /api/clips/[id]/approve` | the human yes, per clip |
| `POST /api/clips/[id]/export` | `clip:export`, only from `approved` |
| `POST /api/clips/[id]/posted` | log a manual post |
| `GET /api/clips/usage` | this month's clips against the plan |

Reject on intake: not public, protected/expired, unknown host, already-blocked
creator, over batch cap. Cap exists because a 25-link batch is 25 renders — the
route must never retry in a loop (that is how keys burn).

## The guards, in code (skill prose → tests)

`src/lib/clips/guards.ts`, each with a unit test:

- `isPublicSource(url)` — https only, no private/loopback/onion, no signed URLs
  past expiry, host not on the leak list (datamined builds, pirated copies,
  "play early" tricks). If unsure → reject, as the skill says.
- `assertCredit(clip)` — fails when `creditWho` is missing or is literally
  `@creator`; `creditUrl` must be the source the clip came from.
- `assertApproved(clip)` — export throws unless `status === "approved"`.
- `assertDisclosure(page, caption)` — a fan/clip page must carry its
  non-affiliation line in the copy or the page bio.
- `assertNotTakedown(creator)` — any handle in `ClipTakedown` blocks intake.

Tests mirror the skill's four gates one-to-one, so a future edit to the skill
without a code change breaks a test rather than shipping a live post.

## UI

`src/app/clips/page.tsx` — one screen, phone-first:

- **Paste links** box (multi-line) → *Clip them*
- **Queue** — cards: thumbnail/preview link, hook, caption with credit line, the
  warnings surfaced in plain words, state chip
- Card buttons: **Preview** · **Approve** · **Export MP4** (disabled until
  approved) · **Edit hook/caption** · **Mark posted**
- A quiet, honest header line: "Previews are previews. Nothing posts itself."

Blocked clips show their reason and can't be approved — no bypass control.

## Billing

`plans.ts` gains `monthlyClips`: FREE 3 · CREATOR 30 · PRO 150 · AGENCY 600,
orchestrated like `monthlyItems` (402 on the same guard path). BYOK lifts the
cap; engine credits are the member's own.

## Phases

1. **P1** — schema, guards + tests, page profile, intake, engine render, queue.
   No export. Ships a reviewable clip on a phone.
2. **P2** — approve → `clip:export` → MP4, plan caps, usage.
3. **P3** — batch of 25 with progress, series labels, cadence board (what's due
   today per platform, counted from `ClipPost`).
4. **P4** — posting handoff (Upload-Post) behind an explicit yes, publishing
   allowlist opened for one tool only.
5. **P5** — numbers, only if real: completion/views per tagged clip. Until then
   every surface says "no performance data yet".

## Skill expansion (v2 — `clipping-page-app`)

The skill stays the editorial contract; v2 adds what a running page needs.
Proposed additions to `.agents/skills/clipping-agent/SKILL.md`:

1. **Page memory** — the nine setup answers live with the page (table above), not
   in a chat. Re-ask only when the niche changes.
2. **Batch rule** — clips are reviewed one at a time; a batch is never a licence
   to approve in bulk.
3. **Credit ledger** — every clip stores who + source URL; the placeholder handle
   is a hard failure, not a warning.
4. **Takedown** — same-day honour, global block, recorded with the date.
5. **Cadence honesty** — a missed slot is reported as missed. No backfill, no
   pretending the page posted.
6. **Series** — a clip that continues a series carries its number; no invented
   episode history.

## Open decisions

1. Render via engine (above) or build a renderer in whoparmy? *Engine — no ffmpeg there.*
2. Clip allowances per Whop tier (proposal above) — yours to set.
3. Export-only in v1, or posting in v1?
4. Does `/clips` sit inside the existing factory app, or as its own Whop product page?

---

# Revision 2 (2026-11-18) — driven by Muse, not a separate app

Decision: the Clipper is exposed **through the existing Muse bridge**, not as a
new front end calling the engine directly.

## How it fits

`/api/bridge/mcp` is already a JSON-RPC endpoint that verifies a bridge token,
then forwards to the P&R MCP on the member's derived key, with an allowlist and
a credit budget (`lib/muse-bridge.ts`). The Clipper adds a **local tool family**
handled by whoparmy itself, in the same endpoint, before the proxy:

```
tools/list  → local clip_* tools  ∪  proxyToolsList (engine tools, filtered)
tools/call  → name.startsWith("clip_") ? localHandler() : proxyToolCall()
```

The local handlers own `ClipPage` / `ClipJob` / `ClipCredit`; when a render is
needed they call the engine **server-to-server** on the same member key
(`create_sitdown` with `video_style:"captions"`). No key ever reaches Muse.

## Tool surface

| Tool | Who may call | Cost | Notes |
|---|---|---|---|
| `clip_page_setup` | Muse | free | the skill's nine answers, stored once |
| `clip_page_get` | Muse | free | |
| `clip_batch` | Muse | 25 credits/clip | up to 25 links; guards run before any spend |
| `clip_queue` | Muse | free | by status |
| `clip_get` | Muse | free | hook, caption, warnings |
| `clip_revise` | Muse | 25 credits | new hook/caption on one draft, re-render |
| `clip_mark_posted` | Muse | free | log only, after the human confirms |
| `clip_export` | **human only** | per-clip | refused to Muse, exactly like `request_mp4` today |

## The approval gate is the point

Muse is autonomous. Gate 3 of the skill ("publish only on an explicit yes") is
only real if **Muse cannot say yes on the human's behalf**:

- `clip_batch` / `clip_revise` can only produce `draft` rows.
- `status → approved` is set **only** by a signed-in human click on `/clips`.
- `clip_export` and the MP4 route both require `status === "approved"` **and** a
  per-clip confirmation token minted by that click.
- `publish_clip` / `post_to_socials` stay outside the allowlist. Posting is
  logged by hand with `clip_mark_posted` after the human posts it.

So Muse's ceiling is: research, draft, render previews, report. It cannot export
or publish, and it cannot approve itself.

## What this removes from the earlier plan

- No separate `/clips` product surface as the primary UX — `/clips` becomes the
  **review desk** (queue, approve, export, warnings), which is the one screen a
  human must use.
- No new integration path: no second key derivation, no new auth.
- Batch cap stays (25), because one `clip_batch` is up to 25 renders.

## Remaining decisions

1. Clip allowance per tier (proposal: FREE 3 · Starter 30 · Operator 150 ·
   Agency 600/mo; BYOK lifts). One constant in `plans.ts`.
2. v1 ends at export-to-device, or do we also open a posting tool for Muse
   (would break the current "publishing stays with the member" rule — needs a
   deliberate yes, not a default).

---

# Revision 3 (2026-11-18) — three systems, three jobs

Dave's correction: **P&R MCP creates the clips, Agent37 does the work, Muse
orchestrates.** whoparmy is the fourth thing — the till and the sign-off book.

| System | Job | Must never |
|---|---|---|
| **Muse** (member's assistant, via `POST /api/bridge/mcp`) | parse the ask ("these 5 links, one a day"), call tools, report back in plain words | render, approve, publish |
| **Agent37** (this platform: agent runtime + `agent37 cron`) | the worker: claims a job, calls the engine, retries once, reports; fires the daily slot per page | hold its own queue of record, or approve |
| **P&R MCP** (`create_sitdown` `video_style:"captions"`, `get_job_status`, `request_mp4`) | makes the clip — ingest, hook, captions, preview page, MP4 | be reimplemented anywhere |
| **whoparmy** | identity, entitlement (`plans.ts`), budget + allowlist (`muse-bridge.ts`), the `/clips` review desk | execute a render itself |

## Ownership: one queue, not two

`ClipJob` rows in whoparmy are the **system of record**. Agent37 is an executor
that claims and reports; it keeps no second queue (that is how the studio and the
MCP tool drifted apart in the Joe-clips build, and why the plan doc had to say
"both sides call the same job").

```
member → Muse ──MCP──▶ whoparmy /api/bridge/mcp  (control plane)
                          clip_page_setup · clip_page_get · clip_batch
                          clip_queue · clip_get        [free]
                          create_sitdown (captions)    [25 cr, allowlisted]
                          clip_export                  [HUMAN ONLY]
                              │  creates ClipJob rows
                              ▼
                        Agent37 worker  ──HMAC──▶ /api/clips/worker/claim | report
                              │  exactly one clip per job id, one retry, then fail
                              ▼
                        P&R MCP (member's derived key)
                          create_sitdown → preview pageUrl + caption + warnings
                          request_mp4    → only with an approval token
```

## What changes from Rev 2

1. **The worker is Agent37, not the web request.** A 25-link batch does not run
   inside an HTTP handler; whoparmy writes 25 `queued` rows, Agent37 claims them.
   `maxDuration` and cold starts stop being the constraint.
2. **Cadence is an Agent37 cron**, not a loop in our code:
   `agent37 cron add --schedule "0 9 * * *" --prompt "…clip today's slot for page
   <id>…"`. Schedules live outside the container, so a sleeping instance still
   fires. One cron per page, never per member.
3. **`request_mp4` stays refused to Muse** and becomes allowed *only* to the
   worker, via a scope token minted by the human approval click and bound to one
   `ClipJob`. Narrow scope with its own budget — not an allowlist edit.
4. **`create_sitdown` joins `BRIDGE_GENERATING_COSTS`** at 25 and is the only
   generating tool the clip flow needs.
5. **Burn guard, from rule 5 of the build skill:** the worker is idempotent on
   `jobId` and retries once. A batch of 25 is 25 renders, bounded at intake —
   nothing in the loop can re-queue itself.

## The approval gate, unchanged and now cheaper to enforce

- Muse can only create `draft` / `queued` rows.
- `approved` is set only by a signed-in human click on `/clips`.
- The click mints a per-job export token; the worker spends it once. No token →
  no MP4, whatever Muse or the worker asks for.
- `publish_clip` / `post_to_socials` stay outside every allowlist.

## Phases (revised)

1. **P1** — schema (`ClipPage`, `ClipJob`, `ClipCredit`, `ClipTakedown`), guards
   + tests, `clip_page_setup` / `clip_batch` / `clip_queue` / `clip_get` on the
   bridge, `/clips` review desk reading the queue. No worker yet: a batch lands
   as `queued` and the desk shows exactly why nothing has rendered.
2. **P2** — Agent37 worker (claim → `create_sitdown` → report), engine previews
   appear on cards with hook/caption/warnings.
3. **P3** — approve → export token → `request_mp4` → MP4 on the card; plan caps
   and usage wired into `plans.ts`.
4. **P4** — cadence: one Agent37 cron per page, missed slots reported as missed.
5. **P5** — numbers, only when real ones exist.

---

# Revision 4 (2026-11-18) — mnemos in the loop, and the army

Two asks: build mnemos into this, and think the Whop army through a bit.

## The one rule

**The database is the record. mnemos is the taste.**

| Layer | Owns | Never holds |
|---|---|---|
| Prisma (`ClipPage`, `ClipJob`, `ClipCredit`, `ClipExportToken`, `ClipPost`) | states, approvals, allowances, money, what was posted | opinions, preferences, anything a report has to add up |
| mnemos | why the page exists, what the member rejected and in what words, corrections, creator rapport, series intent, handoffs between agents | counts, prices, states, anything that could be mistaken for performance data |

If a number appears in mnemos, the member will eventually read it as a result.
That is how invented analytics get in — so numbers never go there.

## Scopes

```
clip:{userId}                 the member's standing taste, all pages
clip:{userId}:page:{pageId}   one page: niche voice, rejected material, series
army:{userId}                 standing rules for every army bot (brand voice, banned words, disclosure lines)
army:{userId}:bot:{botId}     one bot's own lessons and mission history
```

The `userId` segment is mandatory and tested. A shared or global scope is how one
member's taste leaks into another member's output — the worst failure available here.

## Where it plugs in (4 points, no more)

1. **Recall once per batch** — `clip_batch` makes **one** recall call
   ("what has this member rejected on this page, and why?"), and passes the result
   into the render brief as a *hint*. Not per clip: memory calls multiply turns,
   and turns are what burned 800K this morning.
2. **Capture on the human decision, never on the generation.** Only three
   moments write: approved as-is · approved with an edit (the diff is the lesson) ·
   rejected with a reason. "The model liked it" is not a lesson.
3. **Correct, don't append.** When the member overrides a standing note
   ("actually put text over faces"), `mnemos_correct` replaces it. A store that
   only grows starts contradicting itself within a month.
4. **Handoff at the end of a worker run** — `mnemos_handoff("rendered 12, 3 blocked
   for no credit, 9 waiting on approval")`. The next wake knows where it stands
   without replaying a transcript.

## How Muse reaches it

`mnemos_recall`, `mnemos_capture`, `mnemos_correct`, `mnemos_handoff`, `mnemos_journal`
join `BRIDGE_FREE_TOOLS` — free of engine credits, because they render nothing.
They are still LLM turns, so the bridge caps **one recall per tool call** with
`max_results` ≈ 5. A page's memory is a hint, not a library.

## Implementation shape

`src/lib/clips/memory.ts`:

- `recallForPage(userId, pageId, question)` → `string[]`, `[]` on any failure.
- `captureDecision(userId, pageId, clip, decision, note)` → fire-and-forget.
- `correctPreference(userId, scene, oldText, newText)`.
- Hard 1.5s timeout, and **a failure never blocks a clip**: the flow proceeds
  without hints rather than failing a batch because memory is down.
- `MNEMOS_URL` / `MNEMOS_KEY` server-side only, same discipline as `WHOP_BRIDGE_KEY`.

Tests: the scope key builder (userId present, never empty); recall failure → intake
still queues; no capture fires for a generated-but-unapproved clip.

## The Whop army, through a bit

The army is where this pays most: many bots, one member, the same taste to
re-explain every time.

- **`ArmyBot` / `Mission` / `Submission` stay the record** — who did what, what it
  scored, who got paid. mnemos holds the reason a member liked or killed a
  submission, in their words.
- **Per-bot scopes, shared house rules.** `army:{userId}` carries the standing
  rules (voice, banned words, disclosure); `army:{userId}:bot:{botId}` carries that
  bot's lessons. A new bot starts with the house rules and none of the history —
  which is right, because its history is not its predecessor's.
- **Submissions teach only on the member's verdict.** Accepted → what made it
  work; rejected → the reason. Never "the bot scored it 8".
- **Missions are the recall trigger**, one call at mission start, same as batches.
- **Cross-member leakage is the one unacceptable bug.** Every scope is keyed by
  `userId`; a mission brief never carries memory from another member. That gets a
  test, not a comment.

## Open items for mnemos

1. Which mnemos deployment serves whoparmy — the same instance this agent uses, or
   a separate one with its own key for member scopes?
2. Retention: per-page memory is close to permanent; per-clip decisions should age
   out after a quarter, or the hints drown in last season's taste.
