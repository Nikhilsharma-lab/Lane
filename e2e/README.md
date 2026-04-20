# Playwright e2e tests

End-to-end browser tests for Lane's user flows, using
[@playwright/test](https://playwright.dev). These complement the existing
Vitest layer (pure-function tests in `test/*.test.ts`) and the pg-tap
layer (`test/sql/`) by exercising the full stack from browser → API →
DB → response.

## Scope

Tests in this directory cover the user flows in `docs/user-flows-spec.md`
§5-§11 (signup, invite create/accept, ownership transfer, member
remove/leave). The full A2-onward test matrix is in `docs/user-flows-spec.md`
§14.2 — ~12 Playwright tests across these flows.

## Running locally

```
npm run test:e2e
```

Playwright's `webServer` config (`playwright.config.ts`) auto-starts
`npm run dev` on port 3000 if no dev server is already running, and
reuses an existing one if you have it up. Tests run against the
`baseURL` (default `http://localhost:3000`, override via
`BASE_URL` env var).

To open the HTML report after a run:

```
npx playwright show-report
```

## CI

The `e2e` job in `.github/workflows/ci.yml` runs `npx playwright test
--pass-with-no-tests` on every PR and on push to main. Chromium is
cached between runs by Playwright version. HTML report uploaded as
artifact on every run.

## Naming convention

`<flow>.spec.ts` where `<flow>` is the user journey under test:

- `smoke.spec.ts` — sanity check that the harness can reach the app
- `signup.spec.ts` — `/signup` flow per spec §5
- `invite-accept.spec.ts` — invite acceptance per spec §7
- `ownership-transfer.spec.ts` — per spec §9
- etc.

## Fixtures

Reusable test fixtures live in `e2e/fixtures/`:

- Auth state (storageState files for pre-authenticated test users)
- Test user seeds (Supabase auth.users + Lane profiles for the
  per-flow scenarios)

Auth and email-catcher strategies are decided as part of A2 Step 3 —
see commit message and `docs/user-flows-spec.md` §15 Phase D for the
chosen approach once confirmed.

## Production safety

These tests run against `localhost:3000` (the dev server) which connects
to `lane dev` Supabase via `.env.local`. Tests never touch `lane app`
(production). The `run-sql-tests.mjs` runner pattern of hardcoding a
production project-ref guard could be ported here if needed in the
future, but Playwright's webServer + .env.local boundary already makes
prod-touching unlikely.
