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

Initial candidate: UI 989 tests across 94 files pass, including actual owner save,
per-file recovery, real record-before-PUT ordering, two-owner same-Request/draft
races, Leave at each awaited stage, detached continuation, cancelled AI and the
extracted New/Edit action adapters with real session/optimistic coordination.
Full TypeScript, affected lint and design checks pass. The reset-free architecture
bootstrap passed 52 tests before any reset-capable suite. Full application checks/build/bundle comparison and candidate actual-form
browser verification remain pending at this initial source handoff.

The baseline isolated actual React/StrictMode/retained-portal diagnostic passed at
`a54dbf1` on desktop/light and phone/dark. It controls external AI/catalogue/router
boundaries and is not candidate or signed-in acceptance. No new hosted Request,
AI, Storage, membership or provider action was performed by this implementation.
The inherited 17-route bundle baseline is a proposal awaiting main-merge approval;
final comparisons must retain original #167, fresh pinned main and committed-main
receipts separately. Full evidence: `/private/tmp/lane-spec-176-evidence.md`.
