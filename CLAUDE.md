# Lane — Technical & Product Reference

**Status:** Pre-launch, live GTM
**Current Sprint:** Week 7.5 User Flow Foundation — test harnesses + DB migrations 0011-0014 (see `docs/ROADMAP.md`)
**Last Updated:** April 23, 2026 — B2 session commits 2936339 + affabd9 + 186ca28 (migration 0013 shipped). Part 16 reflects git main post-B2. WORKING-RULES adds column-name verification rule this session.

> Business context, pricing, GTM, and founder details are in CLAUDE.local.md (gitignored).
> For a chronological record of what shipped and when, see CHANGELOG.md.

---

## Spec files — read these first

Before touching navigation, sidebar, onboarding, empty states, or request intake, read the relevant spec file. If a spec and a prompt disagree, the spec wins. If a spec and this CLAUDE.md disagree on vocabulary, CLAUDE.md wins — the specs are aligned to it.

- **`docs/nav-spec.md`** — left navigation architecture, three-zone sidebar, role-aware ordering, badge hierarchy, empty/overflow states, workspace switcher, keyboard navigation, guest flow, team creation
- **`docs/onboarding-spec.md`** — three-persona onboarding (Design Head / Designer / PM), intake check UI that aligns to Part 2 Stage 1, progressive disclosure moments, sample team flow, weekly digest introduction

### Vocabulary lock (applies to all UI, copy, labels, empty states)

These terms are canonical and must not be renamed or substituted:
- **Request** — the primary unit of design work (never "Stream," "Ticket," "Issue," "Task")
- **Predesign / Design / Build / Track** — the four phases (Part 1)
- **Sense / Frame / Diverge / Converge / Prove** — the five design stages (Part 3)
- **Intake** — the sidebar item and stage name (never "Intake queue")
- **Prove** — the three-sign-off gate (never "Sign-off," "Validation gate")
- **Commitments** — cycle-committed work (never "Betting table," "Bet cycle")
- **Ideas** — the upstream pool (never "Idea board")
- **Reflection** — the designer's own written thinking (never "Status update"). *Feature deferred to post-v1 per April 15 S1 outcome; vocabulary preserved for future reconsideration.*
- **weekly digest** — the Friday AI summary

### Sidebar non-negotiables

The left sidebar must never contain items with these labels:
- Projects, Streams, Cycles (as top-level), Requests (as top-level), Issues, Tickets, Tasks
- Team (as top-level), Insights or Radar (unless user role is owner/admin)
- "Sign-off," "Validation gate," "Betting table," "Bet cycle"
- Any item containing "bet," "betting," "stream," or "queue" (as suffix)

See `nav-spec.md` section 13 for the full forbidden list.

### Onboarding non-negotiables

- **No tour libraries.** Intro.js, Shepherd, Driver.js, and equivalents are banned.
- **Inline empty states only.** Teach concepts at the moment the user encounters them, not in sequential tours.
- **Teach one concept in the first 60 seconds:** Requests moving through the four phases. Do not explain Prove, Commitments, Ideas, or the five design stages until the user reaches them naturally.
- **Intake check aligns to Part 2 Stage 1.** The classifier returns `problem_framed | solution_specific | hybrid`. Do not invent new classification values.

---
## CRITICAL BUILD RULES

### NEVER Build These (Anti-Surveillance Principles)

These are hard constraints. No exceptions, no "admin toggle," no "optional feature."

```
❌ NEVER: Individual utilization percentages visible to leads
❌ NEVER: "Last active" or "last seen" timestamps anywhere
❌ NEVER: Individual activity feeds visible to anyone except the individual
❌ NEVER: Per-designer speed comparisons or velocity rankings
❌ NEVER: Time-per-task tracking or timers
❌ NEVER: Mouse/click/Figma activity frequency tracking
❌ NEVER: Automatic escalation of designer silence to leads
❌ NEVER: "Overdue" labels on design work
❌ NEVER: Leaderboards ranking individual designers
❌ NEVER: Notifications to leads when a designer hasn't posted a reflection
```

### ALWAYS Build These

```
✅ ALWAYS: AI nudges go to the designer PRIVATELY first
✅ ALWAYS: Leads see TEAM health signals, not individual surveillance
✅ ALWAYS: Designers set their own capacity preferences
✅ ALWAYS: Reflections are the designer's own words, not forced status updates
✅ ALWAYS: Every AI recommendation includes reasoning (no black boxes)
✅ ALWAYS: Every AI suggestion is override-able by humans
✅ ALWAYS: The intake gate blocks solution-specific requests
✅ ALWAYS: Impact is measured at the PM level, not the designer level
```

---

## Part 1: THE 4-PHASE MODEL

```
PHASE 1: PREDESIGN      (PM + Org)       → Decide WHAT to work on
PHASE 2: DESIGN         (Designers)      → Explore and solve the problem
PHASE 3: BUILD          (Developers)     → Build and ship
PHASE 4: IMPACT         (PMs)            → Measure what happened
```

### Detailed Stage Flow

```
INTAKE GATE → CONTEXT → SHAPE → BET → [SENSE → FRAME → DIVERGE → CONVERGE → PROVE] → BUILD → IMPACT
                                        └───────── Design Phase (non-linear) ─────────┘
```

---

## Part 2: PHASE 1 — PREDESIGN (PM + Org)

### Stage 1: INTAKE GATE

**The single most important feature:** Requests MUST be problem-framed. Solution-specific requests are blocked.

**AI Classification Logic:**

