# Build Progress

## Completed Phases
**Phase 1 — Foundation** ✅ (completed 2026-06-20)
**Phase 2a — Feed UI** ✅ (completed 2026-06-20)
**Phase 2b — Supporting Views UI** ✅ (completed 2026-06-21)
**Phase 3 — Annotation Layer** ✅ (completed 2026-06-21)

## Current Phase
Phase 5 (Section 15) and Phase 6 ("Digests & Polish") are complete — this was the full SPEC.md scope. **Macro Indicators Dashboard** (a separate, out-of-spec feature requested directly by Kevin — see `dashboard.md` for the full design) is built but **not yet live**: code is complete and typechecks/builds clean, but three manual setup steps are still needed before it works (see below).

## Macro Indicators Dashboard (2026-06-22)

New page at `/indicators`, design fully resolved in `dashboard.md` before any code was written (schema, per-indicator direction logic verified against official methodologies where they exist, data sources, nav/mobile/error decisions).

**Built:**
- `supabase/migrations/0004_macro_indicators.sql` — `macro_indicators` (static catalog) + `macro_indicator_readings` (time series) tables, RLS policies. **Not yet applied to the live DB** — same as every prior migration, this needs to be run manually via the Supabase SQL editor (no direct Postgres connection available to this session, only the REST API).
- `types/database.ts` — `MacroIndicatorsRow`/`MacroIndicatorReadingsRow` + `Database` registration.
- `scripts/seed-macro-indicators.ts` (`npm run seed:macro`) — seeds the 19 indicator catalog rows from dashboard.md. Idempotent. **Must be run after the migration**, before the page will show anything.
- `lib/ingestion/macro/fred.ts` — FRED observations API client. **Requires a `FRED_API_KEY` env var that does not exist yet in this app** (`.env.local` or Vercel) — sign up free at https://fred.stlouisfed.org/docs/api/api_key.html. Every FRED-backed indicator will show "Data unavailable" until this is added.
- `lib/ingestion/macro/press-release.ts` + `lib/prompts/macro-headline.ts` + `AIProvider.extractMacroHeadline()` (added to the interface, implemented in all three providers) — for the 5 indicators with no structured API (ISM Mfg/Services PMI, Conference Board LEI/Consumer Confidence, UMich Sentiment), fetches the org's public press-release/listing page and asks the user's configured AI provider to find the latest headline figure in free text, rather than a brittle CSS-selector scraper.
- `lib/ingestion/macro/direction.ts` — implements the direction-logic rule for all 19 indicators per the sourced/judgment-call audit in dashboard.md, dispatched by `direction_rule_key`. Two approximations made during implementation (beyond what dashboard.md already flagged): Conference Board LEI's "3Ds" rule only checks the depth leg (6-month rate < -4.3%) — the diffusion leg needs component-level data not available from the free headline-only press release; CPI's "supercore" uses Core CPI (`CPILFESL`) as a proxy since no single FRED series matches the exact "core services ex-shelter" concept.
- `lib/ingestion/macro/run.ts` — `fetchAllMacroIndicators()` (one fetch+direction cycle per indicator, each wrapped so one failure can't take down the rest) and `backfillFredIndicators()` (pulls ~24 historical observations per FRED-backed indicator on first run, so rolling-window rules like Sahm Rule or the 4-week claims MA aren't blank from day one — the 6 non-FRED indicators, including BDI, have no historical backfill path and accumulate history naturally over time instead).
- Wired into the existing daily cron (`app/api/cron/fetch/route.ts`) — same Hobby-tier single-cron constraint as digests, piggybacks on the one daily invocation. Also exposed as manual actions (`lib/actions/macro.ts`: `triggerMacroFetch`, `triggerMacroBackfill`) from buttons on the `/indicators` page itself.
- UI: `components/ui/StatDirectionBadge.tsx` (deliberately not named "SentimentBadge" — that name already means something different elsewhere in this app), `components/indicators/IndicatorRow.tsx` (click to expand: threshold rule, lead/lag window, analyst note, source link), `components/indicators/IndicatorsClient.tsx` (grouped by cycle type), `app/(dashboard)/indicators/page.tsx` + `loading.tsx`. Nav entry added to the desktop top nav only, per dashboard.md decision 2 — mobile bottom bar stays at its existing 5 slots; a link to `/indicators` was added inside Settings (mobile-only, `sm:hidden`) instead.

**Known gaps, flagged honestly rather than papered over:**
- **Baltic Dry Index has no free source at all**, discovered during this build (not part of the original 5-indicator source research). The Baltic Exchange's own API is subscription-only, and unlike the other non-FRED indicators there's no free press release with the headline number either. This row will show "Data unavailable" indefinitely unless a paid source is added later.
- **`FRED_API_KEY` is not yet provisioned** — every FRED-backed indicator (14 of 19) will show "Data unavailable" until Kevin signs up for the free key and adds it to `.env.local` and Vercel's env vars.
- Cron's `maxDuration = 60` (`app/api/cron/fetch/route.ts`) could in theory truncate mid-loop with 19 sequential indicator fetches (5 of which involve an AI call) on a slow day — non-fatal (each indicator commits its own row before moving to the next), just means a stale indicator catches up on a later day rather than that exact run.
- UMich Sentiment's "5yr inflation expectation > 3%" override (dashboard.md's direction rule) isn't wired in — `direction.ts` currently only checks simple MoM sign for this indicator, same as Consumer Confidence.

**Verified:**
- `npx tsc --noEmit` clean.
- `npm run build` clean — the one error printed during the build (`Could not find the table 'public.macro_indicators'`) is Next.js's prerender step correctly hitting the live DB before the migration has been applied; expected, not a code bug.
- **Not yet tested against real data** — blocked on the three manual steps above (run migration, run `npm run seed:macro`, add `FRED_API_KEY`). Once those are done, `/indicators` will need an actual visual check in the browser, which I cannot do myself in this session.

## Phase 6c — Mobile Pass, Loading Skeletons, Optimistic UI, Error States (2026-06-21)

**Built:**
- `components/ui/Skeleton.tsx` — base `Skeleton` block plus `ItemCardSkeleton`/`FeedSkeleton`; added `loading.tsx` for every dashboard route (`feed`, `digest`, `watchlist`, `conflicts`, `correlations`, `search`, `settings`) so navigating shows an immediate skeleton instead of a blank page while the server component fetches.
- `app/(dashboard)/error.tsx` and `app/error.tsx` — client error boundaries with a "Try again" reset button, so an unhandled error in any page/action no longer shows Next.js's default crash screen.
- **Optimistic UI for annotations (Section 17.1: "Annotation save < 200ms, optimistic UI, background sync")** — `components/feed/ItemCard.tsx` now uses `useOptimistic` with a local reducer (`applyAnnotationAction`) so highlight/star/note toggles update the UI instantly, before the server action resolves. `lib/actions/annotations.ts`'s three actions (`toggleHighlight`, `toggleStar`, `saveNote`) were updated to actually check and throw on Supabase errors (previously the `error` field was silently discarded) so failures are catchable; `ItemCard` now shows a dismissible inline error banner ("Couldn't save highlight/note/star — try again") if the background save fails, rather than silently reverting with no explanation.
- **Mobile 375px pass** — reviewed every dashboard view; most of the app was already mobile-first (flex-wrap, no fixed pixel widths). Found and fixed two real overflow risks: the header's email + "Sign out" button could overflow next to the logo on narrow screens (now truncates with a `max-w-[55vw]` cap on mobile); the Settings "Data Sources" list and add-source form could overflow with long names/emails (added `min-w-0`/`truncate`/`shrink-0`, and the add-source form now stacks vertically below `sm:`).
- Error states already mostly existed from earlier phases and were left as-is: empty feed (`FeedClient`'s "No items match the current filters"), failed fetch / failed digest processing (Settings' Fetch History section already shows per-run and per-digest status with a Retry button, colour-coded).

**Verified:**
- `npx tsc --noEmit` clean.
- `npm run build` clean (all 14 routes compiled, no errors).
- Could not visually screenshot-test at 375px — no browser automation tool available in this session. Recommend a manual check on your end (devtools mobile emulation) of the header and Settings → Data Sources list specifically, since those were the two layout fixes.

## Phase 6b — Settings Stats & Token Usage Chart (2026-06-21)

