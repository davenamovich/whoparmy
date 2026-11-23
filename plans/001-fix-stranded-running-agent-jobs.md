# Plan 001: Close the stranded-RUNNING window in agent job execution

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e86574..HEAD -- src/lib/agent-runner.ts src/app/api/agents src/app/api/campaign-market`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8e86574`, 2026-11-19 (branch `feat/factory-agents`)

## Why this matters

When a member orders an agent job, the job's fuel (tokens) is reserved up
front and the job is flipped QUEUED → RUNNING. If anything throws in the
short window between that claim and the runner's failure-settlement code —
or if the dispatch itself fails — the error is silently swallowed by every
caller and the job can sit in RUNNING with its fuel reserved until the same
member happens to trigger a runner drain again. The member sees a job that
never finishes and a bot whose budget never comes back. This plan makes
every post-claim failure settle the job (FAILED + refund) and makes
dispatch failures visible in the server log.

## Current state

Relevant files:

- `src/lib/agent-runner.ts` (584 lines) — the job runner. `runAgentJob`
  starts at line 141. Its claim and load happen **before** any
  failure-settlement try block:
  - `src/lib/agent-runner.ts:141-149`:
    ```ts
    export async function runAgentJob(jobId: string): Promise<void> {
      const claimed = await db.agentJob.updateMany({
        where: { id: jobId, status: "QUEUED" },
        data: { status: "RUNNING" },
      });
      if (claimed.count === 0) return;

      const job = await db.agentJob.findUnique({ where: { id: jobId }, include: { hire: true } });
      if (!job) return;
    ```
    A throw from `findUnique` (or from the VIDEO branch's early refund
    update at ~line 160, before its try) leaves the job RUNNING with no
    settlement.
  - The normal failure path later in the function settles exactly once,
    keyed on the conditional RUNNING → FAILED transition, and refunds by
    delta (see the comments and code around `src/lib/agent-runner.ts:430-520`).
    Read that whole region before writing the fix — your fix must reuse
    this pattern, not invent a second settlement path.
  - Stranded-job recovery already exists: `recoverStrandedJobs(userId)` at
    `src/lib/agent-runner.ts:525-571` fails RUNNING jobs older than
    20 minutes with the same conditional transition + delta refund. But it
    is only called from `runQueuedJobsForUser` (`src/lib/agent-runner.ts:573`),
    i.e. when the same user drains again via `src/app/api/agents/runner/route.ts`.
    A member who never returns never triggers it.
- The three dispatch sites all swallow errors silently:
  - `src/app/api/agents/[id]/jobs/route.ts:134-136`:
    ```ts
    after(async () => {
      await runAgentJob(job.id).catch(() => {});
    });
    ```
  - `src/app/api/campaign-market/[id]/claim/route.ts:88`: `await runAgentJob(job.id).catch(() => {});`
  - `src/app/api/agents/runner/route.ts:18`: `await runQueuedJobsForUser(user.id, 5).catch(() => {});`

Repo conventions that apply:

- Tests are pure unit tests only: `node:test` + `node:assert/strict`,
  relative `.ts` imports, **no test imports the database** (`@/lib/db`).
  Testable logic is extracted into small pure modules — exemplars:
  `src/lib/traffic-pool-core.ts` (tested by `src/lib/traffic-pool.test.ts`)
  and `src/lib/bridge-redact.ts` (tested by `src/lib/bridge-redact.test.ts`).
  Follow this pattern for anything you need to test.
- Comments in this codebase explain *why*, with dates and incident
  references. Match that style for the guard you add.
- Error logging convention in the runner: `console.error("[market] …", job.id, err)`
  (see `src/lib/agent-runner.ts:469-471`).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors (baseline at planned-at commit: clean) |
| Tests     | `npm test`         | all pass (baseline: 148 tests, 16 suites) |
| Lint changed files | `npx eslint src/lib/agent-runner.ts src/lib/job-guard.ts src/lib/job-guard.test.ts` | exit 0 |

## Scope

**In scope** (the only files you may modify/create):

- `src/lib/agent-runner.ts`
- `src/lib/job-guard.ts` (create — pure claim-guard helper, see Step 1)
- `src/lib/job-guard.test.ts` (create)
- `src/app/api/agents/[id]/jobs/route.ts` (logging only, lines ~134-136)
- `src/app/api/campaign-market/[id]/claim/route.ts` (logging only, line ~88)
- `src/app/api/agents/runner/route.ts` (logging only, line ~18)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- The settlement/refund arithmetic itself (lines ~430-571 of
  agent-runner.ts) — it is correct and heavily commented; reuse its
  conditional-transition pattern, don't rewrite it.
- The order-time reservation transaction in
  `src/app/api/agents/[id]/jobs/route.ts` — only the `after(...)` dispatch
  logging in that file changes.
- Any change to job statuses, the 20-minute stale window, or refund amounts.
- `plans/002-*` and `plans/003-*` — separate plans.

## Git workflow

- Branch: create `advisor/001-stranded-running` from the current HEAD.
- Commit per step, in the repo's message style (descriptive sentence, e.g.
  `git log --oneline -5` shows: "Traffic Pool v1: every agent gets 10
  rotator slots a day"). Example: `Close the stranded-RUNNING window in runAgentJob (plan 001)`.
- Do NOT push or open a PR. The operator pushes.

## Steps

### Step 1: Create the pure claim-guard helper

