# Intake operation ownership (#176)

The actual New and Edit form creates one `createIntakeSession` owner for its keyed
lifetime. That owner coordinates AI checking, saving, sequential file transfer,
retry, removal, Skip and interrupted-upload reconciliation. React retains field
validation, wording and focus. The previous caller-held lock, recreated upload
factory and copied test save sequence are removed.

A saved Request is recorded before the saved-row handoff or any file operation.
Typed/thrown save failures preserve the draft and never prepare an attachment.
Post-save failures retain the saved identity and recovery state. Retrying files
never repeats the save or a completed file. Initial recovery names must persist
before prepare; a returned reservation ID must persist before PUT. Failed cleanup
keeps that exact ID. If browser storage is unavailable, metadata remains reachable
in this document; reload durability is not promised.

The operation token is separate from the committed presentation binding. A
cancelled AI check cannot publish into or release its replacement. Rerenders bind
current callbacks without replacing the owner. Hidden New Request portals retain
Files; actual detach invalidates presentation while pending saved work continues.
Leave finishes the current file and starts no next one. Unattended cleanup clears
names only after every reservation is confirmed discarded or already uploaded.
Per-scope operation, record and draft leases keep a second form from overwriting
pending recovery or letting an older completion clear its newer draft, including
when both edits name the same Request.

Reload/orphan reconciliation uses the existing names-only record and discard
boundary; it never reconstructs File bytes or PUTs automatically. Open preserves
unresolved IDs. Dismiss refuses to erase them and offers explicit Retry cleanup.
Confirmed names-only loss can be acknowledged. New keeps its signed review and
advisory reviewer payload; Edit keeps its snapshot, unchanged-source framing/null
impact behavior and existing optimistic queue. The shared action boundary alone
handles explicit pre-write session expiry; ambiguous transport failures do not
permit replay.

## Oct28 reachable Leave correction

`a3c37a1f` connects New/Edit's existing X and Escape close attempts during saved
uploads to the existing Keep working / Leave page confirmation. Saving still
holds the editor open, AI cancellation is unchanged, and ordinary hidden New
recovery retains its Files. The existing Arc Dialog, Buttons, focus callbacks and
motion are reused; no primitive, visual value, route or provider API changed.

Confirmed Leave retires the owner's presentation binding before the host exits.
The operation/record lease survives while the current file settles, and no next
file starts. New retires the saved generation without its completion toast or
navigation; reopening creates a fresh form whose draft and focus cannot be changed
by the old operation. A failed cleanup remains reachable to the next owner.
Edit closes without invoking its saved callback. One-shot confirmation protects
against duplicate activation; Keep working and nested Escape cancel only the
confirmation. Its focused content handles Escape immediately while the global
Radix layer registration settles, without changing Arc timing.

Actual React/StrictMode New and Edit hosts first failed all four X/Escape cases
at824. A separate focused-confirmation one-Escape red was retained, then corrected
without a frame-delay workaround. Final isolated harness: four host cases pass at
1440/light and390/dark, including saving guards, Keep working, nested Escape,
current-file-only settlement, New reopen-before-settlement, shared-lock refusal
and preservation of B's newer draft/focus. Two existing AI-cancel/hidden-File cases
and one saved hidden-recovery/Retry case also pass. These use real hooks, Files,
providers, owner and Arc/CSS, with external actions/router and loopback PUT
responses controlled. They are not signed-in or private Storage acceptance.
Receipts: `/private/tmp/lane-spec-176-leave-harness/` final-confirmation-receipt.json,
controls-receipt.json and recovery-receipt.json; source hashes identify the tested
product delta over824. The source red and intermediate failures remain there.

Final source checks: UI996/94, full TypeScript/repository lint/design and production
build pass under Node24.22.0. The owner test covers retired binding, stale busy/focus,
no next reservation and failed cleanup reachable by B. No application reset was
needed for this client-only correction. Root separately verified clean824 with
bootstrap52 and full application2827/one skipped (255 files/two skipped), including
incoming main DB URL tests. That result remains attributed to824. Its earlier
Open Request actual-host correction is independently green in the browser-owned
`lane-spec-176-lifetime-fixed` receipts.