**Found already mostly built:** `app/(dashboard)/settings/page.tsx` and `SystemSection` in `components/settings/SettingsClient.tsx` already had real (non-placeholder) queries for Section 9.8's "Database stats" (total items, date range, annotations, entities) and most of "Token usage summary" (total tokens/cost this month, breakdown by provider) — this must have shipped in an earlier phase pass. What was actually missing:

- **Breakdown by call type** — Section 9.8 asks for "breakdown by provider **and call type**"; only provider existed. Added `byCallType` alongside the existing `byProvider`.
- **Token usage chart** — Phase 6 task 10 asks for a chart, not just text. No charting library was installed; added a small dependency-free `SpendByProviderChart` (proportional-width CSS bars) in `SettingsClient.tsx` rather than pulling in a chart library for one small widget.
- **Missing `user_id` filters** — `sources`, `fetch_runs` (both queries), `processing_log`, `token_usage`, `items` (count + date range), `annotations`, `entities` were all queried without `.eq("user_id", userId)` in the settings page, unlike every other page in the app. Harmless today (single-user app, RLS-equivalent by construction), but inconsistent with the rest of the codebase's pattern — fixed while already touching this file, flagging here since it wasn't explicitly asked for.

**Verified:**
- `npx tsc --noEmit` and `npm run build` clean.
- Re-ran the real queries directly against production data after the changes: 5 items, 11 entities, 2 sources, 0 annotations, 30 token_usage rows this month — `byProvider: {gemini: 61299}`, `byCallType: {extraction, conflict, correlation, summary}`, `costByProvider: {gemini: $0.034}`. Confirms the `user_id` filters didn't silently zero anything out.

## Phase 6a — Auto-Digest Generation (2026-06-21)

Weekly/monthly summary generation per Section 13, Section 7.6's canonical prompt, and Section 13.3's regeneration flow.

**Built:**
- `lib/prompts/summary.ts` — canonical Section 7.6 prompt, verbatim.
- `lib/ai/utils.ts` — `parseNarrativeWithJsonFooter()`, since the summary prompt (unlike every other prompt) returns prose followed by a JSON footer, not pure JSON. Falls back from a fenced ```json``` block to "last `{` in the text" if the model doesn't fence it.
- `summarise()` implemented in all three providers (`lib/claude.ts`, `lib/gemini.ts`, `lib/openai.ts`), applying Section 6.3's `Math.min(temperature + 0.1, 0.8)` bump for summary calls. **Gemini-specific fix:** the shared `call()` helper forces `responseMimeType: "application/json"`, which would make Gemini mangle the narrative into pure JSON — added a separate `callFreeform()` for this prompt instead.
- `lib/ingestion/digest.ts` — `generateSummary()` (queries items in `[periodStart, periodEnd]` by `items.date`, calls `provider.summarise()`, resolves `watchlist_mentions` entity names to `entities.id` via the same exact-name match `upsertEntity` uses, inserts a new `summaries` row, logs token usage) and `maybeGenerateDigests()` (checked from the existing fetch cron, see below).
- `lib/actions/digest.ts` — `regenerateSummary(summaryId)`: re-runs `generateSummary` for an existing summary's exact period, throws if there are no items to regenerate from. Per Section 13.3, this is a new INSERT, not an UPDATE — both versions are kept.
- `components/digest/DigestClient.tsx` — groups summaries by `(period_start, period_end)`; latest `generated_at` per group is shown as the current card (with a Regenerate button), older versions collapse behind a "Show N earlier version(s)" toggle.
- `app/api/cron/fetch/route.ts` — after `runFetch("cron")` succeeds, calls `maybeGenerateDigests()`, which checks `settings.weekly_digest_enabled`/`digest_day_of_week` and `settings.monthly_digest_enabled`/`digest_day_of_month` against the SGT-shifted "now" (same convention as the existing window check) and generates the relevant digest(s) if due. Guards against duplicate auto-generated rows (e.g. cron jitter/retry on the same day) by skipping if a summary for that exact period already exists — this guard only applies to the automatic path; `regenerateSummary` bypasses it intentionally.

**Deviations / flagged gaps:**
- **No separate cron entry for digests** — Section 13 doesn't define one, and Vercel Hobby tier only allows one cron invocation/day anyway (already used by `/api/cron/fetch`), so weekly/monthly checks piggyback on that same daily invocation rather than firing independently.
- **No `is_current` column exists on `summaries`** (confirmed against `supabase/migrations/0001_init.sql`) — "latest marked as current" (Section 13.3) is derived client-side by sorting each period's versions by `generated_at`, not a stored flag. Nothing else reads "current" status, so this wasn't promoted to a schema change per Section 19's no-uninstructed-schema-changes rule.
- **`conflicts_in_summaries` not populated** — Section 4.13 describes linking conflicts referenced within a summary's period, but Section 13's task list doesn't ask for it and no UI reads it yet. Deferred; flagging here so it isn't forgotten if a future view needs it. There is no equivalent `correlations_in_summaries` table in the schema at all.
- **`watchlist_mentions` keys**: Section 4.12's column comment says `{entity_id: mention_count}` but Section 7.6's canonical prompt literally asks the model for `{entity_name: mention_count}`. Resolved this by post-processing the model's output — looking up each name against `entities` (exact match) and storing the id when found, falling back to the raw name as the key when the model mentions something not yet tracked as an entity — rather than rewriting the prompt itself.

**Verified:**
- `npx tsc --noEmit` and `npm run build` both clean.
- Ran `generateSummary()` directly against real production data (5 real items, Gemini `gemini-2.5-flash-lite`) — produced a coherent prose summary, correctly parsed the JSON footer (`key_themes`, `dominant_sentiment: "mixed"`, empty `watchlist_mentions` since none of today's items mentioned a tracked entity), and inserted into `summaries` with real token counts (865 in / 551 out, ~$0.0003).
- Re-ran `generateSummary()` for the same period to confirm the regeneration model: two distinct `summaries` rows for the identical `(period_start, period_end)`, different `generated_at` — confirms "new record, both kept" per Section 13.3.
- Test rows deleted afterward; no test data left in the database.
- `/digest` route compiles and responds (307 → `/login`, expected — unauthenticated curl request, not an error) under `npm run build` and `npm run dev`.

## Fetch History + Duplicate-Email Prevention (2026-06-21)

Built per Kevin's explicit request, ahead of/outside the original phase plan (flagged since it touches Section 18's "Future Considerations" alert-system note, but Kevin asked directly for an in-app version of it):

- **`digests.gmail_message_id`** (new nullable column, migration `0003_digest_message_id.sql`) + a unique index on `(user_id, gmail_message_id)` where not null. **Applied to the live Supabase DB** (Kevin ran it via the SQL editor).
- `lib/ingestion/run.ts` — `runFetch()` now filters Gmail search results against already-processed `gmail_message_id`s before processing, so re-running "Fetch Now" within the same rolling 24h search window (or an overlapping cron run) never re-processes the same email twice. Logs how many were skipped.
- `lib/ingestion/run.ts` — extracted the per-email extract/save/digest-update logic into an exported `processDigestEmail()`, shared between the main fetch loop and the new retry action below (previously inlined only in the loop).
- `lib/actions/fetch.ts` — new `reprocessDigest(digestId)` server action: reprocesses one previously **failed** digest from its already-stored `raw_body` (no fresh Gmail fetch), via the shared `processDigestEmail()`. Sets `digests.reprocessed`/`reprocessed_at` (pre-existing, previously-unused columns) on success. **Updated 2026-06-21** (see bug-fix note below): also runs the same-day dedup pass before finishing — originally deferred to the next full fetch run, but that left it possible to retry a digest whose underlying email already had a successful sibling digest and silently re-save the same items as duplicates.
- `app/(dashboard)/settings/page.tsx` + `components/settings/SettingsClient.tsx` — new "Fetch History" section: lists the last 10 fetch runs with each run's per-email subject + status (success/failed/skipped) + item count, and a "Retry" button on any failed email. This is the in-app alternative Kevin chose over an external email/Resend notification.
- **Backfill**: the migration is additive and can't retroactively populate `gmail_message_id` on digests created before it existed. One-off backfill performed for the single pre-migration digest (real Reuters "Weekend Briefing" email, subject "U.S. and Iran give it another try") — matched to its real Gmail message via a timestamp-scoped search (exact `received_at` ± 2h, since the email's `Date` header didn't line up with a wide `after:` epoch query) and updated directly. The 3 leftover **failed** duplicate digests from this morning's pre-fix debugging (0 items each) were left as-is in Fetch History at Kevin's request, kept as visible history rather than deleted.
- **Feed traceability**: each item card (Feed + Search) now shows a "From: \<email subject\>" line, sourced from `digests.email_subject`. When `gmail_message_id` is present, the subject is a clickable link (`https://mail.google.com/mail/u/0/#all/<id>`) opening that exact email directly in Gmail. Items from digests without a stored message id (anything pre-migration and not backfilled) show the subject as plain text. `lib/items.ts` (`RawItemRow`/`DisplayItem`), `app/(dashboard)/feed/page.tsx`, `lib/search.ts`, `components/feed/ItemCard.tsx`.
- `components/feed/ItemCard.tsx` — the card's clickable toggle area was changed from a `<button>` to a `<div role="button" tabIndex={0}>` (with matching `onKeyDown`) so the new Gmail link (an `<a>`) can sit inside it without invalid "interactive content nested in a button" HTML and the layout/spacing glitch that caused.

