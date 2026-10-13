# Redundant code cleanup implementation plan

**Goal:** Remove proven unused and duplicated Lane application code, preserve existing behavior, and measure the effect without equating source deletion with user-visible speed.

**Architecture:** Keep GET routes as the sole live readers for search, reviewers and notifications. Share the existing notification visibility predicate with mutations. Skip pending-list work when there is nothing to apply. Remove only files/exports/selectors shown to have no consumers, accounting for Next entrypoints, Storybook mocks and registry APIs.

**Tech stack:** Existing Next.js, React, TypeScript, Arc, Drizzle, Vitest and Storybook. No added dependencies, routes, database changes or hosted operations.

## Constraints

- User explicitly requested repository cleanup on 2026-10-11. Marketing is an independent repository and remains out of scope.
- Preserve Arc registry source/API and provenance, migrations, permissions, Clerk flows, uploads, recovery and functional fixtures.
- Baseline is the unchanged source at `88775ea` / merge `13c7462` (identical app source). Build with `NEXT_DIST_DIR=.next-audit`; preserve route gzip totals, CSS totals and source measurements under `artifacts/cleanup-2026-10-11/`.

## Work

- [x] Audit the production import graph, non-code/config references, duplicate readers and product CSS; capture a fresh production build before edits.
- [x] Delete unused helpers, exports and Next starter assets after reading them and verifying no consumers. Keep documented tools and auto-resolved mocks.
- [x] Remove obsolete search/notification/reviewer read actions. Move their behavioral scenarios onto the live GET routes. Export `notificationVisibility(auth)` from `src/lib/data/notifications.ts` and reuse it in notification mutations. Correct the notification failure story to mock its current GET boundary.
- [x] In `pending-mutations-provider.tsx`, return the original rows immediately for an empty overlay and avoid creating the ID Set when there are no inserts. Retain tests for patches, confirmations, rollback, inserts and stale responses. Benchmark actual before/after source in the same Node process, with warmup, alternating samples and 200 rows.
- [x] Remove confirmed unused product CSS selectors, retaining semantic appearance and all current stories.
- [x] Verify TypeScript, lint, Arc source provenance, local behavioral regressions, relevant browser stories and a fresh production build. Compare all routes against the captured baseline and the committed bundle budget.

## Reporting

Report removed files/lines, actual browser JS/CSS changes, and median processing time with sample ranges and absolute time saved. A microbenchmark is not a whole-app speed measurement. Build timings and hosted page latency are not comparable unless measured under matching conditions; do not claim an app-wide percentage from them.

## Evidence

### Removed code

15 files removed on net: the unused mobile hook, old sidebar/identity helpers, unused redirect and development-key helpers and their dedicated tests, an unused color test helper, the retired search action, and five Next starter SVGs. Two search test files moved to the current API directory; they are not counted as removed coverage. Also removed unused status styles, `StepHeading`, `selectOverviewRequests`, `loadProjectScope`, duplicate notification readers and the old reviewer read action. The final source inventory is 495 files versus 510, 454 fewer lines and 19,516 fewer bytes across `src`, `scripts`, `e2e`, `public` and package manifests (documentation excluded).

Existing selection stories still mocked single-Request actions and an unused server filter prop. They now use the current batch response contract and provider status state, preserving partial failures, retry, focus return and duplicate-submit checks. No product workaround was added for broken mocks.

### Measurements

Actual before/after store source was transpiled with the same TypeScript settings and run in one Node process. Eleven alternating samples, 20,000 applications per sample, 10,000 warmup iterations, 200 rows, with explicit GC between samples. These are the CPU cost of applying the pending-change overlay, not page latency or frame timing.

| Operation | Before median | After median | Reduction |
| --- | ---: | ---: | ---: |
| No pending work | 8.136 microseconds | 0.037 microseconds | 99.5% |
| One pending change | 9.116 microseconds | 4.738 microseconds | 48.0% |
| Newly created Request inserted | 9.325 microseconds | 6.261 microseconds | 32.9% |

Absolute savings are 3–8 microseconds per application. The memoized UI does not necessarily call this function on every render. This is not evidence of a perceptible or app-wide percentage gain.

Fresh production bundles, same local compiler/configuration:

- Requests first-load JS: 409,168 → 409,182 bytes gzip (+14 bytes, effectively unchanged). Other routes change by 0–25 bytes; all pass the existing 2 KB growth budget. Dead modules were already tree-shaken.
- All emitted CSS chunks: 50,592 → 50,455 bytes gzip (137 bytes / 0.27% smaller), 307,620 → 306,733 raw bytes. These are all build CSS assets, not one route's transfer.
- No page-load or hosted latency improvement is claimed. Authenticated production timing requires a saved signed-in session; no such fixture was available. The local build succeeded before and after. Build times are deliberately not compared because verification work ran concurrently after cleanup.

Raw baseline, after-build totals and verification logs: `artifacts/cleanup-2026-10-11/`. The reproducible benchmark, exact before source, all samples and source hashes: `artifacts/redundancy-audit-2026-10-11/`.

### Verification

- Full local suite: 70 files / 620 tests passed. The exact loopback `lane_test` target was backed up first, and its dump inventory verified; no hosted database was touched.
- UI-only suite: 15 files / 147 tests passed (overlaps the full suite; not an additional unique-test total).
- TypeScript, ESLint, Arc source check (63 files / 30 existing adaptations), production build, bundle budget and whitespace checks passed.
- Independent review found no changes to guest/tenant restrictions, notification visibility, pending-layer cleanup or inserted-Request expiry.
- Browser matrix: 34/34 relevant stories passed at 1440 light and 34/34 at 390 dark with reduced motion. Three targeted stories passed at each of 768 and 1024 light (selection, Profile content and notification navigation after failure; 28 unrelated cases intentionally skipped in each mid-width run). These are repeated configurations of the same stories, not 74 unique tests. Keyboard, focus return, pending states, errors and retries are included.

No dependencies, routes, tables, migrations, Arc primitives or hosted deployments changed. The existing dirty marketing submodule was not edited.