```
INPUT: PM's request text

CLASSIFY AS:
  "problem_framed"     → passes gate, proceeds to triage
  "solution_specific"  → BLOCKED, PM sees reframe prompt
  "hybrid"             → AI extracts problem, flags solution, PM reframes

SIGNALS FOR "solution_specific":
  - Contains UI element names without problem context ("add a button", "change the color")
  - Describes implementation ("make it like Stripe", "add a sidebar")
  - No user problem or business metric mentioned
  - Starts with "Can we..." + UI change

SIGNALS FOR "problem_framed":
  - Describes user behavior or business gap
  - References data, metrics, or research
  - Asks "why" something is happening
  - Identifies a pain point without prescribing a solution

SIGNALS FOR "hybrid":
  - Contains both a problem AND a proposed solution
  - AI extracts the problem portion, flags the solution portion
```

**When blocked, show:**
```
"This looks like a solution, not a problem. Lane works best when
designers understand the WHY before the WHAT."

Problem detected: [AI's extraction]
Your proposed solution: [what they wrote]

[Accept AI rewrite] [Edit myself] [Submit anyway with justification]
```

**After passing gate, AI generates:**
- Priority (P0-P3) with reasoning
- Complexity (S/M/L/XL) with reasoning
- Type (New feature / Iteration / Bug fix / Research needed)
- Duplicate check (semantic search)
- Assignment recommendation (capacity + skills + context-switching)
- Request quality score

### Stage 2: CONTEXT

Living document attached to request:
- User research, analytics, past decisions (AI auto-links)
- Competitor data, technical constraints, stakeholder requirements
- AI generates structured design brief

### Stage 3: SHAPE

Define direction without final UI:
- Solution direction (rough), constraints, risks, appetite, open questions
- Non-linear — can loop back to Context
- AI calibrates appetite against historical data

### Stage 4: BET

Design Head decides per cycle:
- **Bet** → moves to Design Phase
- **Kill** → archived with reason
- **Defer** → auto-resurfaced by AI after N cycles

### IDEA BOARD (Parallel)

- Anyone submits ideas, org votes anonymously
- 1-week voting period
- Top ideas → AI + Design Head validate → auto-create request if approved

---

## Part 3: PHASE 2 — DESIGN (5 Scientific Stages)

**These stages are non-linear. Designers move between them freely.**
**No due dates. Appetites (time budgets) apply to the entire phase, not individual stages.**
**When Reflections ship, progress will be captured through them, not status updates.** *(Reflections deferred to post-v1 per April 15 S1 outcome.)*

### Stage 2a: SENSE

**Purpose:** Deep understanding before proposing anything.

**Designer produces:** Sensing Summary — insights, reframes, questions
**Exit signal:** Designer feels ready to frame the problem
**AI behavior:** Surfaces related research, past decisions. Does NOT rush.

**Build spec:**
- Read-only view of all context, research, and past related work
- "Sensing Summary" text field (rich text, supports images)
- AI sidebar: "Related research", "Past decisions on this area", "Suggested areas to investigate"
- No time warnings. No "days in stage" counters visible to leads.

### Stage 2b: FRAME

**Purpose:** Define what problem is actually being solved.

**Designer produces:** Design Frame — problem articulation, success criteria, constraints
**Exit signal:** Clear problem frame exists
**AI behavior:** Compares designer's frame with PM's original — flags divergence as conversation starter, not error