### Verified
- `npx tsc --noEmit` / `npm run build` — clean.
- Dev server restarted clean, `/settings` and `/feed` compile and respond (redirect to `/login` when unauthenticated, as expected).
- Migration applied live; backfill update confirmed via direct query (digest now carries the real `gmail_message_id`).
- Duplicate-prevention and Retry both tested live by Kevin (see bug-fix note immediately below for what the Retry test surfaced).

### Bug fix: Retry created duplicate items (2026-06-21)
Kevin retried one of the 3 leftover failed duplicate digests (pre-`gmail_message_id` migration). Its sibling digest had already succeeded with 5 items for the same email. Since `reprocessDigest` skipped the dedup pass by design, it re-saved all 5 stories as brand-new items with no duplicate check — confirmed via direct DB query (two digests, 5 identical-summary items each, neither flagged `is_duplicate`).
- **Data fix**: deleted the 5 newly-created duplicate items (cascade-safe via `item_entities` FK), reset that digest's `item_count` to 0. Left the digest row itself as history, per Kevin's earlier "keep as history" instruction.
- **Code fix**: exported `runDedupPass` from `lib/ingestion/run.ts`; `reprocessDigest` (`lib/actions/fetch.ts`) now calls it against the day's existing items right after saving, same as the full fetch pipeline. Confirmed `tsc`/`build` clean.
- Note: Feed/Search don't currently filter on `items.is_duplicate` at all (checked — no occurrence outside `lib/ingestion/`), so a future duplicate caught by this pass is recorded but still visible in the Feed today. Flagging as a known gap, not fixed here since it wasn't part of what was asked.

## Phase 5c — Cron Automation (2026-06-21)

Built per SPEC.md Section 14 + Section 15 Phase 5 task 1–2 (the only 5c items explicitly requested this session — watchlist dynamic scores and nav badges remain not started):
- `vercel.json` (new) — single daily cron, `0 22 * * *` (22:00 UTC = 06:00 SGT default), hitting `/api/cron/fetch`. Free/Hobby tier only supports this one daily invocation (Section 14.1's note).
- `app/api/cron/fetch/route.ts` (new) — `GET` handler:
  - Verifies `Authorization: Bearer <CRON_SECRET>` against `process.env.CRON_SECRET`; 401 otherwise (Section 14.2). `CRON_SECRET` already existed in `.env.local`.
  - Since `settings.fetch_schedule` is user-editable independently of the one fixed `vercel.json` entry, the handler converts "now" to SGT and checks it's within ±90 minutes of the user's configured `fetch_schedule` (parsed minute/hour, plus day-of-week if not `*`) before proceeding — outside that window it's a no-op, logged to `processing_log` and returned as `{ skipped: true }`. The 90-minute tolerance covers Vercel's documented cron-jitter window (can fire up to ~an hour late).
  - On match, calls the existing `runFetch("cron")` — no pipeline changes were needed since it already supported the `"cron"` trigger type.
- Known limitation (matches spec's own framing, not a bug): if Kevin changes `fetch_schedule` to a time far from 06:00 SGT, the daily fetch still won't actually run then, since Vercel's Hobby tier only fires the one cron entry once a day at its fixed UTC time. Changing the *displayed/stored* schedule doesn't move the actual trigger — only redeploying `vercel.json` does. This is the tradeoff the spec explicitly calls out for the free tier.

### Verified
- `npx tsc --noEmit` / `npm run build` — clean; `/api/cron/fetch` appears in the build's route list.
- Local dev server: no `Authorization` header → 401; wrong secret → 401; correct secret outside the configured window → `{"skipped":true,...}` (current time was outside the default 06:00 SGT window, as expected).
- **Not yet verified**: an actual successful cron-triggered fetch (correct secret + within window) — would need either a local clock override or a real Vercel deploy + waiting for/triggering the schedule.
- **Deployed**: pushed to `origin/main`; Kevin set `CRON_SECRET` in Vercel's project env vars (Production) to match `.env.local`. First real cron-triggered run expected ~06:00 SGT the next morning — not yet observed end-to-end (Vercel will redeploy on push, but a live cron fire hasn't been confirmed yet).

## Phase 5c — Nav Badges (2026-06-21)

Built per Section 12.4 (badge display rules) and Section 15 Phase 5 task 8 — the only remaining 5c task besides cron.

- `app/(dashboard)/layout.tsx` — the desktop nav (`NAV_LINKS`) now shows a count badge next to "Conflicts" (amber, count of `conflicts` where `acknowledged = false AND is_resolved = false`) and "Correlations" (blue/accent, count of `correlations` where `is_dismissed = false`) when count > 0. Computed server-side on every dashboard layout render via two `count: "exact", head: true` queries — cheap enough not to need caching. The mobile bottom tab bar doesn't include Conflicts/Correlations links at all (Section 9.1's 5-tab limit), so no mobile badge work was needed.
- **Decision: watchlist dynamic score recalculation (the other 5c task) deliberately not built.** The spec's schema has `watchlist.dynamic_score`/`dynamic_window_days` columns meant to be written nightly by cron (Section 11.2), but `/watchlist`'s "Trending This Week" section (built back in Phase 2b) already computes mention counts live on every page load by querying `item_entities` directly — more accurate than a once-daily batch, and nothing in the UI reads the `dynamic_score` column today. Flagged to Kevin directly; he chose to skip the nightly-persistence mechanism rather than write to a column nothing reads. The schema columns remain unused by design — not a bug, a deliberate simplification.

### Verified
- `npx tsc --noEmit` / `npm run build` — clean.
- Direct query confirmed the badge counts match the DB (0 unacknowledged conflicts, 5 active correlations at time of writing).
- Dev server restarted clean; `/feed` responds (redirects to `/login` unauthenticated, as expected). Visual badge rendering not screenshot-tested (no authenticated browser session in this environment) — worth a quick look next time Kevin's logged in.

## Phase 4/5a/5b End-to-End Verification + Bug Fixes (2026-06-21)

