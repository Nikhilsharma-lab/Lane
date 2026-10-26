# Single and bulk Request moves

`createRequestMoves` owns readiness partition, pickup confirmation, submission and
completion for single and bulk lifecycle moves. `useRequestMoves` binds the real
single and batch optimistic runners and existing actions. The selection hook keeps
selected IDs, the bulk bar, failure selection, announcements and focus. It passes
named lifecycle targets and its retained operation/scope predicate, not React state.

Pickup claims duplicate ownership before awaiting confirmation. Ready bulk targets
receive one advisory reviewer confirmation and one `pickUpRequests` call. Done uses
one `markDoneMany` call. Both still reach `transitionRequests` and its guarded,
locked update/notification CTE. Unready Requests are excluded before submission and
retain their Requester-directed explanation. Partial results retain successful
changes and only unsuccessful/unready selections, preserving refusal versus an
uncertain thrown response. No per-Request forward loop or new server API exists.

Each invocation captures the shared workspace navigation continuation.
DataTable's committed preview identity also reaches that owner before paint:
replacement and closure invalidate earlier presentation; the same preview keeps
its pending work. This includes J/K, filters, the responsive breakpoint and Arc's
exit interval. It does not cancel on a move hook's unmount or ordinary palette close.
The bulk caller also owns a selection Symbol and the existing view scope. Navigation or a
scope change during confirmation returns cancelled before any optimistic patch or
action. Once execution is handed to the existing runner, settlement, rollback,
refresh and explicit session-expiry recovery remain unconditional. Presentation
checks ownership again after settlement and before deferred focus. Returning to
the same URL does not revive an older invocation. Ordinary palette close/unmount
does not invalidate the workspace navigation owner.

The detail action button now uses this same confirmation path. Its existing
recoverable-action lock still covers the whole invocation; `onStart` makes the
pending label visible only after accepted confirmation. The obsolete public
`confirmPickup`/`confirmed` split protocol is removed, so a caller cannot capture
navigation only after separately awaiting confirmation.

Single Done retains #174's actual Arc store eligibility and consumed operation.
Late completion cannot open Is it live in another view. A failed Done always ends
Undo. An existing operation toast settles accurately after navigation, including
error/loading states, but a dismissed stale toast is not recreated. An explicit
Undo remains usable after navigating away from its original Done; it captures its
own invocation lifetime and cannot restore the original row's focus.

Bulk Done has a separate summary and one synchronously consumed Undo operation.
Only successful forward IDs are eligible. Undo uses the existing guarded per-ID
actions and optimistic runner, keeps successful reversals, names failed reasons
and refreshes once when any failed or skipped. It never automatically re-arms,
replays successful reversals, opens Release prompts or replaces the single palette
pointer. Uncertain failure copy does not claim a saved status that was not observed.

## Verification boundaries

Coordinator tests run actual `createPickupConfirmation`, workspace navigation,
`runOptimistic`/`runOptimisticBatch`, pending overlays and the actual Arc provider
fixture. They control external action promises, session token responses and UI
presentation callbacks. Tests cover cancellation, duplicate invocations, mixed
readiness, partial outcomes, independent Undo, terminal skipped Undo and navigation
during explicit session recovery. Existing #174 tests remain. The navigation tests
cover frame-time cancellation; actual caller focus/selection/announcement behavior
requires the running-app browser cases.

The guarded application suite retains real batch statement ceilings, permissions,
readiness, notifications and Undo-window coverage. Bootstrap precedes its local
checkout-specific database reset. No hosted database reset, new account, schema,
route, dependency or provider-authority change belongs to this increment.

Browser authoring uses the existing three-Request fixture allocation authorized by
the root task. Source tests are not browser acceptance: real selection, detail and
palette confirmation, partial server outcomes, focus, announcements and responsive
themes remain a separate recorded boundary. Current commands, exact target, bundle
comparison and outstanding review/browser checks are in the session handoff and
`/private/tmp/lane-spec-175-evidence.md`. Always compare the final client build with
the original #167 baseline; an inherited proposed refresh is not approval or
original-budget compliance.

## Measured bundle proposal

The initial #175 Node 24.22.0/Next 16.3.8 build exceeds the original #167 budget on Requests
and Request detail. The inherited #174 proposed baseline passes, but that is not
original-budget compliance. A separate measured #175 refresh is proposed under the
existing PR policy, pending Nikhil's approval by merging; tolerance stays 2,048 bytes.

| Route | Original gzip bytes | Initial proposed gzip bytes | Cumulative growth | Above 2,048 |
| --- | ---: | ---: | ---: | ---: |
| `/` | 510975 | 513191 | 2216 | 168 |
| `/requests/[id]` | 508554 | 511358 | 2804 | 756 |
| `/impact` | 466067 | 468107 | 2040 | 0 |
| `/intake` | 448011 | 450051 | 2040 | 0 |
| `/settings/members` | 478292 | 480330 | 2038 | 0 |
| `/settings/profile` | 478292 | 480330 | 2038 | 0 |

Relative to the inherited proposal, Requests grows 143 bytes and detail 780 bytes.
The shared moves factory used by detail now contains real bulk coordination,
partial outcomes and independently consumed Undo, alongside navigation ownership
and the detail confirmation integration. These are the specified shared boundary,
not a new screen or dependency. No byte-oriented rewrite or tolerance increase
was used. Public routes shrink 35 bytes and onboarding 158 against the original.
Exact receipts: `/private/tmp/lane-spec-175-bundle-bytes.json` and
`/private/tmp/lane-spec-175-original-bundle.log`. Preserve the original baseline
through #176 and final PR review; this proposal does not approve the prior waiver
or any release.

After the Oct26 preview-lifetime correction, the same toolchain measures Requests
513237 bytes (+2262 original, 214 over), detail 511385 (+2831, 783 over),
Impact/Intake +2067 (19 over) and Settings +2065 (17 over). The additional shared
navigation binding costs 46 bytes on Requests and 27 on other workspace routes.
The existing proposed baseline passes unchanged; it is not refreshed again.
Current exact receipt: `/private/tmp/lane-spec-175-preview-bundle-bytes.json`.
Focused99, UI688, full TypeScript/lint/design and production build pass. The real
preview replacement/closure browser cases and independent delta review remain
pending; controller tests do not prove DataTable's rendered effect by themselves.
