# Plan 002: Stop returning internal error messages from API routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e86574..HEAD -- src/app/api src/lib/auth.ts src/lib/muse-bridge.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M–L (one small helper + a mechanical migration across ~91 sites)
- **Risk**: LOW (response shape `{ error: string }` is preserved; only the
  text of *unexpected* errors changes)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8e86574`, 2026-11-19 (branch `feat/factory-agents`)

## Why this matters

Nearly every API route in this app answers a failed request with the raw
`err.message` of whatever was thrown — including on 500s, where the thrown
error is an unexpected Prisma, fetch, or upstream-engine failure. Any
signed-in member can therefore read internal error text (schema details,
upstream URLs and statuses, configuration complaints) that was never
written for them. The same routes almost never log the error server-side
(only 7 `console.error` calls exist under `src/app/api`), so the one place
the detail would help — the operator's log — doesn't have it, and the one
place it can hurt — the client — does. This plan introduces one shared
helper that returns safe messages for known errors, generic fallbacks for
unexpected ones, and logs the real error server-side.

## Current state

The pattern (91 occurrences of `instanceof Error ?` under `src/app/api`,
counted at the planned-at commit):

- `src/app/api/agents/[id]/jobs/route.ts:138-141`:
  ```ts
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Job order failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
  ```
- `src/app/api/generate/route.ts:179-184`:
  ```ts
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  ```
- `src/app/api/assets/route.ts:33`:
  ```ts
  return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load assets" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  ```

The repo already has a **typed-error taxonomy whose messages are written
to be shown to users**. These must keep flowing through unchanged:

- `UnauthorizedError` — `src/lib/auth.ts:13-20`: carries `status = 401`,
  default message "Sign in required". `src/lib/auth.ts` also exports a
  `statusForAuthError()` helper some routes already use — check it before
  writing the helper; reuse it if it fits.
- `BridgeError` — `src/lib/muse-bridge.ts:260-268`: carries
  `status: number` and `code: string`; messages are user-facing by design
  (e.g. "The Muse bridge is not configured on this app yet…").
- Domain errors with the same shape — verify each one's fields from
  source before relying on them: `DoorsError` (`src/lib/doors/game.ts:58`,
  `code` + `status`, message *is* the code), `BtcgameError`
  (`src/lib/doors/btcgame.ts:20`), `PickaphoneError`
  (`src/lib/doors/pickaphone.ts:26`), `BidError`
  (`src/lib/doors/auction.ts:239`), `ClipGuardError`
  (`src/lib/clips/guards.ts:45`), `MemoryScopeError`
  (`src/lib/clips/memory.ts:25`), `EgressError` (`src/lib/egress.ts:19`),
  `UpError` (`src/lib/upload-post.ts:107`).

Conventions:

- Tests are pure unit tests: `node:test` + `node:assert/strict`, relative
  `.ts` imports, no db. Exemplar: `src/lib/bridge-redact.test.ts` testing
  the pure module `src/lib/bridge-redact.ts`. Your helper must be a pure
  module in that style (logging injected or a thin wrapper, so tests don't
  print).
- Several routes deliberately return *literal* strings they construct
  themselves (e.g. the `/api/admin/*` routes return `{ error: "Not found" }`
  for non-operators). Those are not leaks and are out of scope.
- One known deliberate exception to check, not assume:
  `src/app/api/admin/stacks/status/route.ts` returns `err.message` at
  status 400 for errors thrown by `setStackStatus` — that route is
  operator-only and the errors are validation messages from
  `src/lib/stacks.ts`. Migrate it through the helper like everywhere else;
  if `setStackStatus` throws untyped Errors with user-intended messages,
  that is a STOP condition (see below), not something to silently change.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors (baseline: clean) |
| Tests     | `npm test` | all pass (baseline: 148 tests, 16 suites) |
| Count remaining leak sites | `grep -rn "instanceof Error ? " src/app/api --include='*.ts' \| wc -l` | starts at 91; ends at 0 (see Done criteria) |
| Lint changed files | `npx eslint src/lib/api-error.ts src/lib/api-error.test.ts` | exit 0 |

## Scope

**In scope**:

- `src/lib/api-error.ts` (create — the shared helper)
- `src/lib/api-error.test.ts` (create)
- Route files under `src/app/api/**` **only where** they contain the
  `err instanceof Error ? err.message` (or `error instanceof Error ? …`)
  catch pattern — migrate those catches to the helper.
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):

- Any route's success responses, status codes for *known* errors, or the
  `{ error: string }` response shape — clients depend on all three.
