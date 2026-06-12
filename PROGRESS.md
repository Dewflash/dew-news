# Build Progress

## Completed Phases
(none yet — Phase 1 is in progress)

## Current Phase
Phase 1 — Foundation

## Last Session Summary

Most of Phase 1's scaffolding is in place but `npm run build` is currently
**failing** on a TypeScript error, so nothing has been verified end-to-end yet.

Done so far:
- Next.js project initialised (see deviation below), Tailwind configured, dark
  navy theme applied in `app/globals.css` and `app/layout.tsx`.
- `supabase/migrations/0001_init.sql` — all 16 tables from SPEC.md Section 4
  (note: the spec has two headings numbered "4.14", so there are 16 tables,
  not the 15 mentioned in the Phase 1 acceptance criteria). RLS enabled on
  every table via a loop over `user_id`-keyed tables, plus explicit policies
  for `users` (keyed by `id`), `item_entities`, and `conflicts_in_summaries`
  (via `EXISTS` subqueries).
- `supabase/migrations/0002_seed_source.sql` — seed Reuters source row,
  deliberately deferred to run **after** first login (depends on the `users`
  row created by the NextAuth `signIn` callback).
- `types/database.ts` — hand-written types mirroring the migration, in the
  shape `supabase gen types typescript` would produce.
- `lib/supabase/server.ts` (`createServiceClient`) and `lib/supabase/client.ts`
  (`createBrowserSupabaseClient`).
- `auth.ts` — NextAuth v5 config: Google OAuth provider with Gmail readonly
  scope, single-account restriction (`dewlearns@gmail.com` only), JWT session
  with `userId`, `signIn` callback upserts into `users`.
- `types/next-auth.d.ts` — module augmentation for `session.user.id`.
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handlers.
- `proxy.ts` — Next.js 16 middleware replacement, protects all routes except
  `/login` and `/api/auth/*`.
- `app/(auth)/login/page.tsx` — login page with Google sign-in button and
  "unauthorized account" error message.
- `app/(dashboard)/layout.tsx` + placeholder pages for feed, digest,
  watchlist, conflicts, correlations, search, settings.
- `app/page.tsx` — redirects `/` to `/feed`.

**Update (later same session):** the `never[]` error described below is now
**FIXED** (root cause found and resolved — see postmortem). One unrelated,
much smaller type error remains in `auth.ts`'s `session` callback. See
"Known Issues" and "Next Session Must" for current status.

~~**Blocked on:** `npm run build` fails in `auth.ts` at the `.upsert()` call in
the `signIn` callback:~~

```
./auth.ts:39:11
Type error: Object literal may only specify known properties, and 'email'
does not exist in type 'never[]'.
```

~~This means `Database["public"]["Tables"]["users"]["Insert"]` (or the whole
generic) is resolving to `never` when passed through
`createClient<Database>()` / `SupabaseClient<Database, ...>`.~~ (Resolved —
see postmortem.)

### Deviations from spec
- **Next.js 14 → 16.2.9** (React 19.2.4). Next 16 has several breaking changes
  relevant to this project:
  - `middleware.ts` → `proxy.ts`, exporting `proxy` (or default export),
    nodejs runtime only. Implemented this way.
  - `cookies()`, `headers()`, `params`, `searchParams` are all async/Promise
    now — `app/(auth)/login/page.tsx` types `searchParams` as
    `Promise<{ error?: string }>` and awaits it.
- Phase 1 acceptance criteria mentions "15 tables"; the spec actually
  specifies 16 (duplicate "4.14" heading covers both `token_usage` and
  `processing_log`). All 16 are in `0001_init.sql`. Flagging per spec rule 2
  (schema changes must be flagged) even though this is additive, not a change.

## Acceptance Criteria Status (checked 2026-06-13)

Per SPEC.md Section 15, Phase 1 acceptance criteria: "Kevin can log in at
markets.dew.codes, session persists, Supabase dashboard shows the 15 tables
with RLS enabled." Checked directly:

- **Login at markets.dew.codes:** ❌ FAIL — `curl https://markets.dew.codes`
  returns `HTTP 000` (no response). No Vercel project exists locally (no
  `.vercel/` dir, no `vercel` CLI), so nothing has ever been deployed.
- **Session persists:** ❌ N/A — cannot test, nothing is deployed or running.
- **Supabase shows tables with RLS enabled:** ❌ FAIL — queried
  `{SUPABASE_URL}/rest/v1/` with the service-role key; `definitions` is
  `[]`. **Zero tables exist in the live Supabase project.**
  `supabase/migrations/0001_init.sql` has been written but never executed
  against the actual database.

**Conclusion: Phase 1 is not done, independent of the `never[]` TypeScript
error.** Even after that error is fixed, Phase 1 still requires:
1. Running `0001_init.sql` (then `0002_seed_source.sql` after first login)
   against the live Supabase project via the SQL editor.
2. Creating a Vercel project, configuring all env vars from `.env.local`,
   deploying, and pointing `markets.dew.codes` at it (DNS + Vercel domain
   config).
3. Logging in against the live deployment and confirming the session
   survives a page refresh.

