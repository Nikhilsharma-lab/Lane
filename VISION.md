# Lane — Product Vision
## Where we're going and why it matters

*Internal document. Last updated: April 5, 2026.*

---

## The One-Paragraph Vision

Lane starts as the operating system for design teams — replacing chaos with a structured 4-phase model. It evolves into an AI that runs design operations autonomously: classifying problems, briefing designers, grading predictions, generating handoff docs, measuring impact, and surfacing risks before anyone notices them. By v3, the design leader's job shifts from managing operations to approving decisions the AI surfaces. Lane becomes the chief of staff that every design team always needed but could never afford.

```
╔═══════════════════╗     ╔═══════════════════╗     ╔═══════════════════╗
║  v1 — Foundation  ║────▶║ v2 — Intelligence  ║────▶║   v3 — Agentic    ║
║   Months 0–3      ║     ║   Months 3–8       ║     ║   Months 8–18     ║
╠═══════════════════╣     ╠═══════════════════╣     ╠═══════════════════╣
║ Structured ops    ║     ║ AI runs ops        ║     ║ Lane is operator  ║
║ Humans do it all  ║     ║ Humans steer       ║     ║ Humans approve    ║
║ 4-phase workflow  ║     ║ 9 killer features  ║     ║ Lane Agent        ║
║ ✅ Built & live   ║     ║ 🔨 In progress     ║     ║ 🔭 On the horizon ║
╚═══════════════════╝     ╚═══════════════════╝     ╚═══════════════════╝
```

---

## Who This Is For

**The customer:** A design lead or Head of Design at a startup with a 5–15 person design function. They're not at a consultancy — they're embedded in a product company, managing requests from multiple PMs across 2-4 product lines. They have a team of designers who are talented but operating in chaos they didn't create.

**Their current Monday morning:**
They open Slack and spend 20 minutes reconstructing what's actually happening — DMing designers for status updates, skimming Notion docs that are weeks out of date, chasing a PM about a request that's been "in design" for three weeks with no signal. They have a standup in 40 minutes and genuinely don't know who's blocked.

They're not bad at their job. They're managing a system that wasn't designed for design.

**What they're hiring Lane to do:**
Replace the Slack pings, Notion docs, and spreadsheet workarounds with one structured system that tells them — without asking — what's happening, what's at risk, and what needs a decision. Not a dashboard they have to remember to check. A briefing that comes to them.

**What they're not hiring Lane to do:**
Track their designers. Grade their team. Generate reports for their VP. They've seen enough "team productivity" tools to know what surveillance looks like dressed up as insight. They'll kill a tool the moment a designer complains it feels like they're being watched.

**The hiring bar:** Lane earns its seat at the table the first time a design leader forwards the weekly digest to their VP of Product without having written a single word of it.

| Without Lane | With Lane |
|---|---|
| 20 min reconstructing status every Monday | Friday digest lands in inbox automatically |
| Slack DMs to find out who's blocked | Design Radar shows it in under 10 seconds |
| Figma link dropped in a comment at handoff | AI-generated handoff brief with decisions, edge cases, build sequence |
| "What happened to that request?" | Full audit trail on every transition |
| PM submits a solution, not a problem | AI intake gate blocks it before it enters |
| No idea if design is moving a metric | PM calibration score tracks prediction vs. actual |

---

## Where We Are Now (v1 — Foundation)

```
  PREDESIGN          DESIGN             BUILD              TRACK
  (PM + Org)         (Designers)        (Developers)       (PMs)
┌────────────┐    ┌─────────────┐    ┌────────────┐    ┌────────────┐
│ Intake     │    │ Explore     │    │ To Do      │    │ Measuring  │
│ Context    │───▶│ Validate    │───▶│ In Progress│───▶│            │
│ Shape      │    │ Handoff     │    │ Design QA  │    │ Complete   │
│ Bet        │    │             │    │ Done       │    │            │
└────────────┘    └─────────────┘    └────────────┘    └────────────┘
  AI gates             3 sign-offs      Figma locked     PM calibration
  solution requests    required         at handoff       score updated
```

What's built and shipped:

- **4-phase workflow** — Predesign → Design → Build → Track
- **AI intake gate** — blocks solution-specific requests, forces problem framing
- **3-sign-off validation** — designer + PM + design head all required before handoff
- **Figma OAuth** — tokens encrypted at rest (AES-256-GCM), version locked at handoff
- **Role-based access** — strict visibility rules, anti-surveillance by design
- **System comment timeline** — full audit trail of every transition
- **Email notifications** — stage transitions, validation, handoffs
- **Org invites** — with privilege escalation controls

