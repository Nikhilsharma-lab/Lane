# Security Findings Implementation Plan

**Goal:** Repair SEC-01 through SEC-06 from the 11 October audit, preserving existing product behavior and the pending cleanup.

**Architecture:** Upgrade the affected framework; fail closed at the AI/database boundaries; apply the same Request visibility to every diagnostic query. Keep cancelled signed-upload reservations counted until expiry and a confirmed permanent empty object blocks reuse of the path. Storage work stays outside short database transactions. No new route, table, cron, or AI call.

**Tech stack:** Next.js 16, TypeScript, Clerk guards, Drizzle/PostgreSQL, Supabase Storage, Upstash, Vitest.

## Constraints

- User approved all six fixes with “fix these”; no second implementation approval is needed.
- Preserve pending cleanup and exclude the marketing submodule.
- Do not deploy or run hosted migrations in this local implementation pass.
- Back up and verify local `lane_test` before its existing destructive suite resets it. Run database suites sequentially.
- Record local verification separately from deployment verification.

## Tasks

- [x] SEC-01/06: pin Next.js and matching ESLint package to a verified patched 16.x release; update the lockfile with minimal unrelated churn; rerun advisory checks, build and regression checks.
- [x] SEC-02: add nullable expiry/cancellation/blocking timestamps to existing attachment rows. Record expiry before returning a signed URL. Cancelled or invalid uploads retain their row; finalization rejects cancelled rows. Serialize preparation/finalization/cancellation intent on the Request lock. Replace cancelled payloads with permanent private zero-byte live objects using a service upsert, confirm them, and release quota only after expiry. Failed blocking keeps quota. Keep these rows and objects permanently; ordinary deletion would allow a previously started upload to commit later. Test replay, finalization races, storage failure, expiry, foreign scope and healthy uploads.
- [x] SEC-03: enable certificate verification in the app and migration tooling and support an explicit trusted CA where needed; retain loopback-only plaintext for the local database. Test valid/invalid certificate behavior and configuration.
- [x] SEC-04: deny AI review when the limiter is unavailable or times out; keep a recoverable draft and distinguish this from a consumed quota. Test that the AI call is never reached in these cases.
- [x] SEC-05: use scoped diagnostic/cursor lookups and identical missing/invisible errors. Test real local PostgreSQL outcomes for single/bulk actions, guest comments and guest pagination.
- [x] Run full local tests, typecheck, lint, source checks, production build and focused browser recovery checks. Review the combined security changes and update the audit status with exact evidence and deployment requirements.

## Evidence

Local database backup: `/tmp/lane-before-security-fixes-2026-10-11.dump`, verified with `pg_restore --list` before the first successful test reset.

SEC-05 red: `artifacts/security-fixes-2026-10-11/auth-red.log` — 8 expected failures and 15 passing checks before the authorization fix.


## Completed local verification

- SEC-01/06: Next.js + eslint-config-next 16.3.8; frozen lockfile installed; Next advisory entries 17 → 0. Other dependency advisories remain separately triaged.
- SEC-02/05: red regressions reproduced; real local PostgreSQL focused suite 34/34 passed. Full suite below includes expanded upload failure/expiry/concurrency tests.
- SEC-03/04: 44 isolated tests passed, including the migration driver's structured TLS configuration and AI provider admission checks.
- Full regression suite: 74 files / 686 tests passed. Chromium Intake/recovery: 2 files / 46 stories passed.
- Typecheck, lint, Arc source check, production build, bundle budget and diff whitespace check passed. No bundle baseline update.
- No hosted database/storage changes or deployment. Migration 0020, trusted TLS and actual provider cancellation behavior must pass the existing staging-first release gate. See `docs/security-audit-2026-10-11.md` for the implementation and rollout requirements.