The inherited17-route proposal still passes unchanged. Original existing routes
fit: Requests+393/detail+493; three incoming-main routes remain absent from the
original inventory and correctly fail it. Fresh f638 detail+2331 is283 over2048;
committed f638 detail+2687 is639 over; every other route fits. Proposal growth is
Requests+53/detail+133. No new rebaseline or waiver approval. Exact receipts are
`/private/tmp/lane-spec-176-leave-fresh-bundle.json` and
`/private/tmp/lane-spec-176-leave-bundle-comparison.json`. Private-file browser
continuation and independent delta reviews remain parent-owned acceptance gates.

## Oct28 review correction and current source

Review of `a93d724b` found Standards 0 / Spec 1 P2: Open Request after removing the
final failed file lost its explicit navigation intent. Fix `1f69bdd0` carries
`open: true` through the existing confirmed-cleanup, operation and presentation
checks. Skip retains its default completion. The owner regression first observed
`open: false`, then passed; it also covers clear failure/retry, duplicate completion
and detach while cleanup waits. Focused owner/recovery/save tests: 51 passed.
The browser agent separately retained the actual New host red at a93; corrected
candidate browser verification remains pending at this source handoff.

Compatibility merge `74141b42` includes reviewed `e06982c6`, preserving #175's
helper and all five incoming f638 database URL files exactly. Only SESSION-STATE
conflicted, and both histories were retained. Final checks on the merged source:
UI 995/94, full TypeScript, repository lint, design and production build pass.
No database reset was repeated; incoming pure DB URL tests remain for the final
guarded integration suite. Earlier application evidence below is not attributed
to the new main files. Root retains integration and final main-config merge work.

The inherited 17-route proposal still passes without rebaselining. Exact merged
source deltas: original Requests +331/detail +354 bytes, with its three missing
main-added routes correctly failing inventory; fresh current main f638 detail
+2,192 (144 over 2,048), committed f638 detail +2,548 (500 over). Every other route
fits. Fresh f638 measurements equal the prior 3e6 reference byte-for-byte; both
remain immutable and separately attributed. This is not waiver approval.
Authoritative new receipts: `/private/tmp/lane-spec-176-open-final-fresh-bundle.json`
and `/private/tmp/lane-spec-176-open-final-bundle-comparison.json`. Historical
checks and measurements below remain scoped to the initial reviewed candidate.


## Initial reviewed candidate

Initial reviewed a93 source checks: UI 992 tests across 94 files, full TypeScript, full repository
lint, design checks and production build pass. Coverage includes actual owner save,
per-file recovery, real record-before-PUT ordering, two-owner same-Request/draft
races, Leave at each awaited stage, detached continuation, cancelled AI and the
extracted New/Edit action adapters with real session/optimistic coordination.
The final retained-owner regression proves that a second form cannot reconcile
Files still held by a mounted/hidden owner; detached metadata remains recoverable.
Failed or completed owners with no remaining record do not block a new save.

The reset-free architecture bootstrap passed 52 tests before the application suite
reset only `lane_test_lane_spec_176_48aefb67b05f27e27d32`. Application tests passed
2,811 with one skipped (254 files passed, two skipped). That run completed before
the final client-only retained-owner correction; only form formatting changed
during it. The final UI/static/design/build runs include that correction. Server
and payload-adapter code did not change afterward, so no second database reset was
needed. No hosted data or provider was touched.

The initial source candidate was `ae026523`. The baseline isolated actual
React/StrictMode/retained-portal diagnostic passed at `a54dbf1` on desktop/light
and phone/dark. It controls external AI/catalogue/router boundaries and is not
candidate or signed-in acceptance. Candidate actual-form checks, independent
reviews and signed-in acceptance remain pending. No new hosted Request, AI,
Storage, membership or provider action was performed by this implementation.

The inherited 17-route bundle proposal passes unchanged; it is not main-merge
approval. Exact final cumulative comparisons retain tolerance 2,048 bytes:

- Original #167 existing routes fit: Requests +332 bytes and detail +355; three
  incoming-main routes remain absent from the original inventory and fail it.
- Fresh pinned main `3e6de934`: detail +2,193 bytes (145 over); every other route fits.
- That main commit's checked-in baseline: detail +2,549 bytes (501 over); every
  other route fits.

No new rebaseline or waiver approval is claimed. The original receipt is immutable.
The fresh build comparison covers all 17 routes, including Inbox and both Metrics
routes. Exact receipts and red/green boundaries:
`/private/tmp/lane-spec-176-evidence.md` and
`/private/tmp/lane-spec-176-final-bundle-comparison.json`.
