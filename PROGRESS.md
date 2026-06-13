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

**Update (later same session):** both the `never[]` error and the follow-up
`{}`/`session` callback error described below are now **FIXED**.
`npx tsc --noEmit` and `npm run build` both pass cleanly — all 12 routes
build successfully (see postmortems for root causes). See "Known Issues" and
"Next Session Must" for current status.

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

1. ~~**Build-blocking TypeScript error (`never[]` in `auth.ts`)**~~ — **FIXED**,
   see postmortem below.
2. ~~**`Type '{}' is not assignable to type 'string'` in `auth.ts`'s `session`
   callback**~~ — **FIXED**, see Postmortem 2 below.
3. ~~`scratch-test.ts` temporary debug file~~ — deleted (created and removed
   again during Postmortem 2's investigation).
4. `npx tsc --noEmit` and `npm run build` both pass with **zero errors** as of
   this session. Dev server smoke-test (local, unauthenticated) passed:
   `/`, `/feed`, `/digest`, `/watchlist`, `/conflicts`, `/correlations`,
   `/search`, `/settings` all 307-redirect to `/login` via `proxy.ts`;
   `/login` renders 200 with "Sign in with Google"; `/api/auth/providers`
   returns the Google provider config (correctly excluded from proxy
   protection). Supabase migration has been run against the new project
   (`hylhjbtxjewuvdrhgarn`, 16 tables confirmed via PostgREST) but Vercel
   deploy and live login (actual OAuth flow) have not been verified — see
   "Acceptance Criteria Status" (note: that section is stale, written against
   the OLD Supabase project).

### Postmortem: `never[]` TypeScript error in `auth.ts` (RESOLVED)

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
     `SupabaseClient<Database>`.
   - **(b)** The top-level shape of `Database` in `types/database.ts` did not
     match what's expected (`export interface Database { public: {...} }`
     instead of `export type Database = { public: {...} }`).

6. **Both (a) and (b) were applied — neither was the actual fix.** After
   applying both, `npx tsc --noEmit` still showed the identical `never[]`
   errors. The **actual root cause** (found by writing a minimal repro):

   ```ts
   interface RowAsInterface { id: string; email: string; }
   type RowAsType = { id: string; email: string; };
   type Check1 = RowAsInterface extends Record<string, unknown> ? true : false; // false
   type Check2 = RowAsType extends Record<string, unknown> ? true : false;      // true
   ```

   Every `*Row` / `UsersInsert` type in `types/database.ts` was declared as
   `export interface X { ... }`. TypeScript `interface` declarations do
   **not** satisfy `extends Record<string, unknown>` in a conditional type
   check — even when structurally identical to a `type` alias that does. Since
   postgrest-js's `GenericTable` requires `Row`/`Insert`/`Update` to extend
   `Record<string, unknown>`, every table's `Schema` collapsed to `never`,
   and the whole `Database["public"]` resolved to `never`.

   **Fix applied:** converted all 17 `interface` declarations
   (`UsersRow`, `UsersInsert`, `EntitiesRow`, `SourcesRow`, `FetchRunsRow`,
   `DigestsRow`, `ItemsRow`, `ItemEntitiesRow`, `WatchlistRow`,
   `AnnotationsRow`, `ConflictsRow`, `CorrelationsRow`, `SummariesRow`,
   `ConflictsInSummariesRow`, `TokenUsageRow`, `ProcessingLogRow`,
   `SettingsRow`) to `export type X = { ... };` via a one-off script.
   (`ItemSentence`, a nested type used inside `ItemsRow.sentences`, was
   correctly left as an `interface` — it doesn't need to satisfy
   `Record<string, unknown>`.)

   **Result:** the `never[]` errors at `auth.ts:39` and `auth.ts:62` are
   **gone**, confirmed via `npx tsc --noEmit`. The `SupabaseClient<Database>`
   return-type annotation on `createServiceClient()` (suspect (a)) was kept
   in `lib/supabase/server.ts` as a correctness improvement even though it
   wasn't the fix.

### Postmortem 2: `Type '{}' is not assignable to type 'string'` in `auth.ts` (RESOLVED)

**Symptom:** After the fix above, `npx tsc --noEmit` shows exactly one
remaining error:

```
auth.ts(70,9): error TS2322: Type '{}' is not assignable to type 'string'.
```

In the `session` callback:

```ts
async session({ session, token }) {
  const userId = token.userId;
  if (userId && session.user) {
    session.user.id = userId;   // <-- line 70: error here
  }
  return session;
},
```

**Investigation so far:**
- Confirmed (via deliberate `const _debug: never = ...` type-error probes)
  that, *unnarrowed*: `token: JWT`, `token.userId: string | undefined`,
  `session.user: AdapterUser & { id: string } & User`, and
  `session.user.id: string`.
- Inside `if (userId && session.user)`, the narrowed type of `userId`
  collapses to `{}` instead of `string` — confirmed whether narrowing
  `token.userId` directly or via a local `const userId = token.userId`.
- A minimal repro (`interface Base extends Record<string, unknown> { foo?: string }`,
  then `if (b.foo) { const y: string = b.foo }`) did **NOT** reproduce the
  `{}` collapse — so this is not simply "optional string on a
  `Record<string, unknown>`-extending interface narrowed with `&&`" in
  isolation. There's something specific to the actual `JWT`/`Session` types
  here.
