# DesignQ — Complete Product & Development Reference
## Version 2.0 | April 2026

**Status:** Pre-launch, live GTM (LinkedIn strong)
**Current Sprint:** Weeks 1-4 MVP build (Foundation + AI Brain)
**Last Updated:** April 3, 2026
**Next Review:** April 17 (Week 2 checkpoint)

---

## TLDR

DesignQ is an **AI-native design operations platform** organized into 4 phases.

**What it does:** PM identifies a problem → AI gates solution-specific requests → Org shapes and bets → Designer explores through 5 scientific stages → Dev builds via kanban → PM measures impact

**Who it's for:** Design leaders at startups with 5-15 person teams
**Business model:** $99 Starter, $299 Professional, Custom Enterprise
**GTM:** Content-driven (LinkedIn, Twitter/X, Reddit), lead magnet (Chaos Calculator)
**Timeline:** 10-15 paying customers by end of 12-week sprint

**Core philosophy:** Support, not surveillance. Designers should feel the tool is on their side.

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
INTAKE GATE → CONTEXT → SHAPE → BET → [SENSE → FRAME → DIVERGE → CONVERGE → PROVE] → HANDOFF → BUILD → IMPACT
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
"This looks like a solution, not a problem. DesignQ works best when
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
- Request cannot move to Handoff until all 3 sign-offs received

---

## Part 4: PHASE 3 — BUILD

### Handoff