**Build spec:**
- "Design Frame" structured form: Problem (designer's words), Success criteria, Constraints, Divergence from PM brief (optional)
- AI comparison widget: PM's original problem ↔ Designer's frame, with highlighted differences
- This becomes the north star — referenced in all subsequent stages

### Stage 2c: DIVERGE

**Purpose:** Generate multiple solution directions. Breadth over depth.

**Designer produces:** 2-5+ iterations (Figma links, sketches, descriptions)
**Exit signal:** Multiple directions exist, designer has formed opinions
**AI behavior:** Summarizes iterations for stakeholders. Does NOT rank or rate designs.

**Build spec:**
- Iteration cards: each has Figma link, description, rationale
- "Add Direction" button — creates new iteration
- Rationale field: designer's thinking on why this direction, what tradeoffs they're seeing, what they're learning
- Comment threads per iteration (PM, eng, other designers)
- Version control: every Figma update = new version entry
- AI: "Iteration Summary" button generates stakeholder-friendly overview

### Stage 2d: CONVERGE

**Purpose:** Narrow to refined solution through critique and iteration.

**Designer produces:** Refined design, decision log, edge cases addressed
**Exit signal:** Designer believes ready for Prove
**AI behavior:** Auto-generates missing edge cases, flags accessibility gaps, completeness scoring

**Build spec:**
- "Decision Log" entries: what chosen, what killed, why
- AI edge case generator: "What happens if...?" suggestions
- Completeness meter: % of identified states covered (informational, not a gate)
- Feedback threads continue from Diverge

### Stage 2e: PROVE (Quality Gate)

**Purpose:** Three sign-offs from Designer, PM, and Design Head before dev handoff. This is Lane's one deliberate slow-down — the place where non-linear work becomes intentional.

**Build spec:**
- Three sign-off cards: Designer ✅, PM ✅, Design Head ✅
- Each: Approve / Approve with comments / Request changes
- If rejected: loops back with structured feedback (logged)
- Engineering feasibility review (non-blocking, async)
- AI: auto-generates handoff checklist, conflict detection
- All 3 sign-offs → Figma locked, Dev phase starts automatically

---

## Part 4: PHASE 3 — BUILD

### Handoff

- Figma version LOCKED (version at Prove completion)
- Auto-generated handoff doc: specs, edge cases, accessibility, engineering notes

### Dev Kanban

```
To Do → In Progress → In Review → Design QA → Done
```

- Design QA is REQUIRED — dev cannot ship without designer confirmation
- Post-handoff Figma changes trigger alerts: dev (urgent), PM (FYI), Design Head (FYI)
- Change requests go through mini Shape → Prove loop

---

## Part 5: PHASE 4 — IMPACT

### Measure

- AI prompts PM after configured period: "Time to log actual impact"
- PM enters actual result, system calculates accuracy
- AI generates impact narrative

### PM Calibration

- Rolling accuracy score per PM
- Framed as "calibration" not "scoring"
- Visible to PM + their leads only

---

## Part 6: CORE DATA MODEL

### requests
```typescript
{
  id: string,

  // Workflow
  phase: 'predesign' | 'design' | 'dev' | 'track',
  predesign_stage: 'intake' | 'context' | 'shape' | 'bet',
  design_stage: 'sense' | 'frame' | 'diverge' | 'converge' | 'prove',
  kanban_state: 'todo' | 'in_progress' | 'in_review' | 'qa' | 'done',
  track_stage: 'measuring' | 'complete',

  // Assignment
  designer_owner_id: string | null,   // set at design assignment
  dev_owner_id: string | null,        // set at handoff

  // Figma
  figma_url: string | null,
  figma_version_id: string | null,    // locked at Prove completion
  figma_locked_at: timestamp | null,

  // Impact
  impact_metric: string | null,
  impact_prediction: string | null,
  impact_actual: string | null,
  impact_logged_at: timestamp | null,

  // Timestamps
  created_at: timestamp,
  updated_at: timestamp,
}
```

### validations (Prove gate)
```typescript
{
  id: string,
  request_id: string,
  signer_id: string,
  signer_role: 'designer' | 'pm' | 'design_head',
  decision: 'approved' | 'approved_with_conditions' | 'rejected',
  conditions: string | null,
  signed_at: timestamp,
}
```

---

## Part 7: ROLE-BASED VISIBILITY TABLE

**This is the bible for what each role sees. Reference before building ANY dashboard or view.**

| Data Point | Designer (self) | Designer (peer) | PM | Lead | Admin |
|---|---|---|---|---|---|
| Own work portfolio | ✅ | ❌ | Status only | ✅ (org tree) | ✅ |
| Own reflections | ✅ | ❌ | ❌ | ❌ (unless shared) | ❌ |
| Own capacity preference | ✅ | ❌ | ❌ | ✅ (org tree) | ✅ |
| Team health signals | ❌ | ❌ | ❌ | ✅ (org tree) | ✅ |
| Individual utilization % | ❌ | ❌ | ❌ | ❌ (NEVER) | ❌ (NEVER) |
| "Last active" timestamp | ❌ | ❌ | ❌ | ❌ (NEVER) | ❌ (NEVER) |
| Per-designer speed ranking | ❌ | ❌ | ❌ | ❌ (NEVER) | ❌ (NEVER) |
| Request status (their requests) | N/A | N/A | ✅ | ✅ | ✅ |
| PM accuracy score | N/A | N/A | ✅ (own) | ✅ (org tree) | ✅ |
| PM request quality score | N/A | N/A | ✅ (own) | ✅ (org tree) | ✅ |
| Dev kanban | ✅ | ✅ | ✅ | ✅ | ✅ |
| Impact records | ✅ | ✅ | ✅ | ✅ | ✅ |
| Idea Board | ✅ | ✅ | ✅ | ✅ | ✅ |
| Commitments | View only | View only | View only | ✅ (decide) | ✅ |
| AI morning briefing | ✅ (own) | ❌ | ✅ (own) | ✅ (team) | ✅ |

---

## Part 8: UI LANGUAGE GUIDE

**Use these terms in all UI copy, labels, buttons, and empty states.**

| Instead of... | We say... | Why |
|---|---|---|
| Ticket | Request | Requests come from people with problems |
| Task | Work item | Design isn't a task to check off |
| Overdue | Appetite exceeded | Budgets, not deadlines |
| Due date | Appetite | Design has budgets, not deadlines |
| Status update | Reflection | Designers share thinking *(feature deferred to post-v1 per April 15 S1 outcome; vocabulary preserved)* |
| Sprint | Cycle | Less pressure, same cadence |
| Velocity | Throughput | Output, not speed |
| Assign | Recommend + Approve | AI recommends, humans approve |
| Utilization | Capacity | People have capacity |
| Performance | Health | Teams have health signals |
| Productivity | Impact | Outcomes, not output |
| Activity log | Timeline | Story of the work |
| Backlog | Deferred | Nothing rots |
| Blocked | Needs input | Agency, not helplessness |

**Empty state copy examples:**
- Designer with no work: "You're clear. Time to think, learn, or help a teammate."
- No reflections yet: "When you're ready, share what you're thinking. No rush."
- PM with no active requests: "All clear. Good time to review your impact data."

**AI nudge tone:**
- ✅ "Hey — it's been a while since the checkout flow got some attention. Everything okay? [I'm blocked] [Still thinking] [Forgot to update]"
- ❌ "You haven't updated the checkout flow in 5 days. Please update your status."

---

## Part 9: AI CAPABILITIES

### 1. Intake Gate Classification
Classifies requests as problem_framed / solution_specific / hybrid.
Blocks solution-specific. Suggests reframes. Extracts problems from hybrids.

### 2. Auto-Triage
Priority, complexity, type — all with reasoning. Not dropdowns.

### 3. Duplicate Detection
**Current implementation (April 14):** LLM-based comparison — triage prompt asks Claude to flag semantic overlaps with existing Requests. Results stored as JSON in `requests.potential_duplicates`. Works at small scale.

**Planned replacement:** Real pgvector semantic search — adds pgvector extension to Supabase, generates embeddings on Request creation, uses vector similarity operators (`<=>` cosine distance) for queries. Not yet built. See parking lot in `docs/ROADMAP.md` for trigger conditions.

### 4. Smart Assignment
Capacity + skills + context-switching cost + growth opportunity.
Presents options with reasoning. Lead approves.

### 5. Request Quality Scoring
Completeness, evidence strength, clarity. Builds PM accountability.

### 6. Private Designer Nudges
Contextual, friendly, private. Never escalated to leads automatically.

### 7. Weekly Digest (KILLER FEATURE — BIGGEST MOAT)
Auto-generated every Friday. Narrative format — team health, shipped items, recommendations.

### 8. Morning Briefing
Daily 30-second brief, role-specific. Pushed, not pulled.

### 9. Impact Comparison
Predicted vs. actual, narrative generation, PM calibration.

### 10. Edge Case Generator
"What happens if...?" suggestions during Converge stage.

### 11. Handoff Checklist
Auto-generated from design file analysis. Missing states, accessibility gaps.

### 12. Idea Validation
Scores ideas on impact, effort, feasibility. Recommends approve/reject.

---

## Part 10: FIGMA SYNC (Build Phase)

### Post-Handoff Alert Logic
```typescript
if (request.phase === 'dev' && figma_updated) {
  // Alert: "Design updated post-handoff"
  // dev_reviewed = false
  // Notify: dev (URGENT), PM (FYI), design head (FYI)
  // Dev must confirm review before continuing
}
```

---

## Part 11: TECHNICAL STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle ORM (pgvector planned for duplicate detection — see Part 9.3 for current implementation) |
| Auth | Supabase Auth + @supabase/ssr |
| AI | Claude API via Vercel AI SDK |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |
| Cache | Upstash Redis |
| Email | Resend |
| Payments | Stripe (post-beta) |
| Figma | Figma OAuth + on-demand sync |

---

## Part 12: PROJECT STRUCTURE

```
app/
  (auth)/login/
  (auth)/signup/
  (dashboard)/
    dashboard/
    requests/[id]/
    idea-board/
    commitments/
    insights/
    radar/
    dev/
  actions/
  api/
    requests/
    ideas/
    figma/
    insights/
    notifications/
    pm/
    team/

components/
  requests/
  dev-board/
  ideas/
  insights/
  radar/
  shell/
  ui/

db/
  schema/
    users.ts
    requests.ts
    workflow.ts        ← assignments, request_stages
    validation.ts
    figma_connections.ts
    figma_updates.ts
    ideas.ts
    impact_records.ts
    projects.ts

lib/
  ai/
    triage.ts
    context-brief.ts
    handoff-brief.ts
    idea-validator.ts
    prediction-confidence.ts
    impact-retrospective.ts
  figma/
    sync.ts
  supabase/
    client.ts
    server.ts
  workflow.ts          ← stage helpers, DESIGN_STAGES, nextDesignStage
  radar.ts
  encrypt.ts           ← AES-256-GCM for Figma tokens
```

### Architectural notes

**Sidebar and nav split.** Sidebar rendering lives in `components/shell/sidebar.tsx`. The `components/nav/` directory holds nav logic that's distinct from the sidebar shell — team sections (`components/nav/team-section.tsx`) and active-item logic. The `lib/nav/` directory holds nav keys and order constants. When modifying the sidebar's items, edit `components/shell/sidebar.tsx`. When modifying team-scoped nav structure, edit `components/nav/team-section.tsx`. When modifying nav keys or active-item resolution, edit `lib/nav/`.

**Hotkeys.** Keyboard shortcuts are wired in `components/shell/hotkeys-provider.tsx`. When adding or removing sidebar destinations, check whether a corresponding hotkey exists and update both consistently — they were the source of inconsistency during the April 15 S1 deferral.

---

## Part 13: DEVELOPMENT PHILOSOPHY

- **Simplicity > cleverness:** Monolith beats microservices
- **Third-party > custom:** Lean on Supabase, Vercel, Figma API
- **Ship 70%:** Iterate on customer feedback
- **Specs matter:** AI builds to spec; vague specs = vague code
- **Design system** — shadcn/ui preset `b3bZBz3KVM` (base-mira, neutral, hugeicons). All colors use CSS custom properties from `globals.css` — never hardcode hex values. Semantic tokens: `--phase-*`, `--status-*`, `--priority-*`, `--accent-*`, `--notif-*`
- **Type safety:** Let TypeScript catch errors
- **Server components by default**, client only for interactivity
- **Secrets in .env.local** (gitignored)

### Code Conventions

- Use Drizzle ORM for all DB operations
- Use shadcn/ui for all UI components
- Use Tailwind CSS utilities (no custom CSS unless necessary)
- Server actions for mutations, API routes for webhooks
- All AI calls go through lib/ai/ functions
- Git: push to main → auto-deploy to Vercel

---

## Part 14: ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_DATABASE_URL=   ← session-mode connection for migrations + set_config (bypasses transaction pooler)
ANTHROPIC_API_KEY=
FIGMA_TOKEN_ENCRYPTION_KEY=   ← 64 hex chars (32 bytes), AES-256-GCM

# Dev/test only
ENABLE_MULTI_ROLE_TESTING=true

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=
NEXT_PUBLIC_APP_URL=

# Figma OAuth
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=

# Cron security
CRON_SECRET=
```

---

## Part 15: COMMON COMMANDS

```bash
npm run dev
npm run db:push
npm run db:generate
npm run db:studio
npm run db:seed
npx drizzle-kit migrate         ← applies pending migrations (verify __drizzle_migrations row count incremented afterward; exit 0 alone is not proof of apply)
npm run test:sql
npm run test:e2e
npm run script -- path/to/script.ts
npx tsc --noEmit
npm run build
npm run start
```

### Testing pattern — pg-tap

Lane uses pg-tap for SQL-level assertions on migrations and database
invariants. Tests live under `test/sql/` and run via:

```
npm run test:sql
```

The runner (`scripts/run-sql-tests.mjs`) iterates all `test/sql/*.sql`
files against `DIRECT_DATABASE_URL`. Each file runs in isolation
(wrapped in `BEGIN; ... ROLLBACK;`). Production connection refs are
rejected for safety.

**Assertion pattern for complex multi-statement tests:**

```sql
CREATE OR REPLACE FUNCTION test_NN_name() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  ... vars ...
BEGIN
  ... setup SQL (inserts into auth.users, fixtures, etc.) ...
  RETURN NEXT ok(condition, 'description');
END $$;

SELECT * FROM test_NN_name();
```

For simple single-expression assertions (table/column existence, RLS
state, FK checks, CHECK constraints), use pg-tap's direct helpers:
`has_table`, `has_column`, `col_type_is`, `fk_ok`, `throws_ok`, `is`.

**File-level structure:**

```sql
BEGIN;
SELECT plan(N);   -- must match total assertion count across the file

-- direct assertions (SELECT has_table(...), etc.)
-- and/or function-wrapped assertions (CREATE FUNCTION + SELECT)

SELECT * FROM finish();
ROLLBACK;
```

Functions defined inside the `BEGIN/ROLLBACK` wrapper are
transaction-local and auto-drop at rollback.

(Seed invocation — running `supabase/test-seed.sql` outside of pg-tap
tests — is not covered here; see the parking-lot entry "test-seed.sql
invocation path discoverability" (2026-04-22) for the current
reproducible path and scheduled fix.)

**Canonical example:** `test/sql/test_migration_0011.sql` (19 assertions
across tables, columns, RLS, FKs, CHECK, REVOKE, RPC behavior, and
backfill invariants).

---

## Part 16: WHAT'S BUILT (As of April 22, 2026)

- [x] Next.js 14 scaffolded, Vercel deployed
- [x] Supabase auth + org scoping
- [x] Drizzle ORM schema — v2 design stages (sense→frame→diverge→converge→prove)
- [x] Request intake + AI triage
- [x] 4-phase model (predesign → design → dev → track)
- [x] Prove gate (3 sign-offs → auto-advance to dev)
- [x] Dev kanban
- [x] Figma OAuth + token encryption at rest
- [x] Weekly digest (on-demand)
- [x] Ideas board + voting + AI validation
- [x] Impact records + PM calibration
- [x] Email notifications (Resend — needs env vars to activate)
- [x] Design Radar
- [x] Insights page
- [x] `designerOwnerId` column added to requests
- [x] AI foundation verification + silent failure audit — 4 bugs fixed, 8 AI features verified end-to-end, error surfacing refactored across 13 files (April 14-15)
- [x] Vocabulary cleanup Phase 2 — Sign-off → Prove rename (Item 1), `streams` → `active-requests` route (Item 3) (April 14-16)
- [x] Item 4: Intake check UI — problem_framed / solution_specific / hybrid classifier live (April 16-17)
- [x] Items 5 + 6: Real My requests + Submitted by me pages with phase filters (April 17)
- [x] Item 12: Supabase RLS audit + migration plan (`docs/rls-audit.md`) — execution deferred to pre-customer (April 17)
- [x] Item 8: Full onboarding build — 3-persona flow with intake-check payoff, progressive disclosure, sample team (April 17-18)
- [x] Item 13: Upstash Redis rate limiting across all 11 AI routes (April 18)
- [x] Item 14 parts 1+2: 5-stage design flow UI complete — Sense, Frame, Diverge, Converge, Prove panels (April 18)
- [x] Item 15 suite (15a/b/c/d/e/f/g/h): handoff brief with accessibility gaps, nudge compliance (stall_escalation removed), morning briefing role fix + Item 14 signals, impact refinements, weekly digest cron + email, commitments view, perf + 11 hot-path indexes (April 18)
- [x] active-requests page build — zero placeholder pages remain in the app (April 18)
- [x] Pre-customer security sweep — Dependabot cleared, pool fix, API key fix, dev/staging Supabase split (April 19)
- [x] Week 7.5a test harnesses — A1 pg-tap, A2a/b Playwright + email capture, A3 fixtures (April 19-20)
- [x] Pre-B1 bootstrap + spec corrections — lane dev seeded with Drizzle schema + pgtap + sent_emails, `user-flows-spec.md` §4 aligned (April 20-21)
- [x] Migration 0010 — catch-up for 10 days of schema drift, applied to lane dev (April 21-22)
- [x] drizzle-kit silent-skip fix + docs cascade renumber — B1-B4 migrations shifted 0010-0013 → 0011-0014 (April 22)
- [x] Migration 0011 (B1) — workspace_members foundation: populated from profiles via backfill with multi-owner collapse; audit_log table (append-only, REVOKE UPDATE/DELETE enforcement); waitlist_approvals table with approval_source CHECK; 5 cross-schema FKs to auth.users (profiles.id, workspace_members.user_id, invites.accepted_by, audit_log.actor_user_id, waitlist_approvals.approved_by); idempotent bootstrap_organization_membership and accept_invite_membership RPCs; spec §4.1.1/§4.1.2 check-order fix in accept. Migration 0012 fix-up for PL/pgSQL column-vs-OUT-parameter ambiguity surfaced at first RPC execution; resolved with `profiles.org_id` qualification at 2 sites. 19 pg-tap assertions in test/sql/test_migration_0011.sql, all passing on lane dev (April 22, refactored to RETURNS SETOF TEXT pattern on April 22 in ccdf703).
- [x] Migration 0013 (B2) — invite team scoping: invites.team_id + invites.team_role columns; unique pending partial index on (email, org_id) WHERE accepted_at IS NULL; accept_invite_membership extended with Path C (populate project_members.team_role on team-scoped invites, using SQL column project_id); audit_log event_data Pattern (ii) — includes team_id + team_role keys only on team-scoped accepts. 15 pg-tap assertions in test/sql/test_migration_0013.sql, all passing on lane dev (April 23).

---
### Known drift and deferred work (resolve in follow-up sessions)

Identified during the April 13 alignment session. Each item is deliberately deferred, not forgotten.

**Vocabulary drift (in progress — phased rename):**

The Prove stage has accumulated mixed vocabulary: "Sign-off," "Validation gate," and "Prove" all refer to overlapping concepts. The canonical rule, locked during the April 13 session:

- **"Prove"** is the stage name (Phase 2 stage 2e, per Part 3).
- **"Sign-off"** is the canonical term for the act of approving a Request at the Prove stage. It is used in labels, copy, AI prompts, emails, notifications, function names, and database columns. It stays.
- **"Validation gate"** as a user-facing label is forbidden — replace with "Prove" wherever it appears as a string the user sees.

**What is being renamed (phased):**
- **Phase 1 (labels + docs):** User-visible strings in sidebar, page headings, comments, and CLAUDE.md. Status: **shipped April 13 evening.**
- **Stage enum fix (P0 bug):** `DESIGN_STAGES` array and all `designStage` comparisons aligned to current DB enum. 11 files fixed. Status: **shipped April 13 evening.**

**Phase 2 scope (shipped April 16 in commit 73cfedb — all tasks complete; preserved below for archaeology):**
- Rename `components/requests/validation-gate.tsx` → `prove-gate.tsx`
- Rename export `ValidationGate` → `ProveGate`
- Update all import sites
- Rename `app/(dashboard)/dashboard/teams/[slug]/validation/` directory → `/prove/`
- Update nav keys `team:${slug}:validation_gate` → `team:${slug}:prove` in `lib/nav/active-item.ts` and `lib/nav/order.ts`
- **Stale code identifiers from the stage enum fix** — several variables still use old stage vocabulary despite the underlying logic being correct. Known examples: `isRefineStage` in `components/requests/design-phase-panel.tsx:83`. Grep for `isRefine\|isValidate\|isExplore\|isInterrogate` as identifier prefixes before the Phase 2 session to find the full list.

**What is permanently NOT being renamed (documented as decisions, not drift):**
- **Database schema: `validation_signoffs` table stays.** The table, its Drizzle schema exports (`validationSignoffs`, `ValidationSignoff`, `NewValidationSignoff`), the `signer_role` column, and all related identifiers are **not** being renamed. A schema rename was discussed as a follow-up ("Option A" — rename to `proofs` or similar) but was formally cancelled on April 13. Rationale: "sign-off" is the canonical act word per the vocabulary rule, so the schema is already coherent; the rename would cost 2-3 hours of migration work with zero user-facing benefit; and pre-launch effort is better spent on the intake check UI, onboarding build, and real implementations of placeholder pages. Do not re-open this decision without explicit discussion.
- The `/api/requests/[id]/validate/` API route — internal endpoint, not user-facing.
- Notification enum values `signoff_requested`, `signoff_submitted` — these use "sign-off" which is the canonical act word, so they are correct.
- Function names like `detectSignoffOverdue`, types like `pendingSignoffRoles`, AI prompt text, email templates — all use "sign-off" which stays.
- Historical plan and spec documents under `db/lane docs/docs/superpowers/` — these are artifacts of past sessions, not active references. Do not rewrite them.

**Shipped April 13 evening:**
- Phase 1 of Sign-off → Prove: UI labels renamed from "Validation gate" to "Prove" in sidebar, team page heading, and component comments.
- **Stage enum fix (P0 bug):** `DESIGN_STAGES` array in `lib/workflow.ts` was using old stage names (`explore`, `interrogate`, `validate`, `refine`) that didn't match the database enum (`sense`, `frame`, `diverge`, `converge`, `prove`). Fixed in 11 files. This bug had silently broken Sign-off overdue detection, Design Radar risk panels, the Prove-stage guard in `/api/requests/[id]/advance-phase`, the morning briefing stage filter, and the dashboard home page Prove count. Core phase advancement logic is now aligned with the database schema.

**Deferred features (each is a separate session):**

- **Onboarding build. (STATUS: shipped April 17-18 as Item 8 across 7 phases — Phase A through Phase H. Phase I (first-digest email) absorbed into Item 15c weekly digest cron April 18.)** Full spec is in `docs/onboarding-spec.md`, vocabulary-aligned and ready to execute. Section 11 has the 13-step build order. Includes Design Head full flow (4 screens), Designer/PM lightweight variants, the intake check (the killer moment, aligns to CLAUDE.md Part 2 Stage 1 classifier), five progressive disclosure moments, sample team seed script, instrumentation. Budget a full day of focused work.

- **Real implementations for placeholder pages. (STATUS: shipped April 17 — My requests as Item 5 (commit ea073d3), Submitted by me as Item 6 (commit 9135ece, requester_id column confirmed present from V2). Reflections permanently deferred per April 15 S1 outcome — placeholder route preserved in-code but not surfaced in sidebar.)**

- **Command palette.** Deleted in the alignment session. Re-add when building Zone 3 team sections — wire `cmdk` to search Requests by title via pgvector, add an actions registry, re-add the `⌘K` chord hint to the sidebar search.

- **Drafts and Saved routes.** May not have placeholder pages. Verify and stub if missing.

**Reuse opportunities:**

- **`components/nav/team-section.tsx`** was preserved during cleanup. When building Zone 3 team sections, look at this file first — it may already contain 80% of what's needed.

# Part 17: WHAT'S NEXT (Build Sequence)

**The active build sequence is in `docs/ROADMAP.md`.** That file is the source of truth for what to build next and is updated as work ships. Start every Lane session by opening it.

The roadmap absorbs and sequences everything that was previously listed here as "Immediate," "Steps 2-3," and "Weeks 5-12." The mapping from old Part 17 labels to current roadmap items:

| Original Part 17 item | Roadmap location |
|---|---|
| Migration 0002 (`npm run db:push`) | Week 1 — V1 + Item 11 |
| Supabase RLS policies | Week 2 — Item 12 |
| Upstash Redis rate limiting | Week 3 — Item 13 |
| 5-stage design flow screens | Weeks 5-6 — Item 14 parts 1 and 2 |
| Design Frame creation | Week 5 — Item 14 part 1 |
| Iteration management | Week 6 — Item 14 part 2 |
| Reflection system | **Deferred to post-v1** per April 15 S1 outcome — Item 7-build deferred, Item 14 part 2 Rationale field only |
| Feedback threads | Week 6 — Item 14 part 2 |
| Handoff doc generation improvements | Week 6 — Item 15a |
| Impact logging refinements | Week 7 — Item 15b |
| Weekly AI digest cron | Week 7 — Item 15c |
| Private designer nudges | Week 6 — Item 15d |
| Morning briefing | Weeks 6-7 — Item 15e |
| Commitments view | Week 3 — Item 15f |
| Bug fixes, performance | Weeks 7-8 — Items 15g, 15h |

If you find yourself updating this table, you're probably doing it wrong — update `docs/ROADMAP.md` instead, and keep this table as a read-only cross-reference.

**For anything new that comes up during execution:** add it to the Parking lot section at the bottom of `docs/ROADMAP.md`. Do not add items to this Part 17 section.

## Part 18: WHAT WE'RE NOT BUILDING (MVP)

```
❌ Slack notifications → use Zapier temporarily
❌ Email digest → activity feed in-app is enough
❌ Auto-comment in Figma → low ROI
❌ Detailed Figma change diffs → link to Figma is enough
❌ Version comparison tool → defer 6+ months
❌ Linear integration → Month 3
❌ Figma plugin → defer 6+ months
❌ Mobile app → responsive web only
❌ Individual utilization % → NEVER (anti-surveillance)
❌ Activity frequency tracking → NEVER (anti-surveillance)
❌ Designer speed rankings → NEVER (anti-surveillance)
```

---

**Last updated: April 22, 2026 — commit 663401c. Part 16 reflects git main; CHANGELOG + WORKING-RULES refile pending in this sync sweep.**

## Testing

- Run tests: `npm test`
- Test directory: `test/` (unit + integration), `e2e/` (Playwright)
- See `DOCS BIG/TESTING.md` for full conventions

Test expectations:
- 100% coverage is the goal — tests make vibe coding safe
- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test that would have caught it
- When adding a conditional (if/else, switch), test both paths
- Never commit code that makes existing tests fail

## Part 19: INFRA GOTCHAS (Discovered April 2026)

Things future sessions should know before touching infra. Discovered the hard way.

### Production deployment targets

- **App URL:** `https://app.uselane.app` (Vercel project `lane-app`)
- **Marketing URL:** `https://uselane.app` (Vercel project `lane-website`)
- **Production Supabase:** `Lane App` (AWS ap-southeast-2)
- **Dev Supabase:** `Lane Dev` (AWS ap-southeast-1)

Never confuse these. Every env-var and migration task starts by naming which project you're targeting.

### Vercel env var scope rules

- **Sensitive env vars** (passwords, tokens, secrets — anything with credential content) are **blocked from the Development scope by Vercel**. The UI shows a locked padlock and a tooltip: "Sensitive environment variables cannot be created in the Development environment."
- For sensitive vars (including `DIRECT_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, etc.): **Production + Preview only.**
- For non-sensitive vars (`NEXT_PUBLIC_*`, `EMAIL_FROM`, etc.): all three scopes are fine.
- Never tell a user to "check all three" without verifying — doing so on a sensitive var is a visible UI error that damages trust.

### Redeploy behavior — env var changes

When env vars change, a "Redeploy" from Vercel UI requires:
- **UNCHECK "Use existing Build Cache"** — otherwise new values are not picked up
- **UNCHECK "Use project's Ignore Build Step"** — the `vercel.json` ignore command filters deploys where only docs changed, and env-var-only changes (no git commit) get cancelled without this uncheck

Multiple production redeploy attempts may show as "Canceled" in the deployment list — that's the ignore step firing, not a failure. Use the Redeploy modal and uncheck both boxes to force through.

### Supabase Auth callback routing

Lane has `app/auth/callback/route.ts` (added April 2026 per PR #65) to handle Supabase auth redirects: password recovery, magic link, email verification. Before that route existed, all those flows silently broke — the tokens landed in URL fragments on `/login`, which has no handler for them.

If you add a new auth flow (email verification, OAuth, etc.), verify `app/auth/callback/route.ts` handles the code exchange correctly. Don't assume Supabase's client-side helpers do the work — the SSR setup requires a dedicated route.

### Supabase Site URL + Redirect URLs

The Site URL and Redirect URLs in **Supabase → Authentication → URL Configuration** must point at production:
- Site URL: `https://app.uselane.app`
- Redirect URLs (minimum): `https://app.uselane.app/**`, `https://app.uselane.app/auth/callback`, `http://localhost:3000/**` (keep for local dev)

If Site URL is wrong (e.g., stale `http://localhost:3000` on production), every password recovery / magic link email will link to localhost, breaking silently for every user. Check this before shipping any user-facing auth feature.

### Production DB schema drift (open: issue #64)

As of April 2026, production `drizzle.__drizzle_migrations` is empty. Production has 39 tables but no migration history. Parts of migration 0011 are applied (`workspace_members`) but not others (`audit_log`, `waitlist_approvals`), and 0013 is entirely missing (`invites.team_id` etc.).

**Do not run `drizzle-kit migrate` against production** without first reconciling. It will fail immediately with "relation already exists" on all 39 tables. Read #64 for reconciliation options before any migration-apply work on production.

### profiles.role vs workspace_members.role enum mismatch

Two distinct enums:
- `profiles.role` → enum `role` with values including `'lead'`
- `workspace_members.role` → enum `workspace_role` with values `('owner', 'admin', 'member', 'guest')` — NO `'lead'`

When inserting `workspace_members` rows manually (e.g., backfilling a missing row), map `lead → admin`. Cast required: `'admin'::workspace_role`. A straight `p.role::text::workspace_role` cast will fail with "invalid input value for enum workspace_role: lead".

### Before giving dashboard click-paths

Always verify Vercel/Supabase UI behavior with CLI or docs before instructing a user. Guessing produces wrong click counts, wrong checkbox combinations, and wrong button labels. Three errors of this kind in one April 2026 session cost visible trust. CLI-first, UI-second.

### CHANGELOG + ROADMAP update workflow

**When to update:**

| Trigger | Action |
|---|---|
| A PR merges to `main` | Add entry under today's date in `CHANGELOG.md`, categorized Added/Fixed/Changed/Security/Docs, with PR number |
| An issue closes (real-world impact) | Add mention to the day's entry with closing reason |
| A production incident happened | Document under `### Incidents` — root cause + resolution |
| A P0 finding is filed (e.g. schema drift) | Note under `### Filed — P0` with issue number + consequences |
| A roadmap item ships or is deferred | Update `DOCS BIG/docs/ROADMAP.md` — check off or add parking-lot note |

**When NOT to update:**

- Opening a PR that hasn't merged yet
- Filing a non-P0 issue
- Internal branch cleanup, worktree housekeeping
- Memory/agent-only changes (scars, preference files)

**At session end, ALWAYS check:**

```bash
git log main --since="1 day ago" --format="%h %s"
gh pr list --repo Nikhilsharma-lab/Lane --state merged --search "merged:>$(date -u +%Y-%m-%d)"
gh issue list --repo Nikhilsharma-lab/Lane --state closed --search "closed:>$(date -u +%Y-%m-%d)"
```

If any of these return work not yet in CHANGELOG — update before closing the session. This is a common workflow for Lane and not optional.

**Format note:** CHANGELOG entries are organized by date (one entry per day of meaningful activity), not by PR. Multiple PRs from the same day go under one date heading.

### Secret-handling rules

These apply to any automated/AI session touching Lane infrastructure.

**Never run commands that dump plaintext secrets:**
- `vercel env pull` — downloads all env values as plaintext (USE `vercel env ls` INSTEAD — names only)
- `cat .env.local` or any `.env*` file
- `psql` queries reading `auth.users.encrypted_password`, token columns, or `*_key`/`*_secret` columns
- `supabase secrets list --plain`
- `printenv` / `env | grep` in shells where production secrets are loaded

If a command *might* expose secrets, STOP and confirm with the user before running.

**Never type a secret back in any message:**
Even if the secret was seen during the session (by legitimate CLI use or accident), it does not belong in output. Instruction phrasing is always "use your password" — never the literal value. This rule covers messages, tool inputs, commit messages, issue bodies, PR descriptions.

**If a secret is exposed accidentally:**
1. Tell the user immediately what was exposed and how
2. Recommend rotation (DB password, API key, JWT, whatever it was)
3. Do not continue using the exposed secret — have the user rotate first, then resume with the new value

**Why this exists:** On 2026-04-24 I ran `vercel env pull` to check `DIRECT_DATABASE_URL`, which dumped the Supabase DB password and service role key into my session context. I then typed the password back in a later message. No external leak happened, but the exposure-then-re-emit pattern is exactly what credential-rotation discipline is designed to prevent. This rule exists so no future session repeats that flow.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
