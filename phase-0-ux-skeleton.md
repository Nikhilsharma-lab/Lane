# Phase-0 UX Skeleton — journeys & screens

The structural layer for Lane's journeys and screens. `DESIGN.md` supplies the Arc UI visual authority;
this document records product structure and states. Parts A/B describe the existing Phase-0 foundation and Requests scope, not a new
deployment verification. Part C records the approved 2026-09-28 target journey; only the bounded Expected
impact creation/review/detail addition is now implemented and locally verified.

---

## Part A — End-to-end journeys

The pieces assembled into the paths a real person walks.

**J1 · New user → first workspace**
Clerk sign up → verify email → Clerk create/join workspace → activate organization → onboarding:
functional label (PM/Designer/Developer) → land on empty Requests board.

**Decision 2026-09-24:** Clerk Organizations uses **Membership required**. Clerk handles the pending
`choose-organization` task in its authentication flow. Interrupted setup resumes through `/login`;
organization-less or pending sessions cannot enter Requests or save a Lane functional label.

**J2 · Invited user → joins a workspace**
Open Clerk invitation → sign in or sign up with the invited address → Clerk activates the organization
membership → onboarding functional label if missing → land on the shared board. Clerk owns mismatch,
expired, revoked, and already-member outcomes.

**J3 · Submit a request (the gate — the differentiator)**
Requests → New Request composer → title/description, Expected impact and optional Project, Request type, link/files →
Review Request → preparing review → human review → Create Request → save → upload any files → success.
Problem submissions retain the original Request; solution/hybrid submissions show an editable AI-suggested
problem and preserve the original ask. Every branch requires Create Request. Contextual creation closes
the composer, refreshes the originating view and offers Open Request in a toast; direct `/intake` creation
opens the saved detail. A file-upload failure happens after the Request is saved and has its own recovery.

**J4 · Work a request → Done**
Board → click a request → detail → Pick up (→ In Progress, assigned to me) → … → Mark Done (→ Done). Board
reflects each move.

**J5 · Discuss a request**
Detail → add a comment → appears in thread with name + time.

**J6 · Invite a teammate**
Settings → Members → Clerk Organization Profile → invite by email as Admin or Member → Clerk sends and
tracks the invitation. Resend, revoke, membership changes, and role changes stay inside Clerk.

**J7 · Change your role label**
Settings → Profile → role dropdown → persists; board/actions unchanged (label ≠ permission).

**J8 · Invited Guest submits a request** *(implemented; paid Clerk role required in production)*
Clerk `org:guest` invite → join as guest → sees only a "my requests" view → submit (through the gate) →
sees own request + status. No full board, pickup, or Members access.

---

## Part B — Screen inventory & states

**Source-refreshed 2026-10-06.** There are **10 Lane page routes** plus the separate marketing homepage.
`/auth/callback` is a transition endpoint. Review, upload recovery, menus and Clerk steps are connected
states, not additional Lane routes. The checklist below is the review coverage, not a claim that every
state has passed usability or hosted verification. Clerk-owned options depend on provider configuration.

**Current position:** the compact New Request composer is implemented, locally verified and accepted as
the input foundation. Expected impact (Metric or Verified result) now extends creation, signed review and
saved detail locally; local checks passed. Named trio agreement, launch, actual-result closure and
period totals remain target only. Part B maps current code; Part C maps the required target. Do not mistake
current instant pickup/Done for the target's agreement/closure.
Earlier signup/onboarding work remains on the full-journey checklist; it is not silently marked accepted.

### B1 — First entry, in journey order

| ID | Screen / step | States to walk through |
|---|---|---|
| E1 | Signup `/signup` | Empty/entered form; validation; existing account; email or configured provider path; submitting; provider/network failure; verification pending, invalid/expired code and resend; successful continuation. Clerk owns the nested identity screens. |
| E2 | Invitation branch | Signed out versus signed in; matching versus wrong email; new versus existing account; verification; valid, expired, revoked and already-accepted invitation; active membership; interrupted return. No separate Lane accept-invite route. |
| E3 | Workspace setup in Clerk | Create/join choices available to the account; invited organization activation; submission/failure; active organization; reload/interrupted task resumed at `/login`. Membership is required before Lane onboarding. |
| E4 | Role `/onboarding` | No selection; PM/Designer/Developer selected; saving; error/retry; existing role skips setup; missing active membership returns to login. Role labels do not grant access. |
| E5 | First Requests landing `/` | Loading; workspace has no Requests; guest has no own Requests; New Request CTA; admin invite entry; data-load failure. Keep first-use separate from a filter returning zero matches. |

