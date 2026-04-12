# Lane — Technical & Product Reference

**Status:** Pre-launch, live GTM
**Current Sprint:** Weeks 1-4 MVP build (Foundation + AI Brain)
**Last Updated:** April 7, 2026 — synced with CHANGELOG through PR #13

> Business context, pricing, GTM, and founder details are in CLAUDE.local.md (gitignored).
> For a chronological record of what shipped and when, see CHANGELOG.md.

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
**Progress is captured through reflections, not status updates.**

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
- Reflection field: designer's thinking on each direction
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

**Purpose:** 3-sign-off validation before dev.

**Build spec:**
- 3 sign-off cards: Designer ✅, PM ✅, Design Head ✅
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
| Status update | Reflection | Designers share thinking |
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
Semantic search (pgvector embeddings) across all requests.

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
| ORM | Drizzle ORM + pgvector (duplicate detection) |
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
npx tsc --noEmit
npm run build
npm run start
```

---

## Part 16: WHAT'S BUILT (As of Session 3 — April 7, 2026)

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

---

## Part 17: WHAT'S NEXT (Build Sequence)

### Immediate (after merging PR #13)
- [ ] Run `npm run db:push` against Supabase dev to apply migration 0002 (adds `designer_owner_id`, new design stage enum)

### Step 2 — RLS Policies (before first customer)
- [ ] Write Supabase RLS for requests, reflections, validations — enforce org scoping at DB level

### Step 3 — Redis Rate Limiting (before Week 3-4 AI build)
- [ ] Add Upstash Redis rate limiting to AI routes (triage, context-brief, etc.)

### Week 5-6: Design Phase UI
- [ ] 5-stage design flow screens (Sense → Frame → Diverge → Converge → Prove)
- [ ] Design Frame creation
- [ ] Iteration management
- [ ] Reflection system
- [ ] Feedback threads

### Week 7-8: Build + Impact
- [ ] Handoff doc generation improvements
- [ ] Impact logging refinements

### Week 9-10: The Voice
- [ ] Weekly AI digest cron (pre-generation, stored per org)
- [ ] Private designer nudges
- [ ] Morning briefing

### Week 11-12: Polish + Beta
- [ ] Bug fixes, performance
- [ ] Commitments view

---

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

**Last updated: April 7, 2026 — synced with CHANGELOG through PR #13**

## Testing

- Run tests: `npm test`
- Test directory: `test/` (unit + integration), `e2e/` (Playwright)
- See TESTING.md for full conventions

Test expectations:
- 100% coverage is the goal — tests make vibe coding safe
- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test that would have caught it
- When adding a conditional (if/else, switch), test both paths
- Never commit code that makes existing tests fail

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
