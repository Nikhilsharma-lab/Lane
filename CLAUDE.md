# Lane — CLAUDE.md

> This file is one page on purpose. The last version was 250KB. That file *was* the over-scoping.
> If this file grows past one page, something has gone wrong.

## What Lane is

Lane is design-ops software built on one belief: **surveillance produces performance; support produces truth.**
No time tracking, no "last active," no utilization percentages. Ever. This is a product value, not a missing feature.

## The MVP — in three sentences

1. On first login a person picks a role — **PM, Designer, or Developer** (a label, editable later in Settings; it does NOT change what they can see or do). Anyone can submit a design request through an intake form, and before a request can be saved, an AI gate classifies it as a **problem**, a **solution**, or a **hybrid**, reframing solution-shaped requests into a problem the submitter confirms.
2. Accepted requests land on a shared board the whole workspace sees with a dead-simple lifecycle — **Open → In Progress → Done**; anyone can pick up an Open request (it becomes In Progress, assigned to them) and mark it Done. The view and actions are identical for every role.
3. That is the entire product — no design stages, no analytics, no Figma, no automation, no email digests, no AI beyond the intake gate.

## The only screens that exist in the MVP

1. **Auth** — login / signup / accept-invite. (Built fresh, see SALVAGE.md.)
2. **Onboarding** — pick a role (PM / Designer / Developer) and create or join a workspace. Role editable later in Settings.
3. **Intake** — the request form + the AI gate. This is the whole point of the product.
4. **Requests** — one workspace-wide board everyone sees, grouped Open / In Progress / Done. Same view for every role.
5. **Request detail** — view one request; anyone can pick it up, mark it Done, and comment. No role-gated actions.
6. **Settings → Members** (invite teammates) + **Settings → Profile** (change your role). Nothing else under settings.

If a screen isn't on this list, it does not get built without an explicit written decision from Nikhil first.

## Vocabulary (locked — never rename)

Requests (not tickets/tasks) · Intake (not backlog) · Prove (not sign-off) · Ideas (not idea board) ·
Active Requests (not streams). Roles: **PM / Designer / Developer** (on `profiles.role`).
Request lifecycle for the MVP is just **Open → In Progress → Done** — the Sense/Frame/Diverge/Converge/Prove
design stages are DEFERRED, not built now.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (ONE environment for now — no prod/staging split until the trigger below) · Drizzle ORM · Vercel (Hobby, preview deploys = staging for now) · Anthropic via Vercel AI SDK (intake gate uses claude-haiku-4-5).

## Working rules (the part that actually matters)

- **Pace to comprehension, not output.** v1 was 873 commits in two months — ~13/day. That pace is how the mess happened. If Nikhil can't explain in plain English what shipped, it shipped too fast.
- **One user-touchable thing per week.** "Real" = a person could open the app and use it. Refactors and plumbing don't count.
- **Read before writing.** Never change a file without reading it first.
- **No new tables, routes, AI calls, or cron jobs without explicit written approval.** Default answer to "should we also build X" is no.
- **Same view for everyone.** PM/Designer/Developer is a label, not a UI or permission gate. No role-based
  view differences, per-role dashboards, or hidden actions. (Workspace owner-vs-member is the only permission tier.)
- **Migrations are canonical.** Schema files describe intent.

## Do NOT build (these sank v1 — they are banned until there is a paying customer asking)

Figma integration · morning briefings · weekly digests · any cron job · radar · stickies · initiatives ·
reflections · insights / design-ROI · impact prediction · prediction-confidence · handoff briefs ·
iteration summaries · PM calibration · multi-workspace · published views · the Year-2 PM and Year-3 Research roadmap ·
the 5 design stages (Sense/Frame/Diverge/Converge/Prove) and all phase/kanban/track enums · the `user_functional_tags` table (role lives on `profiles.role`).

## BEFORE FIRST PAYING CUSTOMER — do not skip

> Trigger: the first paying customer, OR the first time there are users whose data you'd be upset to lose —
> whichever comes first. When that's on the horizon, every item here must be done. This list is why it
> lives in the file you read every session, not in your head.

- [ ] **Split prod / staging.** Second Vercel project + a second Supabase database for staging.
      Rule that broke v1 last time: migrations run on STAGING first, verified, THEN promoted to prod. Never reverse.
- [ ] **Supabase Pro** — for backups / point-in-time restore. (Free tier has no real backup.)
- [ ] **Vercel Pro** — Hobby prohibits commercial use; you cannot legally charge on it.
- [ ] **Custom domain** — point app.uselane.app at the prod Vercel project.
- [ ] Confirm RLS isolation holds with a fresh second account before anyone real signs up.
