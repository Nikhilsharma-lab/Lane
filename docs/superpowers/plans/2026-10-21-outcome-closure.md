# #60 Actual impact and permanent closure

> **Amended 2026-10-22 (#127, Nikhil):** any active non-guest member records, corrects or voids a release while the Request is Done or Measuring and not closed, each change attributed in history. Closing (measured or without a result) and closure corrections stay with the Requester only. An admin may hand a Request to a new Requester at any point after pickup once the Requester has lost access. "Requester" replaces owner, creator and release and outcome owner. See `REQUIREMENTS.md` §5 "Who closes — the Requester".

Approved by Nikhil on October 21: columns only (no new table); corrections by the Requester only, with admin
handover still available after closure when the Requester loses access; every agreed guardrail requires an actual
value; any active non-guest member may create a follow-up. User authorized implementation, tests, review and
commit on current main. Baseline fd1d432. Builds on #58 (`exception_closure`, agreement
lock/revision) and #59 (`release_state`, `releaseOwner`, UTC deadlines).

## Rules (from REQUIREMENTS.md §§ Outcome lifecycle, Closure ownership, Closed is permanent, Follow-ups)

- **Measured closure** — the Requester (`requesterOf`, read through the release record) who is an active non-guest member; work
  Done, release recorded, agreement snapshot present, UTC today ≥ due date (Due today counts). Overdue stays
  outstanding; nothing auto-closes.
- **Form** — beside the agreed baseline/target (read from the frozen agreement snapshot), record: primary
  actual (numeric in the agreed unit, or pass/fail for `check` metrics and legacy `verification` impacts),
  every agreed guardrail's actual numeric value (held/breached derived, never a gate), evidence/source and
  observation period (defaults to release start → due date; from ≤ to ≤ today). No positive/negative label is
  stored; the comparison is derived for display. Legacy `metric`/`verification` and measurement v2–v4 are all
  supported; nothing is fabricated for legacy Requests (they can only reach measured closure after agreement
  and release).
- **Exception closure** — the Requester, any time before closure, reason required. Codes: `cancelled`
  (not launched; only while no active release), `rolled_back` (release recorded), `measurement_unavailable`
  (any time), `inconclusive` (release recorded). `superseded` stays exclusively on the #58 replacement path,
  unchanged. Status column is unchanged; an exception-closed Request is blocked from further advancement.
- **Permanent** — once closed, the Request row is immutable in SQL except appended corrections (and an appended
  admin handover when the Requester has lost access). Release correction/void, Done undo, edits, agreement mutations all fail.
- **Corrections** — attributable append-only `{field, correction, reason}` shown beside the immutable record;
  never edits result, evidence or target. `field` ∈ actual, guardrails, evidence, observation, reason.
- **Follow-up** — "Create follow-up Request" after release (Measuring or Closed). Copies confirmed context and
  agreement preparation with empty decisions (like the #58 replacement), requires a reason ("what changed and
  why"), gets fresh agreement and its own creator/owner. The original's obligation is untouched; no automatic
  superseding. Multiple follow-ups per original are allowed.
- **Concurrency** — every mutation takes `{orgId, requestId, expectedRevision, operationId}`, checks Clerk
  membership immediately before the transaction, then locks the Request row (shared #58/#59 lock), rechecks
  owner/revision/eligibility. Same actor + operation + input returns the saved result; different input fails.
  Transfer racing closure serialises on the lock: whichever commits first wins, the other gets a stale error.

## Persistence (migration 0030, no new table)

- `requests.outcome_closure jsonb NULL` — measured record v1: `{version, kind:"measured", actorId, ownerId,
  closedAt, operationId, fingerprint, expected (agreed ExpectedImpact copy), release (ReleaseFact copy),
  primary: {kind:"numeric", actual, unit} | {kind:"pass_fail", passed}, guardrails:[{metric, operator, limit,
  unit, actual}], evidence, observedFrom, observedTo}`.
- `requests.exception_closure` — validator extended to accept v2 `{version:2, kind:"exception", reasonCode,
  reason, actorId, ownerId, closedAt, operationId, fingerprint, release|null}` for the four new codes. v1
  superseded records stay valid and unchanged.
- CHECK: at most one of `outcome_closure` / `exception_closure` is set.
- `requests.closure_corrections jsonb NOT NULL DEFAULT '[]'` — append-only array of `{operationId,
  fingerprint, actorId, at, field, correction, reason, revision}`.
- `requests.follow_up_of uuid NULL` with composite FK `(org_id, follow_up_of) → requests(org_id, id)`,
  index; `request_agreement_events.kind` gains `follow_up_created` (recorded on the follow-up, giving retry
  idempotency without mutating the original).
- Triggers: replace the 0028 requests guard so a closed row (either closure) only accepts appending exactly one
  correction (+ revision bump) and an appended ownership transfer; closures themselves immutable;
  `updated_at` ignores the new columns. RLS/revokes as 0028.

## Actions (alongside release-actions.ts, no new routes)

`closeRequestOutcome`, `closeRequestException`, `addClosureCorrection`, `createFollowUpRequest`,
`readRequestOutcome`. Identity from `requireMemberOrAbove`/`requireActiveMember`; guests read their own only.

## Sequence

1. Migration + schema + fixtures (legacy Open/In Progress/Done, v1 superseded, measurement versions).
2. TDD at the server-action/test-DB seam: eligibility clock, owner/transfer/former owner/admin, foreign
   workspace, guest, stale revision, duplicate + lost-response retries, numeric/pass-fail/guardrails,
   positive/neutral/negative, early exceptions, immutability, corrections, follow-ups, transfer race.
3. Request detail outcome panel (Arc Input/Textarea/Select/Button), board label for closed states,
   follow-up links both ways; Storybook stories incl. keyboard/mobile/dark/error.
4. Author `e2e/request-outcome.spec.ts` for the full hosted journey (not run locally; hosted gate).
5. Reconcile REQUIREMENTS.md/roadmap, full suite, build, code review, SESSION-STATE, commit. No hosted
   migration or deployment.

## Current evidence

Implemented locally; see docs/SESSION-STATE.md (October 21, #60) for check results, review fixes and the hosted gates.
