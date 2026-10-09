# Ask for Review Implementation Plan

**Goal:** Let a member ask named teammates for feedback on a design reference inside an existing Request, then read their responses without chasing messages.

**Authority:** Nikhil authorized building the proposed tangible features and explicitly selected “Ask for review first” on 2026-10-09. The Requests list is already reviewed and stays outside this increment. This authorizes local implementation and verification; hosted migration/deployment is a separate release step.

**Architecture:** Store review rounds as a Request-owned JSONB document plus an integer version. Use guarded actions and a conditional version update so stale/concurrent saves never erase feedback. Keep new review notifications and that update in the same transaction. Clerk remains the membership authority. Reuse Arc components inside Request detail.

**Tech stack:** Existing Next.js, React, Arc, Clerk, Drizzle and PostgreSQL. No new dependency, table, route, AI call or cron job.

## Behaviour

- Current non-guest members can start a review. Select 1–10 other current non-guest workspace members who have completed Lane onboarding. A version-specific HTTPS design link and feedback question are required. Lane stores the link, not the external design contents.
- A round freezes its link, question, reviewer identities/name snapshots and initiator. Named reviewers may record or correct their own response: Looks good or Changes requested. Changes requested requires an explanation. Response events remain in history.
- All responded means feedback received, not approval. This feature does not change Request status, authorize work, implement named-trio alignment or override a disagreement in that future workflow.
- One current round. A new round can start after everyone responds or after withdrawal. Earlier rounds are read-only. The initiator, Request creator or workspace admin can withdraw a round with an attributed reason; withdrawal is not approval and preserves all feedback.
- Guests see review context only on their own accessible Requests and cannot enumerate members, ask, respond or withdraw. Functional profile labels grant no privileges.
- Search, save, notification and stale-version failures retain drafts and explain recovery. Identity and current organization always come from Clerk guards. Never trust a client-supplied actor.

## Tasks and acceptance

- [x] Domain and persistence: `src/lib/request-review.ts`, behavioral tests, canonical `0018_request_design_reviews.sql`, Request/notification schemas and the exact local `lane_test` migration harness. Cover validation, retained response history, stale rounds, withdrawal authority and real database defaults/constraints.
- [x] Guarded actions: `requests/[id]/review-actions.ts`, `request-review-members.ts` and integration tests. Cover real saved state, live-membership selection, tenant/guest/unnamed-reviewer denial, stale version, parallel saves, notification atomicity and unchanged Request lifecycle.
- [x] Arc panel and stories: `design-review-panel.tsx`, `design-review.stories.tsx`. Test ask → selected reviewer responds → concern remains visible → corrected response → new round/history; preserve drafts on failure; test guest/read-only, keyboard, mobile, dark and reduced motion.
- [x] Wire production detail: client action adapter and optional detail slot, selected Request projection only, no list redesign. Show a full Request-detail preview with clearly labeled fixture identities. (`requests/[id]/design-review.tsx` is rendered by `requests-workspace.tsx` into the detail view's `designReview` slot.)
- [ ] Verify focused and existing regressions, TypeScript, ESLint, Arc source checks, production build and rendered preview. Record exact evidence below. Hosted deployment and real multi-user delivery remain unverified until staging release checks. (Partly done, see Evidence: the automated checks pass; a rendered review round with real people has not been exercised.)

## Public interfaces

`RequestReviewState = { version: number; reviews: DesignReview[] }`. Each round carries `id`, `designUrl`, `question`, `requestedBy`, `requestedAt`, fixed `reviewers`, append-only `responses` and optional `withdrawal`.

Actions receive `(requestId, input, {orgId})` and return `{state}` or `{error}`. Inputs include `expectedVersion`; response/withdraw inputs identify the current `reviewId`. Membership search receives `(requestId, query, {orgId})` and returns `{members}` or `{error}`. UI identity is presentational only; action identity is always session-derived.

## Evidence

2026-10-09 (committed as `e489bd5`, verified on the branch): TypeScript, ESLint (0 errors), Arc source check (63 files, 29 adaptations) and the production build pass; `pnpm test` passes 63 files / 538 tests including `request-review.test.ts`, `review-actions.test.ts` and `request-review-schema.test.ts`. The local `lane_test` harness applies `0018`. **Hosted:** `0018` was applied to Lane Staging on 2026-10-09 together with `0017` and `0019`, after a verified export and a local rehearsal (see the saved-request-codes plan). A real multi-person review round on staging and production delivery remain unverified.
