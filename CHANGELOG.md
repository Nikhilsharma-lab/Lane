# Changelog

**Lane** — AI-native design ops platform. Built for design teams, not adapted for them.
Status: pre-launch beta

All notable changes are documented here. Update this file with every PR before merging.

---

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