First real end-to-end run of the full pipeline (Gmail → Gemini extraction → save → dedup → conflict/correlation detection), using `gemini-2.5-flash` (Kevin's chosen primary provider, free tier). Surfaced and fixed several real bugs:

- **Gemini JSON truncation**: `gemini-2.5-flash` spends part of `maxOutputTokens` on internal "thinking" tokens before visible output, silently truncating extraction JSON. Fixed in `lib/gemini.ts` via `thinkingConfig: { thinkingBudget: 0 }` and `responseMimeType: "application/json"` (also removes markdown-fence wrapping), plus raised token ceilings (extract: 8192, others: 4096).
- **Gemini free-tier rate limit (429s)**: a fetch run's burst of extract/dedup/conflict/correlation calls (one call per item for the latter two) exceeded Gemini's free-tier cap. Confirmed via a real 429 response: **5 requests/minute** for `gemini-2.5-flash`. Added a self-tuning rate limiter (`lib/ai/utils.ts` `createRateLimiter()`), module-level in `lib/gemini.ts`, starting at the confirmed 5 RPM (13s spacing) and widening further on any actual 429. `withRetry()` now treats rate-limit errors distinctly — waiting on the provider's own suggested `retryDelay` when present, instead of the short generic exponential backoff.
- **Parse-failure errors only logged the first 500 chars** of the model's raw output, discarding the rest. New `ModelOutputParseError` (in `lib/ai/utils.ts`) carries the full untruncated text through to `processing_log.metadata` (JSONB, no size constraint).
- **One rate-limited call could fail an entire otherwise-successful run.** Dedup and per-item conflict/correlation calls are now individually try/caught in `lib/ingestion/run.ts`, logging and continuing rather than aborting the whole run — consistent with Section 17.2's "partial success is acceptable, silent failure is not."
- **Dedup pass date bug**: `runDedupPass()`'s "existing items from today" filter compared `items.date` (the news *event* date, which Section 7.2 explicitly allows to be backdated) against today's calendar date — so re-processing the same email twice in one day never matched as a duplicate unless the model happened to date the event as today. Fixed to compare `created_at` instead, matching the spec's actual intent ("items already processed today").
- **Failed runs silently discarded real partial progress.** If a run failed after emails were already extracted and saved (e.g. during dedup), the outer error handler reported `items_extracted: 0` and `status: "failed"` even though real item rows were already committed. `runFetch()` now tracks counts outside the `try` block and reports them accurately in the catch path, using `"partial"` status when appropriate.

### Verified
- **Real end-to-end run succeeded**: a real Reuters "Weekend Briefing" email was fetched via Gmail, 6 items extracted via Gemini (`gemini-2.5-flash`), saved with correct categories/sentiment/entities, matching the actual email content (spot-checked against `digests.raw_body`).
- `npx tsc --noEmit` / `npm run build` — clean after all fixes.
- This closes out the Phase 4 acceptance criteria that had been pending since Phase 4's session end, using Gemini instead of Claude per Kevin's standing preference.

### Data cleanup
Phase 2a's seed data (`scripts/seed.ts`) was still live in the DB this whole time, mixed in with real fetched items. Deleted (kept the script itself for future re-seeding):
- 14 seed `fetch_runs` (cascaded digests/items/item_entities) and the seed-only entities/watchlist/conflicts/correlations/summaries — confirmed no real items referenced the seed entity names before deleting.
- Per Kevin's explicit request, also wiped *all* remaining data (the real test items/fetch_runs/conflicts/correlations/processing_log from this session's debugging) for a fully clean slate before the next real test — kept `sources` (Reuters/Bloomberg, real active config) and `token_usage` (real cost history) untouched.
- Note: the static watchlist (CEG, Gold, Fed, MAS, STI) was deleted along with this — per Kevin, nothing should be hardcoded going forward; watchlist entities should only be added through the app's existing add-entity UI (`/watchlist`, already functional, not seed-dependent).

---

## Phase 5b — RAG + Conflict/Correlation Detection (2026-06-21)

Built per SPEC.md Section 15 Phase 5 tasks 3–6, Section 7.4/7.5 prompts, and Section 12 (scope rules).

- `lib/prompts/conflict.ts` / `lib/prompts/correlation.ts` — Section 7.4/7.5 prompts, copied verbatim (Section 19 Rule 6).
- `lib/ai/utils.ts` — added `serializeItemForPrompt()`, a shared item-shape helper now reused by dedup/conflict/correlation prompt construction across all three providers (Claude/Gemini/OpenAI), avoiding triplicated inline mapping.
- `lib/claude.ts` / `lib/gemini.ts` / `lib/openai.ts` — `detectConflicts()`/`detectCorrelations()` are now real implementations (previously explicit Phase-5b throw stubs), following the same call/parse/retry pattern as `extract()`/`dedup()`.
- `lib/ai/provider.ts` — `AIProvider.extract()`'s second parameter changed from a flattened `ragContext?: string` placeholder to the full `RagContext` object (`lookbackDays`/`watchlistEntities`/`recentItemsSummary`), now that RAG is actually wired up instead of stubbed with empty values.
- `lib/ingestion/rag.ts` (new) — `buildRagContext()`: when `settings.rag_context_enabled`, builds the Section 7.2 RAG block from active watchlist entities and significance=3 items within `rag_lookback_days`. Returns `undefined` when RAG is off, so the extraction prompt's `{{RAG_CONTEXT_BLOCK}}` placeholder resolves to nothing (existing `buildExtractionPrompt` behavior, unchanged).
- `lib/ingestion/intelligence.ts` (new) — `runConflictDetection()`/`runCorrelationDetection()`, one call per newly-saved non-duplicate item:
  - Conflict scope (Section 12.2): items from the last 90 days sharing the new item's GICS sector OR at least one entity (via `item_entities`), capped at 20 candidates.
  - Correlation scope (Section 12.3): items from the last 30 days with a *different* category (GICS sector, falling back to the item's first extended category), capped at 20 candidates.
  - Results are saved to `conflicts`/`correlations` with `entity_id`/`entity_a_id`/`entity_b_id` resolved by intersecting each item's linked entities (conflict: shared entity; correlation: each item's first entity, since the two items are by definition NOT sharing a category).
  - Both call `logTokenUsage()` with the existing `"conflict"`/`"correlation"` call types (already in the `TokenCallType`/`LogStage` enums from Phase 1 — no schema change).
- `lib/ingestion/run.ts` — `runFetch()` now: builds RAG context once per run (before the email loop) and passes it into every `extract()` call; after the dedup pass, runs conflict + correlation detection for every saved item that wasn't marked a duplicate (tracked via `runDedupPass()`'s new `duplicateIds` return value); the final `fetch_runs.estimated_cost_usd` (a pre-existing schema column that was never populated since Phase 4) is now computed from total input/output tokens at the end of the run, via a newly-exported `estimateCostUsd()` from `lib/ingestion/token-usage.ts`.

### Verified
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes still compile.
- **Not verified end-to-end** — same blocker as 5a/4b: no AI provider has a working API key yet. The Feed's conflict (⚠️)/correlation (🔗) icons and the `/conflicts`/`/correlations` views already read live from these tables (built in Phase 2a/2b against seed data), so they need no further UI work — they'll populate automatically once a real fetch run with a working provider produces rows.

### Deviations / notes
- **Conflict/correlation counts are not stored on `fetch_runs`** — unlike `items_deduplicated`, there's no `conflicts_detected`/`correlations_detected` column in Section 4.3's schema (Rule 2: don't change schema without flagging). Counts are written to `processing_log` instead (stage `"conflict"`/`"correlate"`), consistent with how the dedup pass already logs its own count.
- **Correlation candidate query over-fetches then filters in JS** (`queryCorrelationCandidates` pulls up to 60 candidates by date range, then filters out same-category items before slicing to 20) rather than expressing "different category" as a single SQL filter, since category is derived from two different columns (`gics_sector` falling back to `secondary_categories[0]`) and Supabase's query builder doesn't cleanly express that OR/fallback logic in one `.neq()`. Acceptable for this app's data volume.
- **`entity_a_id`/`entity_b_id` on `correlations` use each item's first linked entity**, not a "shared" entity (correlations are cross-category by definition, so there's rarely a shared entity to intersect on, unlike conflicts).

### What Phase 5c needs
- Vercel cron job (`vercel.json`, Section 14.1) + secret-verified `/api/cron/fetch` endpoint — `runFetch("cron")` already supports this trigger type, just unwired.
- Watchlist dynamic score recalculation (nightly).
- Unacknowledged conflict/correlation badges on nav (Section 12.4) — the feed-card icons and the dedicated `/conflicts`/`/correlations` views already exist; only the nav badge counts are missing.

---

## Phase 5a — Provider Expansion (2026-06-21)

Built per SPEC.md Section 15 Phase 5 tasks 9–10 only (Gemini/OpenAI provider implementations, live provider switching). Tasks 1–8 (cron, RAG, conflict/correlation detection, watchlist scores, nav badges) are 5b/5c — not started.