- Literal error strings routes construct themselves (validation messages,
  the admin routes' "Not found", plan-limit messages, etc.).
- The typed error classes themselves — do not add/remove fields or change
  their messages.
- Server actions / lib code outside `src/app/api` that returns
  `err.message` to *its own caller* (e.g. `src/lib/ralph.ts` surfaces a
  bridge failure reason to the member in chat by design — that is a
  product decision, not this plan).
- `plans/001-*` and `plans/003-*`.

## Git workflow

- Branch: create `advisor/002-api-error-leak` from the current HEAD.
- Commit per step (helper+tests, then migration in directory batches:
  agents/assets/brands…, bridge…, doors…, rest). Message style matches
  `git log` (descriptive sentence). Example: `Route API errors through lib/api-error (plan 002, batch: src/app/api/agents)`.
- Do NOT push or open a PR. The operator pushes.

## Steps

### Step 1: Write the helper

Create `src/lib/api-error.ts`:

```ts
/**
 * Map a caught error to a client-safe API response.
 * Known typed errors (auth, bridge, domain guards) carry messages written
 * for users — pass those through with their status. Anything else is an
 * internal failure: log the real error server-side and answer with the
 * route's generic fallback instead of leaking err.message.
 */
export function apiError(
  err: unknown,
  fallback: string,
  opts?: { defaultStatus?: number; log?: (err: unknown) => void },
): { error: string; status: number }
```

Required behavior:

1. `UnauthorizedError` (import from `@/lib/auth` — check for an import
   cycle first; `lib/auth` imports db/session/whop, **not** api-error, so
   this direction is safe) → `{ error: err.message, status: 401 }`.
2. Any other `Error` carrying a numeric `status` field in the 400–599
   range (structural check — this is how `BridgeError` and the doors/clips
   errors are shaped; verify each class listed in Current state actually
   has one, and list in the file comment which classes you verified) →
   `{ error: err.message, status: err.status }`.
3. Everything else (untyped `Error`, non-Error throws, typed-looking
   errors with an out-of-range status) → call `opts.log ?? console.error`
   once with the original error, return
   `{ error: fallback, status: opts?.defaultStatus ?? 500 }`.

If any error class in the Current-state list does **not** fit rule 1 or 2
(e.g. its message is a machine code that routes currently translate before
returning), note how its routes use it today and make the helper preserve
that behavior exactly — or STOP and report.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the helper

Create `src/lib/api-error.test.ts` (model on
`src/lib/bridge-redact.test.ts`). Cases:

- `new UnauthorizedError()` → status 401, message "Sign in required".
- A fake typed error (`Object.assign(new Error("safe text"), { status: 402 })`)
  → status 402, message "safe text", log NOT called.
- `new Error("Prisma: table User has no column secret_col")` → status 500,
  message is exactly the fallback passed in, log called once with the
  original error (inject a fake `log`).
- A non-Error throw (`"boom"`) → fallback + 500, log called once.
- A typed-looking error with `status: 200` → treated as unknown
  (fallback + 500, logged).

**Verify**: `npm test` → all pass, including ≥ 5 new tests (total ≥ 153).

### Step 3: Migrate the routes in batches

For each route file containing the pattern, rewrite its catch to use the
helper, preserving: the route's existing fallback string, its existing
default status (most use 500; some use 400 — keep each route's own), and
any special-casing that exists today (e.g. a route that checks
`err instanceof BridgeError` explicitly keeps equivalent behavior through
rule 2 — confirm case by case).

Work in directory batches (`src/app/api/agents`, `…/assets`, `…/brands`,
`…/campaigns`, `…/generate`, then the rest), one commit per batch.

After each batch:

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass; the grep
count from the Commands table has dropped by exactly the number of sites
in that batch.

### Step 4: Final sweep

Run the count command: it must print `0`. If a site genuinely cannot be
migrated without changing client-visible behavior for a *known* error,
leave it, and list it in your completion report with the reason — do not
silently skip it (the Done criteria grep allows only sites listed in the
report; when in doubt, STOP and ask).

**Verify**: `npm test` → all pass; `npx tsc --noEmit` → exit 0.

## Test plan

- New tests: `src/lib/api-error.test.ts` (Step 2) — pins the
  pass-through vs. generic-fallback decision, which is the whole fix.
- No route-level tests exist today and none are required by this plan;
  route migration correctness is covered by typecheck + the unchanged
  `{ error }` shape + the helper tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with ≥ 153 tests passing (148 baseline + new helper tests)
- [ ] `grep -rn "instanceof Error ? " src/app/api --include='*.ts' | wc -l` prints `0` — or every remaining site is listed with a reason in the completion report
- [ ] `src/lib/api-error.ts` logs unexpected errors server-side (the injected-log test proves the call happens)
- [ ] Response shape unchanged: migrated routes still return `NextResponse.json({ error: <string> }, { status })`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts or the 91-site count don't match the live code (drift).
- Importing `@/lib/auth` (or any error class) into `lib/api-error.ts`
  creates an import cycle.
- A route's current client-visible behavior depends on an *untyped*
  error's message reaching the client (the `setStackStatus` case in
  Current state is the known suspect — check it first). The right fix
  there is typing that error at its source, which is out of this plan's
  scope: report it instead of papering over it.
- Any typed error class's messages turn out to contain internal detail
  not meant for clients (that contradicts this plan's core assumption).
- A verification step fails twice after a reasonable fix attempt.

## Maintenance notes

- New routes should use `apiError()` from the start — the file comment in
  `lib/api-error.ts` is the documentation; a reviewer should reject new
  `err.message` returns in `src/app/api` on sight (the grep in Done
  criteria is the check).
- If a new typed error class is added, give it a numeric `status` and a
  user-written message and it flows through rule 2 with no helper change.
- Deferred: the same leak pattern outside `src/app/api` (chat surfaces
  like Ralph intentionally quote failure reasons) — a product decision
  for the operator, explicitly not part of this plan.
