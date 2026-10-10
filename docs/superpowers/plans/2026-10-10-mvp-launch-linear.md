# MVP Launch Implementation Plan: Linear-density pages, fast flows

> **For agentic workers:** This is a planning aid. It does not change `AGENTS.md`, `REQUIREMENTS.md`, `lane-roadmap.md` or `DEFERRED.md`. Approving the plan approves planning only. Implementation, migrations, new routes, new dependencies and deployment each need their own authorization (`lane-roadmap.md:5, 90`; `REQUIREMENTS.md:9-11`; `AGENTS.md:27, 46`). Checkboxes are gates still to pass. They do not mean anything has shipped.

**Goal:** Invited design leads use Lane on app.uselane.app. Every in-scope page has one compact, dense visual system and every core flow feels instant.

**Authority:** Accepted by Nikhil on 2026-10-10 ("go ahead step by step and dont deviate from plan") with every §8 default, plus two explicit answers: decision 8.7 is **re-author** the Linear-derived palette as Lane-owned tokens (item 1.0), and decision 8.8 is closed by the Arc Pro licence record in `docs/licenses/arc-pro.md` (Nikhil holds Arc Pro through the authenticated MCP). The plan was drafted the same day from six read-only audits (scope, pages, perf, linear, prod, quality), two critiques, and a short read-only check of plan-doc headers. Item 0.1 (protect `main`) and the Dependabot switch remain Nikhil's: the agent's GitHub settings change was blocked by the permission classifier.

**Architecture:** The server stays the source of truth. The user never waits on it to see the result of their own action. That comes from co-locating the server and database, one-statement mutations, one pending-mutation overlay at layout level, and client-side views. There is no sync engine. Pages are migrated after that foundation, one increment at a time. Production cutover happens early so that each increment ships on its own.

**Tech stack:** Next.js 16.2.7 App Router, React 19, TypeScript, Tailwind v4, Arc UI (free + Pro) with the provenance ledger, Clerk, Supabase Postgres + Drizzle, Vitest, Storybook 10, Playwright, Vercel Hobby.

**Date:** 2026-10-10
**Status:** Accepted 2026-10-10; Phase 0 in progress (S0 decisions recorded in `REQUIREMENTS.md`, `AGENTS.md`, `lane-roadmap.md` and `DEFERRED.md` the same day). Nothing below Phase 0 has been implemented, verified or deployed. The branch is `codex/requests-plane-sidebar` at `8fe585b` with 30 uncommitted files. Production still serves `main` at `826e509` (2026-08-12), the pre-Clerk app (`clerk-clean-cutover.md:213-215`).

---

## 0. Where to start (the short version)

1. **Lock `main` today** (§3, item 0.1). PR #35 is MERGEABLE/CLEAN and `main` has no protection. One merge would deploy the new app onto a production database that lacks migrations 0013–0019 and has no live Clerk keys (prod §1.1, B4, C1). *(2026-10-10: automatic deployments for `main` are disabled in `vercel.json`, so merging no longer deploys; branch protection is still Nikhil's item 0.1.)*
2. **Make the blocking decisions** in §8 group A over one or two sessions. Two of them need outside advice: the Linear-derived tokens and the Arc Pro licence. A one-hour session will not cover them.
3. **Finish Phase 0**, then put the server next to the database and simplify every mutation (Phase 1a).
4. **Cut over production early**, at about week 7, and open it to one or two friendly teams ("pilot zero"). Page polish then ships as small PRs to a protected `main`, not as one giant PR. PR #35 is already 466 files, +53,690/−18,902.

Most of today's slowness comes from distance and duplicated work, not from pixels. Mark Done makes about 2 browser–server round trips plus 9 sequential DB round trips (perf §1).

---

## 1. Goal and what "launch-ready MVP" means

### 1.1 Goal

There are two milestones:

- **Pilot zero.** One or two friendly design teams on production, right after cutover. This is the first real-use evidence `AGENTS.md:101-103` asks for.
- **Wider soft launch.** The invited pilot of design leads. A 20–30 person pilot on free tiers is approved at `lane-roadmap.md:138-140`. That approval does not cover a paid Clerk plan (decision 8.3). Every in-scope page meets the §2 bar first.

The visual target is **Lane-owned tokens with Linear-like density and structure**: 13px UI type, 44px rows and strips, quiet panels. It is not "the Linear look". The tokens shipped today are documented as exact LCH values captured from a signed-in Linear app (`linear-primitives.md:7-9`; `linear-primitives-source.json`, 696 `sourceUrl` entries). Decision 8.7 settles whether they get re-authored, and that happens before any Phase 2 visual baseline is approved (item 1.0).

### 1.2 Pages in scope

These are the 10 routes in code plus the overlays a user meets on the way. They match `AGENTS.md:16-27` and `REQUIREMENTS.md:117-135`, with one exception: the search pane needs whitelisting (decision 8.10). Grades come from the pages audit (§0 table): A means at the bar, B partial, C tokens only, D third-party UI.

| # | Surface | Route / file | Today |
|---|---|---|---|
| 1 | Login, Signup (Clerk) | `/login`, `/signup` | D |
| 2 | Forgot / Reset password (Lane) | `/forgot-password`, `/reset-password` | B |
| 3 | Onboarding (role) | `/onboarding` | B- |
| 4 | Requests welcome (empty workspace) | `src/app/(app)/requests-welcome.tsx` | C |
| 5 | New Request composer drawer and `/intake` | `new-request-provider.tsx`, `intake/intake-form.tsx` | B- |
| 6 | Requests list | `/` → `requests-overview.tsx` | A- (uncommitted polish) |
| 7 | Request detail with the Ask for review panel | `/requests/[id]` → `detail-view.tsx`, `design-review-panel.tsx` | C / B- |
| 8 | Notifications popover | `shell/notification-bell*.tsx` | B- |
| 9 | Workspace search pane | `shell/workspace-search-pane.tsx` | B- (not on the `AGENTS.md:16-27` whitelist; authorized only in `2026-10-07-requests-list-and-workspace-sidebar.md:31`) |
| 10 | Settings → Profile | `/settings/profile` | C+ |
| 11 | Settings → Members (Clerk) | `/settings/members` | D |
| 12 | Shell: sidebar, breadcrumbs, loading, error, not-found | `shell/*`, `(app)/loading.tsx`, `(app)/error.tsx` | A- shell / C states |

**Docs out of step with the build.** `REQUIREMENTS.md:24-27` says that when the docs disagree, work stops. These gaps exist today:

- Saved priority (0019) is in the build. `REQUIREMENTS.md:22` and `lane-roadmap.md:95` still say "priority remains separate".
- Ask for review (0018) appears nowhere in REQUIREMENTS, the roadmap or the whitelist (scope §4 row 3).
- The workspace search pane is missing from both screen lists.
- Linear-style interaction is approved only for Requests, detail and Project navigation (`AGENTS.md:45`). Profile auto-save, the onboarding keys, and notification and search keyboard work all need that approval extended.
- Saved `LAN-n` codes are already recorded (`REQUIREMENTS.md:20`).

Decision 8.10 reconciles all of this.

### 1.3 Flows that must work end to end on production

Sources: `phase-0-ux-skeleton.md:14-51`, `ux-copy-launch-review.md:198`.

