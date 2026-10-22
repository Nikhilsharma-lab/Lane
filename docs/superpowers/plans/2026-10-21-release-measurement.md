# #59 Release and measurement

> **Amended 2026-10-22 (#127, Nikhil):** any active non-guest member records, corrects or voids a release while the Request is Done or Measuring and not closed, each change attributed in history. Closing (measured or without a result) and closure corrections stay with the Requester only. An admin may hand a Request to a new Requester at any point after pickup once the Requester has lost access. "Requester" replaces owner, creator and release and outcome owner. See `REQUIREMENTS.md` §5 "Who closes — the Requester".

Approved October 21: UTC calendar, due at 00:00 UTC on the exposure date plus the agreed days; fixed end dates remain fixed. On the due date show Due today; the next UTC day is 1 day overdue. Corrections (originally owner-only; any active non-guest member since #127) require reasons, retain originals and recalculate relative deadlines. Void only a falsely recorded release, never an actual rollout later rolled back. Rollback uses #60 exception closure.

Implementation baseline: 24ddf821cfcc13b398039c3d228ccde6059c6fdd. User authorized implementation, tests, review and commit on current main. Preserve unrelated dirty files.

Persistence: add nullable versioned `requests.release_state` containing current owner, active release (exposure date, agreed audience, evidence, fixed/relative deadline), and append-only events with actor, timestamp, reason, operation key and fingerprint. NULL means no release/transfer history; effective owner defaults to original creator. No new table, route, AI call or cron. Share the Request lock and agreement_revision with #58. Protect history prefixes and released Done status in SQL. Preserve updated_at for release-only mutations.

1. Test release through real server actions and local Postgres, controlled Clerk and clock; record a past exposure and recover duplicate/lost-response submissions.
2. Implement strict release/correction/void/transfer inputs, fresh membership checks, agreement and lifecycle gates under the shared lock. Handover only when the Requester loses eligible membership (from pickup onwards since #127). Keep original authorship. Read models preserve guest visibility and expose deadlines to all permitted readers.
3. Test fixed windows, UTC before/at/after boundaries, correction/void history, stale revisions, foreign workspaces, departed owners, legacy records, withdrawal and transfer races. Prevent post-release agreement mutation, superseding and Done undo.
4. Compose existing Arc Input/Textarea/Select/Button on Request detail for release, corrections and explicit transfer. Render countdown and audit history. Hide Done priority in rows and every detail presentation without changing stored values. Browser tests use production components, keyboard, themes, mobile and recovery.
5. Run focused tests and typechecking throughout, full application and browser suites at the end, lint/design checks and build. Review Standards and Spec independently against the baseline; fix findings, update handoff and commit scoped changes.

Hosted release: #58 migration 0028 is local-only. Before hosted migration 0029, verify backups and staging 0028 first; exercise real multi-member release/correction/transfer and reload persistence there. No production migration or deployment is part of this local implementation commit.
