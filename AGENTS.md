# Lane — AGENTS.md

> This file is one page on purpose. The last version was 250KB. That file *was* the over-scoping.
> If this file grows past one page, something has gone wrong.

## What Lane is

Lane is design-ops software built on one belief: **surveillance produces performance; support produces truth.**
No time tracking, no "last active," no utilization percentages. Ever. This is a product value, not a missing feature.

## The MVP — in three sentences

1. On first login a person picks a role — **PM, Designer, or Developer** (a label, editable later in Settings; it does NOT change what they can see or do). Anyone can submit a design request through an intake form, and before a request can be saved, an AI gate classifies it as a **problem**, a **solution**, or a **hybrid**, reframing solution-shaped requests into a problem the submitter confirms.
2. Accepted requests land on a shared board the whole workspace sees with a dead-simple lifecycle — **Open → In Progress → Done**; anyone can pick up an Open request (it becomes In Progress, assigned to them) and mark it Done. The view and actions are identical for every role.
3. That is the entire product — plus invited-guest isolation and lightweight in-app notifications already shipped to support this loop. No design stages, analytics, Figma, automation, email digests, or AI beyond the intake gate.

## The only screens that exist in the MVP

1. **Auth** — login / signup / accept-invite. (Built fresh, see SALVAGE.md.)
2. **Onboarding** — pick a role (PM / Designer / Developer) and create or join a workspace. Role editable later in Settings.
3. **Intake** — the request form + the AI gate. This is the whole point of the product.
4. **Requests** — one workspace-wide board everyone sees, grouped Open / In Progress / Done. Same view for every role.
5. **Request detail** — view one request; anyone can pick it up, mark it Done, and comment. No role-gated actions.
6. **Settings → Members** (invite teammates) + **Settings → Profile** (change your role). Nothing else under settings.

Settings → Profile is shipped. Invited Guest is shipped: guests are limited workspace members who see and comment on only their own Requests, and cannot pick up work or access Members. Public / anonymous Intake is separate and deferred.

If a screen isn't on this list, it does not get built without an explicit written decision from Nikhil first.

## Vocabulary (locked — never rename)

Requests (not tickets/tasks) · Intake (not backlog) · Prove (not sign-off) · Ideas (not idea board) ·
Active Requests (not streams). Roles: **PM / Designer / Developer** (on `profiles.role`).
Request lifecycle for the MVP is just **Open → In Progress → Done** — the Sense/Frame/Diverge/Converge/Prove
design stages are DEFERRED, not built now.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (production + free Lane Staging project; migrations run on staging first) · Drizzle ORM · Vercel (Hobby; separate production + staging projects) · Anthropic via Vercel AI SDK (intake gate uses Codex-haiku-4-5).

## Working rules (the part that actually matters)

- **Pace to comprehension, not output.** v1 was 873 commits in two months — ~13/day. That pace is how the mess happened. If Nikhil can't explain in plain English what shipped, it shipped too fast.
- **One user-touchable thing per week.** "Real" = a person could open the app and use it. Refactors and plumbing don't count.
- **Read before writing.** Never change a file without reading it first.
- **No new tables, routes, AI calls, or cron jobs without explicit written approval.** Default answer to "should we also build X" is no.
- **Same view for everyone.** PM/Designer/Developer is a label, not a UI or permission gate. No role-based
  view differences, per-role dashboards, or hidden actions. (Workspace owner-vs-member is the only permission tier.)
- **Actions receive context for workspace, derive identity from the session.** Server actions take
  `{orgId}` from the page render; they must NOT call `ensureWorkspace`/`getWorkspace` to re-derive which
  workspace they're in. (This bug recurred three times — it lives here now so it stops.) **However,
  `userId` must NEVER come from client-passed arguments.** Server action arguments travel over HTTP and
  are forgeable. Identity is derived inside the shared guards (`requireActiveMember` / `requireOwnerOrAdmin`
  in `src/lib/auth-guard.ts`) via `auth.getUser()` — the httpOnly session cookie is unforgeable. Actions
  use the guard's returned `auth.userId` for every identity field (assignedTo, authorId, createdBy, invitedBy).
- **Deferred work is tracked in DEFERRED.md**, by trigger. Daily reviews feed it. Nothing deferred may
  vanish — pre-launch items are built or deleted before the first paying customer.
- **Migrations are canonical.** Schema files describe intent.
- **This file is the primary repository instruction file.** `CLAUDE.md` is only a compatibility pointer.

## Do NOT build (these sank v1 — they are banned until there is a paying customer asking)

Figma integration · morning briefings · weekly digests · any cron job · radar · stickies · initiatives ·
reflections · insights / design-ROI · impact prediction · prediction-confidence · handoff briefs ·
iteration summaries · PM calibration · multi-workspace · published views · the Year-2 PM and Year-3 Research roadmap ·
the 5 design stages (Sense/Frame/Diverge/Converge/Prove) and all phase/kanban/track enums · the `user_functional_tags` table (role lives on `profiles.role`).

Long-term outcome learning and agentic design operations are product vision only. They add no current build authority. PM calibration scores and rankings are permanently refused.

## FREE PILOT → FIRST PAYMENT — do not skip

> Decision (2026-07-12): run a non-commercial pilot with up to 20–30 free users on the free tiers. No payment
> may be accepted on Vercel Hobby. Upgrade before the first payment, or earlier if pilot data becomes valuable
> enough that losing it would materially hurt. Until managed backups exist, take and verify a manual database
> export before every migration; run and verify migrations on staging before production.

- [x] **Split prod / staging.** Completed 2026-07-13: free `Lane Staging` Supabase project in Tokyo,
      initialized from canonical migrations, plus a separate `lane-staging` Vercel Hobby project at
      `https://lane-staging.vercel.app`. Live verification covered signup, Resend confirmation, onboarding,
      the persistent invite step, invite acceptance, membership creation, and the shared Requests board.
      Migrations run on STAGING first, are verified there, and only then may be promoted to production.
- [ ] **Supabase Pro** — required at the trigger for managed daily backups. PITR is a separate paid add-on and
      requires its own explicit cost decision; do not describe it as included in Pro.
- [ ] **Vercel Pro** — required before accepting the first payment; Hobby remains free-pilot/non-commercial only.
- [x] **Custom domain** — `app.uselane.app` is production; `www.uselane.app` permanently redirects to it.
- [x] Confirm workspace isolation with fresh second accounts before anyone real signs up. Verified by the
      live browser E2E in `e2e/workspace-isolation.spec.ts` (own board visible; cross-workspace board/detail denied).


## Roadmap & phases
- **Current phase: Phase 0 functional loop shipped → pre-GTM gate.** Foundation + Requests app, including Settings → Profile, is built and merged.
  The pre-GTM launch list (16 must-build + 5 must-decide) lives in `lane-roadmap.md` §3a.
  Full sequence + the thesis filter (adopt / reconceive / refuse) live in `lane-roadmap.md`.
- **Canonical planning docs** (re-read at the start of a new phase): `lane-roadmap.md` (sequence),
  `conventions-plan.md` (IA / roles / invites wiring, grounded in Plane source), `phase-0-ux-skeleton.md`
  (journeys / screens / states), `PLANE-MAP.md` (reference terrain).
- **Phase checkpoint (so later phases aren't forgotten):** a phase is done only when it ships AND real design
  leads are using it. At that point — not on a date — re-read `lane-roadmap.md`, confirm validation, let usage
  pull the next increment, and update "Current phase" above. Phase 2+ is a hypothesis until Phase 0/1 is in
  real use; the four design leads are the instrument that decides the order.
