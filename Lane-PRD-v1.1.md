# Lane — Product Requirements Document
## Version 2.0 | April 2026

---

## 1. PRODUCT OVERVIEW

### What is Lane?

Lane is an AI-native design operations platform that manages the full lifecycle of design work — from the moment a PM identifies a business problem to measuring whether the shipped design actually moved the metrics it promised.

Unlike Jira, Linear, or Asana — which treat work as tickets on a board — Lane treats work as **problems flowing through stages of clarity**. The design process is iterative, messy, and non-linear. Lane embraces that reality instead of forcing designers into developer-style kanban columns.

**The one-liner:** *"Lane is the AI chief of staff your design team never had."*

### Who is it for?

Lane is the daily workspace for **every person** on a product team — not just a lead's monitoring tool. Everyone uses it to manage their own work. Leads get an additional operational layer on top.

**Individual contributors (daily workspace):**

- **Product Managers (PMs):** Create problem-framed requests, define business goals, set impact predictions, track the full lifecycle of their requests, and build their impact accuracy score over time
- **Designers (Product/UI/UX):** Manage assigned work, explore solutions through scientific design stages, post reflections, track personal capacity, collaborate with PMs and devs, and stay involved through dev implementation
- **Developers:** View their build queue, access handoff documents, flag technical constraints, move items through dev kanban, and collaborate with designers on implementation

**Leads & managers (operational layer on top of IC workspace):**

- **Design/Product/Dev Leads:** Everything their role's ICs can do, plus: team dashboards, capacity management, betting decisions, AI-powered operational briefings, and cross-team visibility. Each lead sees dashboards for their direct reports, and their reports' reports — cascading through the org tree.

### Why does it exist?

The current reality in most product teams:

1. PMs dump requests into Jira/Slack/Docs with no structure — often as solutions ("make a button blue") rather than problems
2. Designers are treated as "Figma operators" executing tickets, not thinking partners
3. Design work is iterative but forced into linear kanban workflows
4. Nobody measures whether shipped design actually moved metrics
5. Design leads spend 40% of their time on operational overhead instead of leading design
6. PMs send random requests with no accountability for impact
7. Design versioning across tools is broken — nobody knows which version is current
8. Every existing tool makes designers feel watched, not supported

Lane fixes all of this with an AI-native approach where the AI runs operations and humans steer.

---

## 2. PRODUCT PHILOSOPHY

### Philosophy 1: Work ≠ Tasks. Work = Decisions.

Every tool today optimizes for task completion speed. Lane optimizes for:

- **Problem clarity** — Is the right problem being solved?
- **Decision quality** — Are we making informed design choices?
- **Outcome impact** — Did it actually work?
- **PM accountability** — Are PMs sending high-quality requests or noise?

### Philosophy 2: Problem-First, Always.

Lane enforces that every request entering the system is framed as a **problem**, not a solution. "Make the checkout button green" is rejected. "Users are dropping off at checkout — 32% abandon after viewing the total" is accepted. This forces PMs to think before they delegate, and gives designers the space to explore solutions rather than execute orders.

### Philosophy 3: Support, Not Surveillance.

**This is the most important philosophy in the product.**

Lane is built for designers to feel **supported**, not **watched**. Every design decision — what's tracked, what's visible, who sees what, how nudges are worded — is filtered through one question:

> *"Would a designer feel this tool is on their side, or reporting on them to their manager?"*

**What Lane tracks (for the individual):**
- Work portfolio (what they're working on, what stage it's in)
- Reflections and thinking (their own narrative of the work)
- Design decisions and rationale (their intellectual contribution)
- Capacity preferences (how much they want to take on)

