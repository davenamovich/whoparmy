# Plan 003: Characterization tests for the untested money/auth hotspots

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e86574..HEAD -- src/middleware.ts src/lib/muse-bridge.ts src/lib/agent-runner.ts src/lib/ralph.ts src/lib/mnemos-bridge.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 001 changes
> `src/lib/agent-runner.ts` on purpose — if 001 is DONE, re-read the
> runner's settlement region and adapt Step 5 to the code as it stands;
> that is expected drift, not a STOP.)

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW (behavior-preserving extractions + new tests only)
- **Depends on**: plans/001-fix-stranded-running-agent-jobs.md (Step 5 only;
  Steps 1–4 are independent)
- **Category**: tests
- **Planned at**: commit `8e86574`, 2026-11-19 (branch `feat/factory-agents`)

## Why this matters

This repo's test suite is healthy where it exists — 148 tests, all passing,
covering pure logic like Whop tier resolution, the traffic pool, egress,
and bridge-secret redaction. But the modules that move money and hold the
auth line have **no tests at all**, and they are also among the
highest-churn files in the repo (churn = commits touching the file in the
last 100): `src/lib/muse-bridge.ts` (816 lines, churn 7 — bridge keys and
credit reservation/settlement), `src/lib/agent-runner.ts` (584 lines,
churn 7 — job charges and refunds), `src/lib/ralph.ts` (448 lines,
churn 10), `src/lib/mnemos-bridge.ts` (206 lines, churn 7), and
`src/middleware.ts` (75 lines, churn 7 — the API auth floor). Verified at
the planned-at commit: no test file imports any of them. The Nov 2026
whole-repo review fixes (atomic budget reservation, fail-closed
settlement, the middleware auth floor) are exactly the kind of subtle
logic that silently regresses. This plan pins their current behavior with
characterization tests, following the repo's own established pattern —
extract the pure decision logic into a `*-core` module and test that —
without changing any behavior.

## Current state

Test conventions (verified — follow them exactly):

- Runner: `npm test` → `node --test "src/**/*.test.ts"`. Baseline at the
  planned-at commit: **148 tests, 16 suites, all passing**; `npx tsc --noEmit`
  clean.
- Style: `import { describe, it } from "node:test"`,
  `import assert from "node:assert/strict"`, relative imports **with**
  the `.ts` extension. Exemplars: `src/lib/traffic-pool.test.ts` (tests
  `src/lib/traffic-pool-core.ts`), `src/lib/bridge-redact.test.ts` (tests
  `src/lib/bridge-redact.ts`).
- **No test imports the database** (`@/lib/db`) and none performs network
  I/O. If logic you need to test is entangled with db/fetch, extract the
  pure decision into a new `*-core.ts` module and have the original module
  call it — do not mock the db.

The five seams, as read at the planned-at commit:

1. **Middleware auth floor** — `src/middleware.ts` (full file, 75 lines).
   Decision inputs: pathname, `process.env.ALLOW_OPERATOR_FALLBACK`,
   presence of the `pr_session` cookie. The `PUBLIC_API_PREFIXES` list
   (lines 29-52) exempts paths that carry their own credentials. Logic at
   lines 62-71: block with 401 `{ error: "Sign in required" }` only when
   path starts `/api/`, fallback is not `"1"`, path matches no public
   prefix, and the cookie is absent.
