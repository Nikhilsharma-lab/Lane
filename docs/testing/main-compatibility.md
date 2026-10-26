# #167 compatibility with main #195

This isolated merge combines through-#175 `f7ad5a9` with main `3e6de934`, then
incorporates reviewed #175 toast correction `6e1f197` and consumer fix `97a7c17`. It preserves
both histories and main's approved Metrics, Inbox, Guest/Viewer, billing, first-run,
same-problem and saved-view behavior. It does not accept #175, implement #176, or
claim signed-in browser acceptance, a hosted migration, provider or deployment pass.

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

The compatibility review found two consumer gaps. Inbox's loaded and suspended
bells, Request/mobile/Members links, preview replacement/close and full-page opening
now use the shared navigation lifetime. Close invalidates before scheduling guarded
row focus; the committed preview observer is idempotent, so it does not cancel that
focus or a full-page arrival. Status-only palette edits explicitly retain the saved
view, including its title and Save changes control. Project/search/list departures
still clear it; opening another saved view swaps it.

Retained tests exercise actual palette and Inbox callbacks with real providers and
navigation. The isolated zero-database renderer first reproduced seven stale Inbox
prompts and the lost saved-view title on unchanged production consumers, then
verified their corrections, retained Undo, close focus, a newer intent superseding
close focus, full-page arrival and native Ctrl-click. It uses actual React/Arc,
InboxScreen/Bell, CommandPalette, RequestPeek wrapper, moves, overlay and ToastStack;
router/actions and remotely loaded preview content are controlled boundaries.
This proves component wiring, not persistence or signed-in application acceptance.
Exact red/green receipts and screenshots are in
`/private/tmp/lane-spec-167-navigation-diagnostic/`; no database/provider calls ran.

All incoming direct PostgreSQL tests now use the exact checkout guard, including
three tests that previously checked only the hostname. The non-resetting bootstrap
passed 52 tests before either application reset. Canonical migrations 0013–0053 and
main's four new pre-migration fixture boundaries remain unchanged.

Verification on Node 24.22.0 / Next 16.3.8, local only:

- Saved-view regression failed on missing saved identity, then passed through the
  production navigation owner. Viewer selection regression failed on unchanged
  scope, then passed with the read-only scope binding.
- Combined navigation/moves/read-state/consumer checks: 76 tests pass. Final full UI:
  968 tests in 92 files pass.
- Full application: 2,787 pass, one skipped; 251 files pass and two are skipped.
  This includes real local database authorization, Intake, attachment accounting,
  batch changes, replay, migrations, metrics, delivery and billing tests; external
  services are mocked at their existing test boundaries.
- Full TypeScript, ESLint, design/provenance and production build pass.
- Signed-in runtime checks for this combined tree remain pending. Earlier #167
  browser results are historical evidence, not acceptance of this merge. The
  isolated consumer renderer is a separate proof boundary described above.
- Initial independent review: Standards 0, Spec 2 P2; both consumer findings are fixed.
  Final delta review remains pending. Reviewed #175 toast restoration is merged,
  with both upstream provenance and compatibility sidebar adaptation preserved.

Bundle proposal (same masked environment as separately built pinned main): all
17 main routes remain in the generated baseline, tolerance 2,048 unchanged. Against
the immutable original #167 baseline, every existing route is within budget
(Requests +340 bytes; detail +360), but the original check correctly rejects main's
three new routes: Inbox, Metrics library and Metric detail. Against fresh pinned
main, detail grows 2,198 bytes, 150 over budget; against main's committed baseline
it grows 2,554, 506 over. Every other route is within in both main comparisons.
All three pre-proposal checks fail for those recorded reasons.

The separate **proposed** baseline refresh records this final build's complete
17-route inventory. The growth is the shared navigation/moves/Undo ownership,
including Inbox lifetime bindings, saved-view editing intent and the reviewed toast
restoration. It introduces no dependency or additional product surface. Passing
the refreshed baseline does not establish original-budget compliance or approval.
Approval by final PR merge remains pending. Original and pinned-main receipts stay
immutable for the cumulative #176/final-PR comparison; no byte-golf was attempted.

External receipts: `/private/tmp/lane-spec-167-reconcile-evidence.md`,
`/private/tmp/lane-spec-167-reconcile-final-bundle-comparison.json`, and
`/private/tmp/lane-spec-167-main-build-evidence.md`. No integration/main edits,
push, deployment, application runtime, or hosted actions by this implementer.
