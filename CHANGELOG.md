# Changelog

**Lane** — AI-native design ops platform. Built for design teams, not adapted for them.
Status: pre-launch beta

All notable changes are documented here. Update this file with every PR before merging.

---

## 2026-04-24 — Production env var recovery + CI pg-tap unblock + 4 PRs merged

### Fixed
- **Production deploy blocker #37 resolved** — `DIRECT_DATABASE_URL` was never actually set in Vercel Production despite UI claims. Pulled via `vercel env ls`, verified absence, re-added scoped to Production + Preview with Session-mode pooler URL (port 5432). Confirmed working end-to-end via smoke test. (closes #37)
- **CI pg-tap failing on every PR** — `postgres:16` service container was missing Supabase-provisioned dependencies. PR #63 adds 3 stub steps before `drizzle-kit migrate`: (1) enable `pgcrypto` extension for `gen_random_bytes()` in `waitlist_approvals.approval_token` default; (2) stub `auth` schema + `auth.users` table with Supabase-compatible columns (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at); (3) create Supabase roles (authenticated, anon, service_role) as idempotent NOLOGIN roles. All future pg-tap runs now pass. (PR #63, closes #61)
- **Supabase Auth Site URL misconfigured on production** — was `http://localhost:3000`, meaning every password recovery / magic link / email verification link would point at localhost for every user. Corrected to `https://app.uselane.app` in Supabase → Authentication → URL Configuration. Redirect URLs list expanded to include production paths.

### Added
- **PR #65: `/auth/callback` route** — first Supabase auth callback handler in Lane. Previously password recovery, magic link, and email verification links landed on `/login` with no handler, producing `otp_expired` errors or silent bounces. New `app/auth/callback/route.ts` calls `supabase.auth.exchangeCodeForSession()` on the `?code=xxx` query param, sets the session cookie, redirects to `/dashboard` on success or `/login?message=…` on failure. Standard `@supabase/ssr` pattern, 27 lines. (PR #65)
- **PR #60: my-requests page migrated to `withUserDb`** — first route migrated as template for umbrella issue #42. Uses RLS-aware session pool instead of `systemDb`, keeps query scoped to `designerOwnerId = profile.id AND orgId = profile.orgId`. (PR #60, first step of #42)
- **PR #66: CLAUDE.md Part 19 — INFRA GOTCHAS** — production URLs, Supabase/Vercel project names, Vercel sensitive env var scope rule (Production + Preview only for secrets), redeploy behavior (uncheck Build Cache + Ignore Build Step for env var changes), auth callback requirements, Supabase URL configuration gotchas, production DB schema drift warning (#64), `profiles.role` vs `workspace_members.role` enum mismatch (`lead` → `admin` cast required), secret-handling rules. (PR #66)