2. **Bridge budget reservation math** — `src/lib/muse-bridge.ts:610-668`.
   `RESERVATION_STALE_MS = 15 * 60_000` (line 60). Rules: a pending
   reservation older than the stale window is swept to 0 before checking;
   reserve is refused when `spentCredits + pending + reserve > budgetCredits`;
   settlement (`settleReservation`'s inner `apply`, lines ~613-625)
   computes `pending = max(0, pendingCredits - reserve)`,
   `spent = spentCredits + amount`, and clears `pendingSince` when pending
   reaches 0. The db transaction plumbing stays in muse-bridge.ts; only
   this arithmetic is pure.
3. **Ralph reply parsing** — `src/lib/ralph.ts:427-446`. The LLM reply is
   parsed as JSON after stripping ```` ```json ```` fences
   (`raw.replace(/^```json?|```$/g, "")`); `reply` must be non-empty after
   trim; `actions` are filtered to members of `RALPH_MENU`
   (`src/lib/ralph.ts:109`) and capped at 3; `remember` is captured only
   when its trimmed length is > 3 (and sliced to 500 chars at capture,
   line ~437). On JSON parse failure the raw text is returned sliced to
   1200 chars with default actions `["make_content", "free_audit", "memory"]`.
4. **Mnemos response parsing** — `src/lib/mnemos-bridge.ts:78-93`.
   Non-OK HTTP → `null`; `result.isError` → `null`; otherwise the
   `result.content[].text` parts are joined with `"\n"`, trimmed, and an
   empty result becomes `null`. ("Memory is an enhancement, never a
   blocker" — the surrounding catch returning `null` is intentional and
   stays.)
5. **Runner refund math** — `src/lib/agent-runner.ts` settlement and
   `recoverStrandedJobs` (lines ~430-571). The recomputation used on
   refund: `refundedUsed = max(0, tokensUsed - tokenCost)`; resulting hire
   status: `PAUSED` stays `PAUSED`, else `refundedUsed >= tokenBudget`
   → `DEPLETED`, else `ACTIVE`. Plan 001 may have added a third user of
   this math (its `onStranded` settlement) — after 001, all users of this
   computation should share the extracted helper.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests     | `npm test` | all pass; count grows per step (148 baseline) |
| Lint changed files | `npx eslint <files you touched>` | exit 0 |

## Scope

**In scope**:

- Create: `src/lib/api-floor.ts` + `src/lib/api-floor.test.ts`;
  `src/lib/bridge-budget-core.ts` + `src/lib/bridge-budget-core.test.ts`;
  `src/lib/ralph-core.ts` + `src/lib/ralph-core.test.ts`;
  `src/lib/mnemos-core.ts` + `src/lib/mnemos-core.test.ts`;
  `src/lib/job-settle-core.ts` + `src/lib/job-settle-core.test.ts`.
  (Names may vary slightly if a name collides; the `*-core` pattern may not.)
- Modify (extraction wiring only — no behavior change):
  `src/middleware.ts`, `src/lib/muse-bridge.ts`, `src/lib/ralph.ts`,
  `src/lib/mnemos-bridge.ts`, `src/lib/agent-runner.ts`.
- `plans/README.md` (status row only)

**Out of scope**:

- Any behavior change, bug fix, or "while I'm here" cleanup in the five
  modules. Characterization means the tests describe the code as it is.
  If a test you write reveals behavior that looks wrong, STOP and report
  it as a new finding — do not fix it in this plan.
- Database or integration tests, test databases, mocking frameworks —
  none exist in this repo; do not introduce any.
- Other untested high-churn modules (`src/lib/stacks.ts`,
  `src/lib/blueprint.ts`, `src/lib/setup-prompt.ts`,
  `src/app/page.tsx`) — deliberately deferred; see Maintenance notes.
- `plans/001-*` and `plans/002-*` work items.

## Git workflow

- Branch: create `advisor/003-hotspot-tests` from the current HEAD
  (after plan 001 has landed, if it is being executed first).
- One commit per step. Message style matches `git log` (descriptive
  sentence). Example: `Extract bridge budget math to bridge-budget-core with characterization tests (plan 003)`.
- Do NOT push or open a PR. The operator pushes.

## Steps

Each step follows the same shape: extract the pure decision into the new
`*-core.ts`, rewire the original module to call it (identical inputs,
identical outputs), write the tests listed, then verify. Keep each
extraction minimal — move the decision, not the plumbing.

### Step 1: Middleware auth floor

Extract `isPublicApiPath(path)` and
`apiFloorDecision(path, { fallbackAllowed, hasSessionCookie }) → "allow" | "block"`
into `src/lib/api-floor.ts`; `src/middleware.ts` keeps reading the env
var and cookie and returns the same 401 body on `"block"`.

Tests (`api-floor.test.ts`): a public prefix (`/api/bridge/mcp`) allows
without a cookie; `/api/agents` without a cookie blocks; `/api/agents`
with a cookie allows; `fallbackAllowed: true` allows everything; a
non-`/api/` path (`/connect/abc`) allows; a path that merely *contains* a
public prefix mid-string (e.g. `/api/x/api/bridge/mcp`) blocks.

**Verify**: `npm test` → all pass (≥ 154); `npx tsc --noEmit` → exit 0.

### Step 2: Bridge budget math

Extract `sweepStaleReservation(pending, pendingSince, now)`,
`canReserve({ spent, pending, reserve, budget })`, and
`applySettlement({ pendingCredits, spentCredits }, reserve, amount)`
(returning the new `{ pendingCredits, spentCredits, clearPendingSince }`)
into `src/lib/bridge-budget-core.ts`; rewire the reservation transaction
and `settleReservation` in `src/lib/muse-bridge.ts` to use them. The
transaction code, the fail-closed retry in `settleReservation`, and all
`BridgeError` paths stay exactly as they are.

Tests: stale reservation (pending > 0, `pendingSince` 16 minutes before
`now`) sweeps to 0; fresh pending (1 minute) does not; reserve exactly at
budget (`spent + pending + reserve === budget`) is allowed, one credit
over is refused; settlement floors pending at 0 when reserve > pending;
settlement adds `amount` to spent; `clearPendingSince` is true exactly
when the resulting pending is 0.

**Verify**: `npm test` → all pass (≥ 160); `npx tsc --noEmit` → exit 0.

### Step 3: Ralph reply parsing

Extract `parseRalphReply(raw, menu)` into `src/lib/ralph-core.ts`,
returning a discriminated result the caller can act on (parsed reply +
filtered actions + remember candidate, or the raw-fallback). Rewire
`src/lib/ralph.ts` to use it; the `mnemosCapture` call and all
surrounding flow stay in ralph.ts.

Tests: clean JSON parses; ```` ```json ````-fenced JSON parses; actions
not in the menu are dropped and the list caps at 3; empty/whitespace
`reply` is not a successful parse (caller continues its model ladder —
pin whichever behavior the current code implements and name the test
after it); `remember` of trimmed length ≤ 3 yields no capture candidate,
length > 3 does; invalid JSON yields the fallback with raw text sliced
to exactly 1200 chars and the default action triple.

**Verify**: `npm test` → all pass (≥ 166); `npx tsc --noEmit` → exit 0.

### Step 4: Mnemos response parsing

Extract `parseMnemosToolResult(data)` (the already-parsed JSON body) into
`src/lib/mnemos-core.ts`; rewire `callTool` in
`src/lib/mnemos-bridge.ts` to use it. The fetch, headers, timeout, and
the catch-returns-null behavior stay untouched.

Tests: `isError: true` → null; multiple content parts join with `"\n"`;
missing `result` → null; content that trims to empty → null; a normal
single-part result returns its text.

**Verify**: `npm test` → all pass (≥ 171); `npx tsc --noEmit` → exit 0.

### Step 5: Runner refund math (after plan 001)

Extract `computeRefundState({ tokensUsed, tokenBudget, status }, tokenCost)`
→ `{ tokensUsed, status }` into `src/lib/job-settle-core.ts` implementing
exactly the recomputation in Current state seam 5; rewire every place
that performs it (normal settlement, `recoverStrandedJobs`, and plan
001's guard settlement if present) to call it.

Tests: refund subtracts and floors at 0; refund landing exactly at
budget → `DEPLETED`; below budget → `ACTIVE`; `PAUSED` stays `PAUSED`
regardless; `tokenCost` of 0 leaves `tokensUsed` unchanged (status still
recomputed per the current code — pin what the code does).

**Verify**: `npm test` → all pass (≥ 176); `npx tsc --noEmit` → exit 0;
`grep -n "Math.max(0, fresh.tokensUsed\|Math.max(0, tokensUsed" src/lib/agent-runner.ts` → no remaining inline copies of the refund computation outside `job-settle-core.ts`.

## Test plan

The steps above *are* the test plan: ≥ 28 new characterization tests
across five new test files, each modeled on
`src/lib/traffic-pool.test.ts`. Running total must reach ≥ 176 with the
148 baseline tests untouched and still passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with ≥ 176 tests passing and the original 148 still present
- [ ] Five new `*-core.ts` modules and their five test files exist; the original modules import from them
- [ ] `git diff` on the five original modules shows extraction wiring only — no logic changes (a reviewer can confirm each moved block is textually equivalent)
- [ ] No test file imports `@/lib/db` (`grep -l "lib/db" src/lib/*.test.ts src/lib/**/*.test.ts` → no new matches beyond baseline: none)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in Current state don't match the live code (other than
  plan 001's expected changes to agent-runner.ts).
- A characterization test reveals behavior that appears to be a bug
  (e.g. the budget check can be bypassed, a prefix matches more than
  intended). Write the failing observation up as a finding in your
  report; do not fix it here and do not write a test that enshrines a
  suspected bug without flagging it.
- An extraction would require changing a module's public exports or any
  caller's behavior.
- A verification step fails twice after a reasonable fix attempt.

## Maintenance notes

- The `*-core` pattern is now the house style for testable logic in this
  repo: new decision logic in these five areas goes into the core module
  with tests, not inline into the db/fetch-bound module.
- Deferred follow-up (not this plan): the same treatment for
  `src/lib/stacks.ts`, `src/lib/blueprint.ts`, and
  `src/lib/setup-prompt.ts` — high churn, untested, but their logic is
  template/string assembly with lower blast radius than money/auth.
- Reviewers: the risk in this plan is a silent behavior change during
  extraction. Review each step's diff by comparing the moved block
  against the original, not by reading the new module alone.