- Deleted stale `tsconfig.tsbuildinfo` — no change (rules out incremental
  cache staleness).
- Kevin's hypothesis: *"The `{}` collapse on `string | undefined` with `&&`
  is a symptom of a deeper type inference issue, not a narrowing bug. Check
  if `JWT` from `next-auth/jwt` is being imported from the wrong path or if
  there are two conflicting `JWT` type definitions in scope."*
- Checked for duplicate augmentations: `grep` across the project (excluding
  `node_modules`) for `declare module "next-auth"` / `interface JWT` /
  `interface Session` / `interface DefaultSession` — only **one** match,
  `types/next-auth.d.ts` (shown below). No duplicates found.
- Checked for duplicate package installs: searched `node_modules` for
  `*/node_modules/next-auth` and `*/node_modules/@auth/core` (nested copies)
  — only the top-level `node_modules/next-auth` and `node_modules/@auth/core`
  exist. No duplicate/conflicting installs found.

  This confirmed Kevin's hypothesis was on the right track — it was a
  type-level conflict, just not a *duplicate* declaration. See below.

**Root cause found:** `types/next-auth.d.ts` augmented
`declare module "next-auth/jwt" { interface JWT { userId?: string } }`. But
`next-auth/jwt.d.ts` is just `export * from "@auth/core/jwt"` — a **re-export**,
not a local declaration. Module augmentation via `declare module` requires the
target module to have its own declaration to merge with; re-exports don't
provide one. So this augmentation created an orphaned `JWT` interface scoped
to `"next-auth/jwt"` that never merged with the real `JWT` interface used by
`@auth/core`'s `session`/`jwt` callback signatures (which import `JWT` directly
from `@auth/core/jwt`, per `@auth/core/index.d.ts`).

As a result, `token.userId` in the callbacks fell through to `JWT`'s
`Record<string, unknown>` index signature and was typed as `unknown`. `unknown`
narrowed via `if (x && ...)` collapses to `{}` (a documented TS quirk — `unknown`
narrowed to "truthy" becomes `{}`, not a more specific type), hence
`Type '{}' is not assignable to type 'string'`.

**Verification:** built a minimal repro of the exact `NextAuth({ callbacks: { session(...) } })`
call in `scratch-test.ts`. Probing with deliberately-wrong type annotations
(`const _x: number = token.userId`) confirmed `token.userId: unknown`
unnarrowed and `{}` narrowed — reproducing the error exactly.

**Fix applied:** changed the augmentation target in `types/next-auth.d.ts`
from `declare module "next-auth/jwt"` to `declare module "@auth/core/jwt"`:

```ts
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
  }
}
```

(The `declare module "next-auth"` augmentation for `Session.user.id` was left
unchanged — `next-auth`'s own `index.d.ts` re-exports `Session` via
`export type { Session, ... } from "@auth/core/types"`, but separately
`@auth/core/index.d.ts` imports `Session` from `./types.js` directly for the
`session` callback, and empirically this augmentation already worked
correctly — only the `JWT`/`jwt` path was broken.)

**Result:** `token.userId` is now `string | undefined` and narrows to `string`
correctly. `npx tsc --noEmit` → zero errors. `npm run build` → succeeds, all
12 routes (`/`, `/_not-found`, `/api/auth/[...nextauth]`, `/conflicts`,
`/correlations`, `/digest`, `/feed`, `/login`, `/search`, `/settings`,
`/watchlist`, proxy/middleware) build cleanly. `scratch-test.ts` deleted again.

## Next Session Must

1. Start the dev server (`npm run dev`) and smoke-test locally: visit
   `/login`, confirm Google sign-in button renders, confirm `/feed` etc.
   redirect to `/login` when unauthenticated (via `proxy.ts`).
2. Resume the original Phase 1 checklist (TodoWrite items 7-10): verify
   `proxy.ts` route protection, verify the login page and dashboard
   placeholder pages render correctly.
3. Commit Phase 1 code (TodoWrite item 12) — working tree currently has
   uncommitted changes to `types/database.ts`, `types/next-auth.d.ts`,
   `lib/supabase/server.ts`, `auth.ts`, `.env.local` (gitignored), and this
   `PROGRESS.md`.
4. Re-verify Phase 1 acceptance criteria against the **current** state
   (the "Acceptance Criteria Status" section above is stale — written against
   the OLD, deleted Supabase project `vzbfzoqmjukdgrbtbsei` with zero tables):
   - Supabase: re-query `{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/` with the
     service-role key against the NEW project (`hylhjbtxjewuvdrhgarn`) and
     confirm all 16 tables + RLS.
   - Vercel: confirm whether a Vercel project/deployment now exists (env vars
     were configured conversationally this session but `npx vercel --prod`
     has not been run).
   - Login + session persistence: only testable once deployed (or via
     `npm run dev` locally with `NEXTAUTH_URL=http://localhost:3000`).
5. Once local smoke-test + acceptance criteria are addressed, produce the
   single batched instruction set for Kevin covering (a) running
   `0001_init.sql`/`0002_seed_source.sql` if not already applied to the new
   project, and (b) `npx vercel --prod` / Vercel domain config for
   `markets.dew.codes`.
6. Update "Completed Phases" / "Current Phase" / "Acceptance Criteria Status"
   once Phase 1's criteria are verifiably met.
