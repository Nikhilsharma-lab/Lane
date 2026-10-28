# #167 compatibility with main #195

## Oct 28 source integration and inherited Inbox failure

Source integration `8371a5fb` preserves reviewed combined candidate `c902f6c8`;
`7cae8bd1` additionally preserves upstream `94e73312`'s exact `vercel.json` cron
entry. Before documentation updates, the complete tree equalled c902f6c8 plus that
one upstream file. This is source preparation, not #175/#176 acceptance or a
deployment. The PR remains draft; final review mapping and browser work remain.

On c902f6c8, combined focused navigation/Intake111, full UI999/94, full TypeScript,
ESLint, design42 plus token/Arc67/brand9 contracts, and masked production build
pass. Guarded bootstrap52/application2827 with one skipped ran on824d1bae before
the later client-only Leave/navigation corrections. No reset was repeated for
the source union. Exact sources and command exits remain in external
`lane-spec-176-root-combined-checks.md` and `lane-spec-176-combined-merge.md`.

The signed-in compatibility walk exposed an inherited Inbox failure: confirmed
read `a6e53f32`, then unread `b7645f59` refused before dispatch, leaves the saved
notification read but displays its initial unread row with error feedback. The
read-state/list modules and relevant adapter sequence are unchanged from f638;
the navigation/session changes did not introduce this lost confirmed patch.
The source diagnosis and scope assessment are retained, and the focused repair
is a pre-launch item in `../../DEFERRED.md`. The original red is not relabelled
green. After context closure, a fresh Inbox correctly omits the saved-read item;
ordinary unread retry/mobile-read checks therefore remain unverified. No hidden
state restoration, fixture reset or direct setup write was used to continue.

Sixteen explicitly reviewed safe reports/receipts/screens/test logs are preserved
outside throwaway worktrees under
`/Users/nikhilsharma/.codex/visualizations/2026/10/23/01a169ec-0c9f-7c53-b22d-b14541ab4859/spec-167-evidence/manifest-reviewed.json`.
This archive excludes env/auth/Flight/capability material. It is not an all-cases
browser pass; current private-file acceptance and final CI remain separate.

## Oct 28: pending route owns navigation during mutation settlement

Product correction `935d5475`, based on compatibility `e06982c6`, prevents the old
Requests URL mirror from restoring the list over an issued Inbox/detail/settings
route. Presentation invalidation, including delayed preview cleanup, cancels stale
work and focus without dropping that route ownership. An explicit newer list choice
or native history still supersedes it; destination acknowledgement releases it.

The local signed-in run ended on the saved-view list after held Done delivery,
despite the intended Inbox activation. Its original click/history ordering was not
recorded. A later ordinary Inbox activation succeeded with zero lifecycle writes.
Two production-controller regressions independently reproduced the competing list
write after the route push, including the late-preview variant. Installed Next's
patched `replaceState` dispatches a router restore, establishing the conflicting
writer mechanism; attributing the historical browser failure to that ordering
remains an inference until a fresh held-action replay. Done remains saved, its Undo
expired, and no hidden Undo, fixture reset or replay was used.

Final Node 24 checks on this product source pass: focused 78/4 files, full UI 971/92,
TypeScript, full ESLint, design (42 tests plus theme/Arc/brand contracts), and masked
production build. No database suite was rerun for this client-only delta. Earlier
application results retain their recorded source boundaries. All 17 routes remain:
the inherited proposal passes at +20 bytes for Requests/detail. Original existing
routes are within (+360/+380), while its three absent main routes correctly fail.
Fresh `f638003c` main detail is +2,218 (170 over 2,048); committed main detail is
+2,574 (526 over); other routes fit. No new baseline was written or approved.
Receipts: `/private/tmp/lane-spec-167-navigation-diagnosis.md`, the sibling
`navigation-bundle-comparison.json`, and `navigation-final-*.log`. Review and signed-in
held-action replay remain pending; this does not accept #175 or compatibility.

## Earlier compatibility preparation

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
