# LANE
## Product Requirements Document
### Version 1.0 · April 2026

**Status:** Pre-launch, live GTM  
**Current Sprint:** Weeks 1–4 MVP Build  
**Next Review:** April 17, 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [The 4-Phase Model](#2-the-4-phase-model)
3. [Phase 1 — Predesign](#3-phase-1--predesign)
4. [Phase 2 — Design](#4-phase-2--design)
5. [Phase 3 — Build](#5-phase-3--build)
6. [Phase 4 — Impact](#6-phase-4--impact)
7. [AI Capabilities](#7-ai-capabilities)
8. [Design Philosophy — Accountability Without Surveillance](#8-design-philosophy--accountability-without-surveillance)
9. [Role-Based Visibility](#9-role-based-visibility)
10. [UI Language Guide](#10-ui-language-guide)
11. [Technical Stack](#11-technical-stack)
12. [Build Roadmap](#12-build-roadmap)
13. [What Makes Lane Different](#13-what-makes-lane-different)
14. [Founder Context](#14-founder-context)

---

## 1. Product Overview

### What Lane Does

Lane is an AI-native design operations platform. It replaces the broken model of solution-driven ticket systems with a problem-first workflow that respects how design thinking actually works.

**The flow:** PM identifies a problem → AI gates solution-specific requests → Org shapes and bets → Designer explores through 5 scientific stages → Dev builds via kanban → PM measures impact.

### Who It's For

Design leaders at product companies with 5–15 person design teams. Teams currently running on Jira, Linear, or Notion who are frustrated that their tools treat design like development.

### Core Philosophy

> *Surveillance produces performance. Support produces truth.*

Lane is built for designers, not about designers. Every product decision flows from this: visibility serves the designer, not the watcher.

### Business Model

| Tier | Price | For |
|---|---|---|
| Starter | $99 / month | 1–3 person design team |
| Professional | $299 / month | 4–10 person team |
| Enterprise | Custom | 10+ seats, SLA |

Annual prepay: 8% discount. Stripe integration post-beta.

### GTM

Content-driven. LinkedIn (primary), Twitter/X, Reddit. Lead magnet: Chaos Calculator. CTA: "DM me CHAOS". No paid ads, no enterprise sales.

Target: 10–15 paying customers by end of 12-week sprint. Goal: $5–20K MRR lifestyle business.

---

## 2. The 4-Phase Model

Lane organises all work across four phases, each owned by a different role.

| Phase | Owner | Purpose | Key Output |
|---|---|---|---|
| **PREDESIGN** | PM + Org | Decide what to work on | Bet: approved problem to design |
| **DESIGN** | Designers | Explore and solve | Handoff-ready design with 3 sign-offs |
| **BUILD** | Developers | Build and ship | Shipped feature |
| **IMPACT** | PMs | Measure what happened | PM calibration + impact narrative |

### End-to-End Stage Flow

```
INTAKE GATE → CONTEXT → SHAPE → BET
  → [SENSE → FRAME → DIVERGE → CONVERGE → (VALIDATE) → PROVE]
  → HANDOFF → BUILD → IMPACT
```

The Design Phase (in brackets) is non-linear. Designers move between stages freely. All other phases are linear.

---

## 3. Phase 1 — Predesign

*Owner: PM + Design Lead · Purpose: Decide what to work on*

### Stage 1: Intake Gate

The single most important feature in Lane. Requests cannot move forward unless they are problem-framed. This is enforced by the system — not by humans, not by culture.

#### AI Classification Logic

When a PM submits a request, the AI runs a Problem-Solution Check before the stream is created:

- `problem_framed` → passes gate, proceeds to triage
- `solution_specific` → BLOCKED, PM sees reframe prompt
- `hybrid` → AI extracts problem portion, flags solution, PM reframes

#### Signals: Solution-Specific (BLOCKED)

- "Redesign the payments screen"
- "Add a dark mode toggle"
- "Make the onboarding flow shorter"
- Any request containing UI element names without problem context
- Requests starting with "Can we..." + UI change

#### Signals: Problem-Framed (ALLOWED)

- "42% of users drop off at the OTP step. We're losing ~₹8L/month in activation."
- "Support tickets mentioning 'can't find transaction history' have increased 3x in 90 days."
- "New users who don't complete their first transaction within 48 hours never return. Activation is at 31%."

#### Blocked Request UI

No error state. No red. No "invalid." The UI is warm and constructive:

> *"This looks like a solution — which is great thinking! Help us capture the problem behind it so the design team can explore even better approaches."*

Three guiding questions surface inline for the PM to answer, then the request is re-classified on resubmit.

#### Intake Form Fields

| Field | Required | Notes |
|---|---|---|
| Problem statement | ✅ | Min 50 chars. Must describe friction, not a feature. |
| Evidence / signal | ✅ | Data, support tickets, user quotes, metrics |
| Business goal | ✅ | Which metric does this connect to? |
| Urgency | ✅ | P0 (critical) / P1 (blocking) / P2 (high) / P3 (standard) |
| Predicted impact | ✅ | PM's estimate of metric improvement post-ship |
| Constraints | Optional | Tech constraints, timelines, known dependencies |
| Proposed direction | ❌ BLOCKED | This field does not exist. Solutions are not inputs. |

#### After Passing Gate

Lane auto-generates a structured brief for the designer: problem statement, evidence summary, business stakes, AI-assigned priority and complexity with reasoning, and duplicate detection results.

---

### Stage 2: Context

A living document attached to the request. Contains user research, analytics, past decisions (AI auto-links), competitor data, technical constraints, and stakeholder requirements. This becomes the design team's source of truth — not a Slack thread.

---

### Stage 3: Shape

Design Lead defines the direction without prescribing UI. Output includes: solution direction (rough), constraints, risks, appetite (time budget in days), and open questions. This stage is non-linear — can loop back to Context.

AI calibrates appetite against historical data from similar requests.

---

### Stage 4: Bet

The Design Head reviews shaped requests per cycle and makes a decision:

- **Bet** → moves to Design Phase
- **Kill** → archived with reason
- **Defer** → AI auto-resurfaces after N cycles

> The Idea Board runs in parallel. Anyone submits ideas, org votes anonymously (1-week period). Top ideas are validated by AI + Design Head and auto-created as requests if approved.

---

## 4. Phase 2 — Design

*Owner: Designers · Purpose: Explore and solve the problem*

The design phase is not a kanban board. It is not a list of tasks. It does not have a "To Do → In Progress → Done" structure. Design work is exploratory — it involves generating options before eliminating them. Lane uses 5 scientific stages that reflect how design thinking actually works.

These stages are non-linear. Designers move between them freely. No due dates. Appetites apply to the entire phase, not individual stages. Progress is captured through reflections, not status updates.

---

### Stage 2a: SENSE
*Understanding the problem deeply before touching a solution*

Designer receives the AI-generated brief from intake. Reviews existing research: analytics, session recordings, user interviews, support tickets. Lists key assumptions explicitly — things believed to be true but not yet verified. Writes a "How Might We" framing as the guiding design question.

**Required output to move forward:**
- Sensing Summary: insights, reframes, questions
- List of at least 3 key assumptions to test
- A clear HMW statement
- Signed-off problem framing (designer + PM alignment)

**AI behaviour:** Surfaces related research and past decisions from the knowledge base. Does NOT rush the designer. Time nudges are soft, private, and framed as support — never as warnings.

---

### Stage 2b: FRAME
*Define what problem is actually being solved*

Designer articulates the problem in their own words, defines success criteria and constraints, and optionally notes divergence from the PM's original brief. The Design Frame becomes the north star — referenced in all subsequent stages.

**Required output:**
- Designer's problem articulation
- Success criteria
- Discovered constraints
- Divergence from PM brief (flagged as conversation starter, not error)

**AI behaviour:** Compares designer's frame with PM's original. Highlights differences. This surfaces alignment gaps early — before any design work is invested.

---

### Stage 2c: DIVERGE
*Divergent thinking — quantity over quality*

Designer generates 2–5+ directions. These are not refined designs — they are distinct conceptual approaches. No direction is evaluated yet. The goal is breadth.

**Required output:**
- Minimum 3 distinct directions documented in the stream (enforced by system)
- Rationale for each direction (1–2 sentences: "This direction assumes X. It works if Y is true.")
- Figma links, sketches, reference boards, flow alternatives — all valid

**AI behaviour:** Summarises directions for stakeholders. Does NOT rank or rate designs. If all directions look similar, AI flags: *"These directions look similar. Want to explore a fundamentally different approach before narrowing?"*

---

### Stage 2d: CONVERGE
*Narrow to refined solution through critique and iteration*

Designer selects 1–2 directions to take forward. Each is stress-tested against: assumptions from Sense (do they hold?), edge cases and failure states, technical feasibility (async input from dev), and business constraints.

**Required output:**
- Direction selected with documented rationale
- Assumption confidence rating per direction (High / Medium / Low)
- Dev feasibility input logged
- Decision log: what chosen, what killed, why

**Conditional route — VALIDATE:** If all remaining directions have low assumption confidence, the stream routes to Validate before Prove. If confidence is medium or high, it proceeds directly to Prove. Validate is not mandatory — low-risk changes skip it entirely.

> Validate methods: Desirability → user interviews, concept testing. Usability → prototype testing. Viability → stakeholder review, feasibility spike. AI synthesises findings into a recommendation.

---

### Stage 2e: PROVE (Quality Gate)
*3-sign-off validation before dev*

One direction is developed to handoff quality. Figma link is attached (auto-versioned on significant updates). Edge cases, states, and interactions are fully designed. Design decisions are logged inline.

**Required output:**
- Figma file at handoff quality
- All edge cases documented
- Decision log complete
- Validation Gate: all 3 sign-offs received

**Sign-off cards:**

| Approver | Status Options | Notes |
|---|---|---|
| Designer | Approve / Approve with comments / Request changes | Self-certification of handoff quality |
| PM | Approve / Approve with comments / Request changes | Confirms design addresses the problem |
| Design Head | Approve / Approve with comments / Request changes | Quality and consistency bar |

If rejected: loops back with structured feedback logged. Engineering feasibility review runs async (non-blocking). Request cannot move to Handoff until all 3 sign-offs are received.

---

### Design Phase Summary

| Stage | What it is | AI Role | Time-aware? | Mandatory? |
|---|---|---|---|---|
| **SENSE** | Understanding deeply | Surfaces research | Soft nudge only | ✅ Always |
| **FRAME** | Define the problem | Flags PM divergence | None | ✅ Always |
| **DIVERGE** | Generate options | Similarity check | Quality, not time | ✅ Always |
| **CONVERGE** | Pressure-test | Edge cases, decision log | None | ✅ Always |
| **VALIDATE** | Test assumptions | Synthesis + recommendation | None | ⚡ Conditional |
| **PROVE** | Execute + sign off | Handoff checklist | None | ✅ Always |

---

## 5. Phase 3 — Build

*Owner: Developers · Purpose: Build and ship*

### Handoff

Figma version is LOCKED at the point of Prove completion. Lane auto-generates a handoff document containing: specs, edge cases, accessibility notes, engineering notes, and the full decision log. A Figma webhook activates for post-handoff change detection.

### Dev Kanban

The build phase is the only place in Lane with a traditional kanban structure. This is intentional — development work is linear and execution-focused in a way that design work is not.

```
To Do → In Progress → In Review → Design QA → Done
```

Design QA is REQUIRED. Dev cannot ship without designer confirmation. Post-handoff Figma changes trigger alerts: dev (urgent), PM (FYI), Design Head (FYI). Change requests go through a mini Shape → Prove loop.

---

## 6. Phase 4 — Impact

*Owner: PMs · Purpose: Measure what happened*

### Measure

After a configured period post-ship, Lane prompts the PM: *"Time to log actual impact."* PM enters the actual result. Lane calculates variance against the predicted impact logged at intake. AI generates an impact narrative.

### PM Calibration

Each PM builds a rolling accuracy score over time. Framed as calibration, not scoring. Visible to PM and their leads only.

**Example:** PM predicted +5% conversion. Actual: +4.2%. Variance: -16%. Over a quarter, if average variance is -12%, the system surfaces: *"This PM tends to over-predict. Calibration conversation recommended."*

This prevents "every idea is urgent" culture, holds PMs accountable for impact claims, and builds real trust over time. The data is not punitive — it's developmental.

---

## 7. AI Capabilities

| Capability | What It Does | Moat Level |
|---|---|---|
| Intake Gate Classification | Classifies requests as problem_framed / solution_specific / hybrid. Blocks solution-specific. Suggests reframes. | High |
| Auto-Triage | Assigns priority (P0–P3), complexity (S/M/L/XL), and type — all with reasoning. Not dropdowns. | Medium |
| Duplicate Detection | Semantic search via pgvector embeddings across all requests. | Medium |
| Smart Assignment | Capacity + skills + context-switching cost + growth opportunity. Presents options with reasoning. Lead approves. | High |
| Private Designer Nudges | Contextual, friendly, private. Framed as questions. Never escalated to leads automatically. | High |
| **Weekly Digest** | Auto-generated every Friday. Narrative format covering shipped work, team health, throughput, and AI recommendations. | **Highest — core moat** |
| Morning Briefing | Daily 30-second role-specific brief. Pushed, not pulled. | High |
| Impact Comparison | Predicted vs. actual, narrative generation, PM calibration scoring. | High |
| Edge Case Generator | "What happens if...?" suggestions during Converge stage. | Medium |
| Handoff Checklist | Auto-generated from design file analysis. Missing states, accessibility gaps. | Medium |
| Idea Validation | Scores ideas on impact, effort, feasibility. Recommends approve/reject. | Medium |

### The Weekly Digest — Killer Feature

Auto-generated every Friday. Narrative format, not a dashboard. This is the feature that design leads will pay for.

```
📊 WEEKLY DESIGN TEAM DIGEST

🚢 SHIPPED THIS WEEK
• Dark Mode (Ananya) — impact: ₹2.3Cr estimated
• Holi banners (Sneha) — impact: ₹800Cr estimated

🧠 TEAM HEALTH
Throughput: 4 items/week ✅
Capacity: 2 designers stretched, 1 available

💡 AI RECOMMENDATIONS
1. Reassign Payments work — Ananya approaching appetite limit
2. Checkout redesign entering Converge — PM review needed soon
3. 2 requests deferred 3+ cycles — decision needed
```

---

## 8. Design Philosophy — Accountability Without Surveillance

Lane is built for designers, not about designers. This distinction shapes every product decision.

### The Problem with Existing Tools

Jira, Linear, and Asana were built on a core assumption: visibility = control. This works tolerably for development work, where tasks are discrete and outputs are binary. It fails catastrophically for design work, where the most valuable activity — thinking, questioning, exploring — is invisible to any tracker.

When designers are tracked by task completion, they optimise for task completion. They ship faster, explore less, and make worse decisions. The tool creates the problem it claims to solve.

### Hard Build Constraints — NEVER Build These

These are not guidelines. They are hard constraints. No admin toggle. No "optional feature."

- ❌ Individual utilisation percentages visible to leads
- ❌ "Last active" or "last seen" timestamps anywhere
- ❌ Individual activity feeds visible to anyone except the individual
- ❌ Per-designer speed comparisons or velocity rankings
- ❌ Time-per-task tracking or timers
- ❌ Automatic escalation of designer silence to leads
- ❌ "Overdue" labels on design work
- ❌ Leaderboards ranking individual designers

### ALWAYS Build These

- ✅ AI nudges go to the designer PRIVATELY first
- ✅ Leads see TEAM health signals, not individual surveillance
- ✅ Designers set their own capacity preferences
- ✅ Reflections are the designer's own words, not forced status updates
- ✅ Every AI recommendation includes reasoning — no black boxes
- ✅ Every AI suggestion is override-able by humans
- ✅ The intake gate blocks solution-specific requests
- ✅ Impact is measured at the PM level, not the designer level

### The Trust Equation

A designer who uses Lane should feel:
- *"This helps me stay oriented in my own work."*
- *"This documents my thinking so I don't have to repeat myself in meetings."*
- *"This shows my impact without me having to advocate for myself."*

Not:
- *"My manager can see exactly what I'm doing."*
- *"I need to update this so I don't get in trouble."*
- *"This is just Jira with a design skin."*

> *If designers feel watched, they game the system. If they feel supported, they use it honestly. Honest usage produces real data. Real data produces actual insight for design leads.*

---

## 9. Role-Based Visibility

**This is the bible for what each role sees. Reference before building ANY dashboard or view.**

| Data Point | Designer (own) | Designer (peer) | PM | Lead | Admin |
|---|---|---|---|---|---|
| Own work portfolio | ✅ | ❌ | Status only | ✅ | ✅ |
| Own reflections | ✅ | ❌ | ❌ | ❌ | ❌ |
| Team health signals | ❌ | ❌ | ❌ | ✅ | ✅ |
| Individual utilisation % | ❌ NEVER | ❌ NEVER | ❌ NEVER | ❌ NEVER | ❌ NEVER |
| "Last active" timestamp | ❌ NEVER | ❌ NEVER | ❌ NEVER | ❌ NEVER | ❌ NEVER |
| Request status (PM's requests) | N/A | N/A | ✅ | ✅ | ✅ |
| PM accuracy score | N/A | N/A | ✅ own | ✅ org | ✅ |
| Dev kanban | ✅ | ✅ | ✅ | ✅ | ✅ |
| Impact records | ✅ | ✅ | ✅ | ✅ | ✅ |
| Betting Board | View only | View only | View only | ✅ decide | ✅ |
| AI morning briefing | ✅ own | ❌ | ✅ own | ✅ team | ✅ |

---

## 10. UI Language Guide

Use these terms in all UI copy, labels, buttons, and empty states. Language shapes how designers feel about the product.

| Instead of... | Lane says... | Why |
|---|---|---|
| Ticket | Request | Requests come from people with problems |
| Task | Work item | Design isn't a task to check off |
| Overdue | Appetite exceeded | Budgets, not deadlines |
| Due date | Appetite | Design has budgets, not deadlines |
| Status update | Reflection | Designers share thinking |
| Sprint | Cycle | Less pressure, same cadence |
| Velocity | Throughput | Output, not speed |
| Assign | Recommend + Approve | AI recommends, humans approve |
| Utilization | Capacity | People have capacity, not utilization rates |
| Blocked | Needs input | Agency, not helplessness |
| Backlog | Deferred | Nothing rots |

### AI Nudge Tone

Every AI nudge must pass this test before it ships:

✅ *"Hey — it's been a while since the checkout flow got some attention. Everything okay? [I'm blocked] [Still thinking] [Forgot to update]"*

❌ *"You haven't updated the checkout flow in 5 days. Please update your status."*

✅ *"The lending flow is approaching its appetite. Want to adjust, or is it wrapping up?"*

❌ *"OVERDUE: Lending flow has exceeded its deadline by 2 days."*

---

## 11. Technical Stack

| Layer | Technology |
|---|---|
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

## 12. Build Roadmap

| Weeks | Phase | Key Deliverables |
|---|---|---|
| 1–2 | Foundation | Schema update for v2 stages, intake gate + classification, role-specific My Work home, org tree + visibility cascade |
| 3–4 | AI Brain | AI intake classification, auto-triage, duplicate detection (pgvector), assignment recommendation, request quality scoring |
| 5–6 | Design Phase | 5-stage design flow (Sense → Frame → Diverge → Converge → Prove), Design Frame, iteration management, reflection system, feedback threads, Figma link management, 3-sign-off Prove gate |
| 7–8 | Build + Impact | Dev kanban, handoff doc generation, Figma webhook + post-handoff alerts, impact logging, PM calibration |
| 9–10 | The Voice | Weekly AI digest, private designer nudges, capacity dashboard, Idea Board |
| 11–12 | Polish + Beta | Morning briefing, betting board view, journey view, bug fixes, performance, 10–15 paying customers |

### What's Not Building — MVP

- Slack notifications → use Zapier temporarily
- Email digest → activity feed in-app is sufficient
- Auto-comment in Figma → low ROI
- Detailed Figma change diffs → link to Figma is enough
- Version comparison tool → defer 6+ months
- Linear integration → Month 3
- Figma plugin → defer 6+ months
- Mobile app → responsive web only
- Individual utilisation % → NEVER (anti-surveillance)
- Designer speed rankings → NEVER (anti-surveillance)

---

## 13. What Makes Lane Different

| Dimension | Jira / Linear / Asana | Lane |
|---|---|---|
| Optimises for | Task speed | Decision quality |
| Core unit | Task / ticket | Problem |
| Design workflow | Kanban (wrong model) | Non-linear 5-stage exploration |
| PM accountability | None | Calibration score |
| Designer visibility | Surveillance by default | Support by default |
| AI role | None / cosmetic | Operations intelligence |
| Impact tracking | None | Predicted vs. actual with PM calibration |
| Post-handoff | Designer disappears | Designer stays involved via Design QA |

> *Every tool assumes: Work = Tasks. Reality: Work = Decisions.*

---

## 14. Founder Context

Lane is being built by the Head of Product Design at Airtel Payments Bank — a fintech at scale, running a team of 8 designers. This isn't a tool designed from the outside. It's designed from inside the exact problem it's trying to solve.

- Building: Lane as a side venture, solo founder
- Stage: Live GTM, leads flowing in on LinkedIn
- Build method: Vibe-coding with Cursor + Claude Code
- Timeline: 12-week sprint to MVP; 10–15 customers by Week 12
- Goal: $5–20K MRR lifestyle business

---

> *Lane is a tool where PMs bring problems (not solutions), designers explore scientifically (not execute tickets), and leads see team health (not individual surveillance). The AI runs operations. Humans steer.*

**Surveillance produces performance. Support produces truth. Lane optimises for truth.**

---

*Version 1.0 · April 2026 · Confidential*