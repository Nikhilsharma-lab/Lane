# Research: what makes Lane's stack load and respond instantly (#226)

Question: what makes an app on Lane's stack (Next.js 16 App Router, React 19, Clerk, Supabase Postgres through Drizzle, Vercel) load and respond instantly, and which of those techniques Lane already uses?
Scope: each technique, what it buys, what it costs, and whether Lane uses it today. Facts only, no decisions. No product code changed.
Snapshot: `main` at `3e6de934` (Next.js `16.3.8`, `react` `19.2.4`, `@clerk/nextjs` `^7.9.4`). Read on 2026-10-26.
Sources: the Next.js docs shipped in `node_modules/next/dist/docs/` (version-pinned, so they come first), plus Vercel, Clerk, Supabase and react.dev pages, and Clerk's own SDK source where its docs say nothing.

## Short answer

| Technique | What it buys | Lane today |
|---|---|---|
| Functions in the same region as the database | Each database round trip drops from cross-ocean to in-region | **Staging: yes (`hnd1`, Tokyo). Production: no. On 2026-10-26 it answered from `iad1` (Washington D.C.)** (see "Observed") |
| Fluid compute | Fewer cold starts; one warm instance serves many requests | Unknown from the repo (a dashboard setting); the 2026-10-10 plan still lists it as open |
| `CLERK_JWT_KEY` (verify sessions without a network call) | No fetch of Clerk's signing keys on a cold instance | Unknown from the repo (a Vercel env var); the plan still lists it as open |
| Transaction pooler (port 6543) + small client pool | Short serverless connections without exhausting Postgres | Yes (`prepare: false`, `max: 8`, `idle_timeout: 20`) |
| Prefetching on intent (hover/focus) | The next page is ready before the click | Yes: Request rows, previous/next, Inbox rows |
| `staleTimes` (client cache of visited pages) | Back and quick returns don't hit the server | Yes: 30 s for both `dynamic` and `static` |
| `loading.tsx` per route | Instant skeleton on click; enables prefetch of dynamic routes | Yes: 12 files |
| Streaming with `<Suspense>` | Slow parts don't hold up the rest of the page | Partly: 7 places (bell count, preview, quarter notes, billing, sign-in, Speed Insights, Web Vitals) |
| Parallel reads from session claims | One database round trip per page instead of a chain | Yes (`getMember` from Clerk claims, then `Promise.all`) |
| Optimistic updates | Changes show in the same frame | Yes: 9 files, plus a shared pending-changes layer above every page |
| Work after the response (`after()`) | Side work never delays the person | Yes (`src/lib/after-response.ts`) |
| Cache Components (Partial Prerendering) + Partial Prefetching | A static shell served at once on every route, prefetched once per route | No (`cacheComponents` is off) |
| `useLinkStatus` pending hint | Feedback on slow networks when prefetch hasn't finished | No |
| View transitions (`<ViewTransition>`) | Animated continuity between pages and loading states | No |
| Smaller client JavaScript | Faster first load and hydration | Measured and budgeted (`bundle:check`); smallest route still ships about 278 KB gzip |
| Self-hosted fonts (`next/font`) | No request to Google; no layout shift | Yes: Geist preloaded, Geist Mono not preloaded |
| Free tiers | n/a (cost) | Supabase Free pauses after 7 idle days; Vercel Hobby has no pre-warmed instances |

## Observed on 2026-10-26 (signed out, from one machine, served by Vercel's Mumbai edge `bom1`)

