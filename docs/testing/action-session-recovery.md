# Action session recovery

Ticket #169, under #167, makes automatic replay a pre-write protocol. `callAction`
asks Clerk for a current token before the first attempt. Only a result carrying
`sessionExpired: true`, or the existing structured `error.code: session_expired`,
permits one renewal. Renewal must return a nonempty token before the same action
closure runs a second time. Renewal failure preserves the first result; a second
expiry stops. Throws propagate unchanged, including auth-like messages and lost
responses after commit. Existing operation idempotency remains a separate defense
for deliberate retries.

`guardActiveMember` and `guardMemberOrAbove` use one Clerk session snapshot for
identity, workspace, role and classification. Only a missing signed-in user emits
expiry. Denied workspaces, unknown roles, guest restrictions, validation and later
failures do not. Guards run before SQL, storage, roster lookup or AI work. The
nullable `require*` wrappers remain compatible with HTTP read-route guards.

The closure retains the original workspace, Request and operation ID. Each server
attempt obtains identity afresh from Clerk. A changed active workspace therefore
refuses the original operation; it cannot redirect it to another workspace.

## Producer and caller coverage

| Producers | Browser entry |
| --- | --- |
| Intake review/save and attachment prepare/finalize/discard | Intake form and upload callbacks use `callAction`; the existing structured expiry and draft continuation stay intact |
| Projects and Labels list/create | Providers and pickers use `callAction`; signed-in workspace/role denials use non-expiry failures |
| Request moves, Undo, priority, edits, comments, deletion and downloads | Single/bulk optimistic runners or direct `callAction`; the single move adapter forwards the marker |
| Reviewer changes; Release, Outcome and follow-up changes | `changeRequest` returns guard failure before roster/transaction work; optimistic callbacks preserve operation IDs |
| Reviewer reads/people; combined Journey, standalone Release and Outcome reads | Direct reads use `callAction`; the timeline uses one combined Journey action, while Is it live retains the standalone Release loader |
| Notifications, Profile and onboarding | Existing optimistic/direct wrappers; onboarding emits expiry before profile access or writes |

Batch expiry is possible only at the initial total refusal. A result containing
committed moves and row failures carries no expiry signal. A post-write cache
failure, provider error or transaction error cannot acquire one. Permission and
existence-hiding copy remain separate from recovery classification.

## Verification

`action-producers-recovery.test.ts` invokes production actions, actual guards and
production recovery with only the external Clerk boundary controlled. It covers
all read/write entry families and structured failures, counting SQL statements
separately from attempts. Profile tests prove zero writes before expiry, one write
after renewal with fresh identity, no write on workspace change, and one committed
write when its response is lost. Release tests retain the original operation ID
and inspect the saved actor/history. Lifecycle tests cover adapter forwarding,
permission wording and partial batches. Unit and optimistic tests cover unusable
renewal, repeated expiry, throws and pending rollback. The caller source scan is
supplementary; it is not proof of computed or passed-through callbacks.

Browser tests use the existing pinned staging safety guard and worker-owned fixture
receipts. `first-run-action-recovery.spec.ts` sends the first real onboarding action
without cookies, verifies the actual server expiry result and no profile write,
then checks exactly two attempts and the saved original role. An aborted request
requires manual retry and preserves the selection. `session-continuity-intake-draft`
revokes only its owned Clerk session and checks the exact restored review and saved
Request on desktop/mobile in both themes. No AI request is needed for those checks.