- `lib/ai/utils.ts` (new) — extracted `withRetry()` (Section 17.2 backoff) and `parseJsonArray()` out of `lib/claude.ts` so all three providers share the same retry/parsing logic instead of duplicating it.
- `lib/gemini.ts` (new) — `GeminiProvider` via the official `@google/genai` SDK (`GoogleGenAI.models.generateContent`). Implements `extract()`/`dedup()` identically to `ClaudeProvider`'s contract; `summarise()`/`detectConflicts()`/`detectCorrelations()` throw explicit "not implemented" errors (Phase 6 / Phase 5b respectively).
- `lib/openai.ts` (new) — `OpenAIProvider` via the official `openai` SDK (`chat.completions.create`). Same shape as `GeminiProvider`.
- `lib/ai/provider.ts` — `getAIProvider()` now handles all three provider names; the `default` case error message changed from "not implemented yet (Phase 5)" to "not recognized" since Phase 5a closes out that gap.
- `lib/claude.ts` — refactored to import the shared helpers from `lib/ai/utils.ts` (no behavior change); its stub error messages for `detectConflicts`/`detectCorrelations` now say "Phase 5b" instead of "Phase 5" to match the new sub-phase split.
- `lib/ingestion/token-usage.ts` — added pricing entries for `gemini-2.5-pro`/`gemini-2.5-flash`/`gpt-4o`/`gpt-4o-mini` (the models already listed in the Settings dropdown) so cost estimation works for whichever provider Kevin actually uses, not just Claude.
- **Task 10 (live provider switching, no restart) required no new code.** `runFetch()` already reads `settings.active_provider`/`active_model`/`temperature` fresh from Supabase at the start of every run (Phase 4 design) and constructs a new provider instance each time — flipping the Settings dropdown takes effect on the very next fetch.
- `package.json` — added `@google/genai` and `openai` as dependencies.

### Verified
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes still compile.
- **Not verified: a real Gemini or OpenAI extraction call.** `GOOGLE_AI_API_KEY` and `OPENAI_API_KEY` are both present but empty in `.env.local`. Kevin's plan is to fill in `GOOGLE_AI_API_KEY` (Gemini), switch the Settings AI Provider toggle to Gemini, and click "Fetch Now" to get the first real end-to-end Phase 4+5a verification — this directly closes out the Phase 4 acceptance criteria that's been pending since session end of Phase 4.