**The v1 promise:** Every design request enters as a problem, moves through a structured process, exits with a measurable outcome.

**The activation moment:** A design leader forwards the Friday digest to their VP — unsolicited, no editing required — and the VP replies "this is exactly what I've been asking for." That's the moment Lane stops being a workflow tool and starts being irreplaceable. Everything in v2 is designed to manufacture that moment faster.

---

## The Linear Parallel

Linear launched in 2020 as "opinionated issue tracking for engineers." By 2026 they declared "issue tracking is dead" — pivoting to Linear Agent, where AI generates and executes work from context rather than humans manually managing tickets.

Their arc: **Task tracker → Intelligence layer → Autonomous agent.**

Lane follows the same arc, but for design:

| Linear | Lane |
|--------|------|
| Issue tracking for engineers | Design ops for designers |
| Sprint cycles | Problem cycles (Predesign → Impact) |
| Issues as tickets | Requests as problems flowing through clarity |
| Agent writes code, closes tickets | Agent runs ops, surfaces decisions |
| "Issue tracking is dead" | "Request tracking is dead" |

The critical difference: Lane's loop is longer and richer. Linear tracks tasks. Lane tracks the journey from *business problem → design exploration → dev build → measured business outcome*. That longer loop means more context, more AI surface area, and a moat Linear can't cross without rebuilding from scratch.

---

## v2 — Intelligence (Month 3–8)
*The AI starts running ops. Humans steer.*

### The 7 Killer Features (internal priority order)

**Already specced and approved — build in this order:**

#### KF1: Speed Layer ✅ Built
Cmd+K command palette, J/K navigation, Cmd+N quick capture, optimistic UI. The product feels instant.

Lane should feel as fast as Linear. Every interaction is optimistic — the UI updates immediately, the server catches up. Zero loading spinners on primary actions. This isn't a performance feature — it's a product philosophy. A tool designers trust has to feel like an extension of their thinking, not a form they fill out.

*Why it matters:* Slow tools create friction that translates to avoidance. If Lane feels heavy, designers route around it.

#### KF2: Design Radar
The Design Head's Monday morning view. One page, under 10 seconds, answers: who's working, who's stuck, what's at risk, what shipped this week.

- Designer status cards: 🟢 In Flow / 🟡 Idle / 🔴 Blocked/Stuck
- Phase heat map: count of requests in each phase across the org
- Risk panel: stalled requests, sign-off overdue, post-handoff Figma drift
- Shipped this week: full cycle time + design/dev breakdown

*Why it matters:* Design Heads currently have zero visibility without Slack pings. This replaces a Monday standup.

#### KF3: AI Context Brief
When a designer opens a request in the design phase for the first time, an AI-generated brief appears immediately — synthesising everything the PM wrote into the 5 things a designer needs before touching Figma:

1. What this actually means (plain language rewrite)
2. Related past work from the org (auto-linked)
3. Key constraints (non-negotiables extracted from the brief)
4. Questions to ask before starting (specific, not generic)
5. Exploration directions (starting points, not answers)

Generated once, cached forever, silent fail if AI is down.

*Why it matters:* Eliminates the 20–30 minute "what does this PM actually mean?" cycle that starts every design project.

#### KF4: Handoff Intelligence
Three sub-features that make the design→dev handoff intelligent:

1. **Handoff Brief** — AI-generated brief for devs the moment handoff happens: design decisions, open questions, build sequence, Figma notes, edge cases to handle
2. **Dev Questions Score** — "Ask Designer" button in dev phase; questions per handoff aggregated per designer; Design Head sees avg on Radar (coaching signal, not performance score)
3. **Figma Drift Email** — push email to dev owner when designer updates Figma post-handoff

*Why it matters:* The current handoff is a Figma link in a comment. Devs start building the wrong thing and nobody knows until Design QA.

#### KF5: Impact Intelligence
Three sub-features closing the PM accountability loop:

1. **Prediction Confidence Score** — AI grades the PM's impact prediction at Shape stage, before the bet. Score: realistic / optimistic / vague / unmeasurable. Surfaces before resources are committed.
2. **Design ROI** — aggregate view by request type: do feature requests move metrics more than bug fixes? Which types are chronically over-promised? Pure SQL, no AI needed.
3. **"What We Learned" Brief** — retrospective AI brief after PM logs actual impact. Headline, what happened, likely reasons for the gap, one thing to do differently next time. Celebrates over-delivery.

*Why it matters:* No other tool holds PMs accountable for impact predictions. This is Lane's most unique data asset — it compounds over time.

#### KF6: Proactive Alerts
AI-decided push notifications to the Design Head:
- Designer stuck for 5+ days → private nudge to designer first, then flag to lead if no movement
- Sign-off overdue 3+ days → alert PM and design head
- Bet deferred 3+ times → "Kill it or bet on it" prompt
- Post-handoff Figma drift unreviewed 24h → urgent dev alert

*Why it matters:* Design Heads shouldn't have to monitor a dashboard. The system comes to them.

#### KF7: AI Pre-flight Check
Before a PM submits a request, AI rates the quality of their impact prediction in real time. Runs before triage, not after. Builds PM accountability from the first interaction.

#### KF8: Dev Board
Dedicated `/dashboard/dev` view for developers — their own morning cockpit alongside the Design Head's Radar.

- Kanban: To Do → In Progress → In Review → Design QA → Done
- Drag-and-drop with keyboard shortcuts (J/K navigation, Cmd+Enter to advance)
- Slide-over detail panel: design specs, Figma link, handoff brief, open questions
- Design QA gate is required — devs cannot mark Done without designer sign-off
- Post-handoff Figma drift surfaces inline with "Review changes" CTA

*Why it matters:* Every role needs their own morning view. Design Head has Radar, designers have their work queue, devs have the kanban. Lane becomes the one tab everyone keeps open — and the product can't be dismissed as "just a designer tool."

#### KF9: Projects
Orgs can manage multiple product lines from a single Lane workspace.

- Projects as a scoping layer above requests: each request belongs to a project
- Project switcher in the dashboard sidebar — instant context switch
- Radar, digest, and calibration scores are all project-scoped
- Design Head sees cross-project view; designers scoped to their assigned projects

*Why it matters:* Design teams at scale aren't working on one product — they're managing checkout, onboarding, mobile, and brand simultaneously. Projects make Lane viable for orgs managing multiple product lines without everything colliding in one undifferentiated list.

---

### v2 Also Includes

**Weekly Digest** — AI-written narrative every Friday. What shipped, what's blocked, what needs a decision. No dashboards required — the product comes to you. Role-specific:
- Design Head: team throughput, capacity signals, risk summary, recommendations
- PM: their requests' status, impact accuracy trending
- Designer: their active work, appetite status, pending actions

**Daily Morning Briefing** — 30-second role-specific brief pushed to email:
- Design Head: "3 bets pending, 1 designer flagged, 2 sign-offs overdue"
- Designer: "You have 2 active requests, checkout flow is in Converge — PM hasn't reviewed in 4 days"
- Dev: "2 items in Design QA waiting for your review"

**PM Calibration Dashboard** — Predicted vs. actual impact tracked over time, trend charts, PM-to-PM comparison (visible to lead only). Framed as calibration, never as scoring.

**Track & Insights v2** — Closes the loop with richer signal:
- Variance displayed immediately after PM logs actual impact ("You predicted +12% conversion. Actual: +4.2%. Gap: –65%.")
- PM coaching notes embedded directly in the weekly digest — not a separate tab, not an email, just context in the narrative they're already reading
- Design ROI by request type: feature requests vs. bug fixes vs. research — which type actually moves metrics at your org? Pure SQL, no AI required, compounds over time
- Unified "Generate" action that produces digest + coaching notes in a single trigger instead of two separate flows

**Idea Board** — Anyone submits ideas, org votes anonymously, AI validates top-voted, approved ideas auto-create requests. Democratises problem sourcing beyond PMs.

---

## v3 — Agentic (Month 8–18)
*Lane stops being a tool and becomes an operator.*

This is Lane's "issue tracking is dead" moment.

**The thesis:** Request management is dead. Design leaders shouldn't manage requests — they should approve decisions that an AI surfaces. Lane runs design operations autonomously and brings humans in for judgment calls only.

### Lane Agent

Natural language interface grounded in your org's full context:

- *"Show me everything blocked in validate this week"*
- *"Which requests have been in explore for more than 8 days without a reflection?"*
- *"Summarise all sign-off rejections from the last month — what are designers being sent back for?"*
- *"Draft a betting board for this cycle based on capacity and priority"*

The agent understands your org's history, team capacity, past decisions, and current risk signals. It doesn't just search — it reasons.

### What the Design Leader's Job Looks Like at v3

It's Tuesday morning. They open Lane. There's one notification.

> *"3 decisions need you today: (1) The payments redesign bet has been in Shape for 9 days — context brief is ready, confidence score is Realistic. Bet it or defer? (2) The onboarding flow hit Design QA — designer approved, dev has 2 open questions. (3) Priya flagged she needs input on the lending flow. She asked you directly — not escalated, her choice."*

That's it. Everything else ran overnight. The weekly digest went to their VP at 8am. The PM calibration scores updated automatically. Two deferred requests were surfaced with a recommended kill or bet. A Zendesk spike got grouped into a draft request for their review.

They spend 11 minutes approving the bet, reading the QA questions, and messaging Priya. Then they go back to design work — the thing they were hired for.

**What they no longer do:** Chase status updates. Run standups to reconstruct reality. Write Friday summaries. Manually assign requests. Read every Figma notification.

**What only they can do:** Approve bets. Reject directions. Decide which problems matter. Coach designers. Set the creative bar.

The agent runs the ops. They lead the design.

### Skills System (Lane's answer to Linear's Skills)

Save agent conversations as reusable org-wide workflows:

- **Weekly Bet Review** — agent pulls all bet-ready concepts, summarises context, surfaces AI-weighted recommendations for Design Head
- **Onboard New Designer** — creates orientation requests, assigns buddy, sets initial capacity
- **Pre-cycle Prep** — surfaces deferred items, flags stale requests, drafts capacity plan
- **Friday Digest Run** — generate and send digest for all orgs (agent-triggered cron)

Skills compound over time. The more you use Lane, the more it learns your org's patterns.

### Figma Agent

Connects to Figma files directly, not just links:

- Reads actual file content to generate handoff checklists (not just what the designer wrote)
- Detects exactly what changed post-handoff: "Button label updated from 'Submit' to 'Pay now'. Error state for timeout removed. Dev needs to review 2 components."
- Compares approved version vs. current file automatically, flags drift with specifics
- Flags accessibility issues in the file: missing alt text, insufficient contrast, unlabelled interactive elements

### Cross-Tool Context

Lane becomes the connective tissue of the product team's tool stack:

**Inbound:**
- Customer feedback from Intercom/Zendesk → auto-creates requests with evidence pre-filled
- Support ticket spikes → AI groups them, suggests a request, presents for PM approval
- Analytics anomalies (if connected) → surfaces as context on related requests

**Outbound:**
- Approved handoffs → auto-create Linear/Jira dev tickets with AI-generated specs
- Shipped requests → push impact measurement reminder to PM
- Weekly digest → Slack DM to Design Head (not just email)

### The Autonomous Ops Loop

At full maturity, Lane's agent runs a daily operations cycle without human input:

```
Every morning:
  → Scan all active requests for risk signals
  → Classify designer status (in flow / idle / stuck / blocked)
  → Check sign-off queues for overdue items
  → Flag post-handoff Figma drift unreviewed >24h
  → Generate morning briefings per role
  → Push alerts for decisions that need humans

Every Friday:
  → Generate weekly digest per org
  → Update PM calibration scores
  → Surface deferred items for kill-or-bet decision
  → Suggest cycle capacity plan for next week

Every time a request completes impact:
  → Generate "What We Learned" retrospective
  → Update Design ROI by request type
  → Update PM calibration rolling score
```

Humans approve bets, sign off on designs, log actual impact. Everything else, Lane runs.

---

## Success Criteria Per Version

How we know when to shift gears — not arbitrary timelines, but observable signals.

### v1 is complete when:
- 3+ design teams are running all requests through Lane (zero Notion/Slack workarounds)
- A design leader has forwarded the weekly digest to their VP without editing it
- Zero security incidents; Figma tokens encrypted; all phase transitions atomic
- Onboarding a new org takes under 30 minutes with no support from us

