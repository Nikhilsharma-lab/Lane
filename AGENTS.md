# Lane — AGENTS.md

> This file is one page on purpose. The last version was 250KB. That file *was* the over-scoping.
> If this file grows past one page, something has gone wrong.

## What Lane is

Lane's foundations are **one source of truth for the product/journeys** and **predicted versus actual impact**, per Request and quarter/year. Optional reviewers advise before pickup and never gate it; the submitter owns results/closure. Documented exceptions stay outside measured-impact totals. Target authority: `REQUIREMENTS.md` (2026-10-06); this is not all implemented. **Support, not surveillance:** no time tracking, last active, utilization or individual rankings.

## Current implementation — target contract is in REQUIREMENTS.md

1. On first login a person creates or joins a Clerk workspace, then picks a role — **PM, Designer, or Developer** (a label, editable later in Settings; it does NOT change what they can see or do). Anyone can submit a design request with a title, freeform description and Expected impact (Metric or Verified result), optional Project, Request type, related link and private file attachments; before a request can be saved, an AI gate classifies it as a **problem**, a **solution**, or a **hybrid**, reframing solution-shaped requests into a problem the submitter confirms.
2. The current app has a shared **Open → In progress → Done → Measuring → Closed** board with pickup/completion, comments and private attachments; eligible non-guests share the same view. Expected impact creation → signed review → saved detail is implemented and locally verified. This is implementation scope, not proof that every production release gate passed.
3. **Confirmed 2026-09-28 target:** optional reviewers on a Request (Looks good / Raise a concern; never block pickup; an edit resets answers; delete before pickup), assignment separate from start, complete readiness, success/evidence, Requester-owned outcome closure and linked follow-ups; Closed never reopens. See `REQUIREMENTS.md` §§4–5. Alignment, launch and actual-result closure remain target only; quarter/year totals are approved (2026-10-23, #151) and built on the integration branch, not yet shipped; the local Expected impact increment does not implement the whole pipeline.

## The only screens that exist in the MVP

1. **Auth** — login / signup / accept-invite.
2. **Onboarding** — create/join a Clerk workspace → pick a role (PM / Designer / Developer) → Requests. Membership is required; interrupted Clerk organization tasks resume at `/login`. Role editable later in Settings. Then a first run on Requests (#217, integration branch): the workspace's first person is guided to file a first real Request, people who join later are shown their Inbox; skippable, reopened from "First-run guide" in the account menu; no new route.
3. **Intake** — title/description, Expected impact, optional Project, Request type, Add link and private attachments + the AI gate. Earlier draft details remain visible read-only; existing saved context is preserved.
4. **Requests** — one workspace-wide board everyone sees, grouped by the five Request statuses (Open / In progress / Done / Measuring / Closed), with an optional `?status=` filter. Same view for every role. The workspace search pane (`/`) belongs to this screen: Requests and Projects by saved code, title, description and Expected impact text, with status, type and created-date filters, recent searches and a result preview; Enter on an exact saved code opens that Request. Whitelisted 2026-10-10; this scope approved 2026-10-20. Saved views (#219, integration branch): anyone, Viewers and Guests included, saves the list's status and Project filters under a name; their own views sit under "Your views" in the sidebar and open through the normal list; personal only, never shared or published.
5. **Request detail** — current problem/context, saved Expected impact, pickup, Done and comments; confirmed alignment/readiness/outcome additions need scoped implementation approval. Profile labels never gate actions; named Request responsibilities may. Same problem links group repeat attempts into numbered Iterations, shown in an "Iterations of this problem" section (#218, integration branch; Admins and Members link, Guests see none).
6. **Inbox** — one page of a person's updates, the list beside the Request preview; the sidebar bell leads to it (approved in #195, 2026-10-25, on the integration branch).
7. **Settings → Members** (invite teammates and change their roles, live from Clerk; #210) + **Settings → Profile** (change your role; includes browser-local theme preference) + **Settings → Metrics** (the workspace's Metrics library; Members and Admins edit, Viewers read; approved in #195, 2026-10-25, on the integration branch) + **Settings → Inbox delivery** (Email, Slack DM or Off per workspace; #206/#207, same approval) + **Settings → Slack** (Admins connect or disconnect Slack; #207, same approval, switched off until Nikhil approves the Slack app) + **Settings → Billing** (Admins see the Free Requests left, the one plan, seats, next bill and invoices, pay by card on the payment provider's hosted checkout, and change period, card or cancel on its hosted pages; a lapsed plan blocks only new Requests; #213/#214/#216, same approval; nothing is blocked and nothing can be paid while `LANE_BILLING_ENFORCED` is off, and paying also needs the Stripe keys). Nothing else under settings.

Settings → Profile is shipped. Guest enforcement is implemented: a Clerk `org:guest` sees and comments on only their own Requests, and cannot pick up work or access Members; a Guest files without a prediction and a Member takes the Guest submission on as its Requester (#212, integration branch). A Clerk `org:viewer` (#210, integration branch) reads what a Member reads except Members, and changes nothing. Clerk production custom roles require Enhanced B2B; until that plan is approved, production invitations are Admin or Member only (`LANE_CUSTOM_ROLES` stays off). Public / anonymous Intake is separate and deferred.

If a screen isn't on this list, it does not get built without an explicit written decision from Nikhil first.

## Vocabulary (locked — never rename)

Requests (not tickets/tasks) · Intake (not backlog) · Prove (not sign-off) · Ideas (not idea board) ·
Active Requests (not streams). Roles: **PM / Designer / Developer** (on `profiles.role`).
Request status is one line: **Open → In progress → Done → Measuring → Closed**; "Closed without a result" is a
form of Closed (#127, 2026-10-22). The person who closes is the **Requester** (not owner/creator). The
Sense/Frame/Diverge/Converge/Prove design stages are DEFERRED, not built now.
Request status, people, reviewer terms and retired words (Agreement, Design review): `GLOSSARY.md`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Arc UI (shadcn CLI is registry transport only) · Clerk (users, sessions, organizations, memberships, roles, invitations) · Supabase (Postgres + private attachment storage only; production + free Lane Staging project; migrations run on staging first) · Drizzle ORM · Vercel (Hobby; separate production + staging projects) · Anthropic via Vercel AI SDK (intake gate uses `claude-haiku-4-5`, see `src/lib/ai/triage.ts`).

## Agent skills

For issue/spec work, use GitHub Issues in `Nikhilsharma-lab/Lane`; read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`. For domain exploration, read `docs/agents/domain.md`.

## Working rules (the part that actually matters)

- **Pace to comprehension, not output.** v1 was 873 commits in two months — ~13/day. That pace is how the mess happened. If Nikhil can't explain in plain English what shipped, it shipped too fast.
- **One user-touchable thing per week.** "Real" = a person could open the app and use it. Refactors and plumbing don't count.
- **Read before writing.** Never change a file without reading it first.
- **Product UI authority: Arc UI only.** `DESIGN.md` and the official Arc/Arc Pro skills in `.claude/skills/` control components, tokens, typography and motion. Use actual Arc registry/MCP source and preserve documented APIs. Linear interactions are explicitly approved for the 2026-10-07 Requests/detail/Project navigation work; Arc remains the visual authority. Preserve working data, permissions, draft/upload recovery and Clerk flows. Verify production components in the running app and with tests, including keyboard, responsive and edge states (Storybook was removed on 2026-10-21 at Nikhil's request). The old `marketing/` repository was removed from Lane on 2026-10-15; the new marketing site is a separate local project built on the same 2026-10-13 Supabase-derived values. On 2026-10-09 Nikhil activated the Linear primitives in production for the whole app (root `data-visual-system="linear"`, Request detail included), retaining Arc components/motion; the compact Requests rows with saved priority and the folder-tree Project navigation ship with it. See `docs/design-system/linear-primitives.md`. On 2026-10-10 Nikhil accepted the MVP launch plan (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`) with its defaults: the same interaction approval extends to Profile auto-save, onboarding role keys, and keyboard operation of the notifications and search panes; the Arc Pro licence is recorded in `docs/licenses/arc-pro.md`. **Theme file (2026-10-22, retires the 2026-10-13 Supabase token decision):** every visual value lives in `src/styles/theme.css` (tweakcn export on top, never hand-edited; Lane additions below); `src/styles/theme-bridge.css` only renames; Arc keeps components and motion; product CSS writes no design literals (`pnpm design:check`). For any change to colours, fonts, corners, shadows, sizes or motion, read `docs/design-system/theme-file.md`.
- **Signed-in browser checks:** walk a change signed in against a local database with `docs/agents/local-browser-checks.md` (reused `lane-e2e-*` user, temporary organization).
- **No new tables, routes, AI calls, or cron jobs without explicit written approval.** Default answer to "should we also build X" is no.
- **Same view for everyone.** PM/Designer/Developer profile labels grant no permissions or separate dashboards.
  Named Request participants/the Requester have scoped alignment/closure responsibilities; no Requester/admin bypass.
  Clerk alone owns tenancy: **admin | member | guest | viewer** (Viewer is read-only, #210 on the integration branch). Lane never recreates membership or invitation authority.
- **Actions receive context for workspace, derive identity from the session.** Server actions take
  `{orgId}` from the page render; they must NOT call `ensureWorkspace`/`getWorkspace` to re-derive which
  workspace they're in. (This bug recurred three times — it lives here now so it stops.) **However,
  `userId` must NEVER come from client-passed arguments.** Server action arguments travel over HTTP and
  are forgeable. Identity, active organization, and organization role are derived inside the shared guards
  (`requireActiveMember` / `requireOwnerOrAdmin` in `src/lib/auth-guard.ts`) from Clerk `auth()` — the
  httpOnly session cookie is unforgeable. Actions use the guard's returned `auth.userId` for every identity
  field (assignedTo, authorId, createdBy). Lane must never recreate local membership or invitation tables.
- **Deferred work is tracked in DEFERRED.md**, by trigger. Daily reviews feed it. Nothing deferred may
  vanish — pre-launch items are built or deleted before the first paying customer.
- **Migrations are canonical.** Schema files describe intent.
- **This file is the primary repository instruction file.** `CLAUDE.md` is only a compatibility pointer.
- **Shared session handoff:** read `docs/SESSION-STATE.md` before resuming Claude or Codex work; keep one editing session per checkout and update the handoff when switching tools.

## Do NOT build (these sank v1 — they are banned until there is a paying customer asking)

Figma integration · morning briefings · weekly digests · any cron job (the one exception: #195's daily Inbox delivery job, `GET /api/inbox/daily`, switched off until Nikhil approves email) · Slack beyond Slack DM of Needs-you items (#207; no events, slash commands or capture) · radar · stickies · initiatives ·
reflections · insights / design-ROI · prediction-confidence · handoff briefs ·
iteration summaries · PM calibration · multi-workspace · published views · the Year-2 PM and Year-3 Research roadmap ·
the 5 design stages (Sense/Frame/Diverge/Converge/Prove) and all phase/kanban/track enums · the `user_functional_tags` table (role lives on `profiles.role`).

The confirmed Request success/readiness/outcome/follow-up contract supersedes the old impact/outcome ban only for focused planning; implementation still requires approval. Integrations and agentic operations remain deferred. Individual scores and rankings are permanently refused.

## FREE PILOT → FIRST PAYMENT — do not skip

> Decision (2026-07-12): run a non-commercial pilot with up to 20–30 free users on the free tiers. No payment
> may be accepted on Vercel Hobby. Upgrade before the first payment, or earlier if pilot data becomes valuable
> enough that losing it would materially hurt. Until managed backups exist, take and verify a manual database
> export before every migration; run and verify migrations on staging before production.

- [x] **Split prod / staging.** Clerk runtime `8490730` is Ready at `https://lane-staging.vercel.app`;
      staging migrations `0013`/`0014` and live signup, onboarding, isolation, and attachments passed after
      verified backups. The test invitation was accepted in Clerk; automatic return to Lane still needs a
      repeat check after the hosted fallback host and allowed-origin wiring. Production is untouched.
      Evidence: [Clerk cutover plan](docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md).
      Migrations run on STAGING first, are verified there, and only then may be promoted to production.
- [ ] **Supabase Pro** — required at the trigger for managed daily backups. PITR is a separate paid add-on and
      requires its own explicit cost decision; do not describe it as included in Pro.
- [ ] **Vercel Pro** — required before accepting the first payment; Hobby remains free-pilot/non-commercial only.
- [x] **Custom domain** — `app.uselane.app` is production; `www.uselane.app` permanently redirects to it.
- [ ] Confirm deployed workspace isolation before anyone real signs up. Fresh Clerk-account board/detail
      and private attachment isolation passed on deployed staging (2026-09-24); production verification is pending.


## Roadmap & phases
- **Current phase: MVP launch plan accepted 2026-10-10; Phases 0, 1a and 1b done; the creation-to-outcome sketch signed 2026-10-11; Phase 2 (page by page, starting with 2.0 app frame and states) is current.** The sequence, budgets and decisions are in `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`. Shipped since 2026-10-06: Expected impact, saved Request codes (`0017`), Ask for review (`0018`, retired 2026-10-18: design reviews and decisions stay in Figma; Lane keeps design links only), saved priority (`0019`), the Linear visual system in production, and the Requests list polish.
  Current implementation is not the confirmed target pipeline. Release evidence remains in the cutover plan;
  operational gates and the alignment-first sequence live in `lane-roadmap.md` §3.
  Full sequence + the thesis filter (adopt / reconceive / refuse) live in `lane-roadmap.md`.
- **Canonical planning docs** (re-read at the start of a new phase): `REQUIREMENTS.md` (product behaviour and decision status), `lane-roadmap.md` (sequence),
  `conventions-plan.md` (IA / roles / invites wiring), `phase-0-ux-skeleton.md`
  (journeys / screens / states).
- **Phase checkpoint (so later phases aren't forgotten):** a phase is done only when it ships AND real design
  leads are using it. Then re-read `lane-roadmap.md`, confirm validation and select the next bounded increment.
  The target contract is confirmed, not all implemented; real use informs later release order. Unrelated apps
  and agents remain hypotheses. Do not turn this contract into a single large build.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
