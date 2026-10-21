# Agreement before work starts — persistence proposal

Issue: [#58](https://github.com/Nikhilsharma-lab/Lane/issues/58), “Agreement before work starts”.

Status: proposed for approval, not implemented. Product behavior and test boundaries are approved; the database contract below is an engineering proposal. No migration is authorized by this document alone.

**Goal:** enforce three explicit named decisions before pickup, with durable withdrawal, replacement and superseding history on existing Request surfaces.

**Architecture:** extend the existing Request server actions and Drizzle transactions. Store one commitment per Request, its current seats and concerns, append-only attributed events, and a workspace-scoped replacement link. Clerk remains the authority for membership and invitations.

**Tech stack:** existing Next.js 16 / React 19 / Arc UI / Clerk / Postgres / Drizzle. No new route, AI call, cron, workflow engine or dependency.

## Approval requested

Approve the three tables and Request columns below, including these behavior choices: corrections are append-only annotations; replacements cannot advance until the original is confirmed Superseded; unresolved concerns survive participant replacement. This approval permits local implementation and tests. Hosted migrations still require a verified backup and staging-first acceptance before production promotion.

## Canonical requirements reconciliation

The approved October 21 ticket supersedes these older passages. Apply these exact behavioral changes in REQUIREMENTS.md and the corresponding sequence in lane-roadmap.md during implementation; do not mark any of them shipped before verification.

| Existing passage | Replacement contract for #58 |
| --- | --- |
| §4.4 creator submission records agreement | Submission records no approval. Each of the three distinct seats must explicitly Agree, including a creator who occupies a seat. |
| §4.4 creator represents one discipline | The creator may occupy one seat but need not. The three seats are named responsibilities, independent of profile role labels. A lead substitutes within one seat. |
| §4.4 same-Request material revisions and §4.5 renewed alignment | Freeze the submitted commitment. Material changes require a new linked Request and three fresh approvals. Attributable minor corrections remain alongside the original. |
| §5 material-change table | Before release, prepare a linked replacement and explicitly confirm the original as Superseded. Preserve both histories. After release, follow-ups do not erase measurement obligations; that release behavior belongs to later tickets. |
| Roadmap alignment scope | #58 covers agreement and recovery first; release and measured closure remain subsequent increments. Existing Open/In Progress/Done statuses survive. |

Preserve the existing rule that participant replacement cannot erase dissent. Preserve current guest visibility and comment access; guests cannot approve or advance work. Guest-created Request sponsorship remains unresolved in REQUIREMENTS.md and is not silently introduced here. Such Requests can remain visible to their creator and blocked from pickup until an approved sponsorship path exists.

## Proposed persistence contract

All timestamps are `timestamptz`, server-generated. IDs for new domain rows are UUIDs. Organization and user references use Clerk text IDs. Existing Request status enum remains unchanged.

### Existing requests table

- Add `agreement_revision integer NOT NULL DEFAULT 0 CHECK (agreement_revision >= 0)`. Every commitment/seat/concern/decision/correction/replacement authority mutation increments this while holding the Request lock. All new actions receive the expected revision; stale writes fail recoverably.
- Add `exception_closure jsonb NULL`. For #58 its only accepted value is `{version:1, kind:"exception", reasonCode:"superseded", reason:string, actorId:string, closedAt:ISODate, replacementId:UUID}`. The reason is nonempty. Absence is NULL, never an invented outcome. This is an immutable terminal exception fact, not a new board status. Ticket 3 must consume this fact rather than create a second competing closure authority.
- Add `UNIQUE (org_id,id)` to support composite tenant foreign keys below.
- Do not backfill approvals, snapshots, exceptions or dates. Existing records begin at revision zero with no agreement.

### request_agreements

One row per Request, including preparation before submission:

| Column | Contract |
| --- | --- |
| `request_id uuid PRIMARY KEY` / `org_id text NOT NULL` | Composite FK `(org_id,request_id)` to Requests; also unique `(org_id,request_id)` for audit FK. |
| `prepared jsonb NOT NULL` | Versioned preparation fields: scopeIncluded, scopeExcluded, audience, timing, constraints, feasibility, commitmentKind (`discovery` or `delivery`). Reuse saved context and impact; do not require duplicate essays. |
| `snapshot jsonb NULL` | NULL until submission; thereafter immutable version-1 commitment described below. |
| `submitted_by text NULL`, `submitted_at timestamptz NULL` | Both NULL before submission; both populated with snapshot. Submission never implies agreement. |
| `seats jsonb NOT NULL` | Object with exactly `pm`, `designer`, `developer`; each slot NULL while preparing, otherwise the participant record below. All slots required for submission. |
| `concerns jsonb NOT NULL DEFAULT '[]'` | Current concern records with stable UUID, author, explicit discipline seat (`pm`/`designer`/`developer`), seat generation, reason, openedAt and nullable resolution `{actorId,reason,resolvedAt}`. Decisions and resolution history also live in events. |

Snapshot version 1 contains title, description, confirmed framing and classification, all saved historical context, usefulLink, requestType, projectId, labelKeys, complete expectedImpact in its existing versioned representation, the seven preparation fields above, and uploaded attachment IDs belonging to the Request at submission. Store no signed URLs. Approval explicitly concerns intended scope and known feasibility, not an unseen final design. Retain original snapshot values when adding a correction.

Participant record: `{generation:positiveInteger, nominee:{kind:"member",userId} | {kind:"invitation",invitationId,email}, decision:null | {kind:"agree"|"request_changes"|"withdraw",actorId,at,reason}, displayNameAtSelection}`. Reasons are required for request_changes/withdraw. Invitation references are historical nominations, not membership records. Three distinct active user IDs are mandatory for agreement completion; reject duplicate normalized invitation emails and member/invite nominations for the same verified email at selection and submission. Recheck distinct user IDs after invitation redemption.

Database checks enforce JSON object/array types, submission nullability, allowed keys/discriminants, three seat keys, positive generations, and decision identity matching a member nominee. Strict server schemas validate bounded strings, exact snapshot shape and supported Expected impact versions. Neither client flags nor JSON claims establish membership. Index `org_id`; primary key handles Request lookup.

### request_agreement_events

`id uuid PRIMARY KEY`, `org_id text NOT NULL`, `request_id uuid NOT NULL`, `revision integer NOT NULL`, `operation_id uuid NOT NULL`, `actor_id text NOT NULL`, `kind text NOT NULL`, `payload jsonb NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

Composite FK to the agreement row, `UNIQUE(request_id,revision)`, `UNIQUE(org_id,actor_id,operation_id)`, and index `(org_id,request_id,created_at,id)`. Event kinds: prepared, submitted, decided, participant_replaced, invitation_resolved, concern_resolved, correction_added, replacement_created, superseded. Payload stores version 1, validated action input fingerprint, before/after attribution relevant to the event and the stable response needed for retries. Failed actions do not consume a revision or operation ID.

The same actor/operation ID plus the same input returns the saved result after visibility/authority checks. Reusing a key with different input fails. Concurrent identical operations serialize on the Request lock, then reread the event. A unique-key race across different Requests fails without applying either partial mutation. Events cannot be updated/deleted through application actions. No actor FK that would erase history when a person leaves.

### request_replacements

`original_id uuid PRIMARY KEY`, `replacement_id uuid NOT NULL UNIQUE`, `org_id text NOT NULL`, `created_by text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `reason text NOT NULL`, `changed_fields jsonb NOT NULL`, `confirmed_by text NULL`, `confirmed_at timestamptz NULL`.

Composite tenant FKs for both endpoints; `CHECK(original_id <> replacement_id)`; confirmation actor/time are both NULL or both present. Index `(org_id,replacement_id)`. Link creation produces a fresh Request, so cycles cannot be created by linking arbitrary saved Requests. One direct successor per original makes retries deterministic. A Request with an unconfirmed incoming replacement link cannot create or confirm its own successor: confirm its predecessor first. This prevents A remaining authorized while B is superseded by C. Reciprocal links are two views of this single row, not independently writable pointers.

The creator prepares the successor, reviews inherited context and edits affected values through existing Intake validation and AI confirmation. Do not duplicate comment authorship or approvals. Preserve private attachments as authorized references to the original attachment records with explicit source attribution; never share storage paths or create public files. Attachment reads must check current access to the source Request as well as the successor. Draft uploads stay owned by their original draft until normal save finalization.

Before confirmation the successor can be prepared and collect agreement but cannot advance. Confirmation locks both Requests in UUID order, verifies creator authority and neither endpoint is terminal, writes the original's exception_closure and link confirmation and event atomically. Original status is unchanged. Successor advancement becomes eligible only after that commit and its own complete agreement. Repeated confirmation returns the original result. Original discussion/history remain readable; no status, commitment or undo action may mutate its terminal record.

### Isolation and immutability

Use the existing server-only Drizzle security model documented in migration 0014: enable RLS, revoke anon/authenticated access, expose no Data API policies, and do not FORCE RLS on the server owner. Every read/write includes org_id; guests retain only existing own-Request reads/comments. Composite FKs prevent cross-workspace links. Add database triggers rejecting changed submitted snapshots, modified/deleted events and changed/cleared exception_closure. Application credentials must not expose these tables to clients.

## Action and concurrency boundary

New actions live alongside existing Request actions, not new routes. Every mutation takes `{orgId,requestId,expectedRevision,operationId}` plus its validated command input. Session identity comes only from the existing guards. Return `{success:true,revision,...stableResult}` or `{error:string}`; errors retain local input and offer reload/retry.

- `prepareAgreement`: Request creator who is a current non-guest workspace member saves preparation, explicit known feasibility concerns and nominations while unsubmitted. Known blockers become durable concern records on submission; each must be explicitly resolved with attribution before pickup. Feasibility prose alone is never a machine-verified absence of blockers. Existing title/description/impact edits remain available under current authority until submission.
- `submitAgreement`: Request creator who is a current non-guest workspace member freezes the exact current commitment and three nominees. Pending invitations are allowed; incomplete measurement or missing commitment fields produce field errors. Snapshot mismatch rejects stale submission.
- `decideAgreement`: current named member decides against snapshot and seat generation. Request changes or withdrawal opens a durable concern. Agree alone cannot erase open concerns.
- `resolveAgreementConcern`: concern author records a nonempty resolution; if unavailable and replaced, the current holder of that same discipline seat records the resolution with explicit attribution. Creator/admin status alone cannot resolve it. Resolving a concern does not itself approve the seat.
- `replaceAgreementParticipant`: Request creator who is a current non-guest workspace member records old/new nominee and required reason, increments seat generation and resets only that seat's decision. Other approvals remain; concerns remain.
- `addAgreementCorrection`: creator appends field reference, original wording, corrected wording and reason. Show both beside the immutable snapshot. Structured impact values, audience, scope and timing cannot change through this action. Lane cannot mechanically prove a prose clarification is immaterial; participants can request changes or withdraw. Material edits use the successor flow.
- `createAgreementReplacement` / `confirmRequestSuperseded`: use the existing Request creation contract, signed AI gate and atomic link/exception writes above.

Load members and pending invitations from Clerk using server calls. Admin invitations use existing Clerk organization UI, then refresh nominations. Non-admins see “Ask an admin to invite” and cannot invoke invitation creation. Resolve accepted invitations only through Clerk's accepted invitation, verified invited email on the signed-in user and current eligible organization membership; never trust a client email match. Revoked/expired invitations remain visible as unavailable and require replacement.

Before accepting a decision or advancing work, fetch current Clerk membership for the actor and all three nominees, fail closed on provider failure, then lock Request rows and recheck revision and decisions. Clerk and Postgres cannot share a transaction: membership is checked immediately before the database transaction; do not claim atomicity with an external membership revocation. No cross-request eligibility cache. Preparation, submission, participant replacement, corrections, successor creation and superseding require both `auth.userId === request.createdBy` and `auth.role !== "guest"`; admin status supplies no bypass. Existing pre-submission Request editing retains its separate creator/admin permission. Decision authority requires the exact current seat identity and generation.

All single/bulk pickup and Done paths, plus editing/current-value writes, acquire the same Request lock before checking agreement. Extend existing transaction/notification atomicity. Bulk operations lock UUIDs in order and report per-Request failure. Withdrawal racing pickup either blocks pickup first, or records a blocked In Progress Request after pickup; it never rewinds status. Further advancement is blocked. Retain existing undo only for nonterminal records and never use undo to clear agreement concerns.

Legacy Open records require submission and agreement before pickup. Legacy In Progress/Done records retain status and may prepare/submit agreement without reopening or fabricating historical approval. For legacy In Progress, Done remains allowed only while no agreement has been submitted, or once a submitted agreement is fully agreed with no unresolved concerns and all participants currently eligible. Submission switches it to the full agreement gate: partial approval without concerns also blocks Done. Release in the later ticket must require full agreement even when none was submitted previously. Explicit withdrawal always blocks further advancement.

## Scoped implementation sequence and acceptance

The already-approved seams are real server actions with test Postgres and controlled Clerk responses, plus the full browser journey. Apply the tdd skill one behavior at a time; do not introduce a parallel workflow engine for tests.

1. Reconcile REQUIREMENTS.md and lane-roadmap.md as above. Add the additive migration, schema declarations in `src/db/schema/request-agreements.ts` / `requests.ts` / `index.ts`, and migration fixtures. Prove legacy Open/In Progress/Done/history/measurement versions survive without invented values; prove tenant FKs and immutable history. Run focused tests and typecheck.
2. Add preparation/submission and decisions in `src/app/(app)/requests/[id]/agreement-actions.ts`, with versioned validation in `src/lib/request-agreement.ts` and Clerk reads in `src/lib/request-agreement-members.ts`. Prove distinct seats, creator not auto-approved, pending/accepted/revoked invitations, forged actors, guests, foreign workspace, stale snapshots and replay behavior at the action boundary.
3. Integrate guards in existing `actions.ts`, `edit-actions.ts`, intake saves and `src/lib/request-lifecycle.ts`. Prove single and bulk actions have identical guards, notification writes remain atomic, current-value edits cannot mutate frozen impact, and withdrawal races preserve a consistent durable result. Test legacy In Progress separately with no submission, partial approval without concerns, complete approval and withdrawn approval. Run focused tests and typecheck.
4. Add seat replacement, concern resolution, corrections and successor/superseding actions. Prove old-seat decisions fail, unchanged approvals survive, concerns cannot disappear, duplicate successor creation returns one Request, premature successor pickup fails, confirmation is atomic, exception closure is immutable and foreign attachment access fails. Exercise A→B pending followed by attempted B→C creation/confirmation and require denial until A→B is confirmed. Deny preparation, submission and seat replacement by unrelated members and noncreator admins.
5. Add Arc agreement controls to existing Request detail and shared editor; expose exact commitment, participants, pending invitation, reason entry, concerns, correction history and reciprocal links. Adapt existing row/bulk actions to eligibility. Use production components in Storybook; cover pending, errors, empty state, stale state, legacy state and blocked state. No new screen.
6. Exercise Intake → submission → three decisions → pickup → withdrawal → resolution → renewed agreement → Done, plus successor confirmation, through `e2e/request-agreement.spec.ts`. Verify reload persistence, keyboard/focus, desktop/mobile, light/dark and failed/repeated actions. Reuse `e2e/reliable-request-lifecycle-actions.spec.ts` patterns.
7. Run typecheck, full application suite once, full lint and design/token/provenance checks; browser tests and production build. Run implement's required code-review skill against the captured starting commit, resolve findings, update SESSION-STATE without including unrelated changes, and commit only this increment on the current branch.
8. Before any hosted migration, create and verify a database backup and restore rehearsal. Apply on staging and verify migration fixtures plus real multi-user journey; promote only after staging acceptance. Until then report local versus hosted evidence separately.

Release/measurement countdown, outcome forms, ownership transfer, post-release follow-ups, Done priority hiding and aggregate reports are not built by #58. Later release actions must reuse the same Request lock and immutable exception guard.

## Current evidence

Read issue #58, the local approved spec, AGENTS.md, SESSION-STATE, canonical alignment passages, Request schema, Clerk guards/roster helper, lifecycle and editing actions, migration 0014 and existing concurrency-test patterns. Working branch is `main`; baseline is `799b1aa5affe6e1432d07f82c9f7da4af03e3b37`. Pre-existing AGENTS.md/SESSION-STATE changes, docs/agents, docs/specs and debug-storybook.log are outside this proposal commit. No application code or database has changed; no implementation tests or hosted acceptance are claimed.
