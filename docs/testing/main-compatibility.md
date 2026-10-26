# #167 compatibility with main #195

This isolated merge combines through-#175 `f7ad5a9` with main `3e6de934`. It preserves
both histories and main's approved Metrics, Inbox, Guest/Viewer, billing, first-run,
same-problem and saved-view behavior. It does not accept #175, implement #176, or
claim a browser, hosted migration, provider or deployment pass.

The explicit action guards use one Clerk session snapshot. Only absent authentication
carries `sessionExpired`; wrong-workspace and capability refusals never replay.
Personal first-run and saved-view actions remain available to all roles, Guest
contributions remain separate from shared changes, and Viewer mutations are refused.
New main callers retain the expiry marker in their public result types.

The combined Journey loader retains main's taken-on Requester, learned text,
correction facts and Viewer restrictions together with one Request/context/clock,
roster-outage behavior and the saved-status refresh binding. The Impact page uses
one visible Request snapshot for the Outcome report, teammates and selected person;
Metric definitions and Quarter notes are ancillary reads. Definition uses and
Iterations keep their narrowed loaders. Main's retired reminders stay deleted.

Saved-view activation now carries its filters and identity through shared navigation,
so pending confirmation is cancelled and submitted work settles without stale prompt
or focus. Ordinary Project/search choices clear the saved association; in-list filter
editing still retains it. Read-only availability reaches the bulk coordinator, and
a change to Viewer invalidates selection scope. Arc sidebar composition preserves
main's controls and #172's async focus ownership; the provenance hash describes the
actual combined file, with its original upstream source retained.

All incoming direct PostgreSQL tests now use the exact checkout guard, including
three tests that previously checked only the hostname. The non-resetting bootstrap
passed 52 tests before either application reset. Canonical migrations 0013–0053 and
main's four new pre-migration fixture boundaries remain unchanged.

Verification on Node 24.22.0 / Next 16.3.8, local only:

- Saved-view regression failed on missing saved identity, then passed through the
  production navigation owner. Viewer selection regression failed on unchanged
  scope, then passed with the read-only scope binding.
- Combined navigation/list/moves: 64 tests pass. Full UI: 965 tests in 91 files pass.
- Full application: 2,787 pass, one skipped; 251 files pass and two are skipped.
  This includes real local database authorization, Intake, attachment accounting,
  batch changes, replay, migrations, metrics, delivery and billing tests; external
  services are mocked at their existing test boundaries.
- Full TypeScript, ESLint, design/provenance and production build pass.
- Runtime checks for this combined tree remain pending. Earlier #167 browser results
  are historical evidence, not acceptance of this merge. The later #175 toast-exit
  correction must still be incorporated and checked.

Bundle receipt (same masked environment as the separately built pinned main): all
17 main routes remain in the checked-in baseline, tolerance 2,048 unchanged. Against
the immutable original #167 baseline, existing routes are within budget (Requests
+264 bytes; detail +284), but the original check correctly rejects main's three new
routes. Against fresh pinned main, detail grows 2,122 bytes, 74 over budget; against
main's committed baseline it grows 2,478, 430 over. Every other route is within.
The checked-in main baseline is unchanged here. A separately measured proposal is
pending the later #175 correction and final combined build; there is no bundle-pass
or waiver-approval claim.

External receipts: `/private/tmp/lane-spec-167-reconcile-evidence.md`,
`/private/tmp/lane-spec-167-reconcile-bundle-comparison.json`, and
`/private/tmp/lane-spec-167-main-build-evidence.md`. No integration/main edits,
push, deployment, application runtime, or hosted actions by this implementer.