### B2 — Create the first Request, in interaction order

| ID | Screen / step | States to walk through |
|---|---|---|
| C1 | Open New Request | Sidebar/button or `C`; lazy-loading form; contextual dialog or direct `/intake`; focus enters title; phone full-screen layout. |
| C2 | Write Request | Empty; title/description entered; Expected impact Metric/Verified result; optional unknown baseline; source/window; incomplete draft versus required review validation; submitting; close and reopen; restored text/review; legacy-only read-only earlier details. Impact controls are implemented and locally verified. The four removed inputs do not return. |
| C3 | Project picker | Unset; load; list; search; existing selection; clear; empty list; create by name; creating; duplicate/concurrent creation; load/create failure and retry; unavailable selection; long name. Preserve Request text throughout. |
| C4 | Request type picker | Unset; Bug/Improvement/New feature; search/no match; selected; clear; disabled while a conflicting operation is active. |
| C5 | Link and file selection | Add link collapsed/expanded; valid, invalid and restored link; invalid collapsed link opens/focuses on review. File chooser/drop; selected list; remove; disallowed type or size/count/total limit; reload requires file re-selection. |
| R1 | Preparing review | Normal wait; slow response cue; no duplicate submission; dismissal blocked while checking. |
| R2 | Review original Request | Problem branch: original title/description; saved-in-token Expected impact summary; optional metadata; exact related link and queued filenames/sizes; Edit Request; Create Request. Nothing is saved merely by reaching review. |
| R3 | Review AI suggestion | Solution branch: editable suggested problem followed by the original ask; edit validation; explicit AI attribution; back/edit and re-review; Create Request. Do not imply AI verified the claim. |
| R4 | Review problem plus suggested change | Hybrid branch: editable suggested problem, original ask and extracted proposed change; correct an inaccurate suggestion; same confirmation path. |
| R5 | Review preparation failure | Timeout; offline/network/provider failure; unusable AI response; rate limit; session expired; server field rejection. Keep draft; retry or sign in; return focus to the relevant control. |
| R6 | Leave, return or expire during review | Edit Request keeps entered properties/files; close/reopen keeps review in memory; reload restores text/review but not File objects; expired review offers Review again. Corrections survive retries for the same title/description. Changed text receives a fresh suggestion; earlier wording remains recoverable. |
| S1 | Create Request | Saving/pending; duplicate-click prevention; invalid edited problem; unavailable Project/type; session expiration; expired review; save/network failure. Preserve editable content and offer recovery. |
| S2 | Upload after save | No files skips upload; per-file queued/uploading/progress/uploaded states; active upload blocks accidental dismissal. The Request already exists at this point. |
| S3 | Recover failed uploads | One/some/all files fail; per-file retry/remove; retry failed files; skip failed files; removal failure; recovery after close/reopen; all failed files removed; success/open saved Request. Do not recreate the Request to retry a file. |
| S4 | Saved arrival | Dialog closes and originating page refreshes; success toast with Open Request. Direct `/intake` goes to detail. Verify creation while current status/search/Project/type filters hide the new row. |

**Review increment implemented locally (2026-10-06):** R2–R4 include the related link and queued file
names/sizes using the product's Arc review composition. The review explains that AI reads only title/description and
files upload after creation. R6 now binds retained wording to its reviewed title/description across
failed retries, reload and sign-in; legacy wording with an unknown origin is not silently reapplied.
Desktop/phone review and recovery checks passed; visual acceptance remains with Nikhil. Evidence:
`docs/superpowers/plans/2026-10-06-request-review.md`. This does not implement trio agreement.

**Connected gaps to resolve in this order:**

1. S3: after all failed files are removed, **View Request** calls the generic finish handler, which only
   closes the contextual composer and shows a toast. Its label and destination disagree.
2. S3: saved creation clears the text draft before uploads. Reload loses unfinished-file retry state;
   the saved Request remains. Review that warning/recovery without implying files were saved successfully.