- **J1** Sign up → verify → create or join a workspace → pick a role → empty Requests.
- **J2** An invited teammate joins through a Clerk invite and lands back in Lane with no manual step (`clerk-clean-cutover.md:180-189`). **This can only be closed on the production Clerk instance.** Staging runs the development instance (critique 1 #7).
- **J3** New Request → AI gate → confirm the framing → Request created and visible. This flow also has to:
  - Fix S3: the "View Request" mislabel. When a reload loses retry state, show an honest warning and a recovery path. Persisting selected files is out of scope.
  - Fix S4: when filters hide the new row, announce it. Do not silently clear filters, which `phase-0-ux-skeleton.md` does not approve (`:106-113`).
  - Show "Review unavailable right now. Your draft is kept." when the gate times out or the spend cap is hit (critique 1 #14).
- **J4** Pick up → In Progress → Mark Done → Undo within 15 minutes (`REQUIREMENTS.md:804-806`).
- **J5** Comment. **J5b** Ask for review and respond.
- **J6** Invite a teammate. Production allows Admin or Member only (`AGENTS.md:25`), and is limited by the Clerk plan (decision 8.3).
- **J7** Change the role label and theme.
- **J8a** Workspace isolation on **production**: two fresh accounts in different workspaces (`AGENTS.md:89-90`).
- **J8b** Guest isolation on **staging only**. `org:guest` cannot exist in production without Clerk Enhanced B2B (`AGENTS.md:25`; `PRODUCT.md:52-53`).
- **A4/A5** Login and password recovery. Real reset email deliverability can only be closed on production. **A6** Shared navigation and failure states.
- The requester gets an in-app notification when their Request is picked up, commented on, or marked Done.

### 1.4 Explicitly out of the launch

| Out | Why / trigger | Source |
|---|---|---|
| Trio alignment, readiness, measurement, outcome closure, period totals | Target scope. Not to be promised at launch | `ux-copy-launch-review.md:120`; `PRODUCT.md:41-43`; `REQUIREMENTS.md:16-18` |
| Board cursor pagination | Trigger is about 120 active Requests. The active-row cap stays (item 1.7) | `DEFERRED.md:57-68` |
| Request side peek | Ungated, but needs a written decision | `DEFERRED.md:210-222` |
| Inbox page, archive, snooze, notification tabs and filters, email notifications | Each has its own trigger. Snooze needs cron, which is banned | `DEFERRED.md:229-286` |
| Extra statuses (Backlog, Todo, Cancelled), assignment from menus, labels, estimates, cycles, "Time in status", subscribers, @mentions, "Last seen / Online" | Refused or not approved | `lane-roadmap.md:42-50`; `REQUIREMENTS.md` §9; `DEFERRED.md:239-248` |
| Board view, saved filters, ⌘K palette | "Separate candidates" | `lane-roadmap.md:130-131`; ⌘K is decision 8.24 |
| Public or anonymous Intake | Needs a decision | `DEFERRED.md:166-173` |
| Settings pages beyond Profile and Members | "Nothing else under settings" | `AGENTS.md:23` |
| Onboarding invite step, seeded tutorial Requests, "Ask Lane" AI home | Refused | `REQUIREMENTS.md` §10; `AGENTS.md:46` |
| Persisting selected files across a composer reload | New scope. S3 only needs an honest warning and recovery | `phase-0-ux-skeleton.md:106-113` |
| Supabase Pro, Vercel Pro | Required at first payment. Supabase Pro may come earlier (decision 8.14) | `AGENTS.md:85-87` |
| Local-first sync engine (IndexedDB) | Not needed. The optimistic overlay gives most of the feel | perf §5 |

**Lane rules win over Linear parity.** The AI gate is mandatory, so Lane never creates instantly. Every Request starts Open. Assignment is separate from starting work.

---

## 2. The quality bar: crisp, superfast, buttery smooth

`REQUIREMENTS.md:713-717` asks only for "immediate acknowledgement". Every number below is a **proposed budget**. Nikhil sets them (decision 8.16), and starting targets are re-set after the first staging measurement (quality §5.3).

**Measurement conditions.** Every "superfast" claim is measured on a production build (`next start` or a Vercel deployment), from India, against staging or production. Warm and cold are measured separately: cold is the first request after 15 minutes idle. Local dev points `next dev` at Tokyo staging (perf §2.1), so local timings and walk-throughs are not evidence. Local UI work runs against local Postgres. Field metrics (Speed Insights) become post-launch alerts, because 20–30 users is too small a sample to gate on (critique 2 #9).

### 2.1 "Crisp": a checklist every page must pass

**Visual (through Arc hooks and Lane tokens):**
- [ ] **One 44px header strip per page**, holding the title or breadcrumb plus actions. No shell topbar stacked on a page header, and no 36px h1. Breadcrumbs end in something specific, such as `LAN-12`, not "Request detail" (`sidebar-view.tsx:97, 130`).
- [ ] **13px UI type and 15px titles.** 0.5px borders, no shadows, 8/12px radii from tokens. No hard-coded colours and no undefined tokens. Today `--surface-hover` is undefined (`requests.module.css:3`).
- [ ] **One status glyph system.** The row `StatusGlyph` (`row-presentation.tsx:27-33`) replaces the lucide `statuses.ts` icons.
- [ ] **One copy vocabulary**: sentence case, with Lane nouns capitalised. "Mark done" (`lifecycle-buttons.tsx:145`) becomes "Mark Done". The notification text "marked … done" (`notification-bell-view.tsx:31`) becomes "Done".
- [ ] **Dates in the viewer's local time.** Today they are pinned to UTC (`request-properties.tsx:33-49`, `workspace-search-pane.tsx:188`, `design-review-panel.tsx:29`).
- [ ] **Overlays** use the theme overlay token and 12px corners, with no backdrop blur.

**Interaction:**
- [ ] Every property shown is either editable in place (only where a server action exists: lifecycle and priority) or clearly read-only. No pretend menu items (`2026-10-08-request-properties-follow-up.md`).
- [ ] Every action is reachable from the keyboard. The visible focus ring uses `--focus-outline`. Esc closes and focus returns. Composite widgets follow the named ARIA pattern (decision 8.21).
- [ ] Every state exists: loading (skeleton shaped like the final layout), empty, error, forbidden/not-found and success. Duplicate submission is blocked.
- [ ] Optimistic changes are announced in a live region. A failed action reverts with a message that says what happened. An expired session never shows up as "Not found" (item 1.5).
- [ ] At narrow widths the whole task stays available and the main action stays reachable. Today detail's lifecycle button sits below all the comments (`detail-view.tsx:150` vs `:168`). Keyboard hints are hidden on coarse pointers.

**Verification matrix** (`DESIGN.md:29`; `phase-0-ux-skeleton.md:146-149`): light and dark; 390, 768, 1024 and 1440 px; long content; zoom; reload, back and deep link; member, admin and guest; reduced motion.

### 2.2 "Superfast": performance budgets

| Budget | Target | Hard limit | How it is measured |
|---|---|---|---|
| Visual response to a click or key (pressed state, highlight, optimistic change) | ≤ 50 ms p75 | 100 ms | Perf spec with the Event Timing API. Stories check order (state shows before the mock resolves), not timing |
| INP, lab, at 4× CPU slowdown | ≤ 150 ms p75 | 200 ms | Perf spec. Field INP is a post-launch alert |
| Status view, Project filter (including sidebar Project and "No Project"), group, sort, in-list filter | **Zero network requests**; INP ≤ 200 ms | — | Perf spec asserts no `_rsc` request. (The draft's 16 ms target is dropped. Up to 200 unmemoised rows at 4× CPU will not fit it.) |
| Route change, list → detail, warm and prefetched | Skeleton ≤ 100 ms; content ≤ 300 ms p75 | 500 ms p95 | Perf spec, from click to a content marker |
| Route change, cold | Measured and recorded; starting target ≤ 1.5 s p95 | — | Perf spec, first request after 15 minutes idle |
| Mutation (Pick up, Mark Done, Undo, priority, comment, review) | On screen in the next frame; server confirms ≤ 400 ms warm p75 from India; **never visibly reverts on success** | Rollback + toast only on real failure | Perf spec plus the no-revert gate (item 1.5) |
| Composer opened with C | Focus in title ≤ 100 ms, **no skeleton** on first open | 200 ms | Perf spec |
| AI gate | Pending state ≤ 100 ms with "Checking whether this describes a problem…" | 15 s timeout keeps input (`triage.ts:90`); the function limit is set above the gate timeout (item 1.1) | Story + e2e |
| Full page load, warm | LCP ≤ 1.5 s desktop / 2.5 s mid-range mobile; TTFB ≤ 400 ms; CLS ≤ 0.02; TBT ≤ 150 ms | Google "good" | Perf spec with PerformanceObserver at 4× CPU |
| Client JS | Phase 1: `/` loses ≥ 60 KB gzip from today's 453 KB and nothing regresses. Absolute targets are set after the LazyMotion decision (8.19) | Per PR: no route grows > 2 KB gzip over the committed baseline unless the PR updates the baseline with a written waiver | Bundle script on `.next/diagnostics/route-bundle-stats.json` |
| Server | ≤ 2 sequential DB round trips per page render and per mutation **including its revalidation render**; statement count per action and loader at or below a ceiling; no server-action reads on page load | — | Dev query counter + Vitest ceilings against `lane_test` |
| Mutation response size | RSC payload of one mutation response set after the first measurement (item 1.7 makes every response carry all statuses) | — | Perf spec network log |

**Where things stand today:**
- Dev timings: markDone 2.4 s, page POST 2.8 s, `getUnreadCount` 585 ms, `listProjects` 434 ms.
- First-load JS on `/` and `/requests/[id]` is 453 KB gzip. The root shell alone is 252 KB, and auth pages are 257–271 KB (perf §2.8, this build). The prod audit's older figure of about 217 KB was an upper bound from a different method.
- Mark Done in production, estimated: about 1.9–2.2 s if functions run in Vercel's default US East region; about 0.3–0.4 s in `hnd1`; on screen in the next frame once Phase 1 lands (perf §1).

### 2.3 "Buttery smooth": motion rules

- **Large surfaces animate only `transform` and `opacity`.** Springs are banned on surfaces wider than about 200 px.
  - **Sidebar.** Today it is a flex sibling (`workspace-shell.module.css:2`) springing `--sidebar-width` on `spring.smooth`, `visualDuration` 0.4 (`motion-tokens.ts:17`, `use-sidebar-resize.ts:36-46`). Change it so the panel translates and the content width changes once per toggle: at the start of collapse and at the end of expand.
  - **List summary.** Today it springs the list's width (`request-list-summary.tsx:45-47`). It should overlay the list instead.
- **Durations apply to settle time,** including any spring tail. Feedback takes 120–200 ms. A panel enters in ≤ 240 ms. The 480 ms `--duration-considered` (`foundation.css:80`) stays off everyday paths. The audits disagree on the composer drawer entrance: one says 480 ms, the other about a 400 ms spring at `drawer.tsx:179`. Confirm it in code before acting (decision 8.20).
- **No backdrop blur** on overlays (Dialog 7px, Drawer 4px). **No `filter: blur` label or icon morphs inside dense rows.** Arc's `button.tsx:29-32`, ChipGroup, ToastStack and Tooltip would otherwise play them on every optimistic regroup.
- **No layout shift.** Skeletons match the final layout. CLS ≤ 0.02. The welcome → list transition does not jump.
- **60 fps.** At most 2 dropped frames in a 300 ms transition at 4× CPU, measured automatically with the Long Animation Frames API in the perf spec.
- **Re-renders.** Typing in the filter or hovering rows must not re-render the sidebar or every tooltip (perf §2.9). One mutation response re-renders only the rows that changed (item 1.14).
- **Reduced motion is honoured everywhere** (`REQUIREMENTS.md:710`). Storybook also gets a reduced-motion pass.

### 2.4 How the bar is enforced

**Required CI on every PR.** This is one workflow with Storybook sharded across parallel jobs. Estimate 15–25 minutes: one Storybook width takes 283 s on a local Mac, and Linux runners also need Chromium installed (critique 1 #6).
1. `pnpm typecheck && pnpm lint && pnpm design:check`, after adding `artifacts/**` to the ESLint ignores.
2. ESLint restrictions. `router.refresh` is allowed only inside the mutation helper. No read server action is imported into a client file. No `router.replace`/`push` with `requestListHref` in list components.
3. `pnpm test`, plus a **mock-parity test** (every export of an `sb.mock`'d module exists in its `__mocks__` file; this catches the `9ac2684` failure) and **statement-count ceilings** per action and loader.
4. `pnpm test:storybook` at 1440/light and 390/dark (`STORYBOOK_WIDTH`/`STORYBOOK_THEME`), sharded.
5. `npx impeccable detect` on changed UI files returns 0 findings or a waiver with a written reason.
6. Per-route bundle sizes against the committed baseline (§2.2).
7. Branch protection on `main` requires all of the above. This only works while the repo is public, or on a paid GitHub plan if it goes private (decision 8.7).

**Per-page definition of done** (human, about 15–20 minutes):
- Page stories render in the Lane/Linear system. They cover default, empty, loading, error, long content and guest/forbidden. Play functions cover the keyboard path, focus return and Esc.
- Each mutation has an **acknowledgement-contract story**: the mock stays pending, the UI shows the new state before it resolves, double submit is blocked, and failure reverts with a message. One more story covers the expired-session case. The pattern exists in `request-selection-refresh.stories.tsx`.
- An Impeccable critique with **0 P0 and 0 P1** (the gate) and a score ≥ 28/40 (advisory). A summary line goes into a committed ledger, `docs/design-system/page-quality.md`, because `.impeccable/` is being gitignored.
- **That page's staging perf-spec numbers** are recorded in the same ledger.
- Visual candidates at 390/768/1440 × light/dark, approved by Nikhil. Approvals happen only after item 1.0 settles the tokens.
- Keyboard-model pages get a manual VoiceOver pass.
- Nikhil walks the flow once on a phone and once on desktop, **on the staging production build**.

**Before soft launch** (nightly or on demand):
- The full Storybook matrix: 4 widths × 2 themes, plus reduced motion.
- The rebuilt golden-journey e2e on staging.
- The perf spec against production from India: warm and cold, about 6 interactions × 10 runs, reporting p75/p95.

---

## 3. Phase 0: finish and land the work in flight

**Goal:** a green, protected, honest baseline with no new user-facing scope. **Estimate: 10–15 working days (weeks 1–3).** The draft's one week did not fit its own S/M scale.

| # | Item | Owner | Effort | Evidence / notes |
|---|---|---|---|---|
| 0.1 | **Protect `main` now.** Require a PR plus the `test` check and block direct pushes, or pause the `lane` project's production auto-deploy until cutover. If decision 8.7 makes the repo private, branch protection stops working on a GitHub Free personal account (`owner_type: User`). Then either add GitHub Pro (about $4/month, verify) or move to an org on a Team plan, and size CI minutes for a private repo. | **Nikhil** | S | prod §1.1, B4, C1; critique 1 #3 |
| 0.2 | Run decision group A (§8), then reconcile the docs (decision 8.10). Fix stale lines: `AGENTS.md:38` model name, `:94` current phase, `lane-roadmap.md:93-97`, the "in production" wording, `README.md:33` port, retired-theme references. | Nikhil decides, agent drafts | S–M | scope §4 rows 1–22 |
| 0.3 | Keep `.claude/` out of the public repo by adding it to `.gitignore`. It holds licensed Arc Pro skill files. | Agent | S | prod A3 |
| 0.4 | **Licensed and Linear-derived files are already public** on the pushed branch: `src/components/arc/blocks/workspace-sidebar/*` from `uiarc.dev/r/pro/` (`arc-source-hashes.json:356,363`), `linear-primitives-source.json` and `linear-row-live-audit-2026-10-08.json`. `docs/licenses/` is empty. Check the Arc Pro licence and decide on provenance (8.7, 8.8) in S0. Execution happens in item 1.0. | Nikhil (with advice) | S to decide | critique 1 #3; prod R1–R4; quality §7 |
| 0.5 | Commit the Requests-list polish together with the mock fix (`setRequestPriority`, `undoMarkDone` in `src/app/(app)/requests/[id]/__mocks__/actions.ts`) and the mock-parity test. | Agent; Nikhil approves the commit | S | quality §6.1 |
| 0.6 | Fix the 18 failing stories by class (see below the table). | Agent | M | quality §2 |
| 0.7 | **Flip the Storybook default to `visualSystem: "linear"`** (`.storybook/preview.tsx:33-45`). Legacy and Geist stories opt out or retire (decision 8.12). Add one global "settled before axe" step in the preview `afterEach`. Triage the new failures; the count is unknown and likely non-zero. | Agent | M | quality §4, §6.5–6.6 |
| 0.8 | Turn on the CI gates in §2.4 items 1–4 and 7, with Storybook sharded. Align pnpm (`packageManager`; CI pins 10, local is 11). Enable Dependabot alerts. | Agent; Nikhil for Dependabot | S–M | prod B2, B5, B6 |
| 0.9 | Cleanup: remove the empty dirs (`(auth)/invite/[token]`, `(auth)/signup/check-email`, `src/lib/email`, `components/reui/*`, `library`, `detail-primitives`), the dead `NoRequestSelected` and the unused skeleton branch. Fix the stale comment at `linear-arc-theme.css:1-2`. | Agent | S | pages §1.6; prod A6 |
| 0.10 | **Restore staging LAN-7 and LAN-8 to In Progress.** The 2026-10-09 browser checks of the new row actions marked both Done on staging; they were In Progress before. LAN-6 was restored with Undo. The 15-minute Undo window has passed, and the agent's direct SQL restore was blocked by the permission classifier. Nikhil runs the restore (status back to `in_progress`, delete their `request_done` notifications) or authorizes the agent explicitly. | Nikhil | S | session record, 2026-10-09/10 |
| 0.11 | Lane's dev server runs on :3100 (`lane-dev-3100` in `.claude/launch.json`) because another project holds :3000. The perf audit's `pnpm build` stopped it on 2026-10-10; it was restarted. | Agent | S | — |
| 0.12 | **Start pilot recruitment and a support channel.** Source 1–2 pilot-zero teams, the 5 usability participants (`ux-copy-launch-review.md:189-191`) and the wider pilot. Draft the welcome message and set up a feedback channel. | Nikhil | ongoing | critique 1 #19 |

The Undo-window and `markDone` transaction gaps (prod A4, A5) are fixed once, in item 1.4. The draft's separate Phase 0 fix contradicted 1.4.

**How item 0.6 fixes the 18 stories** (quality §2, §6):
- **6 broke because of the polish** (#2, #13–17). For #13–17, first decide on an announced result count while filters are active (decision 8.11). Then assert that count instead of the old footer.
- **7 were already broken by `9ac2684` without anyone noticing** (#3, #5, #7, #8, #10, #11, #12):
  - #5, #7, #8: stop wrapping the production `RequestsOverview` in the illustrative `LinearRequestsFixture` presentation. It shadows the shipped `RequestRowActions`.
  - #11: opt into the Linear system.
  - #10: scope the status query.
  - #12: use the new default.
- **1 broke because of `1a042a8`** (#6): query only the visible chip group.
- **4 were pre-existing timing or query issues** (#1, #4, #9, #18): the global settled-before-axe step fixes these, plus #1 is scoped to the current review round.

**Exit criteria:**
- [ ] Storybook has 0 failures at 1440/light and 390/dark, with Linear as the default.
- [ ] Unit tests are green (543/543 today).
- [ ] CI enforces typecheck, lint, design check, unit, Storybook, mock parity and the ESLint restrictions.
- [ ] `main` is protected.
- [ ] Docs are reconciled.
- [ ] Group A decisions are recorded.

---

## 4. Phase 1: speed foundation (done once, before page migrations)

**Principle:** the server stays the source of truth, but the user never waits for it to see the result of their own action.

**Authority needed:** decision 8.4 (un-defer optimistic UI, `DEFERRED.md:37-42`) and decision 8.6, a written waiver of "Only one subsystem may enter implementation at a time" (`REQUIREMENTS.md:790`, §14) for this phase. Otherwise the 17 items must run one subsystem at a time.

**Split.** Phase 1a (weeks 4–6) covers what cutover needs. Phase 1b (weeks 8–10) runs after pilot zero opens. The F/P references point to the perf and linear audits.

### Phase 1a: before cutover

| # | Change | Files / technique | Effort | Expected effect |
|---|---|---|---|---|
| 1.0 | **Lane-owned tokens** (decision 8.7 = re-author; **done 2026-10-10**: `src/styles/lane-primitives.css` + `lane-arc-theme.css`, `data-visual-system="lane"`, capture records and local artifacts removed; visual sign-off by Nikhil pending). Re-author `--lane-*` values independently with the same roles and structure. Remove `linear-primitives-source.json` and the live-audit JSON from the tree. Delete the local `artifacts/` Linear JS files. This lands **before any Phase 2 baseline**, so sign-offs are not thrown away later. | `src/styles/linear-primitives.css`, `linear-arc-theme.css`, `docs/design-system/` | M–L | Removes the provenance risk; stable baselines |
| 1.1 | **Server next to the database.** *(2026-10-10: `vercel.json` pins `hnd1` and the `(app)` segment exports `maxDuration = 30`; Fluid compute, `CLERK_JWT_KEY` and the 6543 pooler URL remain Nikhil's dashboard steps.)* Pick the region before measuring (decision 8.2) and keep staging and production in the same region. Default: `hnd1`, through the dashboard or a new `vercel.json` `{"regions":["hnd1"]}`, verified with `x-vercel-id`. **Turn on Fluid compute** for both projects. Otherwise export `maxDuration` on the intake path above the 15 s gate timeout; nothing exports it today, and Hobby without Fluid is reportedly cut at 10 s (verify). **Set `CLERK_JWT_KEY`.** It is unset (key name checked), so each cold instance likely fetches JWKS from Clerk. | Dashboard / `vercel.json`; Vercel env | S | DB round trip about 150 ms → about 2 ms (est.); fewer cold-start fetches |
| 1.2 | **DB client.** *(done 2026-10-10)* Use the transaction pooler (6543), keep `prepare:false`, set `max` to about 5–10. **Keep `idle_timeout` at about 20–30 s.** Once co-located, reconnects cost milliseconds, and long idles risk dead sockets under Fluid suspension. Use `attachDatabasePool` from `@vercel/functions` (new dependency, decision 8.19). | `src/db/index.ts:24-31`; Vercel `DATABASE_URL` | S | Search no longer queues on a pool of 3; no spurious failures |
| 1.3 | **Stop rendering twice per mutation.** *(done 2026-10-10; the ESLint restriction waits for the mutation helper in 1.5, and the lifecycle contract test still checks the literal on the kept error path.)* Remove the client `router.refresh()` after successful actions that already call `revalidatePath`, and keep it on error and conflict paths. First rewrite the source-string tests that require the literal `router.refresh()` (`lifecycle-action-recovery-contract.test.ts` and 11 others) as behaviour tests. Add the ESLint ban. | `request-row-actions.tsx:62,89`; `lifecycle-buttons.tsx:51-62`; `comment-form.tsx:52`; `design-review.tsx:17`; `use-request-selection.ts:97,113`; `new-request-provider.tsx:88`; `onboarding/role-form.tsx:42` | S | Server work per mutation halves |
| 1.4 | **One statement per mutation, atomic.** *(done 2026-10-10; Undo is one CTE too.)* Use a data-modifying CTE: `WITH u AS (UPDATE … WHERE id AND org AND status … RETURNING created_by) INSERT INTO notifications … SELECT … FROM u`. That is one round trip, atomic, and needs **no `after()`**, which would race with `undoMarkDone` deleting the `request_done` notification inside its own transaction (`actions.ts:163-186`). Run the diagnostic `SELECT` only when no row was updated. Return a **distinct auth error** instead of "Not found" (`actions.ts:75-76`). Undo window: decision 8.18. Notification-failure semantics: decision 8.17. `lifecycle-actions-concurrency.test.ts` must still pass. | `src/app/(app)/requests/[id]/actions.ts`, `notify.ts` | S–M | 3 → 1 DB round trips; fixes prod A4/A5 |
| 1.8 | **Reads off server actions, in parallel.** *(done 2026-10-10)* Load Projects and the unread count in the `(app)` layout. Start the list and detail queries straight from `auth()` claims (role comes from `orgRole`, `ensure-workspace.ts:36-37, 88-91`) **in parallel with** the profile/workspace query, so the critical path is one round trip. Pass the unread count as a promise to a Suspense-wrapped bell, so it never holds up TTFB. Refresh it when the bell opens. A focus-triggered refresh is added only with decision 8.15. Remove the second `NotificationBell` mount on rail switch. | `(app)/layout.tsx`; `requests-workspace.tsx:44`; `workspace-projects-provider.tsx:74,83`; `notification-bell.tsx:55-63`; `workspace-sidebar.tsx:262` | S–M | No queued reads in front of the first click; no sidebar loading flash |
| 1.9 | **Server data loaders** *(done 2026-10-10)* in `src/lib/data/` (server-only): `loadShell` (one join returning the role), `loadRequestList` and `loadRequestDetail`. Reuse the role on Profile. | `src/lib/ensure-workspace.ts:35-61`; `settings/profile/page.tsx:14-17` | S | One fewer round trip per render; Profile goes from 3 to 1 |
| 1.12 | **Error boundaries that catch a paused database.** *(done 2026-10-10; a support address is still to be chosen, the copy ends with "let us know")* Add `src/app/error.tsx`. It catches a throw in `(app)/layout.tsx` while keeping `ClerkProvider`, the theme attributes and the fonts. Also add `src/app/not-found.tsx`, `(auth)/error.tsx`, and `src/app/global-error.tsx` as the last resort (it replaces the root layout and only renders in production). Story: `getWorkspace` throws. These are file conventions, not new routes. | `src/app/` | S | Launch blocker on the free tier |
| 1.15a | **Query counter** *(done 2026-10-10; always on, `queryCounter.measure`)*: a drizzle logger plus `AsyncLocalStorage`, and Vitest statement ceilings. | `src/db/index.ts` | S | Makes the server budget enforceable |

### Phase 1b: after pilot zero opens

| # | Change | Files / technique | Effort | Expected effect |
|---|---|---|---|---|
| 1.5 | **One pending-mutation overlay at layout level**, keyed by request id, placed beside `RequestListViewProvider` (`(app)/layout.tsx:18`). It is not a page-scoped `useOptimistic`. In Next 16.2.7, any navigation or patched `history.replaceState` while an action is pending marks that action discarded, and its revalidated payload is never applied (`node_modules/next/dist/client/components/app-router-instance.js:77-84, 143-150`; `app-router.js:237-245, 268-276`). The row would then flip Done → In Progress → Done.<br>**Rules:**<br>• A patch clears only when the server rows show it (matching status or priority) or when the action returns an error. It never clears on transition end.<br>• The list, detail, summary, counts and the composer insert (the provider sits at layout level, `(app)/layout.tsx:20`) all read through the overlay.<br>• Undo waits for a pending markDone result before it sends `undoMarkDone`, and shows one toast.<br>• On an auth-shaped failure, refresh the Clerk token and retry once before rolling back. That this failure happens after a tab has been hidden is plausible but unverified; it gets a story and an e2e test.<br>• On failure, roll back with a toast: "Could not update this Request".<br>**Gate:** a Playwright test against local `next start`. Mark Done, then within 100 ms switch chip, press Esc or open another row. A MutationObserver records the row's status, and the sequence must never go back. | New `src/components/requests/pending-mutations-provider.tsx` + `useOptimisticAction`; used by `request-row-actions.tsx`, `lifecycle-buttons.tsx`, `comment-form.tsx`, `new-request-provider.tsx` | M | Change on screen in the next frame, with no flicker |
| 1.6 | **Batch bulk actions.** `pickUpRequests(ids)` and `markDoneMany(ids)`: one `UPDATE … WHERE id = ANY($ids)` with the same guards and a per-row failure report. | `use-request-selection.ts:79-86`; `actions.ts` | S–M | A 10-row bulk action goes from about 60 DB round trips to 1–2 |
| 1.7 | **Views in the browser, fully.**<br>• `page.tsx` and `requests/[id]/page.tsx` stop reading `status` and `project`. The client reads them with `useSearchParams`.<br>• Drop both `requests-workspace.tsx:92` (status) and `:93` (Project). When already on `/`, intercept sidebar Project links and "No Project" (`sidebar-view.tsx:110`).<br>• Use canonical `/requests/[id]` URLs. List context (status, Project, order) lives in layout state, so "Return keeps Project filter" still works.<br>• Make the welcome branch (`:190`) independent of the filter.<br>• **Load all Open + In Progress under a hard cap** that keeps today's cap note, plus the latest N Done (decision 8.16). "Show older Done" fetches from the server beyond N. The `DEFERRED.md:57-68` trigger stays at about 120 active.<br>• Sync the URL with `history.replaceState`, **held while any mutation is pending**. | `data-table.tsx:55,79,111`; `request-status-filter.tsx:32`; `requests-workspace.tsx:92-97,190`; `sidebar-view.tsx:110` | M | View switch goes from 0.3–3 s to no network at all |
| 1.10 | **Detail loads only what it shows.** Drop the 200-row list query from detail. Run the Request, comments and attachments queries with `Promise.all`, keeping the org and guest checks as strict as today (join to `requests`). | `requests-workspace.tsx:67-184`; `detail-view.tsx:95-121` | S–M | Detail goes from 5–6 to 1–2 round trips |
| 1.11 | **Navigation.**<br>• Keep the default viewport prefetch on row links. It fetches the skeleton and is the only prefetch phones get.<br>• Add a full `router.prefetch` on pointerenter (after about 80 ms of intent), on focus (J/K) and on pointerdown.<br>• Set `staleTimes: { dynamic: 30, static: 30 }`. Full prefetch otherwise stays cached for the static default of 5 minutes and could show stale status.<br>• Count function invocations per list scroll on staging.<br>• Preload the composer chunk on idle and on New Request hover/focus. | `columns.tsx:12`; `next.config.ts`; `new-request-provider.tsx:16-18` | S | Detail often loads before the click lands; C opens with no skeleton |
| 1.13 | **Bundle.**<br>• Move Request constants and labels into a module without Zod. Zod v4 is the 84 KB gzip chunk and gets in via `src/lib/request-properties.ts:1`.<br>• Load Clerk org membership lazily when the switcher opens.<br>• Set `preload:false` on unused Geist (`src/lib/fonts.ts:5`).<br>• Optional: `LazyMotion` inside Arc, which needs a ledger entry (decision 8.19). Motion puts about 50 KB in the root shell through ToastStack. | listed files | S–M | About 60–80 KB gzip off app routes (est.). `/` lands near 375–390 KB without LazyMotion |
| 1.14 | **Re-renders.**<br>• Split the list-view context into state and setter (`list-view-state.tsx:28-29`).<br>• Use one shared Tooltip provider without the per-tooltip warmth subscription (`tooltip.tsx`).<br>• Memoise `RequestRowActions` identities and menu items (`request-row-actions.tsx:35-38,153`).<br>• **Memoise rows with a comparator on `(id, status, priority, requestNumber, updatedAt)`.** Each RSC response creates new row objects, and the React Compiler alone will not stop all visible rows re-rendering.<br>• React Compiler is optional (decision 8.19).<br>Arc edits need entries in `arc-source-hashes.json`. | listed files | M | Lower INP; the post-response render does not overlap the toast |
| 1.15b | **Measurement and CI enforcement.**<br>• Bundle script with a committed per-route baseline (new file under `scripts/`).<br>• Playwright perf spec against a production build at 4× CPU: warm and cold, Long Animation Frames, no-revert gate, RSC payload size, post-response render timed separately.<br>• `useReportWebVitals` in the root layout.<br>• Speed Insights in production (decision 8.13). | `scripts/`, `e2e/`, root layout | M | Makes §2.2 enforceable during Phase 2, not only at the end |
| 1.16 | **Reads that stay serialized.** Next dispatches server functions one at a time and cannot abort them (`node_modules/next/dist/docs/.../07-mutating-data.md:206`). Search as you type, reviewer type-ahead and the notifications list would queue in front of user mutations.<br>• **If decision 8.15 approves**, add read-only GET route handlers with `AbortController` for search, reviewers, notifications and the unread count.<br>• **If not**, allow one in-flight read where the latest query wins, drop the focus-triggered count refresh, and remove the server-latency budgets from 2.6 and 2.8. | `workspace-search-actions.ts`, `design-review.tsx:6`, `notification-bell.tsx:32,41` | S–M | First click never waits behind a read |

**Order inside Phase 1a:**
1. Do 1.1 and 1.2 first and re-measure on staging.
2. Then do 1.3, 1.4, 1.8, 1.9 and 1.12. These are mostly deletions and query merges.
3. 1.0 runs in parallel when decision 8.7 asks for it.

**Phase 1a exit (on staging, production build):**
- [ ] `x-vercel-id` shows the chosen region.
- [ ] Fluid compute is on, or `maxDuration` is set.
- [ ] `CLERK_JWT_KEY` is set.
- [ ] Each mutation, including its revalidation render, uses ≤ 2 sequential round trips (query counter).
- [ ] There are no server-action reads on page load.
- [ ] The error-boundary stories pass.
- [ ] Tokens are final (1.0, or recorded as kept).

**Phase 1b exit:**
- [ ] Mark Done appears in the next frame and never reverts in the no-revert gate.
- [ ] The server confirms in ≤ 400 ms warm p75 from India. Cold p95 is recorded.
- [ ] Chips, summary filters, sidebar Project and "No Project" make no `_rsc` request.
- [ ] `/` has lost ≥ 60 KB gzip (or is ≤ about 380 KB), or LazyMotion is approved.
- [ ] Bundle and statement-count gates are required in CI.
- [ ] Phase 0 gates are still green.

---

## 5. Phase 2: page-by-page migration in user-journey order

**Precondition: decision 8.5.** `REQUIREMENTS.md:856-857` says "Replan the creation-to-outcome UX before continuing page polish." That covers every page below, not just detail. Nikhil either runs the replan, at minimum a one-session sketch of where alignment and outcome will live on composer and detail, or waives it in writing.

**Shipping.** Each increment is its own small PR to the protected `main`. It is verified on staging, walked through by Nikhil, and promoted to production on its own (`REQUIREMENTS.md:747-758`). Cadence follows "one user-touchable thing per week" (`AGENTS.md:43`). Batching is allowed only where decision 8.6 says so.

Every page inherits the §2.4 definition of done: Linear-system stories, acknowledgement contracts, 0 P0/P1, a critique score ≥ 28/40, staging perf numbers in the ledger, approved visual candidates, and Nikhil's walk-through.

Effort: **S** about 1 day, **M** 2–4 days, **L** 1–2 weeks (agent-assisted).

### 2.0 App frame and states (S–M), first because every page sits on it
- **Changes:**
  - **Header-strip rule:** each page owns a single 44px strip. The shell topbar shows only on pages without one, or the crumbs become the strip.
  - **Skeletons from real primitives:** strip, toolbar and 44px rows for `(app)/loading.tsx` (today `space-y-6 p-4`, which shifts), detail and intake.
  - `(app)/error.tsx` and the Phase 1 root boundaries get the strip.
- **Acceptance:**
  - CLS ≤ 0.02 on list and detail loads.
  - Skeleton appears ≤ 100 ms after navigation.
  - Error and not-found stories render with the layout failing.

### 2.1 Requests welcome (S) and 2.2 Onboarding (S), batchable (8.6)
- **Welcome:**
  - Render the list's title strip and the empty `DataTable` region, so the first Request appears in place.
  - Drop `min-h-dvh` (`requests-welcome.tsx:12`).
  - Keep "Invite teammates" for admins.
  - Add the hint "Press C to create a Request." on fine pointers only.
- **Onboarding:**
  - After saving, `router.replace("/")` directly. This removes the double refresh (`onboarding/actions.ts:52` + `role-form.tsx:42`).
  - Optionally choose and continue in one click.
  - Keys 1, 2 and 3 pick a role. This needs the interaction-scope extension in 8.10.
  - On fine pointers, one line: "C to create, / to search".
  - The step copy matches Clerk's step 1.
  - **Refused:** invite step, seeded Requests, company size.
- **Acceptance:**
  - No scrollbar on an empty page at 390/1440.
  - The first Request causes no layout shift.
  - Role saved → welcome in one navigation.
  - Keyboard-only story.
  - Admin and member stories.

### 2.3 New Request composer and `/intake` (M; L if Expected impact changes shape)
- **Changes:**
  - Borderless large title and description with visually hidden labels. Keep the existing property-chip row (Project, Type) and footer actions.
  - 12px radius, theme overlay token, no blur, entrance settles ≤ 240 ms (8.20).
  - **Expected impact stays required.** It becomes a progressively disclosed section, and validation focuses it on submit (8.23).
  - AI gate: show the review-step skeleton with "Checking whether this describes a problem…", not just a button spinner. On timeout or spend cap: "Review unavailable right now. Your draft is kept."
  - After Create, the Request appears in the Open group through the pending overlay.
  - **S3:** correct the "View Request" label, and give an honest warning plus recovery when a reload loses retry state.
  - **S4:** when filters hide the new row, announce it, for example "Created. It's hidden by your current filters." with a "Show it" action. Do not silently clear filters.
  - One name for the surface (8.10). Today the breadcrumb says "Intake" (`sidebar-view.tsx:96`) and the drawer says "New Request".
- **Linear patterns:** C opens with focus in the title; compact composer; ⌘Enter. **Not adopted:** status or assignee chips at creation, and "Create more".
- **Acceptance:**
  - C → focused title ≤ 100 ms on first open.
  - Gate acknowledgement ≤ 100 ms.
  - Input survives the 15 s timeout, the spend cap and session expiry.
  - The new row is visible immediately.
  - Stories at 390/dark and 1440/light: draft restored, validation, slow gate (5 s), timeout, review unavailable, session expired, upload progress and recovery.

### 2.4 Requests list: finish (M)
- **Changes (Phase 1 already provides client views, the overlay and batch bulk):**
  - **Keyboard model** (8.21): an **ARIA grid with roving tabindex** (default, to be confirmed). The row is the single tab stop. J/K or ↑/↓ move, Enter opens, X selects, Esc clears, F opens the filter. In-row controls become `tabIndex=-1` but stay reachable by menu and shortcut.
  - Shortcut hints in the row menu, for supported actions only.
  - `?` overlay listing the shortcuts.
  - Announced result count while filters are active (8.11).
  - Live-region announcements for optimistic changes.
- **Optional:** edit Project and Type in place (8.25; default no).
- **Acceptance:**
  - Tab reaches the list in 1 stop, not about 10 per row.
  - View switch makes 0 network requests with INP ≤ 200 ms.
  - Mark Done shows in the next frame, with Undo.
  - VoiceOver pass recorded.
  - Re-critique ≥ 28/40 with 0 P0/P1 (25/40 before the polish).
  - Stories green at all 4 widths.

**Usability round (5 people) runs here,** after 2.3 and 2.4, on staging or with pilot-zero teams. That way it finds issues before the remaining polish (critique 1 #19).

### 2.5 Request detail (L), the most important page below the bar
Needs decision 8.5, which also records the go-ahead Nikhil deferred "until he asks" (`2026-10-07-requests-list-and-workspace-sidebar.md:12`).

- **Changes:**
  - **One 44px header:**
    - `Workspace / Project / LAN-n`
    - Copy-link and copy-code buttons
    - Pick up or Mark Done with the Undo toast. Undo on detail needs a ledger amendment, because Undo is recorded as offered "from the Requests list" (8.10).
    - A "2 / 5" previous/next counter with J/K or ↑/↓, using the list context in layout state, prefetched.
  - **Main column:** title (reframed problem), description, context, Expected impact, files, comments (appended through the overlay), and the Ask for review panel.
  - **Right properties panel:**
    - Status glyph with its one allowed move
    - Saved priority (editable)
    - Owner, Project, Type and Submitted (read-only)
    - Space reserved for future alignment and outcome blocks
  - **Phone:** properties collapse under the title, and the lifecycle action stays in the header.
  - Remove the legacy `RequestListPane`.
  - Add `requestNumber` and `priority` to the detail select. This is not a schema change: they are missing from `requests-workspace.tsx:106-131` and from `RequestDetail` at `detail-view.tsx:38-62`.
  - Remove the duplicate People/submitter.
  - A skeleton that matches the new layout.
- **Not adopted:** sub-issues, estimates, subscribe, due date, activity events, side peek.
- **Acceptance:**
  - List → detail content ≤ 300 ms warm p75 when prefetched.
  - ≤ 2 DB round trips per render.
  - Lifecycle, priority and comment appear in the next frame, with rollback and no-revert stories.
  - Code and priority visible and copyable.
  - Guest, forbidden and not-found stories.
  - Esc returns to the list with focus restored.
  - 0 P0/P1, ≥ 28/40.

### 2.6 Ask for review panel (M)
- **Changes:**
  - A debounced (150 ms) type-ahead reviewer combobox, reusing `request-property-pickers.tsx:122-132`.
  - Local times.
  - No client refresh.
  - Denser 13px round rows.
  - Fix the detector finding at `design-review-panel.module.css:33`.
- **Acceptance:**
  - With 8.15 approved, suggestions arrive ≤ 300 ms after typing stops. Without it, latest query wins and requests never stack.
  - Save is optimistic with rollback.
  - "Ask And Respond" story green.
  - A real multi-person round on staging (`2026-10-09-ask-for-review.md:26`).

### 2.7 Notifications popover (M)
- **Changes:**
  - Count seeded from the layout promise.
  - Keep the last list while revalidating, with no spinner on re-open.
  - Optimistic read and unread.
  - J/K inside the popover (8.10 scope extension).
  - Rows read "LAN-n · reframed problem".
  - "Done" capitalised.
  - Empty state: "No notifications".
- **Kept as a popover**, not an Inbox (`DEFERRED.md:276`).
- **Acceptance:**
  - Re-open shows content in the next frame.
  - The count updates after the user's own actions. It also updates on focus only with 8.15.
  - Stories for empty, error and retry.

### 2.8 Workspace search (M), needs whitelisting (8.10)
- **Changes:**
  - Search as you type with a 150 ms debounce. The sequence guard exists at `:102-138`.
  - Instant local results from the loaded list, then server results.
  - `LAN-12` + Enter opens that Request.
  - Arrow and Enter navigation.
  - 44px single-line rows. Local dates.
- **Acceptance:**
  - First local results in under 50 ms.
  - Server results ≤ 400 ms warm p75 only with 8.15. Otherwise latest query wins.
  - "Saved Request Code" story green.
  - Keyboard-only story.

### 2.9 Settings → Profile (S) and 2.10 Settings → Members (S–M), batchable
- **Profile:**
  - 44px strip instead of the 36px h1.
  - Grouped rows: label and description on the left, control on the right.
  - The role saves on change, optimistically, with a toast. This needs the 8.10 scope extension. Keep the "label only" helper text.
  - Mount `SettingsNav` (Profile, Members) as strip tabs.
- **Members:**
  - 44px strip.
  - Clerk `appearance.elements`: hide Clerk's inner nav, 13px rows, 32px buttons, 0.5px borders, `--radius-control`.
  - Reserve space with a skeleton.
  - **Do not rebuild the invite UI.** No "Last seen".
- **Refused:** a separate settings sidebar and extra settings pages.
- **Acceptance:**
  - A role change is acknowledged in the next frame.
  - One save model per page.
  - No layout shift while Clerk loads.
  - Verified against the production Clerk instance.

### 2.11 Auth: login, signup, forgot/reset (M)
Production Clerk exists after the early cutover, so this is styled and verified against the real instance.

- **Changes:**
  - Clerk appearance tuned to Lane's auth column: 24px title, 36px inputs, primary button tokens. Map `colorRing` to `--focus-outline`, not the transparent `--focus-ring`.
  - Add `loading.tsx` for login.
  - Hide "Forgot your password? Reset it" while a Clerk session task is active (`login/page.tsx:18-24`).
  - Reserve the card's space.
  - Align spacing on forgot and reset.
- **Acceptance:**
  - CLS ≤ 0.02.
  - Auth JS does not regress from 257–271 KB gzip, plus the Clerk runtime.
  - A real reset and a real invite return work on **production**.

### 2.12 Later, if selected
- ⌘K palette (8.24): existing actions only.
- Request peek (`DEFERRED.md:210-222`).

**Cut line** if the timeline must shrink: 2.7 and 2.8 are B- today and can follow the soft launch. That saves about 2 weeks.

---

## 6. Phase 3: production cutover and launch readiness

Owner key: **N** = Nikhil (dashboard, manual step or decision), **A** = agent, **N+A** = both. Item codes refer to the prod audit.

**Timing:** cutover happens after Phase 0 and Phase 1a (about week 7), not after all page work. After that, `main` is protected, small PRs promote one at a time, and any new migration (for example a possible 0020 `done_at`) follows staging-first with a verified export (`AGENTS.md:74-77`).

### 6.1 Before cutover (pilot-zero prerequisites)
| Item | Owner | Ref |
|---|---|---|
| Write the cutover and rollback runbook. After 0013, rollback means restoring the pre-cutover dump and redeploying `826e509`; a code rollback alone fails. State the expected downtime window. | A writes, N approves | C6 |
| Check which env the `lane` Preview deployments use (they must not point at the prod DB), plus Fluid compute and the Node version. | N | C3, C4 |
| **Clerk plan for team sizes** (decision 8.3). Per Clerk docs cited in critique 1, Free allows 5 members per organization (verify current terms). The dev instance has an unlimited-members paid feature selected that must not be cloned without approval (`clerk-clean-cutover.md:141-143`). | N | G1, G8 |
| Create the Clerk production instance with Organizations on, Membership required, and Admin/Member roles. | N | G1, G4 |
| DNS CNAMEs in Vercel DNS: `clerk.`, `accounts.`, `clkmail.`, `clk._domainkey`, `clk2._domainkey`. These override the wildcard. | N | G2 |
| Host sign-in and sign-up on `/login` and `/signup`. A staging check is a rehearsal only; the gate closes on production. | N + A verifies | G5 |
| Clerk branding and templates set to "Lane". | N | G6 |
| Sign-up policy (decision 8.9) and bot protection. Social providers need production OAuth credentials. | N | G7, G9 |
| Restrict localhost `allowedRedirectOrigins` to non-production (`src/app/layout.tsx:37-43`). | A | G10 |
| Manual deletion procedure (no Clerk webhooks by design). | N+A | G11 |
| Startup env check (zod) that fails a production build or boot when required keys are missing. Update `.env.example` with the KV keys. | A | I4, I5 |
| **Vercel production env, complete:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, transaction-pooler `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `TRIAGE_TOKEN_SECRET` (present), `NEXT_PUBLIC_APP_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. The Supabase keys change if decision 8.2 creates a new project. | N | I3; critique 1 #13 |
| Create Upstash Redis and set KV in prod and staging. Today the limiter fails open (`src/lib/rate-limit.ts:6-13,29-31`). | N | J1 |
| Anthropic spend cap with an **alert at 50%**. The gate is mandatory, so hitting the cap stops all Request creation. | N | J2 |
| Baseline security headers in `next.config.ts` `headers()`; CSP in Report-Only. | A | K1, K2 |
| Error monitoring, an uptime monitor on app.uselane.app (it also catches a Supabase pause), and Speed Insights (decision 8.13). | N decides, A wires | M1, M3, M5 |
| **Minimal Terms, Privacy and contact before any non-founder data.** List the processors: Clerk, Supabase, Vercel, Anthropic, Upstash, monitoring. Add inbound MX or forwarding for support@, and the Clerk consent checkbox. Get advice on DPDP/GDPR. | N (content/advice) + A (pages) | P1–P5, H3 |
| Linear-derived material handled per decision 8.7 (item 1.0). Arc Pro licence confirmed (8.8). | N decides, A executes | R1–R4 |
| Confirm the old Supabase-era test password (public history, `01acf82`) is not reused anywhere. | N | D9 |

### 6.2 Staging release candidate
1. Deploy the branch head to `lane-staging` in the chosen region.
2. Run the golden-journey e2e with explicit approval (`LANE_E2E_ALLOW_REMOTE=1`, with a wake check for auto-pause). Port alignment (3100) comes first (`DEFERRED.md:206-208`). If the stale specs are not rebuilt yet, run the journeys by hand and record them.
3. Manual walk-through: saved codes (create, search, copy), a multi-person review round, Undo Done, workspace switch, guest notification downgrade (J8b), guest isolation (J8b), attachment failure and retry.
4. Rehearse invite return and reset on the dev instance. **These do not close the gates.**
5. Run the perf spec, warm and cold, and record the p75/p95 numbers.

### 6.3 Cutover day (each step needs its own explicit authorization)
1. **D1:** confirm production data is disposable. 0013 drops every app table.
2. **D2:** final DB region. If it changes, create the new Supabase project now (free tier allows 2 projects). Staging moves with it so evidence still transfers.
3. **Build a staged production deployment with the production env, not promoted.** `NEXT_PUBLIC_*` values are baked in at build time. Check that its served page carries a `pk_live` prefix (do not print the key).
4. **D3:** `pg_dump -Fc` production, check it with `pg_restore --list`, restore into a local rehearsal DB, and apply 0013–0019 with `ON_ERROR_STOP`. Keep an encrypted copy off the laptop; it is the only machine (E3).
5. **D4:** apply 0013–0019 to production. Verify RLS flags, revoked grants, timestamp triggers, and `allocate_request_number`, `guard_request_number` and `guard_organization_request_counter`. Downtime starts here: the old app breaks against the new schema.
6. **Promote the staged deployment immediately.** Downtime ends. *(2026-10-10: PR #35 is merged ahead of cutover at Nikhil's instruction, with `vercel.json` `git.deploymentEnabled.main = false` so the merge deploys nothing; production keeps serving `826e509`. The cutover commit re-enables deployments for `main`, and the promoted build is a build of `main` with the production env.)*
7. **D7:** configure the `request-attachments` bucket on production (10 MB, MIME allowlist).
8. **Production-only checks (L3)** with fresh Clerk accounts. Each is a go/no-go line:
   - Workspace isolation, J8a (board, detail, attachments).
   - Signup, onboarding, Intake with the AI gate, attachments.
   - **Invite auto-return.**
   - **Real reset.**
   - **Invite and reset emails land in the Inbox.**
9. **D8:** Supabase cleanup. Delete legacy `auth.users`, disable Supabase Auth sign-ups, purge orphaned storage, confirm the Data API is off. Also check the Data API on staging (L2).
10. **S1:** tick the `AGENTS.md:79-91` boxes with production evidence only.
11. **Start weekly manual `pg_dump`s** with an off-machine copy, and watch storage use (free tier is 1 GB, attachments up to 10 MB each). This continues until Supabase Pro (decision 8.14).

If anything fails, follow the rollback runbook.

### 6.4 Before the wider soft launch
- All Phase 2 pages above the cut line have shipped and been promoted.
- Favicon, OG image and manifest, with the boilerplate SVGs in `public/` removed (O4).
- Marketing: `marketing/` is a broken gitlink with no `.gitmodules`. Ship a truthful landing page or record that it is out (decision 8.27).
- The full Storybook matrix is green with visual compare mode on. Stale e2e specs and the 41 orphan PNGs are retired. Linux baselines are re-captured.

---

## 7. Phase 4: launch QA, soft launch, go/no-go

### 7.1 Launch QA (production)
- [ ] Full golden journeys on app.uselane.app with fresh accounts: new creator, invited teammate, returning user, recovery (`phase-0-ux-skeleton.md:140`, A7).
- [ ] **Lab perf spec from India against production, warm and cold.** Every §2.2 budget is met, or Nikhil has written a waiver. Numbers are recorded in the plan's verification record.
- [ ] Full Storybook matrix is green (4 widths × 2 themes, plus reduced motion).
- [ ] Every in-scope page has a ledger entry with 0 P0/P1, ≥ 28/40, and staging perf numbers.
- [ ] Every page is reviewed, or removed by a recorded decision, including nested and failure states (`ux-copy-launch-review.md:195`).
- [ ] The landing promise matches what is implemented (`:197`).
- [ ] The error monitor, uptime alert and the 50% spend alert have each fired once in a test.

### 7.2 Pilot zero, usability round, then soft launch
1. **Pilot zero** (from about week 7): 1–2 friendly teams. Each team stays at or under the Clerk plan's seat limit. Nikhil watches errors, uptime and AI spend daily.
2. **Usability round** after 2.3 and 2.4 with 5 recruited people (`ux-copy-launch-review.md:189-191`). Fix anything that blocks a core task or loses data before more polish.
3. **Soft launch:** invite design leads in batches of about 5. Field INP/LCP become alerts here, not gates.
4. **Validation:** gates 2–3 (Intake value, Requests workflow value) count only when real teams use Lane repeatedly (`lane-roadmap.md:208-218`; `AGENTS.md:101-103`).

### 7.3 Go/no-go for the wider soft launch

**Go only if all of these hold:**
- Production cutover is verified, including J8a workspace isolation.
- Invite auto-return, real reset, and invite and reset deliverability are all verified **on production**.
- The Clerk plan supports the pilot team sizes.
- No open issue blocks a core task, loses data, misrepresents save or share, or crosses a permission boundary (`ux-copy-launch-review.md:196`).
- §2.2 lab budgets are met warm and cold from India against production, or waived in writing per budget.
- The AI gate's "review unavailable, draft kept" state works. Rate limiting is live (KV set). The spend cap and 50% alert are set.
- Error and uptime monitoring are live.
- Terms, Privacy and a support contact are live.
- The Linear-provenance decision has been made and carried out. The Arc Pro licence is confirmed.
- Backups: a verified export, an off-machine copy, weekly dumps running, storage watched. Auto-pause is handled (Pro, or an uptime alert plus a restore runbook).
- Free pilot vs paid is recorded explicitly (`ux-copy-launch-review.md:200`).

**No-go triggers:**
- Any isolation failure.
- Invite or reset email landing in Spam.
- Mark Done not visible within 100 ms, or visibly reverting on success.
- A production DB without a verified dump.
- An unprotected `main`.
- A team blocked by the seat limit.

---

## 8. Decisions Nikhil must make

Each decision has a recommended default. Group A blocks Phase 0 and needs one or two sessions; 8.7 and 8.8 need outside advice. Group B is needed before Phase 1 ends. Group C is decided when its page starts.

### Group A: decide now (S0)
1. **Launch audience, primary pain, first value and launch scope** (`ux-copy-launch-review.md:218`), plus **free pilot vs paid** (`:200`). *Default:* design leads at small product teams; a free, invite-only pilot; scope as §1.2–1.4. Payment waits for Vercel Pro, Supabase Pro and every §3a must-build.
2. **Server and DB region.** Decide before any Phase 1 measurement, and keep staging and production in the same region. *Default:* `hnd1` for both Vercel projects, with the DB kept in Tokyo. Consider Mumbai (`bom1` + `ap-south-1`) only if most pilot users are in India. Cutover day is the cheapest moment to move, because 0013 wipes the data anyway.
3. **Clerk plan for pilot team sizes.** This is not covered by the free-tier approval at `lane-roadmap.md:138-140`. *Default:* pilot zero runs with ≤ 5 seats per workspace. Budget for Clerk Pro before the wider soft launch and record it against the roadmap.
4. **Un-defer optimistic UI** (`DEFERRED.md:37-42`). *Default: yes.* Record that "superfast" is a launch requirement. The overlay lands after co-location (1.1), which respects the original trigger order.
5. **Replan the creation-to-outcome UX, or waive it in writing, for all Phase 2 pages** (`REQUIREMENTS.md:856-857`). This includes the detail redesign go-ahead (`2026-10-07-…sidebar.md:12`). *Default:* one sketch session showing where alignment and outcome will sit on composer and detail, then proceed.
6. **Waive the one-subsystem rule for Phase 1** (`REQUIREMENTS.md:790`), and set the increment cadence (`AGENTS.md:43`). *Default:* waive for Phase 1 only. Keep one increment per week for list and detail. Allow batching of welcome + onboarding and Profile + Members.
7. **Linear-derived tokens and records in a public repo**, and repo visibility (prod R1–R4). *Default:* re-author a Lane-owned palette (`--lane-*`) in item 1.0, before any Phase 2 baseline. Remove the source and live-audit records and delete the local Linear JS artifacts. Get legal advice before public marketing. Do no further live-app inspection of Linear. If the repo goes private, add GitHub Pro or move to an org on Team so that item 0.1 keeps working.
8. **Arc Pro licence** allows source in a public repo (`docs/licenses/` is empty). *Default:* check with uiarc before anything else ships. If redistribution is not allowed, go private (see 8.7).
9. **Sign-up policy.** *Default:* invite-only or allowlist for the pilot, with Clerk bot protection.
10. **Reconcile the docs.**
    - Add saved priority and Ask for review to `REQUIREMENTS.md` and the roadmap.
    - Whitelist the workspace search pane (`AGENTS.md:16-27`).
    - Extend the Linear-style interaction approval (`AGENTS.md:45`) to Profile auto-save, onboarding keys, and notification and search keyboard work.
    - Amend the Undo ledger entry so Undo is also offered on detail.
    - Fix the stale lines.
    - Name the composer surface. *Default:* "Intake" is the flow name and "New Request" is the action label and breadcrumb.
11. **Filtered result count** (stories #13–17). *Default:* an announced count in the toolbar while filters are active, for example "3 Requests match".
12. **Retire the Geist and legacy Arc Green stories** once Linear is the Storybook default. *Default:* retire them and keep one Arc reference story.
13. **Monitoring and analytics.** *Default:* error monitoring (for example the Sentry free tier), Vercel Speed Insights and an uptime monitor. Product analytics come from SQL counts only, with no per-person tracking ("support, not surveillance", `AGENTS.md:8`).
14. **Supabase Pro at pilot start** (auto-pause risk). *Default:* yes, once real pilot data arrives. Until then: uptime alert, weekly dumps and a restore runbook.
15. **Read-only GET route handlers** for search, reviewers, notifications and the unread count, with `AbortController`. These are new routes (`AGENTS.md:46`). *Default: approve.* Without them, 2.6 and 2.8 lose their server-latency budgets (item 1.16).
16. **Early cutover and pilot zero.** *Default:* cut over after Phase 0 + Phase 1a and open to 1–2 friendly teams. Every page after that ships as its own small PR.
17. **Restore staging LAN-7/LAN-8** (In Progress before the 2026-10-09 checks, see item 0.10). *Default:* restore both; Nikhil runs it or authorizes the agent for that one staging write.

### Group B: decide before Phase 1 ends
18. **Performance budgets** (§2.2), including N (how many Done items load with the list) and the active-row cap. *Default:* adopt the budgets as written, with N = 50 Done. Re-set thresholds after the first staging measurement.
19. **Undo window.** Today it is measured from `updated_at`, so a priority edit restarts it (`actions.ts:134,159`). *Default:* record that a priority edit extends the window. The alternative is a `done_at` migration (0020, staging first).
20. **Notification-insert failure semantics.** Today a failed insert is swallowed (`notify.ts:8-12`). The atomic CTE would instead fail the whole mutation. *Default:* accept atomic failure. A Done Request with no notification is worse.
21. **New dev dependencies and Arc edits:** `@vercel/functions` (`attachDatabasePool`), `babel-plugin-react-compiler`, the bundle script, Tooltip, Button and motion edits, LazyMotion. *Default:* approve the pool helper, the bundle script and the Tooltip change. React Compiler and LazyMotion are approved only if Phase 1b misses its targets. Each gets a ledger entry.
22. **Arc motion changes:** drawer entrance settles ≤ 240 ms, no backdrop blur, no width springs, no blur morphs in dense rows. *Default:* yes, recorded in `arc-source-hashes.json`.
23. **Done authority (W3)** (`phase-0-ux-skeleton.md:126-128`). *Default:* any non-guest may mark Done. Confirm this matches the server guard and record it.

### Group C: decide at page time
24. **Keyboard model and its ARIA pattern** (2.4). *Default:* an ARIA grid with roving tabindex for list rows, plus J/K, X, Enter, F, `?`, and previous/next on detail. Add live regions and a VoiceOver pass.
25. **⌘K palette.** *Default:* not for the MVP. Ship the `?` overlay.
26. **Expected impact as progressive disclosure in the composer.** It stays required. *Default: yes.*
27. **In-place editing of Project and Type.** *Default:* not for the MVP.
28. **Marketing landing page.** *Default:* in scope as a minimal truthful page with Terms, Privacy and contact, before the wider soft launch.

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PR #35 merged before cutover (`main` unprotected, auto-deploy on) | Production down | Item 0.1 on day 1 |
| Going private on GitHub Free disables branch protection | Accidental deploys return | GitHub Pro or an org Team plan (8.7) |
| Functions not co-located with the DB | Every budget missed | 1.1 first, verified with `x-vercel-id`; region decided before measuring |
| Optimistic state flickers when navigation discards a pending action (Next 16.2.7) | Feels broken; the original deferral reason | Layout-level overlay that clears only on server match or error; URL sync held while pending; no-revert Playwright gate |
| Reads queue behind writes (serial server actions) | First click and search feel stuck | 1.8, plus GET routes (8.15) or latest-query-wins |
| Cold starts dominate a low-traffic pilot | Slow first click after idle | Fluid compute, `CLERK_JWT_KEY`, pool helper; cold p95 measured separately |
| Clerk Free seat limit (5 per organization, verify) | J2 and J6 hit the workspace-limit branch | Decision 8.3; go/no-go line |
| Linear-derived values and records already public (ToS s.2.2) | Legal and reputational | Decided in S0 (8.7). Re-authored before Phase 2 baselines so no sign-offs are lost. Get advice; this plan is not a legal conclusion |
| Arc Pro source already public | Licence breach | Check in S0 (8.8) |
| Supabase free-tier auto-pause | Production outage | `src/app/error.tsx`, uptime alert, weekly dumps, Pro (8.14) |
| No backups between migrations during the pilot | Data loss | Weekly `pg_dump` + off-machine copy; watch storage |
| Destructive 0013 on production | Data loss | Verified dump, local rehearsal, off-machine copy, runbook |
| Downtime between D4 and deploy | Visible outage | Staged production build first, promoted immediately after D4 |
| `NEXT_PUBLIC_*` baked into the wrong build | Production runs on dev Clerk keys | Build with the production env; check `pk_live` in the served page |
| Function time limit below the 15 s AI gate | Request creation fails | Fluid compute or `maxDuration` (1.1) |
| Spend cap stops all creation | Core flow blocked | 50% alert; "review unavailable, draft kept" state |
| An expired session token shows as "Not found" (plausible, unverified) | False rollback with a wrong message | Distinct auth error; refresh and retry once; story + e2e |
| Phase 2 regresses performance without anyone noticing | Late surprises | Bundle baseline and statement ceilings required in CI; per-page staging numbers in the ledger |
| Flipping Storybook to Linear exposes many failures | Phase 0 slips | Time-box it; fix contrast in tokens, not per story |
| Source-string tests resist the rewrite | False reds or false greens | Rewrite them as behaviour tests before 1.3 |
| Scope creep toward Linear parity | Delays; breaks Lane rules | §1.4 out-list and the conflict register; no pretend menu items |
| Docs out of sync stop work (`REQUIREMENTS.md:24-27`) | Blocked agents | Decision 8.10 in S0 |
| Estimates slip (about 20–23 weeks to soft launch) | Launch later | Early pilot zero gives value sooner; cut line drops 2.7/2.8; batching per 8.6 |
| E2E depends on remote staging and Clerk dev | Flaky release gate | Keep it manual with a wake check; per-PR gates stay network-free |
| Vercel Hobby is non-commercial | Can't take payment | Pro before the first payment (`AGENTS.md:87`) |

---

## 10. One-screen timeline

These are sessions and weeks, not calendar promises, using the agent-assisted S/M/L scale. **★ marks the critical path to pilot zero. ◆ marks the extra critical path to the wider soft launch.**

| Step | Product track (agent-heavy) | Ops track (Nikhil-heavy) |
|---|---|---|
| **S0** (1–2 sessions) ★ | Group A decisions (§8); doc reconciliation drafted | ★ Protect `main` / pause prod auto-deploy; Arc licence and Linear-provenance advice; restart :3100 if needed; restore LAN-7/8; start recruiting |
| **Weeks 1–3** ★ | Phase 0: commit polish + mock parity; fix the 18 stories; Storybook → Linear; CI gates (sharded) | Dependabot; Clerk prod instance and plan; Upstash KV; Anthropic cap + 50% alert |
| **Weeks 4–6** ★ | Phase 1a: region + Fluid + `CLERK_JWT_KEY` (1.1), pool (1.2), no refresh (1.3), CTE mutations (1.4), parallel layout reads (1.8), loaders (1.9), error boundaries (1.12), query counter; Lane tokens (1.0) if chosen | ★ Clerk DNS, branding, paths; monitoring + uptime; minimal Terms/Privacy/contact + MX; runbook; prod env complete |
| **Week 7** ★ | Staging release candidate → **cutover** (1–2 sessions) | ★ Staged prod build → dump → rehearse → 0013–0019 → promote → production-only gates → Supabase cleanup → **pilot zero opens** |
| **Weeks 8–10** ◆ | Phase 1b: overlay (1.5), batch bulk (1.6), client views (1.7), detail queries (1.10), prefetch (1.11), bundle (1.13), re-renders (1.14), perf spec + CI budgets (1.15b), read routes (1.16) → re-measure | Weekly `pg_dump`; pilot-zero support |
| **Week 11** | 2.0 app frame and states | — |
| **Week 12** | 2.1 welcome + 2.2 onboarding | — |
| **Weeks 13–14** ◆ | 2.3 composer and `/intake` (S3/S4, review unavailable) | — |
| **Week 15** ◆ | 2.4 list finish + keyboard model | **Usability round (5 people)** |
| **Weeks 16–17** ◆ | 2.5 Request detail (L) | Fix-forward from the usability round |
| **Week 18** | 2.6 Ask for review | — |
| **Week 19** | 2.7 notifications *(cut line)* | — |
| **Week 20** | 2.8 search *(cut line)* | — |
| **Week 21** | 2.9 Profile + 2.10 Members | — |
| **Week 22** ◆ | 2.11 auth; full matrix; golden-journey e2e rebuilt | Landing page, favicon/OG |
| **Week 23** ◆ | Fix-forward from launch QA | ◆ Launch QA on production (lab perf from India, warm and cold) → **go/no-go** (§7.3) → design leads invited in batches of about 5 |

**Critical path to pilot zero (★):** decisions → protect `main` → Phase 0 green → co-location + Phase 1a → production Clerk + cutover. This is about 7 weeks.

**Critical path to soft launch (◆):** Phase 1b → composer → list → usability round → Request detail → auth → launch QA → go/no-go. This is about 23 weeks. Taking the cut line (2.7 and 2.8 after the soft launch) brings it to about 21. Other page increments can slip or be batched without moving launch. The tokens decision, the Clerk plan, the cutover and backups cannot.

---

## Sources

- Canonical docs: `AGENTS.md` (16-27, 38, 43, 45-46, 72-91, 94, 101-103), `REQUIREMENTS.md` (6-27, 117-135, 703-717, 747-771, 790, 801-806, 856-857, §9-§10), `PRODUCT.md` (31-53), `lane-roadmap.md` (5, 42-50, 90-97, 125-140, 145-199, 208-218), `DEFERRED.md` (37-42, 57-68, 166-173, 206-222, 229-286), `DESIGN.md` (3-29), `README.md:33`.
- Plans: `docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md`, `2026-10-05-ux-copy-launch-review.md`, `phase-0-ux-skeleton.md`, `2026-10-07-requests-list-and-workspace-sidebar.md`, `2026-10-08-saved-request-codes.md`, `2026-10-08-request-properties-follow-up.md`, `2026-10-09-ask-for-review.md`.
- Design system: `docs/design-system/linear-primitives.md`, `linear-primitives-source.json`, `arc-source-hashes.json`, `src/styles/linear-primitives.css`, `src/styles/linear-arc-theme.css`, `src/components/arc/foundation.css`.
- Code: `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/requests-workspace.tsx`, `src/app/(app)/requests/[id]/actions.ts`, `notify.ts`, `lifecycle-buttons.tsx`, `comment-form.tsx`, `design-review.tsx`, `src/components/requests/{request-row-actions,request-row,data-table,list-view-state,use-request-selection,new-request-provider,detail-view,design-review-panel}.tsx`, `src/components/shell/{sidebar-view,notification-bell,workspace-search-pane}.tsx`, `src/lib/ensure-workspace.ts`, `src/lib/request-properties.ts`, `src/lib/rate-limit.ts`, `src/lib/ai/triage.ts`, `src/db/index.ts`, `next.config.ts`, `.storybook/preview.tsx`, `.github/workflows/test.yml`, `eslint.config.mjs`, `playwright.config.ts`.
- Next.js 16.2.7 bundled docs and source: `node_modules/next/dist/docs` (`07-mutating-data.md:206`, `revalidatePath.md:16`, `prefetching.md`, `staleTimes.md`), `node_modules/next/dist/client/components/app-router-instance.js:77-84,143-150`, `app-router.js:237-245,268-276`.
- Audits of 2026-10-10: scope, pages, perf, linear (Mobbin public screenshots; Refero was unavailable), prod, quality. Two plan critiques. External references cited in critique 1 (Clerk Organizations docs, GitHub protected branches docs, Vercel community note on `maxDuration`); verify these against current terms before acting.