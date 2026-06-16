# Phase-0 UX Skeleton — journeys & screens

The structural layer between the architecture (PLANE-MAP), the IA conventions (conventions-plan), and your
visual design (globals.css tokens). **Structure only — no colors, type, or look here; your design system
dresses every screen.** Scope: Phase 0 (foundation + the Requests app). Later apps get drawn when they're real.

---

## Part A — End-to-end journeys

The pieces assembled into the paths a real person walks.

**J1 · New user → first workspace**
Sign up → verify (deferred for dev) → onboarding: profile + functional label (PM/Designer/Developer) →
workspace step: no pending invites, so CREATE → name workspace → land on empty Requests board.

**J2 · Invited user → joins a workspace**
Open invite link → not signed in → sign up (email prefilled from invite) → onboarding profile + label →
workspace step: pending invite exists, so JOIN view → "Join {workspace}?" → land on the shared board as member.
*(Branch: already in a workspace → blocked "coming soon," invite stays pending.)*

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
Settings → Members → Invite → enter email(s) + role → copy link → share manually. Re-invite same email →
refreshes, no dupe. Revoke → link dies.

**J7 · Change your role label**
Settings → Account/Profile → role dropdown → persists; board/actions unchanged (label ≠ permission).

**J8 · Guest submits a request** *(next increment, not Phase 0 core)*
Guest invite → join as guest → sees only a "my requests" view → submit (through the gate) → sees own request
+ status. No board, no pickup, no members.

---

## Part B — Screen inventory & states

Each screen, with the states that must exist (so none ships as a blank panel or an unhandled error).

| Screen | Route | Key states |
|---|---|---|
| Sign in | `/login` | default · invalid creds · loading |
| Sign up | `/signup` | default · taken email · validation · loading |
| Forgot / reset password | `/forgot-password` | request · sent · reset · invalid token |
| Onboarding: profile + label | `/onboarding` | default · saving |
| Onboarding: create-or-join | `/onboarding` | CREATE (no invites) · JOIN (invites>0, w/ "create instead") |
| App shell (top bar + sidebar) | wraps all | single-app (rail hidden) · later: multi-app (rail shown) |
| Requests board | `/` | empty ("first request" CTA) · populated · loading |
| Intake / gate | `/intake` | input · classifying · reframed (editable) · looks-good · error/timeout |
| Request detail | `/requests/[id]` | open · in-progress · done · not-found (bad id) · loading |
| Comments (in detail) | — | empty · thread · posting |
| Members | `/settings/members` | members + pending invites · empty ("invite your team") |
| Invite modal | — | default · multi-email · already-member · refreshed |
| Invite accept | `/invite/[token]` | not-signed-in · join-prompt · email-mismatch · expired · revoked · already-member |
| Settings: workspace | `/settings` | general · members |
| Settings: account/profile | `/settings/profile` | label dropdown · name · saving |
| Guest "my requests" *(next)* | `/my-requests` | empty · own-only list |

**States that are easy to forget and must not be:** empty (every list), loading (every fetch), error
(every action — especially the gate timeout and bad-UUID 404), and the invite-accept branches (the spec's
edge-case table maps to real screens here).

---

## What this is NOT

- **Not visual design.** No colors, type, spacing, motion — those are your system, applied on top. This says
  *what's on each screen and what states exist*, not what it looks like.
- **Not the whole suite.** Ideas / Docs / Insights journeys are deliberately absent until those phases are
  real and validated.
- **Not a substitute for per-screen review.** Screen-level UX detail still gets nailed down in each gated
  build prompt and refined through your design eye — this is the shared skeleton, not the final pixels.