These are manual/dashboard steps that need Kevin's Supabase and Vercel/DNS
access — batch them into one instruction set once the build passes locally.

## Known Issues

1. **Build-blocking TypeScript error (`never[]` in `auth.ts`)** — see postmortem
   below. Unresolved.
2. `/Users/kevinyongcj/Programming/dew-news/scratch-test.ts` is a temporary
   debug file at the project root, **not** gitignored. Must be deleted before
   the Phase 1 commit.
3. Nothing has been run end-to-end (no `npm run build`, no dev server, no
   Supabase migration applied, no Vercel deploy) because of issue #1.

### Postmortem: `never[]` TypeScript error in `auth.ts`

**Symptom:** `createClient<Database>(...)` (in `lib/supabase/server.ts`) causes
every `.from("<table>").upsert(...)` / `.insert(...)` / `.select(...)` call to
resolve its payload/row type to `never` (or `never[]`), so any object literal
passed to `.upsert()` fails to type-check no matter what it contains.

**Attempts made, in order, and outcomes:**

1. Added a `Table<Row, Insert, Update> = { Row; Insert; Update; Relationships: [] }`
   helper and used it for all 16 tables in the `Database` type, to satisfy
   postgrest-js's `GenericTable.Relationships: GenericRelationship[]`
   requirement. **Did not fix** the error.
2. Changed `Database["public"]["Views"|"Functions"|"Enums"]` from
   `Record<string, never>` to `{ [_ in never]: never }`, on the theory that
   `keyof Record<string, never>` resolving to `string` was breaking the
   `from()` overload resolution. **Did not fix** the error.
3. Changed the `Insertable<Row, K>` helper from
   `Pick<Row, K> & Partial<Omit<Row, K>>` to
   `{ [P in K]: Row[P] } & { [P in Exclude<keyof Row, K>]?: Row[P] }`, on the
   theory that intersection types weren't satisfying
   `Record<string, unknown>` in `GenericTable`. Verified with
   `npx tsc --noEmit ./scratch-test.ts` — **identical error, unchanged**.
4. As a one-off experiment, rewrote `UsersInsert` as a plain `interface`
   instead of `Insertable<UsersRow, "...">` (the other 15 tables were left
   using `Insertable<...>`). Verified — **identical error, unchanged**.

   **Conclusion: hypotheses 3 and 4 (the shape of `Insertable<Row, K>` / the
   `*Insert` types) are disproven.** The error is identical before and after
   both changes, which means the `Insert` type structure for individual
   tables is not the cause. The `never` is being produced upstream of the
   per-table types — somewhere in how `Database` itself is declared, or how
   it's passed to `createClient`/`SupabaseClient`.

5. Based on that conclusion, two remaining suspects were identified:
   - **(a)** `createServiceClient()` in `lib/supabase/server.ts` returns
     `createClient<Database>(...)` with **no explicit return type
     annotation** — the return type is inferred rather than stated as
     `SupabaseClient<Database>`. Confirmed via
     `grep -n "createServiceClient\|SupabaseClient\|createClient" lib/supabase/server.ts`:
     only `createClient<Database>(...)` appears, no `SupabaseClient<Database>`
     annotation anywhere.
   - **(b)** The top-level shape of `Database` in `types/database.ts` did not
     match what's expected. Confirmed via `head -20 types/database.ts`: at the
     time of the check, `Database` was declared as
     `export interface Database { public: { ... } }` near the bottom of the
     file, not as `export type Database = { public: { Tables: {` at the top.

6. **Edit made but NOT YET VERIFIED**: changed
   `export interface Database { public: {...} }` to
   `export type Database = { public: {...} };` (closing brace updated to
   `};`). `Views`/`Functions`/`Enums` are currently
   `{ [_ in never]: never }`. This edit has **not** been checked with `tsc` or
   `npm run build` — the session was paused before verification could run.

## Next Session Must

1. Run `npx tsc --noEmit` (or `npm run build`) as the **first** action to
   check whether the `interface` → `type` edit to `Database` in
   `types/database.ts` (item 6 above) resolved the `never[]` error.
2. If the error persists, apply suspect (a): give `createServiceClient()` in
   `lib/supabase/server.ts` an explicit return type of
   `SupabaseClient<Database>` (import `SupabaseClient` from
   `@supabase/supabase-js`), then re-run `tsc --noEmit` once.
3. Once `auth.ts` type-checks, run `npm run build` for the whole project and
   fix any remaining errors.
4. Delete `/Users/kevinyongcj/Programming/dew-news/scratch-test.ts` before
   committing.
5. Resume the original Phase 1 checklist: verify `proxy.ts` route protection,
   verify the login page and dashboard placeholder pages render, commit Phase
   1 code, then produce the single batched instruction set for Kevin covering
   (a) running `0001_init.sql` and `0002_seed_source.sql` in the Supabase SQL
   editor, and (b) Vercel project creation, environment variables, and the
   `markets.dew.codes` custom domain.
6. Update this file's "Completed Phases" / "Current Phase" / "Known Issues"
   sections once the build passes and Phase 1's acceptance criteria are met.
