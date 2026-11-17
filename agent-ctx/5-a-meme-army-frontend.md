# Task 5-a — MemeArmy section (frontend)

## What was built
`/home/z/my-project/src/components/factory/meme-army.tsx` — single self-contained client component exporting `MemeArmy()` (no props). Three states:

1. **Upsell landing** (`bot === null`): stage-light hero with eyebrow "P&R MEME ARMY", ALL-CAPS headline "YOU BUILD THE COMMUNITY. WE GIVE IT AN ARMY.", verbatim subline, ember-glow "DEPLOY YOUR MEME ARMY" CTA (opens onboarding) + "See army plans" scroll link, trust chips; dark Telegram phone mockup (hidden md:block) with the exact spec copy (🚀 Today's Mission, checklist, LIVE pill, Today's campaign — Rewards available, Your Army Stats 248/631/86, JOIN TODAY'S MISSION); StatCard teaser 248/631/86 with "Illustrative bot experience and sample statistics" caption; the 6 exact how-it-works steps; ARMY_PLANS pricing cards (setup + monthly) with "Pricing is a starting hypothesis. {USAGE_NOTE}"; final CTA banner.
2. **Onboarding wizard** (dialog, 3 numbered step pills): (1) name/logo (FileReader data URL, image/* only, ≤400KB, `data:image/` validated)/colors (color+hex)/website; (2) BotFather instructions card + password token with show/hide + group title; (3) LangPicker (default en, es) + welcome message + LAUNCH MY ARMY → POST `/api/meme-army/onboard` (honest 400 error shown) then POST `{action:"launch"}`; success view shows verified @username + webhook status honestly (ACTIVE green "Telegram webhook registered", PENDING/FAILED amber "…will activate when the app is served from a public HTTPS URL") + "Your bot belongs to YOU" note. Update mode ("Bot setup") prefills from BotDTO, token optional (blank = keep), button = SAVE ARMY SETTINGS (no re-launch). Reset uses refs so a post-save refresh doesn't kick the success view back to step 1.
3. **Live panel** (`bot !== null`): header card with logo/img, army name, LIVE/PAUSED status badge, t.me link, webhook chip, Pause/Resume + Bot setup + Disconnect (AlertDialog → `{action:"disconnect"}` → refetch → upsell); StatCard row (participants/shares/referrals/verifiedClicks); Tabs:
   - **Missions**: cards (status badge, LangChips, duration, budget, pack count, daily requirement, rules, target URL) + Go live/End (PATCH) + Delete (AlertDialog → DELETE); New mission dialog with all fields, "Generate content pack with P&R MCP" (10–20s loading state) → pack grouped by kind (ANNOUNCEMENT highlighted, MEME, POST, CTA) with per-item remove → "APPROVE & SAVE MISSION" with "Announce to army now" checkbox (disabled + amber hint when bot paused) and owner-approval honesty note.
   - **Leaderboard**: 🏆 table (rank colored top-3, member+@username, SAMPLE badge for isDemo + demo note, language chip, points/shares/referrals/verified clicks, badges) inside max-h-96 overflow-y-auto scrollbar-thin (min-w 760px horizontal scroll on mobile).
   - **Rewards**: editable tiers (name, type Select POINTS/USDC/BADGE/PRIZE/AFFILIATE, cost, description) + add/remove + save (`{action:"rewards"}`) + verbatim compliance note; resyncs only when server rewards JSON changes.
   - **Branding**: name/colors/welcome/languages save (`{action:"update"}`) + bot command reference card (/start /memes /missions /content /language /campaigns /leaderboard /refer /rewards /submit with one-liners).

Every mutation re-fetches `GET /api/meme-army`. Reuses shared.tsx `SectionHeader/EmptyState/StatCard/LangChip`, shadcn ui components, `cn`, DTO types only (no `any`). Dark orange theme, no blue/indigo/purple; only emojis used: 🚀 (mockup) and 🏆 (leaderboard).

## Quality gates
- `bunx tsc --noEmit | grep meme-army` → empty ✅
- `bunx eslint src/components/factory/meme-army.tsx` → 0 problems ✅ (removed 4 unused eslint-disable directives and 2 unused imports: Globe, languageLabel; verified all 87 imports used programmatically)
- Did not modify any other file. Dev server recompiled cleanly ("✓ Compiled") after file creation.

## API gaps / notes for backend agent (5-b?)
1. `POST /api/meme-army/onboard` — frontend sends `botToken` only when non-empty in update mode; backend upsert must keep the existing token when omitted.
2. Onboard response: frontend reads `verified.username`, `webhook.status` with fallbacks to `bot.botUsername` / `bot.webhookStatus` — either shape works.
3. `GET /api/meme-army` already returns `missions` + `members`, so the frontend only uses `GET /api/meme-army/missions` implicitly via the main endpoint; ensure both stay in sync.
4. Mission POST `launch` flag assumed to mean "announce announcement now"; when bot is PAUSED the client sends `launch:false`.
5. `generate-pack` response `language` is rendered as a chip on the ANNOUNCEMENT group only (contract has a single `language` per pack); if packs become per-language arrays later, the UI grouping can extend.
6. `PATCH /api/meme-army/missions/[id]` used with `{ status }` only; contentPack/title/description editing of existing missions is not wired in UI (only create-time).
7. `BotDTO.status` assumed to be "LIVE" | "PAUSED" (anything non-LIVE renders amber with the raw value shown).