### Security
- Rotated production Supabase DB password after accidental exposure in session transcript. Updated `DATABASE_URL` + `DIRECT_DATABASE_URL` in Vercel with new password.
- Disabled `claude-pr-review` workflow — was failing on every PR with invalid API key, requiring admin override for merges. Rather than rotate secret, workflow disabled via GitHub API (PR reviews still covered by Greptile). (closes #38)
- Captured secret-handling rules in global `~/.claude/CLAUDE.md` SCARS + Lane CLAUDE.md Part 19: never run `vercel env pull` (dumps plaintext), never type credentials back in messages, warn before commands that could expose secrets.

### Incidents
- **Production went down twice** during #37 remediation: (1) bad `DIRECT_DATABASE_URL` value after initial save, (2) Supabase pooler circuit breaker after ill-advised "pause project" attempt. Both recovered. Root cause of circuit breaker: pausing the project while pooler had cached connections confused state; dashboard → Database → Settings → Restart project path is the correct recovery for pooler issues.

### Filed — P0
- **#64: Production schema drift** — `drizzle.__drizzle_migrations` is empty on production despite 39 tables existing. `workspace_members` exists but `audit_log`, `waitlist_approvals`, `invites.team_id` do not — partial application of migration 0011. Running `drizzle-kit migrate` against production will fail on "relation already exists" for all 39 tables. Blocks B3 + B4. Needs Nikhil's reconciliation strategy before any future migration work on production.

### Filed
- **#61: CI pg-tap failing** — resolved by PR #63 (same session).
- **Comments on #35, #59, #61** with deferred-session runbooks so future sessions pick up cold.

### Docs
- Memory scars saved for Claude Code sessions: never expose plaintext secrets, verify dashboard paths before dictating, update CHANGELOG + ROADMAP after every merge.
- Lane CLAUDE.md now has Part 19 INFRA GOTCHAS (via PR #66).

### PRs merged today
- #63 fix(ci): enable pgcrypto + stub auth schema for pg-tap job
- #60 refactor(my-requests): migrate to withUserDb
- #65 feat(auth): add /auth/callback route for Supabase auth redirects
- #66 docs(claude): Part 19 — infra gotchas + secret handling runbook

---

## 2026-04-22 — Docs sync sweep + migration 0010 applied

### Fixed
- Bump migration 0010 journal `when` past prior `MAX(created_at)` to unblock `drizzle-kit migrate` — `drizzle-orm`'s pg-core migrator (`pg-core/dialect.cjs:64`) uses strict-less-than comparison against MAX, which silently skipped 0010 when its `when` was earlier than idx 9's manually-rounded `when`. After fix, migration 0010 applied successfully to lane dev. (commit b0e98d3)

### Docs
- Cascade-renumber B1-B4 migrations from 0010-0013 → 0011-0014 across `user-flows-spec.md`, `ROADMAP.md`, `test/sql/README.md` — the shipped 0010 catch-up took the 0010 slot permanently, forcing B1-B4 (originally planned as 0010-0013) to shift. (commit 663401c)
- Sync CLAUDE.md through commit 663401c — Part 16 extension with 15 new entries covering April 14-22 work, env var additions (`DIRECT_DATABASE_URL`), Part 15 command additions (`drizzle-kit migrate`, `test:sql`, `test:e2e`), Current Sprint updated, pgvector qualifier corrected. (commit 363e864)
- Refile 11 discipline items from Pre-B1 + April 22 findings into WORKING-RULES.md — new "Success signals are not proof of effect" rule under Verify before acting, new "Stored claims drift" rule under Living docs rule, new "Fetch before committing mid-session" under Commit discipline, new "Before destructive platform operations" carve-out under Supabase connection strings, and new `## Migration discipline` section for drizzle-kit canonicality and journal `when` invariant. (commit d61ab46)
- Docs sync sweep in progress — additional commits today cover TODOs + bootstrap baseline + ROADMAP parking lot (D2) and `request-flow.md` targeted sweep (D3). Final SHAs in git log.

### Migration note (commits b067d0e + b0e98d3)
Migration 0010 catches up 10 days of schema drift: 5 new tables (`workspace_members`, `analytics_events`, `notifications`, `decision_log_entries`, `stream_guests`), 3 new enums (`workspace_role`, `team_role`, `notification_type` with 15 values), 20 columns added across 8 tables, 13 performance indexes, `weekly_digests` cardinality change (`UNIQUE(org_id)` → `UNIQUE(org_id, week_start_date)` with new `week_start_date text` column, safe because 0 rows). Applied to lane dev on 2026-04-22; **NOT YET APPLIED to production** — separate future action. Before production apply, ensure journal `when` fix (b0e98d3) is in place to prevent `drizzle-kit migrate` silent skip.

---

## 2026-04-21 — Pre-B1 bootstrap, migration 0010 catch-up, DOCS BIG move

### Added
- Migration 0010 — catch-up for 10 days of schema drift, generated via `drizzle-kit generate` against current `db/schema/*.ts`. File committed but NOT APPLIED during this commit. (commit b067d0e)

### Security
- Override vulnerable glob + esbuild transitive dependencies. (PR #57)

### Changed
- Move project docs into `DOCS BIG/` folder + gitignore. (PRs #53, #54, #55)

### Fixed
- CSS: exclude `DOCS BIG/` from Tailwind source scanning. (PR #56)

### Docs
- Lane dev bootstrap procedure + execute first seed — canonical ordering (Drizzle-managed schema first, dev-only migrations on top) for populating empty lane dev. (commit 4ea1b4b)
- WORKING-RULES refinement: "Success doesn't unlock the next gate; the human does" — STOP-gate discipline hardening after April 19 rebase pipeline recurrence. (commit c171f5e)
- Pre-B1.d: bootstrap doc correction — Step 1 uses `drizzle-kit migrate` (was `push`); new Step 0 (Reset) procedure with preservation notes for Supabase platform infrastructure. (commit a12b1cb)
- Pre-B1.c: 7 corrections to `user-flows-spec.md` §4 data model sections — `workspace_member_role` → `workspace_role`, `team_memberships` → `project_members`, `bootstrap_organization_membership` signature, `accept_invite_membership` body. (commit 4e889cf)
- ROADMAP: Step 0 placeholder fix (`<commit-ref>` → `4ea1b4b`) + 28 new parking lot items from April 22 session (Pre-B1 findings, canonicality decision, Commit 2 drift discovery). (commit f692d8f)

### Dependencies
- actions/setup-node 4 → 6. (PR #49)
- actions/github-script 7 → 9. (PR #50)
- minor-and-patch group across 1 directory with 6 updates. (PR #58)

---

## 2026-04-20 — Week 7.5a test harnesses + Supabase drift reconcile

### Added
- Item A1: pg-tap SQL test harness — `npm run test:sql` + GitHub Actions CI step + smoke test. (Item A1 — commit b08dcf4)
- Item A2a: Playwright e2e test harness — Supabase admin API auth fixtures + storageState scaffolding + CI-safe env gating in globalSetup. (Item A2a — commit bde227b)
- Item A2b: Test email capture harness — `db/migrations/dev_only_sent_emails.sql` + lib/email capture branch with module-load production safety check + `e2e/helpers/email.ts`. (Item A2b — commit ec41cf2)
- Item A3: Test fixtures — `supabase/test-seed.sql` deterministic baseline (1 workspace + 4 profiles + 4 workspace_members + 1 pending invite). (Item A3 — commit fed633e)

### Docs
- Correct Supabase drift, reconcile with remote PRs #36/#40/#44/#46/#48, commit shared Claude Code config. (commit 0d843cf)

---

## 2026-04-19 — Security cluster + Week 7.5 P0 blocker

### Security
- Enforce org membership on views + fail closed on cron auth (addresses TODOs Priority 0 items). (PR #34)
- Fail closed in `withUserSession` when `DIRECT_DATABASE_URL` missing in prod (was silently falling back to transaction pooler, breaking RLS set_config). (PR #36)
- Add RLS policies for 11 tables introduced in migration 0007. (PR #40)
- Add ESLint guardrail against `@/db` imports in user-facing code; fix misleading nav.ts comment. (PR #44)
- Fail closed on AI triage failure and missing rate-limit config (prevents silent bypass). (PR #46)
- Delete legacy `/advance` route + dead `StageControls` component; add permission matrix tests — closes vertical privilege escalation surface. (PR #48)

### Added
- `npm run script` — dotenv-cli + tsx wrapper, closes shell-pollution parking lot item. (commit 067367e)

### Fixed
- Use `DIRECT_URL` (session-mode) for migrations, `withUserSession`, and seeds — transaction pooler doesn't persist session-scoped `set_config`. (commit e1db32e)
- Item 15g: connection pool max 3 + test data cleanup script. (Item 15g — commit 5c5f693)

### Docs
- User flows spec v2 — enterprise-grade rewrite: idempotent RPCs, audit log, waitlist infra, rate limiting, tests-parallel build order. Closes Week 7.5 P0 blocker. (commit 194dbcd)
- Week 7.5 roadmap expanded to four phased sub-weeks (7.5a-d) totaling ~50-54 hours. (commit c4e3453)
- Week 7.5 user flow foundation added as P0 blocker. (commit 2279910)

---

## 2026-04-18 — Week 4+5+6+7 complete: Items 8, 13, 15f, 14, 15 suite, active-requests

### Added
- Item 8: Full onboarding build — 3-persona flow (Design Head 4 screens + Designer/PM lightweight variants), intake-check payoff, progressive disclosure tooltips + Prove first-time modal, sample team seed + clear actions. Phase I (first-digest email) absorbed into Item 15c. (Item 8 — commits a4e9294, 6d38cef, 3390072)
- Item 13: Upstash Redis rate limiting across all 11 AI routes. (Item 13 — commit 006cf4c)
- Item 15f: Commitments view — cycle context header, committed requests with first-assignee name, auth/org/team-scoped query. (Item 15f — commit e080b07)
- Item 14 parts 1+2: 5-stage design flow UI complete — Sense panel (reuses ContextBriefPanel for AI research sidebar), Frame panel (4 structured fields + PM-brief comparison), Diverge rationale field, Converge (Decision Log + AI edge cases + completeness meter), AI iteration summary for Diverge, Prove polish (engineering feasibility textarea + inline AI handoff checklist). (Item 14 — commits 658f894, f03c693, d5f15cf, 8cc00d4, 49e1e98, 0f9adc6, 9e1f377)
- Item 15a: Enhanced handoff brief integrates full Item 14 design journey + new `accessibility_gaps` column on `request_handoff_briefs`. (Item 15a — commit 9f8a755)
- Item 15b: Impact logging refinements — notes field, editable actual, shared variance helper in `lib/impact/variance.ts`, prior-calibration hint, warmer labels ("Close to the mark" / "Aimed high" / "Aimed low"). (Item 15b — commit 29cf8d7)
- Item 15c: Weekly digest cron — historical archive (new `week_start_date` column, compound unique), bounded retry with exponential backoff, in-app `weekly_digest` notification, email delivery via Resend template, first-digest preamble (absorbs Item 8 Phase I). (Item 15c — commit f87c157)
- Item 15e: Morning briefing improvements — dedicated `gatherDeveloperContext` (fixes dev role routing through `gatherDesignerContext`), empty-queue fabrication guardrail, `KF6` prefix removal, Item 14 signals threaded into designer context, PM calibration signal from `impact_records`, lead appetite signal (vocabulary-enforced). (Item 15e — commit ef1744b)
- active-requests page — real team-scoped query (`phase IN ('predesign', 'design')`), `PhaseFilter` component, `CompactRequestRow` list. Zero placeholder pages remain in the app. (commit acad4c0)

### Changed
- Item 15d: Remove `stall_escalation` alert type — auto-escalation of designer silence to leads is an anti-surveillance violation per CLAUDE.md Part 1. Function + constant + cron invocation + morning-briefing filter removed; enum value retained with `DEPRECATED` comment (Drizzle cannot drop enum values without dedicated migration). (Item 15d — commit c884eda)
- perf: Add 11 indexes on hot foreign-key columns (`requests.org_id`, `designer_owner_id`, `requester_id`, `project_id`, `phase`; `iterations.request_id`; `decision_log_entries.request_id`; `assignments.assignee_id`, `request_id`; `comments.request_id`; `notifications.recipient_id`). (Item 15g — commit 2b1b34e)
- perf: Scope dashboard assignments — split aggregate + focus queries (500+ row unbounded → ~50-150 row scoped). (Item 15g — commit f16a2da)
- perf: Batch alert detection queries (O(4×N) sequential → O(4) via `inArray` + `max()` aggregates) + detail-dock memoization (6 new `useMemo`/`useCallback` hooks). (Item 15g — commit d3109e9)

### Fixed
- Item 15g: ESLint errors — raw `<button>` → `<Button>` component (4 violations: 1 in `iteration-card.tsx`, 3 pre-existing in `onboarding-flow.tsx`). CI was silently broken since Item 14 landed. (Item 15g — commit 968d5d1)

### Docs
- Week 4 re-scope — Item 14 first, defer command palette + "What's new" footer to post-launch polish. (commit 6e817ae)
- Week 7 buffer + Week 8 GTM roadmap (feature-complete milestone). (commits 47268f1, 1fd2338)

---

## 2026-04-17 — Items 4, 5, 6, 12, Item 8 start, CI pipeline

### Added
- Item 4: Intake check UI live — three-panel `problem_framed` / `solution_specific` / `hybrid` classifier with server-side gate enforcement (blocks solution-specific submissions without justification). The "killer onboarding moment" that makes Lane's philosophical stance concrete. (Item 4 — commits 5c3ac55, 7fe00ad, 5cca8e8, 4295443, 7eef16b)
- Item 5: Real `My requests` page with phase filter (All / Predesign / Design / Build / Track). Replaces placeholder text. (Item 5 — commit ea073d3)
- Item 6: Real `Submitted by me` page; extract `PhaseFilter` to shared component. (Item 6 — commit 9135ece)
- Item 8 Phases A-D: onboarding schema (`onboardedAt` + `analytics_events` table), persona detection + analytics track helper, routing (layout + page + dashboard redirect), Design Head 4-screen flow. (Item 8 — commits ad41297, 0f6f918, b3c839b, c82227d)
- CI pipeline — security scanning, Dependabot, e2e job empty-dir fix. (commits 5a3d6a9, dfee0bb)

### Fixed
- phase-filter: use `<Button>` component instead of raw `<button>`. (commit d22a2a8)

### Docs
- Item 12: RLS audit — route inventory and migration plan at `docs/rls-audit.md`. Plan shipped; execution deferred to pre-customer sweep. (Item 12 — commit d3b78ab)

### Dependencies
- actions/checkout 4 → 6. (PR #30)
- actions/upload-artifact 4 → 7. (PR #31)
- actions/cache 4 → 5. (PR #32)
- minor-and-patch group with 13 updates. (PR #33)
- hono 4.12.12 → 4.12.14. (PR #28)

---

## 2026-04-16 — Sign-off → Prove rename, WORKING-RULES created, Item 4 foundation

### Added
- `docs/WORKING-RULES.md` — AI session working rules (STOP-point discipline, commit discipline, verify before acting, vocabulary lock, Supabase connection strings, Claude.ai ↔ Claude Code loop, Living docs rule). (commit 585fc2a)
- Item 4 foundation: 4 intake classifier columns on `requests` (`ai_flagged`, `ai_classifier_result`, `ai_extracted_problem`, `ai_extracted_solution`), intake classifier AI function (later reverted in favor of extending triage). (Item 4 — commits 5c3ac55, 7fe00ad, 5cca8e8)

### Changed
- Item 1: Complete Sign-off → Prove vocabulary alignment Phase 2 — rename `components/requests/validation-gate.tsx` → `prove-gate.tsx`, export `ValidationGate` → `ProveGate`, directory `teams/[slug]/validation/` → `/prove/`, nav keys `team:${slug}:validation_gate` → `team:${slug}:prove`, `isRefineStage` → `isProveStage`, 11 files touched (TypeScript clean, 90/90 tests pass). Schema `validation_signoffs` intentionally NOT renamed (cancelled April 13 — "sign-off" is canonical act word). (Item 1 — commit 73cfedb)

---

## 2026-04-15 — AI silent failure audit, Reflections deferred

### Fixed
- Drop integer bounds from `prediction-confidence` schema; runtime clamp. (commit d8c2c48)
- Drop integer bounds from `idea-validator` schema (4 fields: impact, effort, feasibility, overall); runtime clamp. (commit e6c11c4)
- Drop array length bounds from `morning-briefing` schema; validate at runtime (truncate if too long, throw if too short). (commit d00725a)
- Surface AI errors in `idea-validator`, request triage, and idea validation routes — no more silent catches. (commit ce2da6f)
- Add `console.error` to 9 UI components with silent `catch` blocks. (commit 2a90a98)

### Changed
- S1 outcome: Defer Reflections feature to post-v1 — no v1 AI feature depends on reflections, no customer feedback requested them. Rename Diverge "Reflection field" → "Rationale" in CLAUDE.md, remove `/dashboard/reflections` from sidebar (placeholder route preserved in-code). Revisit after 3+ beta users have used Lane for 4+ weeks. (S1 — commits 4733e5b, f9cd366)

### Docs
- Spec S2: "What's new" footer — markdown parser for `CHANGELOG.md`, expandable component in sidebar, defer build to Week 4. (commit 72fbf2f)
- Gitignore `tsbuildinfo`; document sidebar/nav/hotkeys architecture in CLAUDE.md. (commit b5b64f9)
- Close AI foundation audit — session log and parking lot updated. (commits a4e74cd, 13bb3b8)

---

## 2026-04-14 — AI foundation verification, vocabulary align, ROADMAP scaffold

### Fixed
- Update AI model ID to `claude-haiku-4-5-20251001` across 17 live code files — prior `claude-3-5-haiku-20241022` was deprecated; triage had never run live due to this + dead API key + Zod 4 incompatibility. (commit cc2394a)
- Drop integer bounds from triage schema; runtime clamp (vercel/ai#13355 — Zod 4 `.int().min().max()` emits JSON Schema properties Anthropic rejects). (commit 63e7d6b)

### Changed
- Item 3: Rename `teams/[slug]/streams` route → `active-requests` — nav vocabulary alignment per CLAUDE.md Part 8 (`Stream` forbidden). (Item 3 — commit 31cdcc9)

### Docs
- Executable 7-week roadmap with dependency graph and re-scope checkpoint. (commit f2d9f49)
- Make `docs/ROADMAP.md` the single source of truth for build sequence + add parking lot section. (commit 4e410f7)
- Add AI foundation verification as Week 1 blocker for Item 4. (commit f933952)
- V4 closeout: pgvector is NOT installed — duplicate detection is LLM-based. Correct CLAUDE.md Part 9.3 to match built reality. Revise Item 9 scope. (commit 36b428f)
- Consolidate April 14 session into ROADMAP.md. (commit 5b09aaf)

---

## 2026-04-13

### Changed
- align codebase vocabulary to CLAUDE.md spec (PR #27)


## 2026-04-12

### Changed
- complete design system migration (PR #26)


## 2026-04-11

### Changed
- Navigation redesign: Linear-style object-first nav + shadcn migration (PR #24)


## 2026-04-09

### Changed
- harden workflow permissions and integrations (PR #14)
- rework RLS rollout runtime model (PR #17)


## 2026-04-07 — Design stage rename, schema fixes, CLAUDE.md public split

### Changed
- Rename design sub-stages from v1 (`explore → validate → handoff`) to v2 (`sense → frame → diverge → converge → prove`) — aligns code with CLAUDE.md product spec (PR #13)
- Update `designStageEnum` in Drizzle schema, `lib/workflow.ts`, `lib/radar.ts`, all UI components, and API routes to use new stage values (PR #13)
- Sign-off gate now checks `designStage === "prove"` instead of `"validate"` (PR #13)
- Prove completion auto-advances to dev phase; `figmaVersionId` set at that moment (PR #13)
- `requestStages` inserts use legacy `"explore"` value to stay compatible with existing `stageEnum` (PR #13)

### Added
- `designer_owner_id` column on `requests` — tracks design assignment separately from requester (PR #13)
- Linear-style triage inbox with action panels (PR #25)

### Docs
- Split `CLAUDE.md` into public technical ref (`CLAUDE.md`) + private business context (`CLAUDE.local.md`, gitignored)
- `CLAUDE.md` is now safe to commit to the public repo — no pricing, GTM, or personal details

### Migration note (PR #13)
Run `npm run db:push` after merging to apply: drops old `design_stage` enum, recreates with 5 new values, adds `designer_owner_id` column.

---

## 2026-04-05 (evening) — Security fixes, token encryption, repo cleanup

### Security
- Block leads from issuing `lead` or `admin` invites — vertical privilege escalation where a lead could grant themselves or others admin-level roles (PR #9)
- Hard-disable multi-role testing override in production via `NODE_ENV !== "production"` guard — env var alone was insufficient as it could be set on Vercel (PR #10)
- Wrap all phase transitions in `db.transaction()` — request state update + stage history insert are now atomic; partial writes can no longer leave requests in inconsistent state (PR #11)
- Move system comment inserts inside transactions — comments are now written atomically with the state change they describe (PR #11)
- Encrypt Figma OAuth tokens at rest using AES-256-GCM (`lib/encrypt.ts`) — tokens were previously stored as plaintext in `figma_connections.access_token` (PR #12)

### Migration note (PR #12)
Any orgs with existing plaintext Figma tokens must reconnect Figma after deploy. Set `FIGMA_TOKEN_ENCRYPTION_KEY` (64 hex chars) in Vercel env vars before deploying.

### Docs
- Full README rewrite — reflects current 4-phase product model, anti-surveillance philosophy, accurate setup instructions, and correct env vars
- Incorporate brand story ("Engineering teams have Linear...") into README
- Remove internal documents from public repo (CLAUDE.md, PRD, plans, specs) — gitignored, files retained locally
- Remove stale git worktree (`claude/musing-wing`) pointing to old DesignQ2 path

---

## 2026-04-05 (morning) — Pre-customer security hardening + brand

### Security (must-fix before first paying customer)
- Replace hardcoded test email with `ENABLE_MULTI_ROLE_TESTING` env flag — removes dev backdoor from production while preserving solo testing locally (PR #6)
- Add role allowlist + lead/admin gate to invite creation — any authenticated user could previously create invites with arbitrary roles (PR #6)
- Add email match check in `acceptInvite` — token possession alone was enough to join any org (PR #6)
- Add org scoping to `toggle-blocked`, `advance`, `impact`, `update` endpoints — authenticated users from other orgs could mutate requests if they knew the UUID (PR #6)
- Validate `managerId` belongs to same org before assignment — prevented cross-org profile injection (PR #7)

### Fixed
- Record `request_stages` rows on every `advance-phase` transition — cycle-time analytics (`radar.ts`) were always returning null because no history was being written (PR #8)
- Flag plaintext Figma OAuth token storage in schema — marked for AES-256-GCM encryption before customer onboarding (PR #8)
- nudge privacy, canToggleBlocked rename, error handling (PR #16)

### Docs
- Add `STORY.md` — Lane brand story, tagline "Own your lane.", positioning, and voice rules
- Document `ENABLE_MULTI_ROLE_TESTING=true` env var in `CLAUDE.md` — required in `.env.local` for solo validation testing

---

## 2026-03-01 to 2026-04-04 — MVP foundation (Weeks 1–8)

### Added
- Next.js 14 (App Router) scaffolded and deployed on Vercel
- Supabase auth + Drizzle ORM schema (requests, profiles, organizations, ideas, assignments, figma_connections)
- Request intake form with AI auto-triage (priority, complexity, type via Claude API)
- 4-phase workflow engine: Predesign → Design → Dev → Track
- Predesign stages: Intake → Context → Shape → Bet (with gate checks)
- Idea Board — org-wide idea submission, anonymous voting, AI validation, auto-create request on approval
- Design phase: Explore → Validate (3-sign-off gate: Designer + PM + Design Head) → Handoff *(superseded by 5-stage model in PR #13)*
- Figma sync — activity feed, version history, post-handoff change alerts (`figma_updates` table)
- Dev kanban board: To Do → In Progress → In Review → QA → Done
- Real-time updates via Supabase Realtime (WebSocket + `router.refresh()`)
- Email notifications via Resend (invite, validation needed, all sign-offs, handoff)
- Settings: org management, team invite flow, role assignment
- Warm cream UI theme (`#F8F6F1` background, `#2E5339` accent, Satoshi + Geist Mono fonts)
- Auth middleware scoping all dashboard routes

---

## How to update this file

Every PR should include a changelog entry under the current date:

```
## YYYY-MM-DD — one-line description of the session

### Security     ← auth, permissions, data exposure
### Added        ← new features
### Changed      ← changes to existing behaviour
### Fixed        ← bug fixes
### Removed      ← removed features
### Docs         ← documentation only changes
```

Skip sections that don't apply. Keep bullets short — one line per change with the *why*, PR number at the end.