3. S4: retained filters can hide the new Request. Decide a clear way to reach it while preserving the
   user's list state; clearing every filter silently is not an approved solution.

### B3 — Find, work and discuss Requests

| ID | Screen / step | States to walk through |
|---|---|---|
| W1 | Populated Requests `/` | One/many Requests; all/Open/In Progress/Done; title search; Project/type including unset filters; combinations; clear filters; no matches; sort; columns; pagination; loading/error; preserved list state and focus after returning from detail. Only the latest 200 are fetched. |
| W2 | Request detail `/requests/[id]` | Loading; Open/unassigned; In Progress/current owner; Done; original versus confirmed problem; Project/type unset or selected; minimal versus long content; retained legacy details/link/files; desktop secondary list versus phone back navigation. |
| W3 | Pickup and completion | Eligible member picks any Open Request; pending; success; another person already picked it up; stale status; network/server failure and refresh/retry. Completion pending/success/failure; moved outside current filter. Guests have no lifecycle actions. |
| W4 | Discussion | No comments; existing thread; blank/entered comment; length validation; submitting; success; failure retaining text; retry; keyboard submit. |
| W5 | Saved files | None; file list; download pending; successful private download; inaccessible/missing file or expired session; error/retry. No post-creation file upload/edit/delete interface currently exists. |
| W6 | Unavailable Request | Malformed ID, missing Request, wrong workspace or unauthorized access share Request unavailable; offer a safe return to Requests. Do not disclose another workspace's Request. |

**Rule to review explicitly at W3:** current server behavior allows any non-guest member to mark an
In Progress Request Done. It is not restricted to its current owner. Preserve the existing guard until
Nikhil chooses a different rule; do not silently equate free pickup with ownership of completion.

### B4 — Supporting and returning-user branches

| ID | Screen / step | States to walk through |
|---|---|---|
| A1 | Notifications popover | Unread count; loading; empty; populated; read/unread; mark all read; load/action failure; retry; open linked Request; unavailable target; guest visibility. Latest 30 only. Do not promise invite-accepted notifications: a renderer exists but no current application emitter was found. |
| A2 | Members `/settings/members` | Loading; member list; invitation dialog; pending invite; resend/revoke; acceptance; role/remove/leave controls according to Clerk permissions; failure; guest redirected away. Run invitation through E2 to first use. |
| A3 | Profile `/settings/profile` | Current role; changed/unchanged selection; save; pending; success/error; missing profile returns to onboarding; System/Light/Dark browser-local theme; reload and system-theme behavior. |
| A4 | Returning login `/login` | Credentials/configured provider; validation; loading; failure/retry; additional verification; session activation; intended destination; pending organization/reset task; sign-out and return. |
| A5 | Recovery `/forgot-password` and `/reset-password` | Email; sending; code/new password; invalid/expired code; resend cooldown; change email; validation; provider failure; password updated but session activation failed; retry activation; additional security factor; interrupted/mandatory reset; return to workspace. |
| A6 | Shared navigation and failures | Expanded/collapsed sidebar; phone drawer; workspace/account menus; active location/status links; New Request from different pages; keyboard/escape/focus return; app error and retry; route loading; unknown-route default Next 404. |
| A7 | Marketing and launch rehearsal | Separate marketing homepage: positioning, truthful capabilities, CTA/signup/login destinations, phone navigation and errors. Rehearse new creator, invited teammate, returning user and recovery through a real Request on the intended release environment. |

**Settings boundary:** Members and Profile are the only Lane Settings routes. The current embedded Clerk
Members host also exposes a General hash panel; this must be explicitly reviewed against the intended
scope and privileges. Its presence is not authorization to add Lane billing, deletion or settings pages.

**Applied to every relevant row:** desktop/light and phone/dark; keyboard and focus; accessible labels
and feedback; long/empty content and zoom; reload/back/deep link; current member/admin/guest access;
session or workspace changes; pending/error/retry without lost or duplicated data. Mark user acceptance,
local verification and hosted release evidence separately. This inventory does not declare production ready.

---

## Part C — Approved target journey (2026-09-28; clarified 2026-10-06; not fully implemented)

The canonical rules are in `REQUIREMENTS.md` §§4–7. These are journey moments inside the Requests product,
not approval for new routes, board columns, schema, or a separate Roadmap application.

