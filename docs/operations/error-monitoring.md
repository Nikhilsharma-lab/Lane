# Error monitoring (GlitchTip)

> Launch plan decision 13 (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`): error monitoring on a free tier. Lane uses GlitchTip, which speaks the Sentry protocol, through `@sentry/nextjs`. Added 2026-10-19.

**Where:** GlitchTip organisation `lane`, project `Lane` (id 28916): https://app.glitchtip.com/lane/issues?project=28916

## What is wired

| Piece | File | Notes |
| --- | --- | --- |
| Server init (Node and Edge) | `src/instrumentation.ts` | `register()` calls `Sentry.init` with the shared options. `onRequestError` is Next's own hook for uncaught errors in Server Components, Server Actions and route handlers. |
| Shared options | `src/lib/error-reporting.ts` | Pure, tested. Off without a DSN. Tracing off. Every `dataCollection` category off except the URL path, method and three harmless request headers. `scrubEvent` drops cookies, auth headers and the user block again in `beforeSend`. |
| Browser reporting | `src/lib/report-client-error.ts` | Called from `src/app/error.tsx` and `src/app/global-error.tsx` only. The browser SDK is imported on demand after an error, so it is not on any route's first load (2 KB per-route budget, `scripts/bundle-baseline.mjs`). Measured 2026-10-19: one separate 179 KB gzip chunk, fetched only once a boundary has already shown its fallback. |
| CSP | `src/lib/security-headers.ts` | The DSN's origin (`https://app.glitchtip.com`) joins `connect-src` only when the DSN is set. |
| Env | `NEXT_PUBLIC_SENTRY_DSN` | `.env.example` documents it. The boot check (`src/lib/env.ts`) warns, but does not fail, when production has none. |

Not wired on purpose: `withSentryConfig` and source-map upload (the Sentry CLI postinstall is disabled in `pnpm-workspace.yaml`), the tunnel route (AGENTS.md: no new routes without approval), session replay, performance tracing, user identification.

## Setting the DSN

1. GlitchTip → `lane` → Settings → Projects → Lane → Client Keys (DSN). The DSN looks like `https://<key>@app.glitchtip.com/28916`. It is public by design: the browser needs it, and it can only create events.
2. Locally: `NEXT_PUBLIC_SENTRY_DSN=...` in `.env.local`. Leave it unset to send nothing.
3. Vercel: add `NEXT_PUBLIC_SENTRY_DSN` to the staging and production projects (Nikhil's write). Vercel's system variables supply `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA`, which become the event's environment and release.

## Checking it works

A thrown error in any Server Action or page appears under Issues within a few seconds, tagged with the environment. The browser path fires only from the two root error boundaries, tagged `boundary: workspace` or `boundary: root-layout`.

## Why these privacy settings

Sentry SDK v11 collects user info, cookies, request bodies, query parameters, AI prompt inputs and outputs, database query data and stack-frame local variables by default. In Lane that would send a Request's description (through the AI gate) and the Clerk session cookie with every error. "Support, not surveillance" (AGENTS.md) rules all of that out, so every category is set to off, and the test file pins it.