**What Lane NEVER tracks:**
- Time spent per task (no timers, no time logging)
- Screen activity or "last active" timestamps
- Utilization percentage as a performance metric
- Individual velocity or speed comparisons between designers
- Mouse clicks, Figma activity frequency, or any behavioral surveillance
- "Overdue" status on design work (design doesn't have due dates in the traditional sense — it has appetites)

**What leads see vs. what individuals see:**
- Leads see **team health signals** (bottlenecks, capacity gaps, stalled work) — not individual productivity scores
- Individuals see **their own work, their own reflections, their own growth** — the tool is their thinking partner
- The AI nudges designers privately — "Hey, it's been a while since you posted a reflection on the checkout flow. Everything okay?" — it never escalates silence to a manager automatically

**The guiding principle:**

> *Surveillance produces performance. Support produces truth. Lane optimizes for truth.*

When designers feel safe, they share real thinking — dead ends, uncertainty, pivots. That's where the best design happens. The moment they feel watched, they perform instead of think.

---

## 3. THE FULL WORKFLOW

### The 4-Phase Model

```
PHASE 1: PREDESIGN      (PM + Org)       → Decide WHAT to work on
PHASE 2: DESIGN         (Designers)      → Explore and solve the problem
PHASE 3: BUILD          (Developers)     → Build and ship
PHASE 4: IMPACT         (PMs)            → Measure what happened
```

### Detailed Stage Flow

```
INTAKE GATE → CONTEXT → SHAPE → BET → [SENSE → FRAME → DIVERGE → CONVERGE → PROVE] → HANDOFF → BUILD → IMPACT
                                        └──────── Design Phase (non-linear) ────────┘
```

| Phase | Stages | Model | Who drives |
|-------|--------|-------|------------|
| **Predesign** (Phase 1) | Intake Gate, Context, Shape, Bet | Structured input + AI enrichment | PMs create, AI triages, leads decide |
| **Design** (Phase 2) | Sense, Frame, Diverge, Converge, Prove | Non-linear, exploratory, scientific | Designers explore at their own pace |
| **Build** (Phase 3) | Handoff, Dev Kanban | Kanban (traditional columns) | Devs execute, designers consult |
| **Impact** (Phase 4) | Measure, Calibrate | Accountability loop | PMs log actuals, AI compares |

---

### PHASE 1: PREDESIGN

#### Stage 1: INTAKE GATE

**Purpose:** Ensure every request entering the system is problem-framed, not solution-specific. This is the first and most important quality gate.

**The Rule:** A request does not move forward if it describes a solution. It must describe a problem.

**How the gate works:**

When a PM clicks "Create Request," they fill a structured form:

**Required fields:**
- **Problem statement:** What user problem or business gap are we addressing? (Must describe the problem, not a solution)
- **Business goal:** What metric will this move? (conversion, retention, NPS, revenue, etc.)
- **Impact prediction:** "I estimate this will improve [metric] by [X%]" — logged and later compared to actuals
- **User segment:** Which users are affected?
- **Evidence:** Data, user research, competitor screenshots, support tickets — what proves this is a real problem?

**Optional fields:**
- Priority rationale (why now?)
- Rough deadline or urgency level
- Related past requests
- Figma links to existing screens (for context, NOT as a solution spec)

**AI Intake Classification:**

The AI reads every incoming request and classifies it:

```
PROBLEM-FRAMED (passes gate):
  "Users are dropping off at checkout — 32% abandon after viewing total"
  "Merchant onboarding takes 14 days, competitors do it in 3"
  "Support tickets about password reset increased 200% this quarter"

SOLUTION-SPECIFIC (blocked):
  "Make the checkout button green"
  "Add a progress bar to onboarding"
  "Redesign the settings page"
  "Can we make this look like Stripe?"

HYBRID (needs reframing):
  "Users can't find the settings — maybe we should add a sidebar?"
  → AI extracts the problem: "Users can't find the settings"
  → AI flags the solution: "adding a sidebar is a proposed solution, not a problem"
  → PM is prompted to reframe
```

**What happens when a request is blocked:**

The PM sees a clear, helpful message — not a wall:

> "This looks like a solution, not a problem. Lane works best when designers understand the *why* before the *what*. Here's what we extracted:"
>
> **Problem detected:** [AI's best guess at the underlying problem]
> **Your proposed solution:** [what they wrote]
>
> "Try rewriting the problem statement. What user behavior or business metric is this addressing?"

The AI also suggests a rewrite. The PM can accept the AI's rewrite, modify it, or write their own.

**After passing the gate, AI also generates:**

1. **Auto-triage:** Suggested priority (P0-P3) with reasoning, complexity estimate (S/M/L/XL), type classification
2. **Duplicate detection:** Semantic search across all requests — flags overlaps, suggests merges
3. **Assignment recommendation:** Based on designer capacity + skills + context-switching cost. Presents options with reasoning, not just a name.
4. **Request quality score:** AI rates completeness, evidence strength, clarity. Builds PM accountability over time.

**Key design decision:** The PM does NOT choose the designer. AI recommends, the design lead approves.

---

#### Stage 2: CONTEXT

**Purpose:** Make the problem intelligent by attaching everything a designer needs to understand it deeply.

Once a request is triaged and assigned, Context becomes a living document attached to the request — a "case file," not a card.

**Context includes:**
- User research (if available)
- Analytics data / dashboards
- Past design decisions on this area (auto-linked by AI)
- Competitor screenshots
- Technical constraints from engineering
- Stakeholder requirements and comments

**What AI does:**
- Auto-links related past work: "3 previous requests touched the checkout flow. Here's what was decided and shipped."
- Pulls relevant metrics if connected to analytics
- Generates a structured design brief the designer can start from — not a blank page

Context is never "done" — it evolves as the request moves through stages.

---

#### Stage 3: SHAPE

**Purpose:** Define the solution direction, constraints, and appetite — WITHOUT designing the final UI.

**Inspired by:** Shape Up methodology (Basecamp)

The designer (often with PM input) defines:
- **Solution direction:** Rough approach — wireframes, written description, or annotated sketches. NOT a polished Figma file.
- **Constraints:** What's out of scope? What can't change?
- **Risks:** What could go wrong? What's unknown?
- **Appetite:** How much time should we invest? (This is a budget, not a deadline)
- **Open questions:** What do we still need to figure out?

Shape is non-linear — requests can move back to Context if more info is needed. Multiple solution directions can coexist.

**What AI does:**
- Risk identification based on historical data
- Historical reference to similar past shapes
- Appetite calibration: "Similar requests took 5-8 days. Your 3-day appetite is aggressive."

---

#### Stage 4: BET

**Purpose:** Kill backlog culture. Decide what gets designed, what gets killed, what gets delayed.

Instead of an ever-growing backlog, Lane runs **betting cycles** (weekly or biweekly). Shaped concepts are presented to the design/product lead, who decides:

- **Bet:** Moves forward to Design Phase. Designer is committed for the appetite duration.
- **Kill:** Not worth doing. Archived with reason.
- **Defer:** Not now. Maybe next cycle. (Deferred items are auto-resurfaced by AI after N cycles: "This has been deferred 3 times. Kill it or bet on it?")

**The Betting Board:**
- Shaped summary, PM's impact prediction, AI's complexity estimate
- Available capacity this cycle
- Impact-weighted ranking (AI-suggested)

---

#### IDEA BOARD (Parallel to Predesign)

**Anyone in the org can submit ideas and vote (anonymous):**

- Anyone submits: title, problem, proposed solution, estimated impact, estimated effort
- Org votes anonymously (1-week voting period)
- Top-voted ideas move to validation
- AI + Design Head validate: impact score, effort estimate, feasibility
- If approved: auto-creates a request in Predesign (already problem-framed)

This democratizes idea generation beyond PMs, removes roadmap politics, and ensures ideas come with real team support.

---

### PHASE 2: DESIGN (The 5 Scientific Stages)

**This is the heart of Lane and what makes it fundamentally different from every other tool.**

Design work is not a ticket moving through columns. It's a thinking process. The 5 stages below are **exploratory and scientific** — they describe modes of thinking, not positions on a board.

**Critical rules for the Design Phase:**
- There are NO due dates on design stages. There are appetites (time budgets).
- Stages are non-linear. A designer can move between them freely.
- Progress is captured through **reflections** (designer's own words), not status updates for managers.
- The AI never escalates silence to a lead. It nudges the designer privately and only surfaces team-level health signals to leads.

#### Stage 2a: SENSE

**What it is:** Understanding the problem space deeply before proposing anything.

**What happens here:**
- Designer reviews the problem brief, context, and all attached evidence
- Designer conducts their own investigation: talking to users, reviewing analytics, studying competitors, auditing the current experience
- Designer develops empathy for the problem — not just intellectual understanding, but felt understanding

**What the designer produces:**
- A "Sensing Summary" — what they now understand about the problem that wasn't in the brief
- Key insights, surprising findings, reframed problem angles
- Questions that emerged ("The brief says users drop off at checkout, but I'm seeing the real friction is two steps earlier")

**Exit signal (not gate — signal):**
- Designer feels they understand the problem well enough to start framing it
- At least one insight or reframe has been documented

**What AI does:**
- Surfaces related research, past decisions, and metrics automatically
- Suggests areas to investigate: "3 support tickets this month mention the same checkout issue — have you seen these?"
- Does NOT rush the designer. No "you've been in Sense for 3 days" warnings.

---

#### Stage 2b: FRAME

**What it is:** Defining what problem is actually being solved and what success looks like — before any pixels.

**What happens here:**
- Designer articulates the problem in their own words (which may differ from the PM's framing)
- Designer defines success criteria: what would a good solution look like? What would a bad one look like?
- Designer identifies constraints they've discovered through sensing
- Designer may reframe the problem entirely: "The PM asked about checkout dropout, but the real issue is trust — users don't believe the price is final"

**What the designer produces:**
- A "Design Frame" — the designer's articulation of the problem, success criteria, and constraints
- This becomes the north star for all subsequent exploration

**Why this matters:**
- It gives designers intellectual ownership of the problem
- It creates accountability for the framing, not just the pixels
- It allows the designer to push back on the PM's framing with evidence

**Exit signal:**
- A clear problem frame exists that the designer is confident in
- Success criteria are defined (even roughly)

**What AI does:**
- Compares the designer's frame with the PM's original problem statement — flags significant divergence for discussion (not as an error, as a conversation starter)
- Suggests success criteria based on similar past projects

---

#### Stage 2c: DIVERGE

**What it is:** Generating multiple solution directions without commitment. This is the creative heart.

**What happens here:**
- Designer explores 2-5+ solution directions in parallel
- Each direction is an "iteration" — versioned, timestamped, commentable
- Figma links, sketches, wireframes, written descriptions — any format
- No commitment to any direction. The point is breadth, not depth.
- PMs, other designers, and engineers can comment on specific iterations

**What the designer produces:**
- Multiple design directions, each with a brief rationale
- Reflections on what they're learning as they explore: "Direction A feels clean but might confuse new users. Direction B is noisier but more discoverable."

**What this is NOT:**
- It's not "produce 3 options and let the PM pick." It's genuine exploration.
- It's not time-boxed by stages. The appetite from Shape applies to the entire Design Phase, not to individual stages.

**Version control:**
- Every Figma link update creates a new version entry
- Versions are labeled and have changelogs
- Anyone can compare versions side-by-side
- Current version is always unambiguous

**Exit signal:**
- At least 2 meaningfully different directions exist
- Designer has formed an opinion on which direction(s) to pursue further

**What AI does:**
- Iteration summarization for stakeholders who don't want to read every update
- Does NOT rank or rate design directions. The designer's judgment is sovereign.

---

#### Stage 2d: CONVERGE

**What it is:** Narrowing from multiple directions to a refined solution through critique and iteration.

**What happens here:**
- Designer selects 1-2 directions to develop further
- Deep iteration: refining interactions, edge cases, responsive behavior, states
- Structured feedback from PM, engineers, other designers
- Designer documents decisions: "Chose Direction A because [reasoning]. Killed Direction B because [reasoning]."

**What the designer produces:**
- A refined design approaching completeness
- Decision log: what was chosen, what was killed, and why
- Edge cases and states addressed (with AI helping identify gaps)

**Exit signal:**
- Designer believes the design is ready for validation
- Major decisions are documented
- Edge cases are addressed

**What AI does:**
- Auto-generates missing edge cases: "What happens if transaction ID is unavailable? What about 40+ character merchant names?"
- Flags potential accessibility gaps
- Completeness scoring: "This design covers 85% of identified states. Missing: error state for timeout, empty state for first-time users."

---

#### Stage 2e: PROVE

**What it is:** Validating the design with stakeholders before it goes to dev. This is the quality gate.

**What happens here:**

When a designer believes the design is ready, they move to Prove. This triggers a structured validation:

**3-Sign-Off Gate (all required before moving to Build):**

1. **Designer sign-off ✅** — Design is complete, no open questions, ready for handoff
2. **PM sign-off ✅** — Design solves the original problem, business goal is achievable, impact thesis is still valid
3. **Design Head sign-off ✅** — Quality standards met, approach is sound, no design debt

If any party rejects: sent back to the designer with structured feedback. Every loop-back is logged with reasoning — accountability for scope creep.

**Engineering feasibility review (non-blocking but critical):**
- Dev lead or assigned engineer reviews for technical feasibility
- Flags anything that can't be built as designed, with alternatives
- Estimates dev effort

**Exit signal:**
- All 3 sign-offs received
- Engineering has reviewed (even if async)

**What AI does:**
- Auto-generates the handoff checklist
- Conflict detection: "PM approved, but engineering says the animation isn't feasible. Flagging for resolution."
- Completeness audit of the design file

---

### PHASE 3: BUILD

#### Stage 3a: HANDOFF

Once Prove is complete, the request moves to Handoff:

- Final Figma link is **version-locked** (not a moving target)
- Design specifications: spacing, colors, typography, interactions
- Edge cases and error states (AI-generated + designer-verified)
- Accessibility requirements
- Engineering notes from feasibility review
- Designer notes: decisions, context, things to watch for

**Figma webhook activated:** If designer updates Figma after handoff, the system flags it as a post-handoff change and alerts the developer.

**Key principle:** Designers stay involved after handoff. They are not "done."

---

#### Stage 3b: DEV KANBAN

Now — and ONLY now — the workflow becomes traditional kanban:

**Columns:**
- **To Do** — Handoff complete, waiting for dev
- **In Progress** — Developer is building
- **In Review** — Code review, QA testing
- **Design QA** — Designer reviews implementation against design (REQUIRED — dev cannot ship without this)
- **Done** — Shipped to production

**Designer's role in Build:**
- Observer in kanban board
- Comments on design questions
- Reviews implementation at Design QA
- Flags if post-handoff design changes are needed
- Unblocks design-related issues

**Figma Sync During Dev:**
```
Designer updates Figma post-handoff
  → Webhook fires
  → Lane captures: who, when, what changed
  → If post-handoff: ⚠️ ALERT to dev (urgent), PM (FYI), Design Head (FYI)
  → Dev must review and confirm before continuing
```

**Change management:**
- If PM realizes they forgot a requirement: add as "change request" (not edit the original)
- Change requests go through a mini Shape → Prove loop
- AI flags scope expansion: "This change adds 40% more work. Consider deferring to follow-up."

---

### PHASE 4: IMPACT

#### Stage 4a: MEASURE

After release + configured time period (2 weeks, 1 month, 1 quarter), the AI prompts the PM:

> "The checkout redesign shipped 3 weeks ago. Time to log actual impact."

PM enters actual results:
- Predicted: "Checkout success screen redesign will improve post-payment drop-off by 5%"
- Actual: "Post-payment drop-off reduced by 3.2%"
- Accuracy: 64%

#### Stage 4b: PM CALIBRATION

Over time, Lane builds an **Impact Accuracy Score** for each PM:

- How often do predictions match reality?
- Are they consistently over-predicting to get priority?
- Are they sending high-value requests or noise?

**Framing matters:** This is presented as "calibration," not "scoring." It helps PMs make better predictions, not punish bad ones.

The design lead can use this data constructively: "Your last 5 requests predicted 10%+ impact but averaged 2%. Let's discuss request quality."

**What AI does:**
- Impact narrative: "PM predicted 5% improvement. Actual: 3.2%. Still represents ₹1.4Cr annual revenue impact."
- Trend analysis: "This PM's predictions are within 20% accuracy for 7 of last 10 requests — above team average."
- Design ROI reporting: aggregates impact across the team for leadership

---

## 4. CORE OBJECTS (Data Model)

### Request (root object)
- Problem statement, business goal, user segment, evidence
- Impact prediction (metric + estimated %)
- Priority (AI-suggested, lead-approved)
- Complexity (AI-estimated)
- Phase: predesign | design | build | impact
- Predesign stage: intake | context | shape | bet
- Design stage: sense | frame | diverge | converge | prove
- Dev kanban state: todo | in_progress | in_review | design_qa | done
- Impact stage: measuring | complete
- Quality score (AI-assessed)
- Intake classification: problem_framed | solution_specific | hybrid
- All history, comments, audit trail

### Idea (crowd-sourced)
- Title, problem, proposed solution, category
- Author (can be anonymous)
- Upvotes/downvotes, net score, voting period
- Validation record (AI + Design Head)
- If approved: linked to auto-created request

### Iteration (design version)
- Figma link (version-locked per iteration)
- Changelog (what changed and why)
- Reflection notes (designer's thinking)
- Feedback threads
- Design stage at creation

### Design Frame
- Designer's problem articulation
- Success criteria
- Discovered constraints
- Divergence from PM's original framing (if any)

### Handoff
- Locked Figma version
- Design specs, edge cases, accessibility notes
- Engineering feasibility notes
- All stakeholder sign-offs (3 required)

### Figma Update
- Request ID, file URL, version
- Who changed, when, what changed
- Post-handoff flag
- Dev review status

### Impact Record
- Predicted vs. actual metric impact
- Accuracy score
- PM calibration update

### Designer Profile
- Current workload (active items by stage)
- Skill areas / product domain expertise
- Capacity preferences (designer sets their own)
- Reflections history

### PM Profile
- Impact accuracy score (rolling)
- Request quality score (rolling)
- Intake classification history (how often blocked by gate)

---

## 5. AI-NATIVE FEATURES

**The "Remove the AI" test:** If you remove the AI, does the feature break entirely (AI-native), work worse (AI-enhanced), or work the same (AI-sprinkled)?

### MVP (Month 1) — The Brain

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 1 | Intake gate classification | ✅ Breaks | AI classifies problem vs. solution, suggests reframes, blocks solution-specific requests |
| 2 | Auto-triage with reasoning | ✅ Breaks | Priority, complexity, type — with reasoning, not dropdowns |
| 3 | Duplicate & conflict detection | ✅ Breaks | Semantic search across all requests |
| 4 | Smart assignment recommendation | ✅ Breaks | Based on capacity + skills + context-switching cost |
| 5 | Request quality scoring | ✅ Breaks | PM accountability over time |
| 6 | Auto-generated handoff checklist | ✅ Breaks | Missing edge cases, accessibility gaps, undocumented states |

### Month 2 — The Voice

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 7 | Private designer nudges | 🟡 Enhanced | Contextual, never escalated to leads automatically |
| 8 | Self-writing weekly digest | ✅ Breaks | Narrative team report — throughput, insights, recommendations |
| 9 | Proactive capacity alerts | ✅ Breaks | Alerts lead BEFORE someone drowns. Recommends rebalancing. |

### Month 3 — The Operator

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 10 | Cycle auto-planner | ✅ Breaks | Draft sprint plan considering all constraints |
| 11 | Impact comparison & PM scoring | ✅ Breaks | Predicted vs. actual, narrative generation, calibration |
| 12 | Morning briefing | ✅ Breaks | 30-second daily brief: what needs eyes, what's at risk |

### Month 6+ — The Chief of Staff

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 13 | Design critique / heuristic review | ✅ Breaks | Reviews iterations against UX heuristics |
| 14 | Quarterly impact narrative | ✅ Breaks | Full leadership presentation draft from data |
| 15 | DesignOps autonomous agent | ✅ Breaks | Full daily ops with human approval only |

**AI-native score: 13/15 features (87%) break without AI.**

---

## 6. VIEWS & INTERFACES

### 6.1 My Work (Default home for every user)

Every PM, designer, and developer lands here. This is their personal cockpit.

**For a PM:**
- My Requests: all submitted requests grouped by stage
- Impact Tracker: predicted vs. actual scores, rolling accuracy
- Pending Actions: reviews to approve, impact to log, triage to confirm
- Request Quality trend

**For a Designer:**
- My Work: active work with stage, appetite remaining, and health signal
- Quick Reflection: post an update without navigating away
- My Capacity: self-set preferences, current load, upcoming items
- Pending Actions: feedback needed, Design QA reviews

**For a Developer:**
- My Build Queue: kanban cards assigned (To Do → Done)
- Handoff Docs: quick access to specs
- Pending Actions: questions for designers, QA items

**For a Lead (in addition to their IC view):**
- Team Health: bottleneck signals, capacity gaps, stalled work (NOT individual productivity)
- AI Morning Briefing: decisions needed today
- Team Capacity: heat map, unassigned queue

### 6.2 Journey View (replaces kanban for design work)

Horizontal flow showing all active requests and their current phase/stage:

```
INTAKE → CONTEXT → SHAPE → BET → SENSE → FRAME → DIVERGE → CONVERGE → PROVE → HANDOFF → BUILD → IMPACT
  [3]      [2]      [4]    [—]    [2]     [1]      [3]        [2]       [1]      [1]      [3]     [1]
```

Each card: title, PM, designer, priority, appetite remaining, AI health signal.

### 6.3 Kanban View (Build phase ONLY)

Traditional kanban columns for dev: To Do → In Progress → In Review → Design QA → Done

### 6.4 Betting Board

All bet-ready concepts for current cycle. Cards show shaped summary, impact prediction, complexity, and Bet/Kill/Defer buttons.

### 6.5 Idea Board

Anonymous submission + voting. Trending ideas, recent submissions, voting-in-progress, validated ideas.

### 6.6 Capacity Dashboard

**Individual view (visible to the person + their lead):**
- Current load and capacity preference (designer sets their own)
- Active items by stage
- AI health signal: Available | Healthy | Stretched | Overloaded

**Team view (leads only — scoped to org subtree):**
- Team health heat map (NOT individual utilization percentages)
- Bottleneck analysis (which stage has most items stuck)
- Unassigned queue
- Capacity gaps

### 6.7 Impact Dashboard

- All shipped requests with predicted vs. actual impact
- PM calibration trends
- Design ROI metrics (aggregate team impact)
- Quarterly trends

### 6.8 Morning Briefing (AI-generated, pushed — not a page)

**For leads:** Decisions needed, what's at risk, capacity signals, new requests to triage
**For ICs:** Your work status, appetite limits, pending actions, AI suggestions

### 6.9 Request Detail View

The core "page" for any request:
- Left panel: full timeline (intake → current stage, all reflections, comments, versions)
- Right panel: context (linked data, metrics, AI-generated brief)
- Figma embed: live preview of current version
- Version history: all iterations with changelogs, compare mode
- Action bar: stage-appropriate actions

---

## 7. ROLES, PERMISSIONS & VISIBILITY

### Roles

**PM:**
- Can: create requests, add context, provide feedback, approve at Prove, log impact, view their own accuracy score
- Can see: status of their requests through all phases, developer kanban (everyone can)
- Cannot: assign designers, move requests through design stages, see other PMs' accuracy scores

**Designer:**
- Can: view assigned work, create iterations, post reflections, update Figma links, conduct Design QA, manage own capacity preference
- Can see: their own work portfolio and reflections, developer kanban
- Cannot: create requests, approve their own work at Prove, see other designers' individual dashboards

**Developer:**
- Can: view handoff docs, move items through Build kanban, flag feasibility, manage own queue
- Can see: their own queue, everyone can see dev kanban
- Cannot: modify design iterations, change impact predictions

**Lead:**
- Can: everything their role's ICs can do, plus: approve/override assignments, make betting decisions, access team health analytics, configure AI, view PM calibration scores
- Can see: team-level health signals for their org subtree. NOT individual time tracking, activity logs, or utilization percentages.

**Admin:**
- Can: configure workspace, manage users/org structure, set cycles, configure AI

### Visibility Cascade

Visibility flows through the org tree:
```
VP of Product
├── Head of Design → sees team health for all design subtrees
│   ├── Design Manager A → sees health for their direct reports
│   └── Design Manager B → sees health for their direct reports
├── Head of Engineering → sees dev kanban and build metrics
└── Head of Product → sees PM calibration and request pipeline
```

### What leads see vs. what they DON'T see

| Leads CAN see | Leads CANNOT see |
|---|---|
| Team bottleneck signals | Individual time-per-task |
| Capacity health (Available/Stretched/Overloaded) | Utilization percentages |
| Stalled work (team-level) | "Last active" timestamps |
| Unassigned queue size | Individual velocity rankings |
| Design quality trends (aggregate) | Per-designer speed comparisons |
| PM calibration scores | Designer's private reflections (unless shared) |

---

## 8. LANGUAGE GUIDE (What We Call Things)

The words we use shape how the product feels. Every label in the UI follows these rules:

| Instead of... | We say... | Why |
|---|---|---|
| Ticket | Request | Requests come from people with problems, not systems with tasks |
| Task | Work item | Design isn't a task to check off |
| Overdue | Appetite exceeded | Appetites are budgets, not deadlines. Exceeding is a signal, not a failure |
| Due date | Appetite | Design work has budgets, not deadlines |
| Status update | Reflection | Designers share thinking, not progress reports |
| Sprint | Cycle | Less pressure, same cadence |
| Velocity | Throughput | We measure output, not speed |
| Assign | Recommend + Approve | AI recommends, leads approve — nobody is "assigned" by a machine |
| Utilization | Capacity | People have capacity, machines have utilization |
| Performance | Health | Teams have health signals, not performance scores |
| Productivity | Impact | We measure outcomes, not output |
| Activity log | Timeline | It's the story of the work, not a surveillance record |

---

## 9. NON-FUNCTIONAL REQUIREMENTS

### Performance
- Page load under 2 seconds
- AI triage response under 5 seconds
- Real-time updates for comments and status changes (WebSocket)
- Morning briefing delivered by 8:00 AM local time

### Reliability
- 99.9% uptime target
- All AI recommendations include reasoning (no black-box decisions)
- AI suggestions always override-able — human has final say
- If AI service is down, tool still functions as manual workflow (graceful degradation)

### Security
- Role-based access control (RBAC)
- Audit trail for all actions
- Data encryption at rest and in transit

### Scalability
- Teams of 3-50 designers in V1
- Up to 500 active requests per workspace
- AI processing: 100 requests/day without degradation

---

## 10. SUCCESS METRICS

### Product health

| Metric | Target | Why |
|--------|--------|-----|
| Intake gate reframe rate | < 30% of requests need reframing after 3 months | PMs learn to write problem-framed requests |
| Avg triage time | < 30 minutes | AI-native triage should be near-instant |
| Design cycle time | 20% reduction in 3 months | Better problem clarity = less rework |
| Rework rate (loops back from Prove) | < 15% | Validation gate catches issues |
| PM calibration accuracy | Trending upward over 6 months | Accountability loop working |
| Design lead ops time | 50% reduction | AI chief of staff doing its job |
| Handoff completeness | > 90% on AI checklist | Specs aren't missing |

### Adoption signals

| Signal | Target |
|--------|--------|
| Daily active rate (all users) | > 70% weekdays |
| Morning briefing engagement | > 70% interaction rate |
| PM requests passing intake gate first try | > 70% after month 1 |
| Designer reflections posted | > 2 per request average |
| Idea Board participation | > 50% of org members vote at least once per month |

---

## 11. WHAT'S OUT OF SCOPE FOR V1

- Figma plugin (links/webhooks only)
- Slack integration (deferred to Month 3+)
- Jira/Linear integration (Build kanban is inside Lane)
- Real-time collaborative editing
- Mobile app (responsive web only)
- Multi-org / enterprise features
- Billing / payments (free during beta)

---

## 12. MVP BUILD SEQUENCE

### Week 1-2: Foundation
- Request creation form with intake gate logic
- Request list/table view
- Basic workflow phases (Predesign → Design → Build → Impact)
- User roles (PM, Designer, Developer, Lead)
- Org tree and visibility cascade

### Week 3-4: The AI Brain
- Intake gate classification (problem vs. solution)
- AI auto-triage (priority, complexity, type)
- Duplicate detection
- Assignment recommendation
- Request quality scoring

### Week 5-6: The Design Phase
- 5-stage design flow (Sense → Frame → Diverge → Converge → Prove)
- Iteration management (version tracking)
- Reflection system (designer updates)
- Feedback threads on iterations
- Figma link management with manual versioning
- 3-sign-off Prove gate

### Week 7-8: Build + Impact
- Dev kanban (To Do → Done)
- Handoff document generation
- Figma sync (webhook, post-handoff alerts)
- Impact logging (predicted vs. actual)
- PM calibration tracking

### Week 9-10: The Voice
- Weekly AI digest
- Private designer nudges
- Capacity dashboard
- Idea Board (submit, vote, validate)

### Week 11-12: Polish + Beta
- Morning briefing
- Betting board view
- Journey view
- Bug fixes, performance, edge cases

**Total: 10-12 weeks for solo builder with Claude Code.**

---

## 13. COMPETITIVE POSITIONING

| | Jira | Linear | Asana | Lane |
|---|---|---|---|---|
| **Built for** | Developers | Developers | Everyone (generic) | Design teams + PMs |
| **Work model** | Tickets in sprints | Issues in cycles | Tasks in projects | Problems through stages of clarity |
| **Intake quality** | Any text → ticket | Any text → issue | Any text → task | Problem-framed only (AI gate) |
| **Design workflow** | ❌ Force-fit | ❌ Force-fit | ❌ Force-fit | ✅ 5 scientific stages |
| **Designer experience** | Surveillance | Surveillance | Surveillance | Support (anti-surveillance by design) |
| **Impact measurement** | ❌ | ❌ | ❌ | ✅ Predicted vs. actual |
| **PM accountability** | ❌ | ❌ | ❌ | ✅ Calibration tracking |
| **AI role** | Copilot (sprinkled) | Copilot (sprinkled) | Copilot (sprinkled) | Chief of Staff (native) |
| **Dev tracking** | ✅ (core) | ✅ (core) | 🟡 (generic) | ✅ (built-in post-handoff) |
| **Who does ops** | Humans | Humans | Humans | AI (human approves) |

**Positioning statement:**
*For design-led product teams who are tired of forcing design work into developer tools, Lane is an AI-native design operations platform that manages the full lifecycle from problem identification to measured impact. Unlike Jira or Linear, Lane rejects solution-specific tickets at intake, embraces the scientific nature of design exploration, treats designers as thinking partners instead of surveillance subjects, holds PMs accountable for impact predictions, and uses AI as an autonomous operations manager — not a chatbot bolted on.*

---

*Version 2.0 | April 2026*
*Previous: v1.1 (March 2026)*
*Next: Technical architecture, data model, and API design.*