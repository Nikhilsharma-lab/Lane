# Request agreement — local delivery and hosted release gate

Issue [#58](https://github.com/Nikhilsharma-lab/Lane/issues/58). Approved persistence:
[contract](../superpowers/plans/2026-10-21-request-agreement-persistence.md).

## Delivered locally on 2026-10-21

The existing Request detail now prepares a compact commitment and names three distinct PM, Designer and
Developer participants. Submission freezes the commitment without approving for the creator. Each named
person explicitly agrees or records a reason for changes/withdrawal. Single and bulk pickup/Done use the
same locked server guard and current Clerk eligibility. Withdrawal retains the current column.

Participant replacement resets only that seat and preserves concerns. Replacement resolution requires a
recorded unavailability attestation for the concern author and generation. Minor prose corrections append
original/corrected wording and reason. Material changes create a linked Open Request with fresh approvals;
creator confirmation permanently marks the original Superseded, excluded from measured-impact totals,
without inventing a new work status. Replacement diffs are visible before agreement and freeze on submission.
Private inherited files retain source attribution and source access checks.

Migration `0028_request_agreements.sql` is additive. It preserves old statuses, measurement versions, dates
and comments; creates no historical approvals; enforces tenant FKs and immutable snapshots/events/closure;
and preserves the old Done undo window during agreement-only activity. Legacy In Progress can finish while
unsubmitted; submitting switches it to the complete agreement gate. Guest sponsorship is not introduced.

## Verification evidence

- `pnpm test`: **1,197 passed, 1 skipped**, 112 files passed and 2 skipped. Local loopback `lane_test` is rebuilt
  from canonical prerequisites/migrations; this is not a hosted restore or live Clerk test.
- Focused agreement action + migration checks: **22 passed**. Covers migration preservation, tenant FKs,
  strict seat/closure records, explicit decisions, invitation redemption, stale/replayed writes, concurrency,
  legacy progression, participant departure, preserved concerns, replacement links and immutable closure.
- Agreement production-component Storybook interactions: **7 passed**. Covers keyboard submission, exact
  frozen commitment, pending invite, unsaved preparation, error/retry input retention, guest and exception UI, empty preparation and repeated read-failure recovery.
- Full Storybook run: **588 passed, 5 failed**. Isolated recheck: 51 passed, 3 failed; the two Intake recovery
  failures did not recur. The reproducible failures are the saved-code search story and the Default/In Progress
  detail-row height assertions. Baseline `e3f8360` reproduced all three (46 passed, 3 failed). These failures predate #58; no unrelated search or visual behavior was changed.
- `pnpm typecheck`, full ESLint (excluding existing `.claude/**` and `Building-AI-Agents-for-Finance/**`),
  `pnpm design:check`, `pnpm build`, and `git diff --check` passed.
- Visually inspected the actual agreement panel in light/dark and at 390px mobile width. Storybook uses
  production components/tokens; its mocked server boundary is not a live multi-user acceptance run.
- Parallel Standards and Spec review: reported findings fixed, follow-up found no remaining implementation
  blocker. Review identified the still-pending hosted browser acceptance below.

## Before hosted release

No hosted database, provider membership, production deployment or GitHub push was changed by this task.
Do not deploy app code that queries the new fields before migrating its target database.

1. Take and verify a manual database export, including storage metadata; rehearse restoration separately.
2. Apply migration `0028` on Lane Staging first. Verify the new relations, indexes, composite tenant FKs,
   grants/RLS and trigger behavior. Compare pre/post legacy statuses, impact JSON and history; never backfill
   agreement, outcomes or approval timestamps.
3. Run `pnpm test:e2e e2e/request-agreement.spec.ts e2e/reliable-request-lifecycle-actions.spec.ts` with the
   existing staging-only E2E safety configuration. These tests provision three real Clerk test users, use the
   existing signed Intake-review fixture seam, save through the app, and exercise real agreement/lifecycle
   actions. They cover reload, keyboard, themes, responsive sizes, failed/repeated lifecycle actions,
   withdrawal/resolution and superseding. **Authored and typechecked; not executed in this local-only task.**
4. Agreement test histories are deliberately immutable. The E2E helper retains its isolated fixture users and
   workspace, attaching their exact creation receipts to the report. Inspect/export those receipts; do not
   disable hosted history triggers or sweep by a name/email prefix for teardown. Agree the staging fixture
   retention/reset procedure before running the suite.
5. Verify live accepted/revoked invitation eligibility, cross-workspace and guest/source-file denial, and the
   multi-user race/retry cases on staging. External Clerk membership checks and Postgres writes cannot be one
   distributed transaction; current provider checks fail closed but do not claim atomic external revocation.
6. Promote only after staging acceptance and a verified production backup. Keep release/measurement and
   actual-result closure in #59/#60; those capabilities and aggregate reports are not part of #58.