- Figma version LOCKED (version at Prove completion)
- Auto-generated handoff doc: specs, edge cases, accessibility, engineering notes
- Figma webhook activated for post-handoff change detection

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
  phase: 'predesign' | 'design' | 'build' | 'impact',
  predesign_stage: 'intake' | 'context' | 'shape' | 'bet',
  design_stage: 'sense' | 'frame' | 'diverge' | 'converge' | 'prove',
  kanban_state: 'todo' | 'in_progress' | 'in_review' | 'design_qa' | 'done',
  impact_stage: 'measuring' | 'complete',
  
  // Intake gate
  intake_classification: 'problem_framed' | 'solution_specific' | 'hybrid',
  intake_ai_rewrite: string | null,
  intake_original_text: string,
  
  // Assignment
  created_by_pm: string,
  assigned_to_designer: string | null,
  assigned_to_dev: string | null,
  
  // Content
  title: string,
  problem_statement: string,    // Must be problem-framed
  business_goal: string,
  user_segment: string,
  evidence: string,
  
  // AI triage
  ai_priority: 'P0' | 'P1' | 'P2' | 'P3',
  ai_priority_reasoning: string,
  ai_complexity: 'S' | 'M' | 'L' | 'XL',
  ai_complexity_reasoning: string,
  ai_type: 'new_feature' | 'iteration' | 'bug_fix' | 'research',
  ai_quality_score: number,     // 0-100
  
  // Shape
  solution_direction: string | null,
  constraints: string | null,
  risks: string | null,
  appetite_days: number | null,
  
  // Figma
  figma_file_url: string | null,
  figma_version_locked: string | null,
  figma_locked_at: timestamp | null,
  
  // Idea board link
  linked_idea_id: string | null,
  
  // Impact
  predicted_impact_metric: string | null,
  predicted_impact_value: string | null,
  actual_impact_value: string | null,
  impact_accuracy: number | null,
  impact_measured_at: timestamp | null,
  
  // Timestamps
  created_at: timestamp,
  updated_at: timestamp,
}
```

### design_frames
```typescript
{
  id: string,
  request_id: string,
  designer_problem_articulation: string,
  success_criteria: string,
  discovered_constraints: string,
  divergence_from_pm: string | null,
  created_at: timestamp,
  updated_at: timestamp,
}
```

### iterations
```typescript
{
  id: string,
  request_id: string,
  version_number: number,
  figma_url: string | null,
  description: string,
  rationale: string,
  reflection: string | null,      // Designer's thinking
  changelog: string | null,
  design_stage: string,           // Stage when created
  created_by: string,
  created_at: timestamp,
}
```

### reflections
```typescript
{
  id: string,
  request_id: string,
  author_id: string,
  content: string,                // Designer's own words
  stage_at_creation: string,
  attachments: string[],          // Screenshot URLs
  created_at: timestamp,
}
```

### validations (Prove gate)
```typescript
{
  id: string,
  request_id: string,
  
  designer_approved: boolean | null,
  designer_notes: string | null,
  designer_approved_at: timestamp | null,
  
  pm_approved: boolean | null,
  pm_notes: string | null,
  pm_approved_at: timestamp | null,
  
  design_head_approved: boolean | null,
  design_head_notes: string | null,
  design_head_approved_at: timestamp | null,
  
  // All 3 must be true to proceed
  all_approved: boolean,
  
  created_at: timestamp,
  updated_at: timestamp,
}
```

### figma_updates
```typescript
{
  id: string,
  request_id: string,
  figma_file_id: string,
  figma_file_name: string,
  figma_file_url: string,
  figma_version_id: string,
  updated_by: string,
  updated_at: timestamp,
  change_description: string,
  request_phase: 'design' | 'build',
  post_handoff: boolean,
  dev_reviewed: boolean,
  dev_reviewed_by: string | null,
  dev_review_notes: string | null,
}
```

### ideas
```typescript
{
  id: string,
  title: string,
  problem: string,
  proposed_solution: string,
  category: 'design' | 'feature' | 'workflow' | 'performance',
  author_id: string,
  anonymous: boolean,
  upvotes: number,
  downvotes: number,
  net_score: number,
  voting_end_date: timestamp,
  status: 'pending_votes' | 'validation' | 'approved' | 'rejected' | 'archived',
  linked_request_id: string | null,
  validation_impact_score: number | null,
  validation_effort_score: number | null,
  validation_feasibility_score: number | null,
  validated_by: string | null,
  validated_at: timestamp | null,
  validation_notes: string | null,
  created_at: timestamp,
}
```

### impact_records
```typescript
{
  id: string,
  request_id: string,
  pm_id: string,
  predicted_metric: string,
  predicted_value: string,
  actual_value: string,
  accuracy_percentage: number,
  narrative: string | null,        // AI-generated
  measured_at: timestamp,
  created_at: timestamp,
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
| Betting Board | View only | View only | View only | ✅ (decide) | ✅ |
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
- ✅ "The lending flow is approaching its appetite. Want to adjust, or is it wrapping up?"
- ❌ "OVERDUE: Lending flow has exceeded its deadline by 2 days."

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
Auto-generated every Friday. Narrative format:
```
📊 WEEKLY DESIGN TEAM DIGEST

🚢 SHIPPED THIS WEEK
• Dark Mode (Ananya) — impact: ₹2.3Cr estimated
• Holi banners (Sneha) — impact: ₹800Cr estimated

🧠 TEAM HEALTH
Throughput: 4 items/week ✅
Capacity: 2 designers stretched, 1 available

💡 RECOMMENDATIONS
1. Reassign Payments work — Ananya approaching appetite limit
2. Checkout redesign entering Converge — PM review needed soon
3. 2 requests deferred 3+ cycles — decision needed
```

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

### How It Works

```
Designer updates Figma
  → Figma webhook fires → POST /api/figma/webhook
  → Verify signature, extract metadata
  → Create figma_updates entry
  → If post-handoff: set alert flag, notify dev (urgent)
  → Create activity timeline entry
```

### Post-Handoff Alert Logic
```typescript
if (request.phase === 'build' && figma_updated) {
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
| Figma | Figma API + Vercel Functions (webhook) |

---

## Part 12: PROJECT STRUCTURE

```
app/
  (auth)/login/
  (auth)/signup/
  (dashboard)/
    dashboard/                  ← My Work (role-specific home)
    requests/[id]/              ← Request detail (full timeline)
    requests/new/               ← Create request (intake gate)
    idea-board/
    betting-board/
    capacity/
    impact/
  actions/auth.ts
  api/
    requests/route.ts
    ideas/route.ts
    figma/webhook.ts
    ai/triage/route.ts
    ai/classify/route.ts       ← Intake gate classification
    ai/digest/route.ts
  layout.tsx

components/
  requests/
  design-phase/
    sense/
    frame/
    diverge/
    converge/
    prove/
  ideas/
  figma/
  kanban/
  ai/
  ui/

db/
  schema/
    users.ts
    requests.ts
    design-frames.ts
    iterations.ts
    reflections.ts
    validations.ts
    figma-updates.ts
    ideas.ts
    impact-records.ts

lib/
  ai/
    classify-intake.ts          ← Problem vs. solution classification
    triage.ts
    duplicate-detect.ts
    assignment.ts
    quality-score.ts
    nudge.ts
    digest.ts
    briefing.ts
    edge-cases.ts
    handoff-checklist.ts
    idea-validator.ts
  figma/
    webhook-handler.ts
    sync.ts
  supabase/
    client.ts
    server.ts
```

---

## Part 13: DEVELOPMENT PHILOSOPHY

### Founder-Built, AI-Assisted

- **Simplicity > cleverness:** Monolith beats microservices
- **Third-party > custom:** Lean on Supabase, Vercel, Figma API
- **Ship 70%:** Iterate on customer feedback
- **Specs matter:** AI builds to spec; vague specs = vague code
- **Warm cream design system** — `#F8F6F1` base, `#2E5339` forest green accent, Satoshi + Geist Mono fonts. See DESIGN.md for full token system.
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

## Part 14: BUSINESS MODEL

### Pricing (Flat-Rate)
- **Starter:** $99/month (1-3 person design team)
- **Professional:** $299/month (4-10 person team)
- **Enterprise:** Custom (10+ seats, SLA)

Annual prepay: 8% discount

### GTM
- **Lead funnel:** Content → DM → Chaos Calculator → Email → Trial → Paid
- **Channels:** LinkedIn (primary), Twitter/X, Reddit
- **CTA:** "DM me CHAOS"
- **Not doing:** Paid ads, enterprise sales

---

## Part 15: ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
ANTHROPIC_API_KEY=

# Dev/test only — allows solo multi-role validation sign-off (designer + PM + design head)
# Add this to .env.local for local development. NEVER add to Vercel production env vars.
ENABLE_MULTI_ROLE_TESTING=true

# Email (Resend) — add these in Vercel dashboard to activate email notifications
RESEND_API_KEY=               ← get from resend.com (free tier, 3k emails/month)
EMAIL_FROM=                   ← e.g. "DesignQ <notifications@yourdomain.com>"
                                  domain must be verified in Resend dashboard
                                  OR use "onboarding@resend.dev" to test without domain
NEXT_PUBLIC_APP_URL=          ← your Vercel deployment URL (e.g. https://designq2.vercel.app)
                                  used in email links — without this, links in emails won't work

# Figma OAuth
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=
FIGMA_TOKEN_ENCRYPTION_KEY=   ← 64 hex chars (32 bytes). Generate with:
                                  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
                                  Required for Figma OAuth to work — tokens are encrypted at rest (AES-256-GCM).
# FIGMA_WEBHOOK_TOKEN removed — webhook approach dropped in favour of OAuth
```

---

## Part 16: COMMON COMMANDS

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

## Part 17: WHAT'S BUILT (As of Session 2)

- [x] Next.js 14 scaffolded, Vercel deployed
- [x] Supabase auth
- [x] Drizzle ORM schema (needs update for v2 stages)
- [x] Request intake + AI triage (needs intake gate update)
- [x] Dashboard (needs role-specific "My Work" update)
- [x] Auth middleware

---

## Part 18: WHAT'S NEXT (Build Sequence)

### Week 1-2: Foundation
- [ ] Update schema for v2 (design stages, design_frames, reflections, validations)
- [ ] Intake gate (problem vs. solution classification)
- [ ] Request creation with gate logic
- [ ] Role-specific "My Work" home
- [ ] Org tree + visibility cascade

### Week 3-4: AI Brain
- [ ] AI intake classification (classify-intake.ts)
- [ ] AI auto-triage (priority, complexity, type)
- [ ] Duplicate detection (pgvector)
- [ ] Assignment recommendation
- [ ] Request quality scoring

### Week 5-6: Design Phase
- [ ] 5-stage design flow (Sense → Frame → Diverge → Converge → Prove)
- [ ] Design Frame creation
- [ ] Iteration management
- [ ] Reflection system
- [ ] Feedback threads
- [ ] Figma link management
- [ ] 3-sign-off Prove gate

### Week 7-8: Build + Impact
- [ ] Dev kanban (To Do → Design QA → Done)
- [ ] Handoff doc generation
- [ ] Figma webhook + post-handoff alerts
- [ ] Impact logging
- [ ] PM calibration

### Week 9-10: The Voice
- [ ] Weekly AI digest
- [ ] Private designer nudges
- [ ] Capacity dashboard
- [ ] Idea Board

### Week 11-12: Polish + Beta
- [ ] Morning briefing
- [ ] Betting board view
- [ ] Journey view
- [ ] Bug fixes, performance

---

## Part 19: WHAT WE'RE NOT BUILDING (MVP)

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

## Part 20: FOUNDER CONTEXT

- **Role:** Head of Product Design at Airtel Payments Bank (full-time)
- **Building:** DesignQ as side project
- **Stage:** Live GTM, leads flowing in
- **Team:** Solo, vibe-coding with Cursor + Claude Code
- **Timeline:** 12-week plan; MVP by Week 4; 10-15 customers by Week 12
- **Goal:** $5-20K MRR lifestyle business

---

## Part 21: UPDATE SCHEDULE

**Weekly (Monday):** Update "What's built", metrics. 15 min.
**Bi-weekly:** Update roadmap, business metrics. 30 min.
**Monthly:** Update founder context, reprioritize. 1 hour.
**Quarterly:** Full vision, pricing, timeline review. 2 hours.

---

## SUMMARY

**The one thing to remember:**

DesignQ is a tool where PMs bring problems (not solutions), designers explore scientifically (not execute tickets), and leads see team health (not individual surveillance). The AI runs operations. Humans steer.

*Surveillance produces performance. Support produces truth. DesignQ optimizes for truth.*

---

**Version 2.0 | April 2026**
**Previous: v1.1 (March 2026)**