These are one-off `curl` checks, not measurements of signed-in pages. Vercel documents that `x-vercel-id` "contains a list of Vercel regions your request hit, as well as the region the function was executed in" ([response headers](https://vercel.com/docs/headers/response-headers#x-vercel-id)).

| URL | `x-vercel-id` (regions) | Time to first byte |
|---|---|---|
| `https://lane-staging.vercel.app/` | `bom1::hnd1` | 0.44 s |
| `https://lane-staging.vercel.app/requests/x` | `bom1::hnd1` | 0.48 s |
| `https://app.uselane.app/` (first call) | `bom1::iad1` | 2.26 s |
| `https://app.uselane.app/` (next two calls) | `bom1::iad1` | 0.59 s, 0.71 s |
| `https://app.uselane.app/requests/x` | `bom1::iad1` | 0.94 s |
| `https://app.uselane.app/api/notifications/unread` | `bom1::iad1` | n/a (401) |
| `https://app.uselane.app/login`, `/privacy` | `bom1` only (served from cache) | 0.52 s, 0.71 s |

- Production page functions ran in `iad1` (Washington D.C.). Staging ran in `hnd1` (Tokyo). Production's database pooler is `aws-1-ap-northeast-1.pooler.supabase.com` (Tokyo) per `docs/SESSION-STATE.md:316`.
- `vercel.json` has had `"regions": ["hnd1"]` since `1fd5637d` (2026-10-10). Vercel says `vercel.json` settings override the dashboard ([Fluid compute: order of precedence](https://vercel.com/docs/fluid-compute#order-of-settings-precedence)), and new projects default to `iad1` ([function regions](https://vercel.com/docs/functions/configuring-functions/region)). Why the production deployment runs in `iad1` is not visible from the repo. Production deployments are made from the CLI (`main` auto-deploys are off, `vercel.json`), and `/inbox` answered 404 on production, so production runs an older build than `main`.
- The signed-out pages above only read Clerk claims and redirect; they make no database call. A signed-in page in `iad1` makes each database round trip to Tokyo. The 2026-10-10 plan estimated about 150 ms per round trip from the US and about 2 ms in-region, and Mark Done at about 1.9–2.2 s from US East against about 0.3–0.4 s from `hnd1` (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md:154,251`). Those are the plan's estimates, not measurements made here.

## 1. Server next to the database (function region)

- **What it buys.** Vercel: "the physical distance between your function and its data source can impact latency", so set functions "close to your data source". Functions "should be executed in the same region as your database" ([regions](https://vercel.com/docs/regions#compute-defaults)).
- **What it costs.** Hobby allows a single function region, Pro 5, Enterprise all ([function regions: limits](https://vercel.com/docs/functions/configuring-functions/region#limits)). One region means users far from it pay the distance once per page (browser to region) rather than once per query. Vercel's edge (126 points of presence) carries the request to the region over its private network ([regions](https://vercel.com/docs/regions#global-infrastructure)).
- **Region codes.** `hnd1` is Tokyo (`ap-northeast-1`), `bom1` is Mumbai (`ap-south-1`), `iad1` is Washington D.C. ([region list](https://vercel.com/docs/regions#region-list)). Supabase offers `ap-northeast-1` (Tokyo) and `ap-south-1` (Mumbai) ([Supabase regions](https://supabase.com/docs/guides/platform/regions)). Supabase's page does not say whether a project's region can be changed after creation.
- **Lane today.** `vercel.json` pins `hnd1`. Staging and production databases are in Tokyo (`ap-northeast-1`). Staging functions run in `hnd1`. Production functions answered from `iad1` on 2026-10-26 (see "Observed").

## 2. Cold starts: Fluid compute, Hobby vs Pro

- **What Fluid compute buys.** Several requests share one instance ("optimized concurrency"), bytecode caching on Node.js 20+ in production, and "function pre-warming on production deployments". On by default for projects created since 2025-04-23; older projects turn it on in the dashboard or with `"fluid": true` in `vercel.json` ([Fluid compute](https://vercel.com/docs/fluid-compute)).
- **Hobby vs Pro.** Vercel's cold-start guide: "On paid plans, production deployments keep instances warm and ready". Functions "archive after two weeks idle in production and 48 hours in preview", and archived functions "add at least one second of latency on the first invocation after an idle period". Startup time grows with function size; "large dependencies take longer to parse and evaluate" ([cold-start guide](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel)). Fluid default and maximum duration on Hobby is 300 s; Pro is 300 s default, up to 800 s ([Fluid compute: default settings](https://vercel.com/docs/fluid-compute#default-settings-by-plan)).
- **Hobby limits that touch speed tooling.** 4 active CPU-hours, 1,000,000 invocations, 10,000 Speed Insights events per 30 days; over a limit, "you will have to wait until 30 days have passed". Hobby is for "non-commercial, personal use only" ([Hobby plan](https://vercel.com/docs/plans/hobby)).
- **Lane today.** Vercel Hobby (AGENTS.md). The `(app)` layout exports `maxDuration = 30`. Whether Fluid compute is on is a dashboard setting, not visible in the repo. The plan's checklist still has "Fluid compute is on, or `maxDuration` is set" unticked (`2026-10-10-mvp-launch-linear.md:281`). The first production call in "Observed" took 2.26 s; the next two took 0.59 s and 0.71 s.

## 3. Clerk: proxy and `auth()` cost per request

- **Session tokens are short.** Clerk's session token "expires after 60 seconds"; the browser SDK refreshes it about every 50 seconds ([how Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)).
- **Verification.** With `CLERK_JWT_KEY` (or `jwtKey`), the token is verified "in a networkless manner" ([`clerkMiddleware`](https://clerk.com/docs/reference/nextjs/clerk-middleware)). Without it, Clerk's backend SDK fetches the signing keys from Clerk's Backend API and keeps them in the instance's memory for 5 minutes (`loadClerkJWKFromRemote` and `MAX_CACHE_LAST_UPDATED_AT_SECONDS = 5 * 60` in `@clerk/backend` 3.18.1, `dist/chunk-R4AMSIE3.mjs`). Each new instance therefore makes that fetch once.
- **Expired token on a full page load.** When the cookie's token has expired on a `GET`, the SDK first tries a server-side refresh (a call to Clerk), and otherwise sends the browser through a "handshake" redirect to Clerk and back (`handleSessionTokenError` / `isRequestEligibleForRefresh` in the same file; [how Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)). A client-side navigation inside the app keeps the token fresh in the browser, so this applies to full loads, such as opening a link after more than 60 s away.
- **`currentUser()` is a network call.** It calls `GET /v1/users/{user_id}` and "counts toward the Backend API request rate limit" ([`currentUser`](https://clerk.com/docs/reference/nextjs/app-router/current-user)). `auth()` reads the verified token's claims.
- **Where the proxy runs.** Next.js 16 renamed Middleware to Proxy; it defaults to the Node.js runtime and "is not intended for slow data fetching" (`01-app/01-getting-started/16-proxy.md`, `03-file-conventions/proxy.md`). Vercel "deploys Routing Middleware to all regions by default … On the Hobby plan, Routing Middleware runs in fewer regions" ([function regions: limits](https://vercel.com/docs/functions/configuring-functions/region#limits)). Without a matcher it runs on every request, including static files ([Routing Middleware](https://vercel.com/docs/routing-middleware#path-matching)).
- **Lane today.** `src/proxy.ts` is `clerkMiddleware()` with a matcher that skips `_next` and static files; it protects nothing itself (pages and actions guard their own data). `getMember()` reads only `auth()` claims and is wrapped in React `cache`, so the layout and page share one call. `getWorkspace()` calls `currentUser()` only on the onboarding path and `clerkClient()` only the first time Lane sees a workspace. `CLERK_JWT_KEY` is unverified from the repo; the plan's checklist still has "`CLERK_JWT_KEY` is set" unticked (`2026-10-10-mvp-launch-linear.md:282`).

## 4. Database connections: pooler, pool size, free tier

- **Pooler modes.** Supabase's shared pooler (Supavisor) in transaction mode, port 6543, is the option "for serverless and edge functions". It does not support prepared statements, so the driver must turn them off. A dedicated pooler next to the database is "available only on paid plans" and is the "lower-latency option" ([connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)).
- **Free tier.** "Free projects are paused after 1 week of inactivity." Free gives 500 MB database, shared CPU with 500 MB RAM, 5 GB egress, 2 active projects, no automatic backups. Pro is from $25/month, is never paused, and includes a Micro instance ([pricing](https://supabase.com/pricing)). Free projects run on Nano (shared CPU, up to 0.5 GB; 60 direct and 200 pooler connections; 250 baseline IOPS against Micro's 500) ([compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk)).
- **Vercel pool helper.** Lane's `src/db/index.ts` notes that Vercel's `attachDatabasePool` supports pg-style pools, not the `postgres` driver's client, and throws for it.
- **Lane today.** `DATABASE_URL` uses the Tokyo transaction pooler on 6543 (`SESSION-STATE.md:316`). The client is created lazily, once per instance, with `prepare: false`, `max: 8`, `idle_timeout: 20`, `connect_timeout: 10`, and verified TLS. A query counter records queries per request. Both Supabase projects are on Free. `src/app/error.tsx` and the other error boundaries exist so that a paused database shows an error screen rather than a crash (plan item 1.12).

## 5. Prefetching and the client cache (`staleTimes`)

- **Default behaviour without Cache Components.** A static route is prefetched in full and kept 5 minutes. A dynamic route is prefetched only down to its first `loading.js`, and its page is not kept unless `staleTimes.dynamic` is set; a click still makes a server round trip, streamed after the shell (`02-guides/prefetching.md`). Automatic prefetching runs only in production. Sibling navigations reuse the shared layout and fetch only the changed page.
- **`staleTimes`.** `dynamic` (default 0 s) applies to pages that are neither static nor fully prefetched. `static` (default 5 min) applies to static pages, `prefetch={true}` and `router.prefetch`. It is still marked experimental. It "doesn't change back/forward caching" (`05-config/01-next-config-js/staleTimes.md`).
- **Manual prefetch.** `router.prefetch()` on hover or focus warms routes outside the viewport; going around `<Link>` "opts you into maintaining prefetching and cache invalidation" (`02-guides/prefetching.md`).
- **Side effects.** Layouts and pages run when prefetched, so side effects in them run on prefetch, not on visit (same guide, "Troubleshooting").
- **Lane today.** `staleTimes: { dynamic: 30, static: 30 }`; the comment says 30 s stops a full prefetch from showing a stale status for 5 minutes. `src/components/requests/use-intent-prefetch.ts` does a full `router.prefetch` after the pointer rests 80 ms, or at once on press or focus, once per href. Used by list title links (`tasks/columns.tsx`), keyboard-focused rows (`request-row.tsx`), previous/next on detail (`detail-sequence.tsx`, which also prefetches both neighbours when idle), and Inbox rows. List links also keep Next's default viewport prefetch, the only prefetch phones get.

## 6. `loading.tsx`, streaming and `<Suspense>`

- **What `loading.tsx` buys.** Its fallback is prefetched, so navigation is "immediate unless prefetching hasn't completed"; shared layouts stay interactive. It wraps `page.js` and nested layouts, but "does **not** wrap the `layout.js` … in the same segment". If a layout reads runtime data (cookies, headers, uncached queries) without Cache Components, "navigation blocks until the layout finishes rendering" (`03-file-conventions/loading.md`).
- **What streaming buys.** Time to first byte falls to the time to render layouts and fallbacks; each `<Suspense>` boundary hydrates separately, which helps interaction (INP). Keep the largest element (LCP) outside boundaries, and size skeletons to the content to avoid layout shift (CLS) (`02-guides/streaming.md`, "Streaming and Web Vitals"). Vercel "supports streaming natively" (same guide).
- **What it costs.** "If there's a Suspense boundary, React might use it", even when you didn't expect it, under a slow network or busy CPU (same guide). An `await` at the top of a layout makes everything below it wait ("Push dynamic access down").
- **Lane today.** 12 `loading.tsx` files: `(app)`, inbox, intake, impact, request detail, each settings page, login, signup, onboarding. The `(app)` layout awaits `getMember()`, then `getWorkspace()`, projects, labels and saved views in parallel before rendering. Moving between pages inside `(app)` reuses this layout, but a full page load waits for it. The Needs-you count is deliberately not awaited; it streams into the Suspense-wrapped bell. The list (`/`) and detail pages each await their data in one `Promise.all` (one round trip), with no inner Suspense sections.

## 7. Cache Components, Partial Prerendering and Partial Prefetching (Next.js 16)

- **What it is.** `cacheComponents: true` makes data dynamic by default; `"use cache"` marks what may be cached. Next.js "prerenders a static HTML shell that is served immediately while dynamic content streams in". It turns on Partial Prerendering, which no longer has a separate flag. It requires the Node.js runtime. Under it, Next.js keeps recently visited routes mounted but hidden with React `<Activity>`, so form inputs and open sections survive Back (`05-config/01-next-config-js/cacheComponents.md`).
- **Partial Prefetching** (`partialPrefetching: true`, new in 16.3.0, needs Cache Components). Links prefetch one reusable "App Shell" per route instead of one prefetch per link. Routes that read cookies get a shell cached per session in the browser. Invalidations (`revalidateTag`, `revalidatePath`) refresh prefetches (`partialPrefetching.md`; `02-guides/prefetching.md`).
- **"Instant" as Next.js defines it.** The new page starts rendering on click, with static, cached and fallback content at once, and the rest streams in. This "assumes caches are warm". In development, Cache Components checks every page and flags what would block a navigation. `@next/playwright` has an `instant()` helper for tests (`02-guides/instant-navigation.md`).
- **Signed-in apps.** A session read "can't be prerendered into the static shell"; signed-in UI streams behind `<Suspense>`. `"use cache: private"` can cache session-dependent results in the browser only. The guide says to keep the session read out of a layout's top level. `export const instant = false` lets a route keep blocking while it is migrated (`02-guides/authentication-with-cache-components.md`).
- **What it costs.** Route segment configs `dynamic`, `revalidate` and `fetchCache` are replaced by `"use cache"` and `cacheLife` (`02-guides/migrating-to-cache-components.md`). Reading `cookies()` outside a boundary becomes a build error. With the default in-memory handler on serverless, runtime cache entries "typically don't persist across requests", and no cache survives a new deploy. `"use cache: remote"` is durable but adds a network round trip and "typically incurs platform fees" (`01-directives/use-cache.md`, `use-cache-remote.md`). The client router enforces "a minimum 30-second stale time" for cached content (`use-cache.md`). Activity keeps hidden pages mounted, which changes how dropdowns, dialogs and tests behave (`cacheComponents.md`).
- **Lane today.** Not enabled. Lane uses no `"use cache"`, `cacheTag` or `unstable_cache`, and exports no `dynamic`, `revalidate` or `fetchCache` segment config (only `maxDuration`). Every signed-in page reads the Clerk session through `auth()`.

## 8. Optimistic updates and transitions (React 19)

- **What `useOptimistic` buys.** It shows a temporary value "while an Action is in progress"; when the Action ends, real and optimistic state "converge in the same render". If the Action throws, React renders whatever the real value is, which reverts the change. The setter "must be called inside an Action" or `startTransition`, otherwise React warns ([useOptimistic](https://react.dev/reference/react/useOptimistic)).
- **What it costs.** The real value must come back from the server (for example a refresh) for the change to stay. Failures need their own message.
- **Lane today.** `useOptimistic` in 9 files: lifecycle buttons, intake form, profile role, inbox screen, request reviews, selection, journey change, moves, and `use-optimistic-action.ts`. `PendingMutationsProvider` above every `(app)` page holds pending Request changes so that a navigation mid-action does not show the row revert (plan item 1.5). The shared helper refreshes the page only on failure; a lint rule bans `router.refresh()` elsewhere. `callAction` (`src/lib/action-call.ts`) gets a fresh Clerk token and retries once if the session looks expired. Lifecycle optimistic UI was un-deferred on 2026-10-10 as a launch requirement (`DEFERRED.md:43`, `REQUIREMENTS.md:1147`). `lane-roadmap.md:204` still lists it as deferred.

## 9. Pending feedback on slow networks (`useLinkStatus`)

- **What it buys.** "On slow or unstable networks, prefetching may not finish before the user clicks", so the `loading.js` fallback may not show at once. `useLinkStatus` exposes `pending` for a link so the UI can show a hint, and the hint can be delayed (for example 100 ms) so it appears only on slow navigations (`01-getting-started/04-linking-and-navigating.md`, "Slow networks").
- **Lane today.** Not used.

## 10. View transitions

- **What it buys.** React's `<ViewTransition>` uses the browser's View Transitions API to morph shared elements between pages, animate a skeleton into content, and slide forward or back. It "work[s] in the App Router with no configuration", and navigations are transitions, so it triggers on navigation. It needs Chromium 125+ or recent Safari and Firefox; "without browser support, your application works normally" (`02-guides/view-transitions.md`).
- **What it costs.** Only Transitions, `<Suspense>` reveals and `useDeferredValue` trigger it; a plain `setState` does not. "React doesn't automatically disable animations" for reduced motion; that needs a `prefers-reduced-motion` rule ([ViewTransition](https://react.dev/reference/react/ViewTransition)). react.dev's examples pin a 19.3 canary. Next.js 16.3.8 bundles React `19.3.0-canary-cbb046ab-20260731`, which includes `ViewTransition` (`node_modules/next/dist/compiled/react`). Lane's `react` package (19.2.4) is not what the App Router runs.
- **Lane today.** Not used. Lane uses `motion` v14 in 38 files.

## 11. Client JavaScript size

- **Why it matters.** Next.js splits code by route and loads only that route's code. Client Components ship their code to the browser; work that needs no browser APIs can run as a Server Component instead. `next/dynamic` loads code on demand. `optimizePackageImports` trims libraries with many exports, and `lucide-react` is already optimized by default (`02-guides/package-bundling.md`, `02-guides/lazy-loading.md`, `optimizePackageImports.md`). Each `<Suspense>` boundary hydrates separately (`02-guides/streaming.md`).
- **Lane today.** `pnpm bundle:check` compares each route's first-load JavaScript (gzip) with `docs/design-system/bundle-baseline.json` (updated 2026-10-26) and fails if a route grows more than 2 KB. Baseline: `/` 497 KB, `/requests/[id]` 494 KB, settings pages 463–469 KB, `/impact` 449 KB, `/inbox` 438 KB, `/intake` 429 KB, sign-in pages about 298–310 KB, `/privacy` and `/terms` 282 KB, `/_not-found` 278 KB. Even the static legal pages carry about 280 KB, which is the root layout's shared floor. The root layout wraps everything in `ClerkProvider` with `ui={ui}` (Clerk's UI bundled from `@clerk/ui` instead of its CDN build), `ThemeProvider`, the toast stack, Web Vitals and Speed Insights. 171 of 233 `.tsx` files contain `"use client"` (the inventory's 156 of 232 counts the directive at the top of the file only). 15 places load code lazily. The list and detail routes are separate modules so neither carries the other's code (plan item 2.12).

## 12. Fonts

- **What `next/font` buys.** It self-hosts fonts from the deployment's own domain, so "no requests are sent to Google by the browser", with no layout shift (`01-getting-started/13-fonts.md`).
- **Lane today.** `src/lib/fonts.ts`: Geist (`display: "swap"`, preloaded) and Geist Mono (`preload: false`, since no screen renders mono text yet).

## 13. Measurement already in place

- `src/components/web-vitals.tsx` logs Web Vitals in development only. `src/components/speed-insights.tsx` sends field data from `app.uselane.app` only (decision 8.13). Speed Insights on Hobby is capped at 10,000 events per 30 days ([Hobby plan](https://vercel.com/docs/plans/hobby)).
- `src/db/query-counter.ts` counts queries per request.
- The 2026-10-10 plan says speed claims must be measured on a production build, from India, with warm and cold measured separately (cold is the first request after 15 minutes idle). Local `next dev` timings do not count (`2026-10-10-mvp-launch-linear.md:113`).

## Open facts this research could not settle

- Why production functions run in `iad1` although `vercel.json` says `hnd1`. The deployment summary in the Vercel dashboard shows the region.
- Whether Fluid compute is on for the `lane` and staging projects, and whether `CLERK_JWT_KEY` is set (Vercel dashboard).
- Which region Lane's Clerk proxy runs in on Hobby (Vercel only says "fewer regions").
- What makes up the roughly 280 KB shared first-load floor. `next build` with the experimental bundle analyzer (`02-guides/package-bundling.md`) would show it.