### v2 is complete when:
- Design Radar replaces at least one standing Monday standup for a customer
- The AI Context Brief is used on >80% of new requests (not dismissed)
- A PM has changed a decision based on their Prediction Confidence Score
- At least one customer renews solely citing the weekly digest as the reason
- Average time-to-handoff measurably shorter than before Lane (tracked via `request_stages`)

### v3 is complete when:
- A design leader goes 5 working days without manually checking Lane — the agent surfaces everything that needed attention
- Lane generates a complete betting board recommendation that the Design Head approves with fewer than 3 edits
- At least one org connects an inbound integration (Intercom or Zendesk) and Lane auto-creates requests with evidence that PMs treat as real
- A customer describes Lane as "the chief of staff I never had"

---

## Business Model & Feature Tiers

Flat-rate pricing. No per-seat confusion.

| Tier | Price | Target | What unlocks |
|------|-------|--------|--------------|
| **Starter** | $99/mo | 1–3 designer teams | Core 4-phase workflow, AI intake gate, Figma OAuth, weekly digest |
| **Professional** | $299/mo | 4–10 designer teams | Design Radar, AI Context Brief, Handoff Intelligence, Projects, Dev Board, PM Calibration |
| **Enterprise** | Custom | 10+ seats, SLAs | Lane Agent, Skills System, Figma Agent, cross-tool integrations, dedicated support |

**The build filter:** Every feature decision should answer "which tier does this unlock, and does it justify the price gap?" Projects and Dev Board expand Lane's audience from the design team to the whole product team — that's the Professional upgrade trigger. Lane Agent is the Enterprise lock-in.

Annual prepay: 8% discount. Framed as "buy the year, get a month free" — not as a discount.

---

## The Moat

What makes Lane genuinely defensible as the agentic layer matures:

### 1. Design-specific context
Lane's AI understands design workflows natively — intake gates, exploration stages, 3-sign-off validation, handoff quality, post-handoff drift. Linear's agent understands engineering sprints. They can't swap context models without rebuilding the product.

### 2. Anti-surveillance as a feature
Design teams won't adopt tools that make them feel watched. Lane is the only product in this space that makes anti-surveillance a hard product constraint, not a marketing claim. Design leaders will choose Lane because their team will actually use it — and they'll know exactly why.

### 3. The impact loop
No other tool closes the loop from problem → design → build → measured outcome, and then uses that data to grade PM predictions, track calibration over time, and surface Design ROI by type. This data compounds. After 6 months of use, Lane knows which PMs consistently over-predict, which request types deliver impact, and what the team's average cycle time is by complexity. That's an organisational intelligence asset nobody else has.

### 4. Skills that learn your org
The longer you use Lane, the more the agent understands your team's patterns, decision history, and naming conventions. That's genuine lock-in that doesn't feel like lock-in — it feels like the tool getting smarter.

### 5. The weekly digest
An AI-written narrative that a design leader can share with their VP on Friday afternoon, showing what the team shipped, what's at risk, and what impact was measured — with no manual effort. If this lands correctly, it becomes the most-read document in the design team's week. That's product-led growth inside the org.

---

## What We're Not Building

Some things belong in the roadmap but not in the product:

- **Per-designer speed comparisons** — Never. Anti-surveillance is non-negotiable.
- **"Last active" timestamps** — Never. This is surveillance.
- **Individual utilization percentages** — Never. Teams have health, people have capacity.
- **Time-per-task tracking** — Never. Appetites are budgets, not timers.
- **Figma plugin (MVP)** — Links are sufficient. Plugin is a power-user feature for Month 6+.
- **Mobile app** — Responsive web only. Design leads work at desks.
- **Slack integration (MVP)** — Zapier bridges this. Native integration is Month 3.
- **Jira integration (MVP)** — Build queue is inside Lane. Jira push is Month 3.

---

## The Category Redefinition Moment

Linear said: *"Issue tracking is dead."*

Lane's equivalent: **"Request tracking is dead."**

The old model: PMs submit requests → designers pick them up → nobody measures what happened.

The Lane model: Problems enter → AI shapes, routes, and briefs → designers explore → AI validates quality → dev builds with AI-generated specs → impact is measured automatically → PM calibration improves over time.

The design leader doesn't manage the process. Lane runs it. The design leader makes the calls Lane can't: which problems matter, which directions to pursue, which bets to approve.

*AI runs the ops. You lead the design.*

---

*Version 2.0 | April 2026*
*Next review: When first 3 paying customers are onboarded — validate ICP assumptions against real usage*
