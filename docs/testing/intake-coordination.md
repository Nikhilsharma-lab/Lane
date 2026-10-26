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

## Verification boundary

Final source checks: UI 992 tests across 94 files, full TypeScript, full repository
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
