# DesignQ — Product Requirements Document
## Version 1.1 | March 2026

---

## 1. PRODUCT OVERVIEW

### What is DesignQ?

DesignQ is an AI-native design operations platform that manages the full lifecycle of design work — from the moment a PM has a business idea to measuring whether the shipped design actually moved the metrics it promised.

Unlike Jira, Linear, or Asana — which treat work as tickets on a board — DesignQ treats work as **decisions flowing through stages of clarity**. The design process is iterative, messy, and non-linear. DesignQ embraces that reality instead of forcing designers into developer-style kanban columns.

**The one-liner:** *"DesignQ is the AI chief of staff your design team never had."*

### Who is it for?

DesignQ is the daily workspace for **every person** on a product team — not just a lead's monitoring tool. Everyone uses it to manage their own work, and leads get an additional operational layer on top.

**Individual contributors (daily workspace):**

- **Product Managers (PMs):** Create requests, define business goals, set impact predictions, track the full lifecycle of their requests through design and dev, and build their impact accuracy score over time
- **Designers (Product/UI/UX):** Manage assigned work, explore solutions iteratively, post check-ins, track personal capacity and throughput, collaborate with PMs and devs, and stay involved through dev implementation
- **Developers:** View their build queue, access handoff documents, flag technical constraints, move items through dev kanban, and collaborate with designers on implementation

**Leads & managers (operational layer on top of IC workspace):**

- **Design/Product/Dev Leads:** Everything their role's ICs can do, plus: team dashboards, capacity management, betting decisions, AI-powered operational briefings, and cross-team visibility. Each lead sees dashboards for their direct reports, and their reports' reports — cascading through the org tree.

### Why does it exist?

The current reality in most product teams:

1. PMs dump requests into Jira/Slack/Docs with no structure
2. Designers are treated as "Figma operators" executing tickets, not thinking partners
3. Design work is iterative but forced into linear kanban workflows
4. Nobody measures whether shipped design actually moved metrics
5. Design leads spend 40% of their time on operational overhead instead of leading design
6. PMs send random requests with no accountability for impact
7. Design versioning across tools is broken — nobody knows which version is current

DesignQ fixes all of this with an AI-native approach where the AI runs operations and humans steer.

### Core Philosophy

> **Work ≠ Tasks. Work = Decisions.**

Every tool today optimizes for task completion speed. DesignQ optimizes for:

- **Problem clarity** — Is the right problem being solved?
- **Decision quality** — Are we making informed design choices?
- **Outcome impact** — Did it actually work?
- **PM accountability** — Are PMs sending high-quality requests or noise?

---

## 2. THE FULL WORKFLOW LOOP

### Overview

```
INTAKE → CONTEXT → SHAPE → BET → EXPLORE → VALIDATE → HANDOFF → BUILD → IMPACT
  ↑                                    ↑        ↑                          |
  |          (iterative loops)         |        |                          |
  └────────────────────────────────────┘        └── designers stay ────────┘
                                                    involved here
```

The workflow has **three distinct zones** with different interaction models:

| Zone | Stages | Model | Who drives |
|------|--------|-------|------------|
| **PM Zone** | Intake, Context | Structured input + AI enrichment | PMs create, AI triages |
| **Design Zone** | Shape, Bet, Explore, Validate | Iterative, non-linear, canvas-like | Designers explore, leads decide |
| **Dev Zone** | Handoff, Build | Kanban (traditional columns) | Devs execute, designers consult |

**Impact** spans all zones — it's the accountability layer that closes the loop.

---

### Stage 1: INTAKE (PM Zone)

**Purpose:** Transform raw business ideas into structured, triageable requests.

**How it works:**

A PM clicks "Create Request" and fills a structured form. This is NOT a Jira ticket. The form forces clarity:

**Required fields:**
- **Problem statement:** What user problem or business gap are we addressing?
- **Business goal:** What metric will this move? (conversion, retention, NPS, revenue, etc.)
- **Impact prediction:** "I estimate this will improve [metric] by [X%]" — this is logged and later compared to actual results
- **User segment:** Which users are affected? (new users, merchants, power users, etc.)
- **Priority rationale:** Why now? What happens if we don't do this?
- **Supporting evidence:** Data, user research, competitor screenshots, support tickets

**Optional fields:**
- Rough deadline or urgency level
- Figma links to existing screens
- Related past requests

**What AI does at intake (AI-native, not sprinkled):**

