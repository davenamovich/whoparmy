# Task 5-b — Factory Section Views (campaigns, library, brands, account, publishing)

## Files created (all in src/components/factory/, named exports exactly as contracted)
- `campaigns.tsx` → `CampaignsView({ onOpen, onNewCampaign })` — list from GET /api/campaigns, 3s poll while any status=GENERATING (silent reloads), status badges (COMPLETE green / PARTIAL amber / GENERATING amber pulse), LangChips, formats count, ≈pieces estimate (formats×piecesPerFormat×languages), done/total counts + red failed line, date-fns created date. Duplicate → POST /[id]/duplicate (per-card spinner + toast + refresh). Delete → confirm Dialog → DELETE → refresh. Empty state (LayoutGrid) with "Create your first campaign".
- `library.tsx` → `LibraryView()` — debounced 300ms search + type select + language select (ALL + 23), GET /api/assets?limit=200, AssetCard grid sm:2 xl:3 with allLanguages=LANGUAGES, skeleton loading, refreshing spinner, EmptyState (Library) with Clear-filters action.
- `brands.tsx` → `BrandsView({ onUseInCampaign })` — GET/POST/PATCH/DELETE /api/brands(+[id]); one Dialog for create+edit with all fields + languages multi-chip (default [en]); BrandDTO→ProfileDTO conversion exactly per contract; "Use in campaign" → onUseInCampaign(profile, brand.name); delete confirm dialog; plan-limit 402 errors surfaced via destructive toast.
- `account.tsx` → `AccountView()` — GET /api/usage; 5 StatCards; Progress meter + recent activity (TEXT/IMAGE/FAILED ×count, formatDistanceToNow); PLANS grid with ring-primary current plan, "Switch to X" → POST /api/usage → toast + refetch, Whop caption; ARMY_PLANS upsell strip + USAGE_NOTE; honest Whop auth anchor card (src/lib/auth.ts).
- `publishing.tsx` → `PublishingView()` — HONEST: amber Alert "No publishing provider connected…Upload-Post"; 6 platform cards (TikTok=Music2) with "Not connected" chips + disabled Connect buttons; "What works right now" card; bonus caption-preview panel with char count.

## Verification
- `bunx tsc --noEmit | grep factory(campaigns|library|brands|account|publishing)` → EMPTY (pass).
- `bun run lint | grep factory/(campaigns|library|brands|account|publishing)` → EMPTY (pass).
- dev.log: only remaining compile error is the missing `@/components/factory/meme-army` (owned by another task; page.tsx imports it). Historical module-not-found entries for my files are stale pre-creation.

## API gaps noticed
- All contracted endpoints exist and match documented shapes. Notes: POST /api/usage plan switch returns { ok, plan }; POST /api/brands returns 402 with plan-limit message (surfaced in toast); /api/assets supports q/type/language/campaignId/limit as documented; `assets/[id]/publish` directory exists but has no route file — consistent with the honest "no publishing provider" stance.