Create `src/lib/job-guard.ts` exporting one function with this contract
(name may vary slightly; behavior may not):

```ts
/**
 * Run `fn` for a job that has just been claimed (QUEUED → RUNNING).
 * If `fn` throws before the job's own settlement code has run,
 * `onStranded` is called exactly once so the caller can settle the job
 * (FAILED + refund) instead of leaving it RUNNING. Errors thrown by
 * `onStranded` itself are swallowed after logging — settlement is
 * best-effort here; recoverStrandedJobs remains the backstop.
 */
export async function withClaimGuard<T>(
  fn: () => Promise<T>,
  onStranded: (err: unknown) => Promise<void>,
  log: (msg: string, err: unknown) => void = (m, e) => console.error(m, e),
): Promise<T | undefined>
```

Behavior: return `fn()`'s value on success. On throw: call `log` once,
call `onStranded(err)` once, return `undefined` (do not rethrow — all
current callers treat runner failure as a job state, not a request error).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Guard the post-claim body of runAgentJob

In `src/lib/agent-runner.ts`, wrap everything in `runAgentJob` **after**
the successful claim (`claimed.count === 1`) in `withClaimGuard`:

- The claim itself (`updateMany`) stays outside the guard: if the claim
  throws, the job was never marked RUNNING and nothing is stranded.
- The `onStranded` callback performs the settlement, reusing the existing
  pattern from `recoverStrandedJobs` (lines ~533-565): inside a
  transaction, `updateMany` the job `where: { id: jobId, status: "RUNNING" }`
  → `status: "FAILED"`, result JSON
  `{ error: "The run failed before it could start — its fuel was refunded.", provider: "runner-guard" }`;
  only if that transition claimed exactly 1 row, refund by delta:
  `tokensUsed = max(0, tokensUsed - job.tokenCost)` with the same
  PAUSED/DEPLETED/ACTIVE status recomputation `recoverStrandedJobs` uses.
  Note: `onStranded` may not have the loaded `job` row (the throw may have
  happened inside `findUnique`) — load `tokenCost`/`hireId` inside the
  callback; if the job row no longer exists, do nothing.
- If the job was already settled by the normal path (status no longer
  RUNNING), the conditional transition claims 0 rows and nothing happens.
  This is what makes the guard safe to wrap around the whole body.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all 148 baseline
tests still pass.

### Step 3: Make dispatch failures visible at the three call sites

Replace the silent `.catch(() => {})` at the three dispatch sites listed
in Current state with a logging catch, e.g.:

```ts
await runAgentJob(job.id).catch((err) => console.error("[agents] runAgentJob dispatch failed", job.id, err));
```

Use a tag consistent with each file's existing logging (check the file;
`[agents]`, `[campaign-market]`, `[agents/runner]` are all acceptable).
Do not change any surrounding behavior.

**Verify**: `grep -rn "runAgentJob(job.id).catch(() => {})\|runQueuedJobsForUser(user.id, 5).catch(() => {})" src/app/api` → no matches.

### Step 4: Tests for the guard

Create `src/lib/job-guard.test.ts`, modeled on
`src/lib/traffic-pool.test.ts` (node:test `describe`/`it`,
`node:assert/strict`, plain injected fakes — no db, no timers):

- success: `fn` resolves → value returned, `onStranded` never called.
- failure: `fn` throws → `onStranded` called exactly once with that error,
  `log` called once, function returns `undefined` (does not throw).
- settlement failure: `fn` throws and `onStranded` also throws → function
  still returns `undefined`, does not throw.

**Verify**: `npm test` → all pass, including the 3+ new tests (total ≥ 151).

## Test plan

- New tests: `src/lib/job-guard.test.ts` as in Step 4 — this pins the
  guard contract that the runner fix relies on.
- Existing suite must stay green: `npm test` → 148 baseline tests pass.
- The db-bound settlement inside `onStranded` is deliberately NOT
  unit-tested (repo convention: no db in tests); it is verified by code
  review against the `recoverStrandedJobs` pattern it mirrors, plus the
  typecheck.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with ≥ 151 tests passing (148 baseline + new guard tests)
- [ ] `grep -rn "catch(() => {})" src/app/api/agents src/app/api/campaign-market` shows no remaining silent catch on a `runAgentJob`/`runQueuedJobsForUser` dispatch line
- [ ] `src/lib/job-guard.ts` and `src/lib/job-guard.test.ts` exist; `runAgentJob`'s post-claim body runs inside the guard
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in Current state don't match the live code (drift).
- You find the main body of `runAgentJob` already settles failures from
  the claim onward (i.e. the window described here no longer exists).
- The fix appears to require changing the settlement arithmetic in
  lines ~430-571, the reservation transaction in the jobs route, or any
  out-of-scope file.
- A verification step fails twice after a reasonable fix attempt.

## Maintenance notes

- `recoverStrandedJobs` remains the backstop for crashes that kill the
  process mid-run (the guard can't run if the process dies). The guard
  covers in-process throws; both paths intentionally use the same
  conditional RUNNING → FAILED transition so they can never double-refund.
- A reviewer should scrutinize: that `onStranded` truly mirrors the
  refund/status logic of `recoverStrandedJobs`, and that the guard wraps
  the claim's *successors*, not the claim itself.
- Deferred: a periodic (cron) stranded-job sweep across all users — the
  guard + per-user recovery make it non-urgent; it is not part of this plan.