### Deviations / notes
- Used `@google/genai` (Google's current unified GenAI SDK, v2.x) rather than the older `@google/generative-ai` package, which is the predecessor SDK — consistent with Section 19 Rule 7 (choose the closest current alternative).
- Reordered Phase 5's task list (5a provider swap before 5b RAG/conflict/correlation) per Kevin's explicit instruction, since he does not intend to fund Claude API access and needs a working non-Anthropic provider before 4b/4c can be exercised at all.

(5b and 5c built next — see the "Phase 5b" section above this one for what followed, and its "What Phase 5c needs" list for what's still outstanding.)

---

## Phase 4 — Ingestion Pipeline (2026-06-21)

Built per SPEC.md Section 7, Section 8, Section 6, and Section 15 (Phase 4). Split into three parts (Gmail ingestion → AI extraction → orchestration/UI) since they're independently testable layers.

### Part 4a — Gmail ingestion
- `lib/gmail/client.ts` — Gmail API client (`googleapis`), authenticated via a refresh token (not the NextAuth session — the pipeline runs unattended, so it needs its own offline grant). `searchMessages()` paginates `messages.list`; `getMessage()` fetches one message `format: "full"`.
- `lib/gmail/query.ts` — `buildSearchQuery()`: Section 8.2's rolling-24h `from:(...) after:...` query, built from active `sources`, handling the `%@domain` wildcard pattern from Section 4.2.
- `lib/gmail/extract.ts` — Section 8.3: prefers `text/plain`, falls back to `text/html` (tag-stripped, entity-decoded, whitespace-collapsed), then truncates at the first line matching a common unsubscribe/legal-footer pattern.
- `scripts/get-gmail-refresh-token.ts` (`npm run gmail:auth`) — one-time local OAuth flow to obtain the refresh token, since NextAuth's login flow requests the `gmail.readonly` scope (already in `auth.ts`) but never persists `account.refresh_token` anywhere, and the pipeline needs a long-lived token independent of any browser session.

### Part 4b — AI extraction
- `lib/ai/provider.ts` — Section 6.1's `AIProvider` interface, exactly as specified, plus the result/error types for all five methods. `getAIProvider()` is the Section 6.3 factory (provider/model/temperature passed in from settings at call time). Only `claude` is implemented; any other provider name throws "not implemented yet (Phase 5)".
- `lib/claude.ts` — `ClaudeProvider` via `@anthropic-ai/sdk`. Implements `extract()` and `dedup()` (Phase 4 tasks 5–7,10); `summarise()`/`detectConflicts()`/`detectCorrelations()` throw explicitly — those are Phase 5/6 pipeline stages per Section 15, not implemented yet by design. Includes the Section 17.2 exponential-backoff retry (max 3 attempts) around every API call, and strips markdown code fences before `JSON.parse` in case the model wraps its output despite instructions.
- `lib/prompts/extraction.ts` / `lib/prompts/dedup.ts` — Section 7.2/7.3 prompts, copied verbatim (Section 19 Rule 6). The extraction prompt has no explicit placeholder for the newsletter body itself in the spec text, so the cleaned email body is appended after the prompt under a `Newsletter body:` heading — flagging as a minor interpretation, not a prompt rewrite.

### Part 4c — Orchestration, persistence, Settings UI
- `lib/ingestion/entities.ts` — `upsertEntity()`: exact-name match against `entities` (Section 4.6's `UNIQUE(user_id, name)`), bumping `mention_count`/`last_seen` on repeat sightings; invalid `type` values from the model fall back to `"other"` rather than failing the CHECK constraint.
- `lib/ingestion/save-item.ts` — `saveExtractedItem()`: inserts the item row (computing `reading_time_seconds` per Section 7.7), sanitises `gics_sector` against `GICS_SECTORS` and `secondary_categories` against `EXTENDED_CATEGORIES` (the prompt's "approved list" is the extended categories only, capped at 3), then links each extracted entity via `item_entities` (upserted on `(item_id, entity_id)`).
- `lib/ingestion/match-source.ts` — maps an email's `From` header back to the `sources` row that matched the Gmail query (domain-wildcard or exact), so `digests.source_id` is set correctly even when multiple sources are active.
- `lib/ingestion/log.ts` / `lib/ingestion/token-usage.ts` — `processing_log` and `token_usage` write helpers (Section 17.3/4.14). Cost estimation uses a small hardcoded USD/M-token table for known Claude models; per Section 6.3 the model field is free text, so an unrecognised model logs token counts with a `null` cost rather than guessing.
- `lib/ingestion/run.ts` — `runFetch(triggeredBy)`: the Section 7.1 pipeline (create `fetch_run` → search Gmail → per email: create `digest`, extract, save items, log tokens → dedup pass across all new items vs. today's existing items → finalise `fetch_run` status). Section 8.4's error handling is implemented per-email (one failed digest → `partial`, all failed → `failed`, zero emails found → `success` with an info log, not an error). Conflict/correlation detection, watchlist dynamic scores, and RAG context injection are intentionally not called here — Section 15 schedules them for Phase 5.
- `lib/actions/fetch.ts` — `triggerFetch()` server action wired to the previously-disabled "Fetch Now" button in `components/settings/SettingsClient.tsx`, which now shows a "Fetching…" state and surfaces any thrown error inline. The last-run status, processing log, and token usage displays in Settings (built in Phase 2b against empty tables) needed no changes — they already read live data and will populate once a real fetch runs.

### Verified
- `npx tsc --noEmit` — clean.
- `npm run build` — clean, all routes still compile.
- Dev server starts with no runtime errors.
- **Gmail leg (4a) verified end-to-end against real Gmail**, on 2026-06-21:
  - `GOOGLE_REFRESH_TOKEN` bootstrapped via `npm run gmail:auth` and set in `.env.local`.
  - Gmail API enabled on the GCP project (was disabled by default; one-time per-project setting, separate from the OAuth client itself).
  - "Fetch Now" in Settings successfully listed and fetched a real email ("U.S. and Iran give it another try") via `searchMessages`/`getMessage`.
  - Two stale `next dev` processes were found running on ports 3000/3001 during this testing, causing a confusing 404 on `/settings` — killed the stale one (port 3000); only port 3001 (or whatever the current `npm run dev` picks) should be used going forward.
- **AI extraction leg (4b/4c) not yet verified end-to-end.** The only implemented provider (`ClaudeProvider`) requires `ANTHROPIC_API_KEY`, which is unset. The fetch run reached `extract()` and failed there with "Could not resolve authentication method" — confirming the Gmail leg works and isolating the remaining blocker to the AI call only.
- **Decision: paused, not blocked.** Kevin's Claude Pro subscription does not include API credits (separate billing system from console.anthropic.com). He has chosen not to fund a Claude API key and instead wants a Gemini implementation of `AIProvider` (Phase 5 work, see "What Phase 5 needs"). Real end-to-end verification of 4b/4c (and thus full Phase 4 acceptance criteria) is deferred until either a Gemini provider exists, or Kevin decides to fund Claude API access.
- Browser click-through of the "Fetch Now" button's loading/error states has been informally verified live (button enables/disables, errors surface inline) during this session's debugging.

### Deviations / notes
- **`min_significance` and `active_categories` settings are applied at save time**, not specified explicitly in Section 7/8 — interpreted as: items below `min_significance` are dropped before saving (so they never reach the DB at all, rather than being saved and hidden by feed filters). `active_categories` is not yet enforced (no spec text on how it should gate extraction/save) — flagging as an open question rather than guessing further.
- Gmail integration uses the `googleapis` package and Claude extraction uses `@anthropic-ai/sdk` (both official SDKs) — not explicitly required by spec, but consistent with "choose the closest alternative" (Section 19 Rule 7) over hand-rolled REST clients.
- `digests.email_date`/`received_at` parsing assumes the `Date` header and `internalDate` are both present and parseable; Section 8.2's date-normalisation fallback (event date → email send date in SGT) is applied inside the extraction prompt's own date inference, not re-derived here.

### What Phase 5 needs
- **Gemini implementation of `AIProvider` — prioritise this first.** Kevin wants Gemini (not Claude) as his primary provider going forward to avoid paying for separate Anthropic API credits on top of Claude Pro. `getAIProvider()` in `lib/ai/provider.ts` currently only implements `"claude"`; add a `GeminiProvider` and wire it in before/instead of OpenAI.
- RAG context building (`extract()`'s `ragContext` param already exists on the interface, unused so far).
- Conflict/correlation detection passes (`ClaudeProvider.detectConflicts`/`detectCorrelations` currently throw on purpose).
- Watchlist dynamic score recalculation.
- Vercel cron + `/api/cron/fetch` (the Section 14.1 cron secret endpoint) — `runFetch("cron")` already supports this trigger type, just unwired.
- OpenAI provider implementation (lower priority than Gemini per above).

---

## Phase 3 — Annotation Layer (2026-06-21)

**Goal:** Fully working annotation system persisting to Supabase (SPEC.md Section 10 + Section 15 Phase 3).

### What was built
- `lib/actions/annotations.ts` — three server actions, all soft-delete (`is_deleted`) and `revalidatePath("/feed")` + `revalidatePath("/search")`:
  - `toggleHighlight(itemId, sentenceIndex, colour)` — tapping the active colour again removes the highlight (per Section 10.2); tapping a different colour replaces it. Looks up the existing non-deleted highlight row for that sentence rather than relying on a DB unique constraint (none exists on `annotations`), since only one highlight colour is allowed per sentence.
  - `toggleStar(itemId)` — whole-item annotation, `sentence_index IS NULL`.
  - `saveNote(itemId, sentenceIndex, noteText)` — sentence-level or whole-item (`sentenceIndex = null`) free-text note; saving an empty string soft-deletes the existing note.
- `lib/user.ts` (new) — extracted the `USER_EMAIL` / `getUserId()` helper that had been duplicated in `watchlist.ts` and `settings.ts`; all three action modules and `lib/search.ts` / `feed/page.tsx` now share it.
- `lib/items.ts` — `DisplayItem` gained an `annotations: AnnotationsRow[]` field; `buildDisplayItems()` takes an optional 5th `annotations` argument and groups it by `item_id`. Both `feed/page.tsx` and `lib/search.ts` now fetch the current user's non-deleted annotations and pass them through, so highlights/stars/notes hydrate correctly on both the Feed and Search views.
- `components/feed/ItemCard.tsx` — full rewrite of the expanded-card interaction:
  - Each sentence is its own `Sentence` component. Desktop: click toggles the action bar open/closed. Mobile: a `touchstart`/`touchmove`/`touchend` timer (activate only if held ≥ 500ms and moved < 10px) per the Section 10.2 iOS Safari note — `preventDefault()` is called on a successful long-press so the native text-selection menu never appears, and a `suppressClickRef` swallows the synthetic click that follows a short tap so quick taps do nothing (only long-press activates on touch devices).
  - Action bar: three highlight-colour dots (yellow/green/red, ring-highlighted if active) + an "Add note"/"Edit note" button. Only one sentence's bar is open at a time.
  - Highlighted sentences get a translucent background tint (`bg-yellow-500/30` / `bg-bullish/30` / `bg-bearish/30`) so the colour reads correctly against the existing dark theme tokens.
  - Sentence notes show a 💬 icon with the note text in its `title` (hover/tap-to-reveal per Section 10.4); editing opens an inline textarea with Save/Cancel.
  - Whole-item star button (★/☆) and whole-item note (separate from sentence notes, `sentence_index = null`) live below the sentence list, alongside the existing "View conflict"/"View correlation" links.
  - Collapsed-card badge row now shows a filled star if the item is starred and a highlight count (`✎ N`) if any sentences are highlighted, per Section 9.2/10.3.
- `lib/export.ts` + `app/api/export/annotations/route.ts` — Section 10.5 export. `buildAnnotationExport()` fetches all non-deleted annotations for the user, joins each to its item (date, summary, sentence text by index, GICS sector, secondary categories, significance, sentiment) and to that item's entity names, producing the exact row shape from the spec's JSON example. `annotationExportToCsv()` flattens the same rows to CSV (arrays joined with `; `, fields quoted/escaped only when they contain a comma/quote/newline). The route checks `auth()` and returns 401 if not logged in; `?format=csv` returns `text/csv`, otherwise pretty-printed JSON; both set `Content-Disposition: attachment` so the browser downloads a file directly.
- `components/settings/SettingsClient.tsx` — the previously-disabled "Export annotations" button is now a real `<a href="/api/export/annotations?format=...">` download link, reading the live `export_format` setting so the existing format `<select>` (already wired to `updateSettings`) controls which file format gets downloaded.

### Verified
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; `/api/export/annotations` compiles as a dynamic route alongside the existing pages.
- `npm run dev` — starts with no runtime errors.
- Browser click-through (long-press on a real touch device, highlight persistence across reload, note editing, star toggle, export download in both formats) has **not** been verified by Claude Code — no browser-driving tool is available in this environment. Handed to Kevin to verify manually per the Phase 3 acceptance criteria below.

### Deviations / notes
- **No true optimistic UI yet.** Annotation actions call the server action via `useTransition` and rely on `revalidatePath` + Server Component refetch to reflect the change, the same pattern already used for pin/acknowledge/dismiss in Phase 2b. SPEC.md Section 17.1 asks for "Annotation save < 200ms (optimistic UI, background sync)," but Section 15 Phase 6 task 7 explicitly schedules "optimistic UI for annotations" as a later polish pass — so this is deferred by design, not an oversight.
- `annotations` has no DB-level unique constraint on `(user_id, item_id, sentence_index, annotation_type)`, so each server action does a `select` for the existing row before deciding to insert/update/soft-delete, rather than using `upsert`. Functionally equivalent for a single-user app with no concurrent writers.
- CSV export escaping is minimal (RFC4180-style quoting only when needed) — sufficient for this dataset size, not a full CSV library.

### What Phase 4 needs
- A working `lib/gmail/client.ts` + AI provider abstraction to actually populate `items`/`entities` from real Gmail newsletters — annotations, search, and all Phase 2b/3 views are currently only exercised against seed data.
- The Settings "Fetch Now" button and fetch-run status display are still stubbed/disabled pending the real pipeline.

---

## Phase 2b — Supporting Views UI (2026-06-21)

Built per SPEC.md Section 9.3–9.8 and Section 15 (Phase 2b). All views render
against the Phase 2a seed data; all write actions are real Supabase Server
Actions (no mocked state).

**Shared refactor:** Extracted `lib/items.ts` (`DisplayItem` type +
`buildDisplayItems()`) out of `feed/page.tsx` so the Feed and Search views
share the same item-shape-building logic (entities, source name, conflict/
correlation/watchlist flags) instead of duplicating it.

**Digest (`/digest`):** `components/digest/DigestClient.tsx` — Weekly/Monthly
tabs, summary cards (period, dominant sentiment, item count, key theme pills),
tap-to-expand full content, pin/unpin via `lib/actions/digest.ts`, "Generated
by AI" label, per-tab empty states.

**Watchlist (`/watchlist`):** `components/watchlist/WatchlistClient.tsx` —
static list (name/ticker/type/notes/alert threshold) with up/down priority
reorder and remove, add-entity-by-name form (creates the entity if it doesn't
exist); Trending This Week section computed server-side in
`watchlist/page.tsx` from `item_entities`/`items` (mention count over the
last 7 days, trend arrow vs the prior 7 days, dominant sentiment), with a
one-tap promote into the static list. All via `lib/actions/watchlist.ts`.

**Conflicts (`/conflicts`):** `components/conflicts/ConflictsClient.tsx` —
list (unacknowledged sorted first), entity + days-apart badges, both linked
item summaries, acknowledge/unacknowledge and resolve-with-note actions
(`lib/actions/conflicts.ts`), All/Unacknowledged/Resolved filter.

**Correlations (`/correlations`):** `components/correlations/CorrelationsClient.tsx`
— list, direction badge, confidence %, both linked item summaries + categories,
dismiss action (`lib/actions/correlations.ts`), All/High confidence/Dismissed
filter.

**Search (`/search`):** `lib/search.ts` implements Section 9.7 exactly as
specified — Supabase `textSearch` on the generated `search_vector` column
unioned with a separate entity-name `ilike` lookup (via `item_entities`),
deduplicated by item id, no client-side fallback. `components/search/SearchForm.tsx`
drives the query via URL search params (category/sentiment/significance/date
range filters layered on top of the search results in `search/page.tsx`);
results grouped by date, rendered with the same `ItemCard` as the feed.

**Settings (`/settings`):** `components/settings/SettingsClient.tsx` — all six
Section 9.8 sections (AI Provider, Data Sources, Extraction, Display, Digests,
System), each backed by a real `settings` row (auto-created on first visit if
missing) via `lib/actions/settings.ts`. Data Sources section does full CRUD
against the real `sources` table. System section shows the real last
`fetch_runs` row, `processing_log` (empty — pipeline not built yet),
`token_usage` aggregated for the current month (empty for the same reason),
and live `items`/`annotations`/`entities` counts for DB stats.

**Global nav:** Added a mobile bottom tab bar (Feed/Digest/Watchlist/Search/
Settings, per Section 9.1's "5 most used views") to `app/(dashboard)/layout.tsx`,
shown below `sm` breakpoint alongside the existing desktop top nav.

**Verified:** `npx tsc --noEmit` and `npm run build` both clean (all 7 routes
compile and prerender without error). Dev server starts cleanly. Browser
click-through across all 7 views, the mobile tab bar, and the feed's "View
conflict"/"View correlation" links was handed to Kevin to confirm visually
(no browser-driving tool available in this environment) — pending his
confirmation before this is fully closed out.

### Deviations / notes
- **Watchlist drag-to-reorder → up/down buttons.** Spec says "drag to
  reorder priority"; implemented as up/down arrow buttons swapping priority
  values instead of pulling in a drag-and-drop library. Functionally
  equivalent for a single-user list of ~5-10 entities; flagging in case a
  true drag interaction is wanted later.
- **"Fetch Now" and "Export annotations" are visibly present but disabled**,
  with a tooltip explaining why: the email fetch pipeline (Phase 4/5) and the
  annotations table (Phase 3) don't exist yet, so these buttons would have
  nothing real to do. Per Section 9.8 they're part of the Settings layout, so
  they're rendered rather than omitted, but wiring them up is correctly out
  of scope for Phase 2b.
- **Settings `active_categories` default (set in Phase 1's migration) doesn't
  exactly match the Section 5 category taxonomy** (e.g. "Technology" instead
  of "Information Technology", no separate "Consumer Discretionary"/"Consumer
  Staples"). Pre-existing from Phase 1, not introduced this session. The
  Extraction section's category toggle list itself uses the correct
  `lib/categories.ts` taxonomy; only the stored default values inherit the
  old naming until a settings row is edited or a migration corrects the
  default. Flagging for cleanup whenever Phase 1's schema gets revisited.
- **Cron schedule human-readable preview is a minimal heuristic**
  (`lib/format.ts` `cronToHuman()`), handling only the `M H * * *` / `M H * * D`
  shapes this app actually uses (e.g. "0 6 * * *" → "Every day at 06:00").
  Arbitrary cron expressions fall back to showing the raw string. Sufficient
  for this app's one fetch schedule; not a general cron parser.

## Phase 2a — Feed UI (2026-06-20)

Built per SPEC.md Section 15 (Phase 2a) and Section 16 (Seed Data Specification).

**Seed data:** `scripts/seed.ts` (run via `npm run seed`). Idempotent — deletes
previously-seeded `conflicts`/`correlations`/`summaries`/`fetch_runs`/`entities`
for the user before re-inserting, so it can be re-run during development.
Produces:
- 20 items across 14 distinct categories (11 GICS sectors + 3 extended
  categories used), dated today back to 13 days ago
- 11 entities, including the 5 SPEC 11.1 static watchlist entities
  (CEG, Gold/XAU, MAS, Federal Reserve, STI)
- 5 watchlist entries (static, all active)
- 1 conflict pair (Fed signals cuts → Fed signals hold, 11 days apart)
- 1 correlation pair (oil price spike → airline margin pressure, negative direction)
- 1 pinned weekly summary
- A second source ("Bloomberg Markets Wrap") alongside the Phase 1 Reuters seed,
  so items span 2+ sources per spec

**UI built:**
- `app/(dashboard)/feed/page.tsx` — Server Component. Fetches items with
  nested entity and source joins, conflicts, correlations, and the static
  watchlist via `createServiceClient()`, then computes `hasConflict`/
  `hasCorrelation`/`isWatched` per item before handing off to the client.
- `components/feed/FeedClient.tsx` — owns all filter/sort/density state
  (client-side filtering — the dataset is small and Search already owns the
  server-side full-text-search requirement from Section 9.7, so the feed
  itself doesn't need it). Splits filtered items into "Watching" (pinned) vs
  the rest, both independently sorted.
- `components/feed/FeedControls.tsx` — date picker + Today/Week/Month/Year
  quick buttons, category multi-select, sentiment/significance filters, sort
  dropdown, density toggle.
- `components/feed/ItemCard.tsx` — compact/expanded card with significance
  dot, sentiment badge, GICS + secondary category pills, entity pills, source
  + date, reading time, conflict/correlation icons. Expanded state renders
  the `sentences[]` array as individual elements (not yet tappable —
  per-sentence annotation interaction is Phase 3) and stubs a star button.
- `components/ui/Badge.tsx`, `components/ui/Pill.tsx` — shared primitives.
- `lib/categories.ts` — canonical category list from SPEC.md Section 5.
- `lib/format.ts` — `formatReadingTime()` per Section 7.7 display rules.

**Verified:** `npx tsc --noEmit` and `npm run build` both clean. Logged in
locally (`npm run dev`) and confirmed: Today view shows the single seeded
item dated today; This Week / This Month expand correctly; sentiment,
significance, and category filters narrow results; Compact/Expanded toggle
works; Watching section appears with blue-bordered container above the rest
when CEG/Gold/Fed items are in range; conflict (⚠️) and correlation (🔗) icons
appear on the Fed cut/hold and oil/airline item pairs respectively.

### Deviations / notes
- Added `tsx` as a dev dependency to run `scripts/seed.ts` directly
  (`npm run seed` = `tsx --env-file=.env.local scripts/seed.ts`).
- Reading time per Section 7.7 (`Math.ceil(wordCount / 200)` seconds) rounds
  to 1 second for nearly all seeded items, since `full_context` is only
  2-3 sentences. This is the literal spec formula, not a bug — most cards
  will show "< 1 min read" until real, longer extracted content exists.
- **Known pre-existing issue (not introduced this session):** the standalone
  `npm run lint` command fails (`eslint-config-next@15.5.19`'s flat-config
  export shape doesn't match what `eslint.config.mjs` expects — see Phase 1's
  eslint-config-next version-pin deviation). This does **not** block builds:
  `next build`'s internal lint step (which uses its own ESLint integration)
  passes cleanly. Not fixed — out of scope for Phase 2a, flagging for whoever
  picks up eslint tooling cleanup later.
- **Local dev environment fix:** `.env.local`'s `GOOGLE_CLIENT_SECRET` was
  stale (a typo'd/earlier value that didn't match the secret actually
  configured on the new Google OAuth client / set on Vercel). Corrected to
  match. If local login ever throws `invalid_client`, check this first.

## Phase 1 — Final Status (2026-06-20)

All acceptance criteria met:
- ✅ Login at `https://markets.dew.codes` via Google OAuth (`dewlearns@gmail.com` only)
- ✅ Session persists across page refresh
- ✅ Supabase `users` table has a row, created via the `signIn` callback,
  with `last_login` updating on each sign-in
- ✅ All 16 tables + RLS deployed to Supabase project `hylhjbtxjewuvdrhgarn`
- ✅ DNS CNAME propagated, SSL auto-issued by Vercel

**Production URL:** https://markets.dew.codes

### Mid-flight complication: lost Google account

The original Google account hosting the OAuth client was lost partway through
deployment. A new OAuth 2.0 Client ID was created under a new account/project.
Steps taken:
1. New Client ID + Secret generated in Google Cloud Console.
2. Added both redirect URIs (`https://markets.dew.codes/api/auth/callback/google`
   and `http://localhost:3000/api/auth/callback/google`) and both JS origins
   (`https://markets.dew.codes`, `http://localhost:3000`) to the new client.
3. Replaced `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on Vercel (old values
   deleted, new ones created via API), then redeployed.
4. Hit `Error 403: access_denied` — new OAuth consent screens default to
   **Testing** publish status, which only allows explicitly-approved test users.
   Fixed by adding `dewlearns@gmail.com` as a test user under the consent
   screen's **Audience** tab (Google moved "Test users" here in a UI redesign;
   it's no longer on the main OAuth consent screen page).
5. `AUTHORISED_EMAIL` in `auth.ts` was unaffected — it was always
   `dewlearns@gmail.com`, which is the account being logged into, not the
   account hosting the OAuth client.

**Note for future reference:** since this is a private single-user app, the
OAuth consent screen can stay in "Testing" mode indefinitely — no need to
pursue Google's full verification process.

## Session History

### Session 1 (2026-06-12)

Scaffolded the project. Key work:
- Next.js project initialized, Tailwind configured, dark navy theme applied.
- `supabase/migrations/0001_init.sql` — all 16 tables from SPEC.md Section 4.
- `supabase/migrations/0002_seed_source.sql` — seed Reuters source row.
- `types/database.ts` — hand-written types matching the migration.
- `lib/supabase/server.ts` / `lib/supabase/client.ts`.
- `auth.ts` — NextAuth v5, Google OAuth, single-account restriction, JWT session.
- `types/next-auth.d.ts` — module augmentation for `session.user.id`.
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handlers.
- Login page, dashboard layout + placeholder pages.

Blocked at end of session on TypeScript errors (see Postmortems 1 and 2).

### Session 2 (2026-06-12 continued)

Fixed both TypeScript errors. Both `tsc --noEmit` and `npm run build` pass.

### Session 3 (2026-06-12–16)

Discovered build was on Next.js 16 (should be 14 per spec). Downgraded to
Next.js 14.2.35 + React 18. Multiple Vercel deployment issues worked through
(see Postmortems 3–6 below).

### Session 4 (2026-06-16–17)

Resolved all Vercel deployment blockers. App is live. See deployment status above.

---

## Deviations from spec

- **`eslint-config-next` pinned at `15.5.19`** (not `14.x`) — Next.js 14's eslint
  config requires eslint@7/8 but the project uses eslint@9; v15 supports eslint@9
  with no runtime effect on Next.js 14.
- Phase 1 acceptance criteria says "15 tables"; the spec has 16 (duplicate "4.14"
  heading covers `token_usage` and `processing_log`). All 16 are in `0001_init.sql`.
- **No Next.js middleware** — replaced with layout-level auth protection (see
  Postmortem 6). Route protection is enforced in `app/(dashboard)/layout.tsx`.

---

## Known Issues

None blocking deployment. Remaining work is DNS + login verification (see above).

---

## Postmortem 1: `never[]` TypeScript error in `auth.ts` (RESOLVED)

**Root cause:** All `*Row`/`*Insert` types in `types/database.ts` were declared
as `interface`. TypeScript interfaces do **not** satisfy `extends Record<string, unknown>`
in conditional type checks, even when structurally identical to a `type` alias that
does. Since postgrest-js's `GenericTable` requires `Row`/`Insert`/`Update` to extend
`Record<string, unknown>`, every table's schema collapsed to `never`.

**Fix:** Converted all 17 `interface` declarations to `export type X = { ... }`.

---

## Postmortem 2: `Type '{}' is not assignable to type 'string'` in `auth.ts` session callback (RESOLVED)

**Root cause:** `types/next-auth.d.ts` augmented `declare module "next-auth/jwt"`,
but `next-auth/jwt.d.ts` is just `export * from "@auth/core/jwt"` (a re-export).
Module augmentation through re-exports doesn't merge. So `token.userId` fell
through to `JWT`'s `Record<string, unknown>` index signature → typed `unknown` →
narrowed via `&&` to `{}`.

**Fix:** Changed augmentation target to `declare module "@auth/core/jwt"`.

---

## Postmortem 3: Next.js 16 → 14 downgrade (RESOLVED)

**Root cause:** Next.js was upgraded to 16.2.9 without flagging the spec deviation.
Next.js 16 introduces a new Deployment Adapter API that Vercel's build infrastructure
does not yet support. Resulted in 404 on all deployed routes (2-second "bad" builds).

**Fix:** Downgraded to Next.js 14.2.35 + React 18.3.1. Reverted breaking changes:
- `proxy.ts` (Next.js 16 middleware rename) → `middleware.ts`
- `next.config.ts` (TS config, 15+ only) → `next.config.js`
- Async `searchParams` in login page → sync

**Lesson:** deviations from spec versions must be flagged before implementation.

---

## Postmortem 4: Vercel Edge Function `__dirname` error (RESOLVED)

**Symptom:** Even a trivial passthrough `middleware.ts` (`return NextResponse.next()`)
failed at runtime with `ReferenceError: __dirname` and `MIDDLEWARE_INVOCATION_FAILED`.

**Root cause:** Next.js 14.2.35's Edge Function middleware bundle (when run through
Vercel's current build infrastructure / Node.js 24) fails with `ReferenceError: __dirname`
at runtime. The `__dirname` is NOT present in the locally-compiled output — it is
introduced by Vercel's Edge Function packaging step. This is a framework/infrastructure
incompatibility, not a code bug.

**Attempted fixes before root cause identified:**
1. Split config pattern (`auth.config.ts` + updated `middleware.ts`) — solved previous
   Edge Function import rejection (`@/auth.config` alias not resolved, then JOSE's
   `CompressionStream`/`DecompressionStream` warnings) but not the `__dirname` error.
2. Trivial passthrough middleware with only `next/server` imports — still failed.
3. `vercel --force` (no-cache build) — still failed.

**Fix:** Deleted `middleware.ts` (and `auth.config.ts`) entirely. Auth protection moved
to `app/(dashboard)/layout.tsx` — a server component running in Node.js runtime, which
has no Edge Runtime constraints.

---

## Postmortem 5: Vercel `framework: null` — all routes returning 404 (RESOLVED)

**Symptom:** After removing middleware, all routes returned 404 (`x-vercel-error: NOT_FOUND`).
`vercel inspect` showed `Builds: . [0ms]` with no functions listed.

**Root cause:** `.vercel/project.json` had `"framework": null`. Without framework
detection, Vercel doesn't run the `@vercel/next` build plugin and doesn't package
the Next.js build output into serverless functions. The project was created without
framework auto-detection (probably because the repo had no package.json when it was
first linked, or framework was never set in the dashboard).

**Fix:** Updated the Vercel project's framework setting via the REST API:
```
PATCH /v9/projects/{projectId} → {"framework": "nextjs"}
```

---

## Acceptance Criteria Status (Phase 1)

Per SPEC.md Section 15: "Kevin can log in at markets.dew.codes, session persists,
Supabase dashboard shows the 15 tables with RLS enabled."

- **Vercel deployment:** ✅ App deployed, routes serving correctly
- **markets.dew.codes domain:** ✅ Added to Vercel (verified), awaiting DNS CNAME
- **NEXTAUTH_URL:** ✅ Set to `https://markets.dew.codes`
- **Route protection:** ✅ Unauthenticated `/feed` → 307 → `/login`
- **Supabase tables (16 + RLS):** ✅ Confirmed in Supabase project `hylhjbtxjewuvdrhgarn`
- **Login at markets.dew.codes:** ⏳ Pending DNS propagation
- **Session persistence:** ⏳ Pending live login test
