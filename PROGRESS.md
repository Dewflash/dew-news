# Build Progress

## Completed Phases
(none yet — Phase 1 deployed but awaiting DNS + login verification)

## Current Phase
Phase 1 — Foundation

---

## Deployment Status (as of 2026-06-17)

The app is deployed and running on Vercel. All routes serve correctly:
- `/login` → 200 OK
- `/feed` (unauthenticated) → 307 → `/login`
- All dashboard routes redirect to `/login` when no session

**Production URL:** https://dew-news-czghxm6gt-dewflash-s-projects.vercel.app  
**Target URL:** https://markets.dew.codes (Vercel-side configured, DNS pending)

### Remaining before Phase 1 is complete

1. **DNS CNAME** — add to your DNS provider:
   - Host: `markets`
   - Type: CNAME
   - Value: `cname.vercel-dns.com`

2. **Google OAuth redirect URI** — add to your Google Cloud Console OAuth client:
   - `https://markets.dew.codes/api/auth/callback/google`

3. **Supabase SQL** — run the two migrations if not already done:
   - `supabase/migrations/0001_init.sql` (all 16 tables + RLS)
   - `supabase/migrations/0002_seed_source.sql` (run after first login, depends on `users` row)

4. **Login test** — visit `markets.dew.codes`, sign in with `dewlearns@gmail.com`,
   confirm session persists on refresh, confirm Supabase `users` table has a row.

---

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