1. **Auto-triage with reasoning:** AI reads the request and generates:
   - Suggested priority (P0-P3) with reasoning ("Revenue impact detected — checkout is a critical conversion point, 32% failure rate mentioned")
   - Complexity estimate (S/M/L/XL) with reasoning ("Similar to Request #47 which took 4 days. Single screen, no new patterns.")
   - Type classification (New feature / Iteration / Bug fix / Research needed)

2. **Duplicate & conflict detection:** Semantic search across all existing requests. If a similar request exists or a related one is in progress, AI flags it: "This overlaps with Request #47 submitted by Rahul, currently in Explore with Ananya. Merge or keep separate?"

3. **Auto-assignment recommendation:** Based on designer capacity, skill match, context-switching cost, and growth opportunities. AI presents options with reasoning, not just a name.

4. **Quality scoring of the request itself:** AI rates the PM's request quality (completeness, clarity, evidence strength). Over time, this builds a PM effectiveness score — PMs who write vague requests with no data get flagged.

**Key design decision:** The PM does NOT choose the designer. AI recommends, the design lead approves. This prevents PMs from always going to their "favorite" designer and creating workload imbalances.

---

### Stage 2: CONTEXT (PM Zone → Design Zone transition)

**Purpose:** Make the problem intelligent by attaching everything a designer needs to understand it deeply.

**How it works:**

Once a request is triaged and assigned, the Context stage becomes a living document attached to the request. Think of it as a "case file" — not a card.

**Context includes:**
- User research (if available)
- Analytics data / dashboards
- Past design decisions on this area (auto-linked by AI)
- Competitor screenshots
- Technical constraints from engineering
- Stakeholder requirements and comments

**What AI does:**
- **Auto-links related past work:** "3 previous requests touched the checkout flow. Here's what was decided and shipped."
- **Pulls relevant metrics:** If connected to analytics, shows current state of the metric the PM wants to move
- **Generates a design brief:** Based on all context, AI generates a structured brief the designer can start from — not a blank page

**Key principle:** Context is never "done" — it evolves as the request moves through stages. New insights, stakeholder comments, and data can be added at any point.

---

### Stage 3: SHAPE (Design Zone — non-linear)

**Purpose:** Define the solution direction, constraints, and appetite — WITHOUT designing the final UI.

**Inspired by:** Shape Up methodology (Basecamp)

**How it works:**

This is where the request transforms from "problem" to "bet-ready concept." The designer (often with PM input) defines:

- **Solution direction:** A rough approach — could be wireframes, written description, or annotated sketches. NOT a polished Figma file.
- **Constraints:** What's out of scope? What can't change? (e.g., "Can't modify the payment SDK flow")
- **Risks:** What could go wrong? What's unknown?
- **Appetite:** How much time should we invest? (2 days? 1 week? 2 weeks?)
- **Open questions:** What do we still need to figure out?

**The non-linear nature:**
- A request can move BACK from Shape to Context if more information is needed
- Multiple solution directions can exist simultaneously — Shape is a thinking space, not a conveyor belt
- Shaping can involve async comments from PMs, engineers, and other designers

**What AI does:**
- **Risk identification:** "This approach requires real-time data. Based on past requests involving real-time features, engineering estimates were 2x longer than expected."
- **Historical reference:** "A similar solution was shaped for the merchant onboarding flow 3 months ago. Here's what worked and what didn't."
- **Appetite calibration:** "Given complexity and team history, similar requests took 5-8 days. Your 3-day appetite is aggressive."

---

### Stage 4: BET (Design Zone — decision point)

**Purpose:** Kill backlog culture. Decide what gets built, what gets killed, and what gets delayed.

**How it works:**

Instead of an ever-growing backlog, DesignQ runs **betting cycles** (weekly or biweekly). Shaped concepts are presented to the design/product lead, who decides:

- **Bet:** This moves forward to Explore. Designer is committed for the appetite duration.
- **Kill:** This isn't worth doing. Archive with reason.
- **Defer:** Not now. Maybe next cycle. (But it doesn't rot in a backlog — deferred items are auto-resurfaced by AI after N cycles with a prompt: "This has been deferred 3 times. Kill it or bet on it?")

**The Betting Board:**
A dedicated view showing all bet-ready concepts for the current cycle with:
- Shaped summary
- PM's impact prediction
- AI's complexity estimate
- Designer recommendation
- Available capacity this cycle

**What AI does:**
- **Generates the betting brief:** Summarizes all bet-ready concepts with pros/cons
- **Capacity check:** "You have 120 designer-hours this cycle. The current bets total 95 hours. 25 hours of buffer remaining."
- **Impact-weighted ranking:** Suggests an order based on estimated impact × feasibility
- **Deferred item resurfacing:** Automatically brings back concepts that have been sitting too long

---

### Stage 5: EXPLORE (Design Zone — iterative, non-linear)

**Purpose:** Designers explore, ideate, prototype, and iterate. This is the creative heart of the process.

**This is NOT kanban.** This is a canvas.

**How it works:**

Once a concept is "bet," the designer enters Explore mode. This stage has no columns, no linear progression. Instead, it's structured around:

- **Iterations:** Each significant design direction is an "iteration" — versioned, timestamped, and commentable. Think Git branches for design.
- **Design check-ins:** Instead of moving a card across columns, designers post check-ins — short updates with screenshots/links showing where they are: "Explored two directions for the checkout success screen. Direction A is minimal, Direction B has animation. Need input on which to pursue."
- **Feedback threads:** PMs, other designers, and engineers can comment on specific iterations. Feedback is structured (not Slack noise) and tied to the iteration it references.
- **Time tracking against appetite:** The system tracks time spent vs. the appetite defined in Shape. If a designer is at 80% of appetite with low completion signals, AI flags it.

**Version control (critical feature):**
- Every Figma link update (manual or via Figma webhook) creates a new version entry
- Versions are labeled: v1 (initial exploration), v2 (after PM feedback), v3 (after user testing), etc.
- Each version has a changelog: "What changed and why"
- Anyone can compare versions side-by-side
- **Current version is always unambiguous** — no more "which Figma page is the latest?"

**What AI does:**
- **Progress sensing:** AI reads check-ins and estimates completion percentage. Not based on arbitrary column position, but on actual design signals.
- **Stall detection:** If no check-in for X days (relative to complexity), AI nudges the designer: "Hey — the checkout screen has been in Explore for 6 days (appetite: 5 days). Everything okay? [I'm blocked] [Need more time] [Forgot to update]"
- **Design critique (future):** AI reviews the latest iteration against heuristics and suggests improvements
- **Iteration summarization:** AI generates a summary of design evolution for stakeholders who don't want to read every check-in

**Key design decisions:**
- No drag-and-drop columns in Explore. The interface is a timeline/feed of iterations and check-ins.
- Designers update status through check-ins, not by moving cards. This captures the WHY behind progress, not just the position.
- The "non-linear" nature means a designer can have multiple active explorations, merge them, kill one direction, or go back to an earlier iteration.

---

### Stage 6: VALIDATE (Design Zone → Handoff transition)

**Purpose:** Before anything goes to dev, ensure alignment across PM, Design, and Engineering.

**This is the gate that prevents 70% of rework.**

**How it works:**

When a designer believes the design is ready, they move to Validate. This triggers a structured validation process:

**Validation checklist (AI-generated + manual):**

1. **Design completeness:**
   - All screens/states designed (happy path, error states, empty states, loading states)
   - Edge cases documented
   - Responsive behavior defined
   - Accessibility requirements noted
   - AI auto-generates missing edge cases: "What happens if transaction ID is unavailable? What about 40+ character merchant names?"

2. **PM sign-off:**
   - Does the design match the original problem statement?
   - Does it align with the business goal?
   - PM confirms or requests changes (with reason)

3. **Engineering feasibility:**
   - Dev lead or assigned engineer reviews for technical feasibility
   - Flags anything that can't be built as designed, with alternatives
   - Estimates dev effort

4. **Stakeholder alignment:**
   - Anyone tagged as a stakeholder on this request can review and approve
   - Structured feedback: Approve / Approve with comments / Request changes

**Validation is not a formality.** If any stakeholder requests changes, the request loops back to Explore — this is the non-linear nature. But every loop-back is logged with reasoning, so there's accountability for scope creep.

**What AI does:**
- **Auto-generates the handoff checklist:** Checks the Figma file for missing states, accessibility gaps, and undocumented edge cases
- **Completeness scoring:** "This handoff is 85% complete. Missing: error state for timeout scenario, accessibility notes for screen reader."
- **Conflict detection:** "PM approved this, but the engineering comment says the animation isn't feasible. Flagging for resolution before handoff."

---

### Stage 7: HANDOFF (Dev Zone — transition)

**Purpose:** Clean, structured handoff from design to development.

**How it works:**

Once Validate is complete (all sign-offs received), the request moves to Handoff. This generates a structured handoff document:

- Final Figma link (version-locked — not a moving target)
- Design specifications (spacing, colors, typography — pulled from Figma or manually noted)
- Interaction specifications (animations, transitions, gestures)
- Edge cases and error states (AI-generated + designer-verified)
- Accessibility requirements
- Assets to export
- Engineering notes from the feasibility review

**Version lock:** The Figma version at Handoff is locked as the "handoff version." If the design changes after this point (due to dev constraints or PM changes), a new version is created with a changelog, and the developer is notified.

**Key principle:** Designers stay involved after handoff. They are not "done" when they hand off.

---

### Stage 8: BUILD (Dev Zone — kanban)

**Purpose:** Track development progress. THIS is where kanban lives.

**How it works:**

Now — and ONLY now — the workflow becomes a traditional kanban board:

**Columns:**
- **Ready for Dev** — Handoff complete, waiting for a developer to pick it up
- **In Development** — Developer is building it
- **Dev Review / QA** — Code review, QA testing
- **Design QA** — Designer reviews the built implementation against the design
- **Ready for Release** — Approved by design, passing QA
- **Released** — Live in production

**Designer involvement in Build:**
- Designers are notified when their request enters "Dev Review / QA"
- **Design QA** is a required column — a developer cannot ship without the designer confirming the implementation matches the design
- If implementation deviates (due to tech constraints, PM change requests, etc.), a new design iteration is created in the Explore stage, and both versions are tracked

**What AI does:**
- **Dev stall detection:** Same as design stall detection — if a card sits in one column too long, AI nudges
- **Design-dev mismatch detection (future):** AI compares Figma screenshots with dev screenshots and flags visual differences
- **Auto-notifications:** When dev has questions, the designer is looped in automatically. No Slack hunting.

**Change management during Build:**
- If a PM realizes they forgot a requirement, they add it as a "change request" — not by editing the original request
- Change requests go through a mini Shape → Validate loop
- The original request and change request are linked, so there's a clear audit trail
- AI flags if change requests are significantly expanding scope: "This change request adds 40% more work. Consider deferring to a follow-up release."

---

### Stage 9: IMPACT (Accountability Layer)

**Purpose:** Close the loop. Did this design actually move the metric it promised?

**This is DesignQ's killer feature and the biggest gap in every existing tool.**

**How it works:**

After a design is released, the Impact stage activates. Two things happen:

**1. Impact entry:**
- The PM (or anyone) enters the actual metric impact after a defined period (2 weeks, 1 month, 1 quarter — configurable)
- The system compares **predicted impact** (what the PM estimated at Intake) vs. **actual impact** (what actually happened)
- Example:
  - Predicted: "Checkout success screen redesign will improve post-payment drop-off by 5%"
  - Actual: "Post-payment drop-off reduced by 3.2%"
  - Impact score: 64% accuracy

**2. PM accountability scoring:**

Over time, DesignQ builds an **Impact Accuracy Score** for each PM:
- How often do their impact predictions match reality?
- Are they consistently over-predicting (sending inflated requests to get priority)?
- Are they sending high-value requests or noise?

This creates a natural feedback loop:
- PMs who send well-researched, high-impact requests build credibility
- PMs who send vague, low-impact requests or consistently over-predict are surfaced in reports
- The design lead can use this data to push back on low-quality requests: "Your last 5 requests predicted 10%+ impact but averaged 2%. Let's discuss request quality."

**What AI does:**
- **Impact reminder:** After release + configured time period, AI prompts: "The checkout redesign shipped 3 weeks ago. Time to log actual impact."
- **Impact narrative:** AI generates the comparison: "PM predicted 5% improvement. Actual: 3.2%. While below prediction, this still represents an estimated ₹1.4Cr annual revenue impact."
- **Trend analysis:** "This PM's predictions have been within 20% accuracy for 7 of their last 10 requests — above team average."
- **Design ROI reporting:** Aggregates impact data across the team for leadership presentations

---

## 3. CORE OBJECTS (Data Model — Conceptual)

DesignQ replaces traditional "tasks" and "tickets" with purpose-built objects:

### Request
The root unit. Created by PMs.
- Problem statement, business goal, user segment
- Impact prediction (metric + estimated %)
- Priority (AI-suggested, lead-approved)
- Complexity (AI-estimated)
- Status (maps to current workflow stage)
- Quality score (AI-assessed request quality)
- All history, comments, and audit trail

### Concept
A shaped solution direction, born from a Request.
- Solution approach (description, rough wireframes)
- Constraints, risks, open questions
- Appetite (time budget)
- Betting decision (Bet / Kill / Defer)

### Iteration
A versioned design exploration within a Concept.
- Figma link (version-locked)
- Changelog (what changed and why)
- Check-in notes
- Feedback threads
- Timestamp + author

### Handoff
The bridge between Design and Dev.
- Locked Figma version
- Design specs, edge cases, accessibility notes
- Engineering feasibility notes
- All stakeholder sign-offs

### Build Item
The dev-side kanban card, linked back to Request + Handoff.
- Kanban status (Ready for Dev → Released)
- Developer assignment
- Design QA status
- Change requests (linked)

### Impact Record
The accountability close-out.
- Predicted metric + %
- Actual metric + %
- Accuracy score
- PM who made the prediction
- Time to measure

### Designer Profile
Capacity and skill tracking.
- Current workload (active items, hours committed)
- Skills / product area expertise
- Historical throughput (avg cycle time, items per sprint)
- Utilization % (current and trending)

### PM Profile
Request quality and impact accuracy.
- Impact accuracy score (rolling)
- Request quality score (rolling)
- Number of requests submitted, approved, killed
- Change request frequency (scope creep indicator)

---

## 4. AI-NATIVE FEATURES (Ordered by Priority)

The "Remove the AI" test: If you remove the AI, does the feature break entirely (AI-native), work worse (AI-enhanced), or work the same (AI-sprinkled)?

### MVP (Month 1) — The Brain

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 1 | Auto-triage with reasoning | ✅ Breaks without AI | AI reads request, generates priority/complexity/type with reasoning. Not a dropdown — a thinking partner. |
| 2 | Duplicate & conflict detection | ✅ Breaks without AI | Semantic search across all requests. Flags overlaps, suggests merges. |
| 3 | Smart assignment recommendation | ✅ Breaks without AI | AI recommends designer based on capacity + skills + context-switching cost + growth opportunity. Presents options with reasoning. |
| 4 | Request quality scoring | ✅ Breaks without AI | AI assesses PM request quality (completeness, evidence, clarity). Builds PM accountability over time. |
| 5 | Auto-generated handoff checklist | ✅ Breaks without AI | AI checks for missing edge cases, accessibility gaps, undocumented states. Generates what's missing. |

### Month 2 — The Voice

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 6 | Stall detection & nudging | 🟡 Enhanced | Time-based triggers + AI-generated contextual nudges. Simple timer works without AI; contextual reasoning doesn't. |
| 7 | Self-writing weekly digest | ✅ Breaks without AI | AI generates narrative team report every Friday — throughput, cycle time, blockers, insights. |
| 8 | Proactive overload alerts | ✅ Breaks without AI | AI monitors capacity continuously, alerts lead BEFORE someone drowns. Recommends specific rebalancing actions. |

### Month 3 — The Operator

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 9 | Sprint/cycle auto-planner | ✅ Breaks without AI | AI generates a draft sprint plan considering all constraints simultaneously. Human approves/adjusts. |
| 10 | Impact comparison & PM scoring | ✅ Breaks without AI | AI compares predicted vs. actual impact, generates narrative, builds PM accuracy scores over time. |
| 11 | Morning briefing | ✅ Breaks without AI | Daily 30-second brief: what needs your eyes, what's at risk, what changed overnight. |

### Month 6+ — The Chief of Staff

| # | Feature | AI-Native? | Description |
|---|---------|-----------|-------------|
| 12 | Design critique / heuristic review | ✅ Breaks without AI | AI reviews design iterations against UX heuristics and suggests improvements. |
| 13 | Quarterly impact narrative | ✅ Breaks without AI | AI generates full leadership presentation draft from accumulated data. |
| 14 | DesignOps autonomous agent | ✅ Breaks without AI | Full daily operations management — triage, assign, nudge, rebalance, report — with human approval only. |
| 15 | MCP server | N/A (infrastructure) | Other AI tools can query DesignQ data — "What's the status of the checkout redesign?" |

**AI-native score: 12/15 features (80%) break without AI.** Target exceeded.

---

## 5. VIEWS & INTERFACES

### 5.1 My Work (Default home for every user)

Every PM, designer, and developer lands here. This is their personal workspace — not a team dashboard they're looking at from the outside, but THEIR cockpit.

**For a PM:**
- My Requests: All requests they've created, grouped by stage (with AI status signals)
- Impact Tracker: Their predicted vs. actual scores, rolling accuracy
- Pending Actions: Reviews to approve, impact data to log, AI triage decisions to confirm
- My Request Quality Score (trending over time)

**For a Designer:**
- My Assignments: Active work with stage, appetite remaining, and AI health signal
- Check-in prompt: Quick-post an update without navigating away
- My Capacity: Current utilization, upcoming items, throughput trend
- Pending Actions: Design QA reviews, validation feedback needed

**For a Developer:**
- My Build Queue: Kanban cards assigned to them (Ready for Dev → Released)
- Handoff Docs: Quick access to specs for items they're building
- Pending Actions: Questions for designers, QA items, blockers to flag

**For a Lead (in addition to their role's IC view):**
- Team Overview: Dashboard of all direct reports and their reports (cascading org tree)
- AI Morning Briefing: Pushed to the top — decisions needed today
- Team Capacity: Heat map, bottleneck analysis, unassigned queue

### 5.2 Journey View (replaces Kanban for design work)

A horizontal flow showing all active requests and their current stage:

```
INTAKE → CONTEXT → SHAPE → BET → EXPLORE → VALIDATE → HANDOFF → BUILD → IMPACT
  [3]      [2]      [4]    [—]     [6]       [2]        [1]      [3]     [1]
```

Each request is a card showing: title, PM, assigned designer, priority, days in current stage, and AI-generated status signal (on track / at risk / stalled / blocked).

Clicking a request opens the full request view — a vertical timeline of everything that's happened, from intake through impact.

### 5.3 Kanban View (Dev Zone only)

Traditional kanban columns, but ONLY for requests in Build stage:
Ready for Dev → In Development → Dev Review/QA → Design QA → Ready for Release → Released

### 5.4 Betting Board

Shows all bet-ready concepts for the current cycle. Cards show: shaped summary, PM impact prediction, AI complexity estimate, designer recommendation, and betting decision buttons (Bet / Kill / Defer).

### 5.5 Capacity Dashboard

**Individual view (visible to the person themselves + their lead):**
- Current utilization % (with trend)
- Active items (with stage and days remaining)
- Skill areas (product domains worked on)
- Throughput trend (items completed per cycle)
- AI health signal: Underloaded / Healthy / Overloaded / Drowning

**Team view (visible to leads — scoped to their org subtree):**
- Team utilization heat map
- Bottleneck analysis (which stage has the most items stuck)
- Unassigned request queue
- Upcoming capacity gaps
- Per-person breakdown with drill-down

### 5.6 Impact Dashboard

- All shipped requests with predicted vs. actual impact
- PM accuracy leaderboard
- Design ROI metrics (aggregate impact delivered by the team)
- Trend: Is design impact improving quarter over quarter?

### 5.7 Morning Briefing (AI-generated, not a dashboard)

Not a page you open — this is pushed to you. Content varies by role:

**For leads:** Decisions needed today, what's at risk, who's overloaded/underloaded, new requests to triage, one-tap approve/reassign/defer actions.

**For ICs:** Your work status, items approaching appetite limits, pending actions from others (PM hasn't reviewed, dev has a question), and AI suggestions ("You have 2 hours of buffer today — good time to post a check-in on the lending flow").

### 5.8 Request Detail View

The core "page" for any request. Not a card — a rich document view:
- Left panel: Full timeline (intake → current stage, all check-ins, comments, version history)
- Right panel: Context (linked data, metrics, past decisions, AI-generated brief)
- Figma embed: Live preview of current version
- Version history: All iterations with changelogs, compare mode
- Action bar: Stage-appropriate actions (approve, request changes, move to next stage, etc.)

---

## 6. USER ROLES, PERMISSIONS & VISIBILITY

### Roles

**PM (Product Manager)**
- **Can:** Create requests, add context, provide feedback, approve/request changes at Validate, log impact data, view their own PM accuracy score, manage their own request pipeline
- **Can see:** Designer dashboards (work status of designers handling their requests), developer dashboards (everyone can), their own impact scores
- **Cannot:** Assign designers (can only see AI recommendation), move requests through design stages, modify designer profiles

**Designer**
- **Can:** View assigned requests, create iterations, post check-ins, update Figma links, conduct Design QA, add context/research, manage own work queue
- **Can see:** Developer dashboards (everyone can), their own capacity and throughput
- **Cannot:** Create requests (that's a PM function), approve their own work at Validate (needs PM + eng sign-off), see other designers' dashboards (unless they're a lead)

**Developer**
- **Can:** View handoff documents, move items through Build kanban, flag feasibility issues, add technical constraints, review at Validate, manage own build queue
- **Can see:** Their own dashboard is visible to everyone (transparent by default)
- **Cannot:** Modify design iterations, change PM impact predictions

**Lead (Design Lead / Product Head / Dev Head)**
- **Can:** Everything their role's ICs can do, plus: approve/override AI assignments, make betting decisions, access team analytics, configure AI settings, view PM accountability scores, generate reports
- **Can see:** Dashboards for all direct reports AND their reports' reports (cascading org tree). A VP sees the entire org; a team lead sees only their subtree.

**Admin**
- **Can:** Configure workspace, manage users and org structure, set cycle durations, configure AI behavior, manage integrations

### Visibility Model

Visibility cascades through the org tree — no manual configuration needed:

```
VP of Product
├── sees all PM, designer, dev dashboards
│
├── Head of Design (Nikhil)
│   ├── sees all designer dashboards
│   ├── Design Manager A
│   │   └── sees dashboards of designers reporting to them
│   └── Design Manager B
│       └── sees dashboards of designers reporting to them
│
├── Head of Engineering
│   └── sees all dev dashboards
│
└── Head of Product
    └── sees all PM dashboards
```

**Cross-role visibility rules:**
- Developer dashboards → visible to **everyone** (full transparency on build progress)
- Designer dashboards → visible to **PMs** (they need to track their requests through design) and **design leads** (org tree)
- PM dashboards → visible to **product leads** (org tree) and **themselves**
- Impact scores → visible to **the PM themselves** and **their leads**

---

## 7. NON-FUNCTIONAL REQUIREMENTS

### Performance
- Page load under 2 seconds
- AI triage response under 5 seconds
- Real-time updates for comments and status changes (WebSocket)
- Morning briefing generated and delivered by 8:00 AM local time

### Reliability
- 99.9% uptime target
- All AI recommendations include reasoning (no black-box decisions)
- AI suggestions are always override-able — human has final say
- If AI service is down, the tool still functions as a manual workflow system (graceful degradation)

### Security
- Role-based access control (RBAC)
- Audit trail for all actions (who did what, when)
- SOC2 compliance target for enterprise adoption
- Data encryption at rest and in transit

### Scalability
- Support teams of 3-50 designers in V1
- Support up to 500 active requests per workspace
- AI processing should handle 100 requests/day without degradation

---

## 8. SUCCESS METRICS

### For the product (how we know DesignQ is working):

| Metric | Target | Why it matters |
|--------|--------|----------------|
| Avg request triage time | < 30 minutes (from hours/days) | AI-native triage should be near-instant |
| Design cycle time | 20% reduction within 3 months | Better clarity = less rework |
| Rework rate (requests looping back) | < 15% after Validate | Validate gate should catch issues |
| PM impact prediction accuracy | Trending upward over 6 months | Accountability loop is working |
| Design lead ops time | 50% reduction | AI chief of staff doing its job |
| Handoff completeness score | > 90% on AI checklist | Edge cases and specs aren't missing |
| Weekly digest read rate | > 80% of stakeholders | The report is actually useful |

### For users (adoption signals):

| Signal | Target |
|--------|--------|
| Daily active rate (design leads) | > 80% weekdays |
| Morning briefing engagement | > 70% interaction rate |
| PM requests include impact prediction | > 90% |
| Designers posting check-ins | > 3 per request on average |

---

## 9. WHAT'S EXPLICITLY OUT OF SCOPE FOR V1

- **Figma plugin:** V1 uses Figma links/webhooks, not a native plugin
- **Slack integration for intake:** Under consideration but not in V1. The "Create Request" button is the primary intake. Slack detection is a Month 3+ feature.
- **Jira/Linear integration:** Not needed — Build kanban is inside DesignQ
- **Real-time collaborative editing:** Comments and check-ins yes; Google Docs-style real-time co-editing no
- **Mobile app:** Web-first. Responsive web for mobile access, native app later
- **Multi-org / enterprise features:** Single workspace per org in V1
- **Billing / payments:** Free during beta, pricing comes after PMF

---

## 10. OPEN QUESTIONS

1. **Figma version detection:** Should versioning be manual (designer clicks "save version") or automatic via Figma webhooks? Webhooks are more AI-native but could create noise (every minor tweak = new version). **Recommendation:** Auto-detect via webhooks but only create a version when changes exceed a threshold, with option to manually pin a version.

2. **Slack integration scope:** You mentioned being unsure about Slack. For MVP, skip Slack and focus on the in-app experience. Slack detection (reading messages to find requests) is high-impact but Month 3+ work. Slack notifications (sending alerts OUT to Slack) is easier and could be Month 2.

3. **AI model dependency:** The product breaks without AI. What's the fallback if Claude/OpenAI APIs are down? **Recommendation:** Queue AI operations and process when available. Manual override always works. Critical: don't make the core workflow BLOCKED by AI — make it DEGRADED (less intelligent, still functional).

4. **PM resistance to accountability scoring:** PMs may resist having their impact predictions tracked. **Recommendation:** Frame it as "calibration" not "scoring." Start with team-level accuracy, then individual. Position it as helping PMs make better predictions, not punishing bad ones.

5. **Design check-in fatigue:** Will designers find check-ins burdensome? **Recommendation:** Make check-ins lightweight — screenshot + 1-2 sentences. AI can auto-generate check-ins from Figma activity if connected. Don't mandate frequency; let AI nudge when it's been too long.

---

## 11. MVP SCOPE (What to build first)

### The absolute minimum that delivers the core value:

**Week 1-2: The Foundation**
- Request creation form (PM intake with all required fields)
- Request list/table view
- Basic workflow stages (Intake → Explore → Validate → Handoff → Build → Impact)
- User roles (PM, Designer, Lead)

**Week 3-4: The AI Brain**
- AI auto-triage (priority, complexity, type — with reasoning)
- AI duplicate detection
- AI assignment recommendation
- AI request quality scoring

**Week 5-6: The Design Zone**
- Iteration management (version tracking for design work)
- Check-in system (designer progress updates)
- Comment threads on iterations
- Figma link management with manual versioning

**Week 7-8: The Dev Zone + Impact**
- Build kanban (post-handoff)
- Handoff document generation (AI-assisted checklist)
- Impact logging (predicted vs. actual)
- PM accuracy tracking

**Week 9-10: The Voice**
- Weekly digest (AI-generated)
- Stall detection and nudging (in-app notifications)
- Capacity dashboard (per-designer and team-level)

**Week 11-12: Polish + Beta**
- Morning briefing
- Betting board view
- Journey view (the full-loop visualization)
- Bug fixes, performance, edge cases

**Total estimated MVP timeline: 10-12 weeks for a solo builder using Claude Code.**

---

## 12. COMPETITIVE POSITIONING

| | Jira | Linear | Asana | DesignQ |
|---|---|---|---|---|
| **Built for** | Developers | Developers | Everyone (generic) | Design teams + PMs |
| **Work model** | Tickets in sprints | Issues in cycles | Tasks in projects | Decisions through stages |
| **Design workflow** | ❌ Force-fit | ❌ Force-fit | ❌ Force-fit | ✅ Built for iterative design |
| **Impact measurement** | ❌ | ❌ | ❌ | ✅ Predicted vs. actual |
| **PM accountability** | ❌ | ❌ | ❌ | ✅ Impact accuracy scoring |
| **AI role** | Copilot (sprinkled) | Copilot (sprinkled) | Copilot (sprinkled) | Chief of Staff (native) |
| **Dev tracking** | ✅ (core product) | ✅ (core product) | 🟡 (generic) | ✅ (built-in post-handoff) |
| **Who does ops work** | Humans | Humans | Humans | AI (human approves) |

**Positioning statement:**
*For design-led product teams who are tired of forcing design work into developer tools, DesignQ is an AI-native design operations platform that manages the full lifecycle from PM request to measured impact. Unlike Jira or Linear, DesignQ embraces the iterative nature of design work, holds PMs accountable for impact predictions, and uses AI as an autonomous operations manager — not just a chatbot bolted on.*

---

*This is a living document. Version 1.0, March 2026.*
*Next: Technical architecture, data model, and API design.*