1. **Create and frame:** record the Request and its expected impact during creation → human-confirmed
   problem and expected result → select its named PM, Designer and Developer. Preserve the original
   prediction. Expected impact creation, signed review and read-only saved detail are implemented locally;
   local checks passed. Naming participants and agreement remain target only. The removed vague
   research fields do not return. Saving a Request does not authorize execution under this target.
2. **Align:** agree on bounded discovery or delivery, including scope, timing, success, guardrails,
   complexity, dependencies, and unknowns. The other two participants explicitly align. A disagreement
   needs a short reason and blocks progress; no timeout or administrator override supplies agreement.
3. **Schedule and assign:** the trio agrees a start window; administrators can help resolve capacity
   conflicts. The creator/admin may assign the Designer, or a Designer may pick up unassigned work.
   Assignment is not agreement or permission to start; a replacement acknowledges the current agreement
   and cannot erase an unresolved concern.
4. **Explore as needed:** linked research, flows, designs, prototypes, or technical experiments support
   nonlinear work. Routine iterations stay in the Request. Material changes amend its agreement and
   require realignment; no mandatory diary or stage-by-stage completion.
5. **Ready to build → build:** confirm complete readiness for the agreed release. Use existing design and
   engineering evidence rather than retyping it in Lane; specialist implementation stays in its tools.
6. **Ready to release → release:** confirm relevant verification, measurement, audience, rollout/recovery,
   and ownership. Release is not inferred from a completed engineering task.
7. **Measure → close:** at the agreed post-launch window, the person who submitted the Request records
   actual results and evidence, compares them with the prediction and records the conclusion. Active work
   can be Done while the outcome is still Measuring. Closure requires actual results or a separately
   recorded exception with a reason; exceptions are excluded from measured-impact totals. The submitter
   owns closure even when someone else is the named PM; visible transfer remains recovery for lost access.
   A positive result is not required for closure.
8. **Further work → follow-up:** outcome-closed Requests do not reopen. New post-release work has a linked
   follow-up Request and fresh agreement/outcome. Closed-record factual corrections are append-only.
9. **Quarter/year review:** derive product-level results from the same Request records. Show actual versus
   predicted results, outstanding measurements and exceptions separately. Define the reporting period and
   combine only compatible, non-duplicated results; do not invent an overall impact score from unrelated
   metrics or use outcome reporting to rank individuals.

Across this chain, the product/journey record links the current experience, changes, decisions, design/dev
references and results. Its representation and Request-to-journey relationships remain design decisions;
the current flat Projects/list are not proof that this source-of-truth foundation exists.

**State-design checklist added by this clarification:** Expected impact missing/entered, unknown baseline,
both modes and review/detail continuity are implemented locally and under validation. Remaining target states:
discovery handling; participants missing, awaiting one/two/all agreements, recorded concern,
resolved concern and material change requiring renewed agreement; launch not yet happened/partial/complete;
measurement not due/due/overdue, measured above/met/below expectation, inconclusive/unavailable/never launched;
closure blocked/ready/closed, attributable ownership transfer and immutable corrections; quarter/year with
no launches, unmeasured work, mixed units, shared/overlapping results and exceptions. The remaining target
states are not approved enum names or a claim that they are already implemented.

**Target states to design when the increment is selected:** awaiting participants/alignment; a specific
concern and its resolution; material agreement revision; participant replacement; assigned-but-not-started;
readiness incomplete/complete; released-and-measuring; truthful exception closure; immutable closed history;
follow-up creation/linkage. These describe UX cases, not approved database enum names. No guest access or
functional-label permissions may be broadened implicitly while designing them.

---

## What this is NOT

- **Not visual design.** No colors, type, spacing, motion — those are your system, applied on top. This says
  *what's on each screen and what states exist*, not what it looks like.
- **Not the whole suite.** Ideas / Docs / Insights journeys are deliberately absent until those phases are
  selected by real usage. The approved pipeline above is not implemented by this document; outcome screens
  need a scoped increment and state review. Agentic design operations remain vision only.
- **Not a substitute for per-screen review.** Screen-level UX detail still gets nailed down in each gated
  build prompt and refined through your design eye — this is the shared skeleton, not the final pixels.
