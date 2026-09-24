# Phase-0 UX Skeleton — journeys & screens

The structural layer between the architecture (PLANE-MAP), the IA conventions (conventions-plan), and your
visual design (globals.css tokens). **Structure only — no colors, type, or look here; your design system
dresses every screen.** Scope: Phase 0 (foundation + the Requests app). Later apps get drawn when they're real.

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
Board → New request → type a request → gate classifies → if solution-shaped: reframed problem shown
(editable) → confirm → lands on board under Open. If problem-shaped: "Looks good" + optional suggestions →
lands on board.

**J4 · Work a request → Done**
Board → click a request → detail → Pick up (→ In Progress, assigned to me) → … → Mark Done (→ Done). Board
reflects each move.

**J5 · Discuss a request**
Detail → add a comment → appears in thread with name + time.

**J6 · Invite a teammate**
Settings → Members → Clerk Organization Profile → invite by email as Admin or Member → Clerk sends and
tracks the invitation. Resend, revoke, membership changes, and role changes stay inside Clerk.

**J7 · Change your role label**
Settings → Account/Profile → role dropdown → persists; board/actions unchanged (label ≠ permission).

**J8 · Invited Guest submits a request** *(implemented; paid Clerk role required in production)*
Clerk `org:guest` invite → join as guest → sees only a "my requests" view → submit (through the gate) →
sees own request + status. No full board, pickup, or Members access.

---

## Part B — Screen inventory & states

Each screen, with the states that must exist (so none ships as a blank panel or an unhandled error).

| Screen | Route | Key states |
|---|---|---|
| Sign in | `/login` | default · invalid creds · loading · resume Clerk organization task |
| Sign up | `/signup` | default · taken email · validation · loading · Clerk organization task |
| Forgot / reset password | `/forgot-password` | request · sent · reset · invalid token |
| Onboarding: organization | Clerk auth flow at `/signup` or `/login` | pending create/join · invited organization activation · interrupted task recovery |
| Onboarding: functional label | `/onboarding` | active organization required · default · saving · recoverable error · existing label skips to Requests |
| App shell (top bar + sidebar) | wraps all | single-app (rail hidden) · later: multi-app (rail shown) |
| Notifications popover | shell | unread count · loading · empty · list · read/unread |
| Requests board | `/` | empty ("first request" CTA) · populated · loading · optional `?status=` filter |
| Intake / gate | `/intake` | input (title, description, optional evidence fields, attachments) · classifying · reframed (editable) · looks-good · error/timeout |
| Request detail | `/requests/[id]` | open · in-progress · done · not-found (bad id) · loading |
| Comments (in detail) | — | empty · thread · posting |
| Members | `/settings/members` | Clerk Organization Profile: members · invitations · roles · leave organization |
| Invite flow | Clerk-hosted route/email | not-signed-in · email verification · expired/revoked · already-member |
| Settings: workspace | `/settings` | general · members |
| Settings: account/profile | `/settings/profile` | label dropdown · browser-local theme · saving |
| Guest "my requests" *(shipped at `/` for guests)* | `/` | empty · own-only list |

**States that are easy to forget and must not be:** empty (every list), loading (every fetch), error
(every action — especially the gate timeout and bad-UUID 404). Clerk owns and tests authentication,
organization, membership, and invitation edge states; Lane tests its routing and authorization boundary.

---

## What this is NOT

- **Not visual design.** No colors, type, spacing, motion — those are your system, applied on top. This says
  *what's on each screen and what states exist*, not what it looks like.
- **Not the whole suite.** Ideas / Docs / Insights journeys are deliberately absent until those phases are
  selected by real usage. Outcome learning and agentic design operations are also vision, not Phase-0 screens.
- **Not a substitute for per-screen review.** Screen-level UX detail still gets nailed down in each gated
  build prompt and refined through your design eye — this is the shared skeleton, not the final pixels.
