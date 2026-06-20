# Build Progress

## Completed Phases
**Phase 1 — Foundation** ✅ (completed 2026-06-20)
**Phase 2a — Feed UI** ✅ (completed 2026-06-20)
**Phase 2b — Supporting Views UI** ✅ (completed 2026-06-21)
**Phase 3 — Annotation Layer** ✅ (completed 2026-06-21)

## Current Phase
Phase 4 — Ingestion Pipeline — not yet started

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
