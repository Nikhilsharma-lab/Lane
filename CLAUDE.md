# DesignQ — Complete Product & Development Reference (Updated)

**Status:** Pre-launch, live GTM (LinkedIn strong)  
**Current Sprint:** Weeks 1-4 MVP build (Predesign Phase)  
**Last Updated:** April 1, 2026  
**Next Review:** April 15 (Week 2 checkpoint)

---

## TLDR

DesignQ is an **AI-native design operations command center** organized into **4 phases** based on who's working and what they're doing.

**What it does:** PM creates request → Org votes on ideas → Designer designs → Dev builds → PM measures impact

**Who it's for:** Design leaders at startups with 5-15 person teams  
**Business model:** $99 Starter, $299 Professional, Custom Enterprise (flat-rate, annual prepay)  
**GTM:** Content-driven (LinkedIn, Twitter/X, Reddit), lead magnet (Chaos Calculator)  
**Timeline:** 10-15 paying customers by end of 12-week sprint

---

## Part 1: THE 4-PHASE MODEL

Clear division by **WHO works** and **WHAT they do**:

```
PHASE 1: PREDESIGN      (PM + Org)       ← Decide WHAT to build
PHASE 2: DESIGN         (Designers)      ← Design the solution
PHASE 3: DEV            (Developers)     ← Build and ship
PHASE 4: TRACK & IMPACT (PMs)            ← Measure what happened
```

---

## PHASE 1: PREDESIGN (PM + Org decides what to build)

**Who:** PMs create requests, Org votes on ideas, Design Head bets  
**What:** Intake → Context → Shape → Bet  
**Output:** Clear request + assigned designer ready for design phase

### **Stage 1a: INTAKE**
PM submits request with clarity:
- Problem statement (what's the actual problem?)
- Business goal (why does it matter?)
- User impact (who's affected?)

System checks: All fields present?  
If incomplete: Block, show what's missing  
If complete: Move to CONTEXT

---

### **Stage 1b: CONTEXT**
PM attaches supporting information:
- User data (surveys, interviews, support tickets)
- Research (competitive analysis, market trends)
- Past decisions (why was this tried before?)
- Metrics (current KPIs, targets)

System checks: Sufficient context for designer to start?  
If incomplete: Can't move to shaping  
If complete: Move to SHAPING

---

### **Stage 1c: SHAPE**
PM + Design Head define solution direction (NOT final UI):
- Rough solution sketch
- Constraints (budget, technical limits, timeline)
- Risks (what could go wrong?)
- Appetite (time budget: 1 week? 2 weeks? 1 month?)

System checks: Direction clear? Constraints listed?  
If incomplete: Block betting  
If complete: Concept is "bet-ready"

---

### **Stage 1d: BETTING**
Design Head decides: Build, Kill, or Delay?
- If approved: Budget allocated, designer assigned
- If rejected: Archived (can revisit later)
- If delayed: Moved to backlog

Output: "Ready for design" with assigned designer

---

### **IDEA BOARD (Parallel to Predesign)**

**Anyone in org can submit ideas and vote (anonymous):**

```
IDEA BOARD
├─ Anyone submits idea (title, problem, solution, impact, effort)
├─ Org votes (anonymous upvotes/downvotes)
├─ 1-week voting period
├─ Top-voted idea moves to VALIDATION
└─ AI + Design Head validate:
   ├─ Impact score (realistic?)
   ├─ Effort estimate (correct?)
   ├─ Feasibility score (doable?)
   └─ Decision: APPROVE → Auto-create request in PREDESIGN
```

**Why this matters:**
- Democratizes idea generation (not just PMs)
- Org priority votes (not PM politics)
- Removes roadmap bottleneck
- Ideas come with real team support

---

## PHASE 2: DESIGN (Designers design the solution)

**Who:** Designers (PM, Design Head, team provide feedback)  
**What:** Explore → Validate → Handoff  
**Output:** Approved design, ready for dev

### **Stage 2a: EXPLORE**
Designer creates multiple concepts:
- v1, v2, v3 designed in parallel
- Figma files linked to request
- Team can comment and feedback
- Designer iterates based on feedback

System checks: At least one concept created?  
If incomplete: Designer continues exploring (no gate)  
If ready: Move to VALIDATE

---

### **Stage 2b: VALIDATE (3-Sign-Off Gate)**

**All three must approve before moving to dev:**

**Sign-off 1: Designer ✅**
- Design is complete
- No open questions
- Ready for handoff

**Sign-off 2: PM ✅**
- Design solves original problem
- Business goal achievable
- Impact thesis still valid

**Sign-off 3: Design Head ✅**
- Quality standards met
- Approach is sound
- No technical/design debt

If any reject: Sent back to designer with comments  
If all approve: Move to HANDOFF

---

### **Stage 2c: HANDOFF**
Designer hands off to dev:
- Figma version locked (baseline for tracking changes)
- Designer notes attached (specifications, decisions, questions)
- Dev owner assigned
- Activity feed initialized

**Critical:** Figma webhook activated to track post-handoff changes

Output: Design locked, ready for dev phase

---

## PHASE 3: DEV (Developers build and ship)

**Who:** Developers (Designer stays as observer/supporter)  
**What:** Dev Kanban board (To Do → Done)  
**Output:** Feature shipped to production

### **Dev Kanban States**

```
To Do
  ↓ Dev starts
In Progress
  ↓ Dev submits for review
In Review
  ↓ Issues resolved
QA (optional testing)
  ↓
Done (shipped to production)
```

**Designer's role in dev phase:**
- Observer in kanban board
- Comments on design questions
- Flags if changes needed
- Reviews post-handoff design updates
- Unblocks issues if design-related

---

### **FIGMA SYNC DURING DEV PHASE (MVP Feature)**

**When designer updates Figma, everyone knows immediately:**

```
DESIGNER UPDATES FIGMA
  ↓ (Webhook fires)
DESIGNQ CAPTURES:
  ├─ Who: Ananya
  ├─ When: Mar 28, 2:45 PM
  ├─ What: Color tokens updated
  ├─ File: Dark Mode v3
  └─ Link: [Figma URL]

ACTIVITY FEED UPDATED:
  🎨 Ananya updated Figma — Mar 28, 2:45 PM
     Dark Mode v3
     Changes: Color tokens, font sizes
     [Link to Figma]

IF POST-HANDOFF:
  ⚠️ ALERT: Design updated post-handoff
     Dev review required
     [View update] [Dev confirm]

NOTIFICATION SENT:
  ├─ Dev: URGENT (must review)
  ├─ PM: FYI
  └─ Design Head: FYI
```

**Why this matters:**
- Dev doesn't code against stale Figma
- Post-handoff changes are explicit (not hidden)
- Audit trail (who changed what when)
- Single source of truth (not scattered in Slack)

---

## PHASE 4: TRACK & IMPACT (PMs measure results)

**Who:** PMs measure and record  
**What:** PM enters actual impact, system calculates variance  
**Output:** Impact recorded, PM calibration updated

### **Stage 4a: MEASURE**
PM enters actual result:
```
Feature: Dark mode for mobile
Launched: Mar 15
Predicted impact: +5% retention
Actual measured impact: +4.2%
```

System calculates:
```
Variance: (4.2 - 5) / 5 = -16%
PM Score: "This prediction was 16% off (over-optimistic)"
```

---

### **Stage 4b: PM CALIBRATION TRACKING**

System tracks PM accuracy over time:
```
By end of quarter:
  PM created 10 ideas
  Average variance: -12% (consistently over-optimistic)
  Recommendation: "Calibrate expectations lower"

By next quarter:
  PM created 10 new ideas
  Average variance: +2% (much better)
  Status: "Well-calibrated, predictions accurate"
```

---

## Part 2: CORE OBJECTS & DATA MODEL

### **Request** (Root object)
- Problem statement, Business goal, User impact
- Created by: PM
- Assigned to: Designer
- Phase: predesign | design | dev | track
- Predesign stage: intake | context | shape | bet
- Design stage: explore | validate | handoff
- Dev kanban state: todo | in_progress | in_review | qa | done
- Track stage: measuring | complete

### **Idea** (Crowd-sourced)
- Title, Problem, Proposed Solution
- Author, Category (design | feature | workflow | performance)
- Upvotes/Downvotes (anonymous)
- Status: pending_votes | validation | approved | rejected | archived
- If approved: Links to auto-created request

### **Validation Record** (Design phase gate)
- Designer ✅, PM ✅, Design Head ✅ (all required)
- Can be approved or rejected with conditions

### **Figma Update** (NEW - Design phase tracking)
- Request ID, Figma file URL, file version
- Who changed, When changed, What changed
- Phase at update, Stage at update
- Post-handoff flag (critical in dev phase)
- Activity entry created automatically

### **Dev Handoff** (Design → Dev transition)
- Figma version locked
- Designer notes attached
- Dev owner assigned
- Figma webhook activated

### **Impact Record** (Track phase)
- Request ID, Predicted impact, Actual impact
- Variance calculated, PM calibration score updated

---

## Part 3: DATABASE SCHEMA (UPDATED)

### **requests** (core)
```javascript
{
  id: string,
  
  // Workflow
  phase: 'predesign' | 'design' | 'dev' | 'track',
  predesign_stage: 'intake' | 'context' | 'shape' | 'bet',
  design_stage: 'explore' | 'validate' | 'handoff',
  kanban_state: 'todo' | 'in_progress' | 'in_review' | 'qa' | 'done',
  track_stage: 'measuring' | 'complete',
  
  // Assignment
  created_by_pm: string,
  assigned_to_designer: string,
  assigned_to_dev: string,
  
  // Content
  title: string,
  problem_statement: string,
  business_goal: string,
  user_impact: string,
  
  // Figma
  figma_file_url: string,
  figma_version_id: string, // Locked at handoff
  figma_version_locked_at: timestamp,
  
  // From idea board (if applicable)
  linked_idea_id: string | null,
  
  // Impact
  predicted_impact: string,
  actual_impact: string,
  impact_measured_at: timestamp,
  
  // Timestamps
  created_at: timestamp,
  updated_at: timestamp,
}
```

### **figma_updates** (NEW)
```javascript
{
  id: string,
  request_id: string,
  
  // Figma metadata
  figma_file_id: string,
  figma_file_name: string,
  figma_file_url: string,
  figma_version_id: string,
  
  // Update details
  updated_by: string, // Designer who made change
  updated_at: timestamp,
  change_description: string, // "Updated color tokens"
  change_summary: string, // "2 files, 15 components"
  
  // Context
  request_phase: 'design' | 'dev',
  request_stage: string,
  
  // Post-handoff flag
  post_handoff: boolean, // Critical for dev phase
  dev_reviewed: boolean,
  dev_reviewed_by: string | null,
  dev_review_notes: string | null,
  
  // Tracking
  notification_sent_at: timestamp,
  activity_feed_entry_created: boolean,
}
```

### **ideas** (Idea Board)
```javascript
{
  id: string,
  
  // Content
  title: string,
  problem: string,
  proposed_solution: string,
  category: 'design' | 'feature' | 'workflow' | 'performance',
  
  // Author
  author: string,
  author_display: string | 'anonymous',
  created_at: timestamp,
  
  // Voting
  upvotes: number,
  downvotes: number,
  net_score: number,
  voting_end_date: timestamp,
  
  // Estimation
  user_impact_estimate: string,
  user_effort_estimate_weeks: number,
  target_users: string,
  
  // Validation
  status: 'pending_votes' | 'validation' | 'approved' | 'rejected' | 'archived',
  
  // If approved
  linked_request_id: string | null,
  
  validation: {
    impact_score: number, // 1-10
    effort_estimate: number,
    feasibility_score: number,
    impact_to_effort_ratio: number,
    decision: 'approved' | 'approved_with_conditions' | 'rejected',
    validated_by: string,
    validated_at: timestamp,
    notes: string,
  }
}
```

---

## Part 4: FIGMA SYNC FEATURE (Deferred — OAuth approach)

### Why Webhooks Were Dropped

Figma webhooks require each team to manually register a webhook URL in Figma's developer console. This doesn't scale for multi-tenant SaaS — every new DesignQ customer would need manual setup. **Decision: Replace with Figma OAuth.**

### Planned Approach: Figma OAuth

```
User clicks "Connect Figma" in DesignQ settings
  ↓ (OAuth flow)
DesignQ receives access_token scoped to that user's Figma workspace
  ↓
App polls Figma REST API (GET /v1/files/:key/versions) on a schedule
  OR
App fetches on demand when user opens request with a Figma URL
  ↓
Stores updates in figma_updates table (same schema, works unchanged)
```

**Why OAuth is better for SaaS:**
- Zero setup per team — users click "Connect Figma" once
- Works for every customer automatically
- No webhook URL registration in Figma dev console
- Figma access_token stored securely per org

**When to build:** After email notifications and real-time sync. Not blocking anything.

**What was already built (reusable):**
- `figma_updates` DB table ✅ (works as-is)
- `FigmaHistory` component ✅ (works as-is)
- `GET /api/requests/[id]/figma-updates` ✅ (works as-is)
- `POST .../[updateId]/review` ✅ (works as-is)
- Webhook route `app/api/figma/webhook/route.ts` → will be replaced by a polling/OAuth flow

### How It Works (OAuth version — future)

**Step 1: Figma OAuth Connection**
```
User clicks "Connect Figma" in DesignQ settings
  ↓
Redirect to Figma OAuth: https://www.figma.com/oauth?...
  ↓
Callback: POST /api/figma/oauth/callback
  ├─ Exchange code for access_token
  ├─ Store token against org in DB
  └─ Mark org as figma_connected = true
```

**Step 2: Activity Feed Created**
```
Automatically creates activity entry:
  🎨 Ananya updated Figma — Mar 28, 2:45 PM
     Dark Mode v3
     Changes: Color tokens, font sizes
     [Link to Figma]
```

**Step 3: Post-Handoff Alert** (CRITICAL in dev phase)
```
If (request.phase === 'dev' && figma_updated) {
  ⚠️ Alert: "Design updated post-handoff"
  Flag: dev_reviewed = false
  Notify: Dev (URGENT), PM, Design Head
  Action: Dev must review before continuing
}
```

**Step 4: Version History**
```
REQUEST: Dark Mode
├─ Design Versions
│  ├─ v3 (Mar 28, 2:45 PM) — CURRENT
│  │  └─ Color tokens, font sizes
│  │  └─ [Link to Figma]
│  ├─ v2 (Mar 27, 10:15 AM)
│  │  └─ Dark background, contrast
│  │  └─ [Link to Figma]
│  └─ v1 (Mar 25, 4:30 PM)
│     └─ Initial design
│     └─ [Link to Figma]
```

---

## Part 5: UI/UX VIEWS

### **Request Detail Page**
```
REQUEST: Dark Mode for Mobile
├─ Phase: DESIGN | Designer: Ananya | Status: Validating
│
├─ FIGMA FILES (NEW)
│  ├─ 📄 Dark Mode v3 (CURRENT)
│  │  └─ Updated: Mar 28, 2:45 PM by Ananya
│  │  └─ Changes: Color tokens, font sizes
│  │  └─ [🔗 Open in Figma]
│  │
│  └─ 📄 Dark Mode v2
│     └─ Updated: Mar 27, 10:15 AM
│     └─ [🔗 Open in Figma]
│
├─ VALIDATION GATE (Design phase)
│  ├─ Designer: ✅ Approved
│  ├─ PM: ⏳ Pending
│  └─ Design Head: ⏳ Pending
│
└─ ACTIVITY FEED
   ├─ 🎨 Ananya updated Figma — Mar 28, 2:45 PM
   │  └─ [Link to Figma]
   │
   ├─ 💬 Raj commented — Mar 27, 11:20 AM
   │  └─ "Looks good"
   │
   └─ 🎨 Ananya created design — Mar 25, 4:30 PM
```

### **Dev Phase View** (With Post-Handoff Alerts)
```
REQUEST: Dark Mode for Mobile
├─ Phase: DEV | Dev: John | Kanban: In Review
│
├─ ⚠️ ALERT: Design updated post-handoff
│  └─ Ananya updated Figma on Mar 28
│  └─ Dev review required
│  └─ [View Update] [Dev Confirm Reviewed]
│
├─ FIGMA CHANGES (Post-Handoff)
│  └─ Color tokens v3 (Mar 28, 2:45 PM)
│  └─ Status: ⏳ Dev reviewing
│  └─ [Link to Figma]
│
└─ DEV KANBAN
   ├─ To Do (2 items)
   ├─ In Progress (3 items)
   ├─ In Review (1 item) ← We are here
   ├─ QA (0 items)
   └─ Done (2 items)
```

---

## Part 6: CHECKPOINTS & GATES

### **Phase 1: Predesign**
- ✅ Intake gate: Problem clear?
- ✅ Context gate: Context sufficient?
- ✅ Shaping gate: Direction sound?
- ✅ Betting gate: Design Head approves?
- ✅ Idea validation gate: Upvoted idea validated?

### **Phase 2: Design**
- ✅ Exploration gate: Concepts explored?
- ✅ Validation gate: All 3 sign-offs received?
- ✅ Handoff gate: Figma locked, notes complete?

### **Phase 3: Dev**
- ✅ Dev execution gate: Kanban moving?
- ✅ Post-handoff alert: Designer changed Figma? Flag it!
- ✅ Dev review gate: Dev confirms design update reviewed?

### **Phase 4: Track**
- ✅ Impact gate: Impact measured?

---

## Part 7: AI CAPABILITIES

### **1. Problem Rewriting**
Turns: "Button not working"  
Into: "Users drop off at payment step (32% failure rate)"

### **2. Idea Validation** (Idea Board)
- Impact score: Is prediction realistic?
- Effort estimate: Is timeline reasonable?
- Feasibility: Can we build this?

### **3. Figma Change Detection** (NEW)
- Monitors Figma updates
- Flags post-handoff changes
- Alerts relevant people

### **4. Weekly Designer Report** (KILLER FEATURE)
Auto-generated every Friday:
```
📊 WEEKLY DESIGN TEAM DIGEST

🚢 SHIPPED THIS WEEK
• Dark Mode (Ananya) — 5 days, ₹2.3Cr impact
• Holi banners (Sneha) — 2 days, ₹800Cr impact

🧠 TEAM HEALTH
Throughput: 4 items/week ✅
Avg cycle time: 3.8 days 📈

⭐ STANDOUT
✅ Sneha: Fastest output
✅ Ananya: Highest impact

💡 RECOMMENDATIONS
1. Reassign Payments work to Ananya
2. Riya ready for mid-level growth
3. Deepak needs estimation coaching
```

### **5. PM Calibration Tracking**
- Predicted vs. actual impact
- Variance calculation
- PM accuracy score
- Recommendations for improvement

---

## Part 8: COMPETITIVE DIFFERENTIATION

| Aspect | Jira/Linear | DesignQ |
|--------|---|---|
| **Optimizes for** | Task speed | Decision quality |
| **Core unit** | Task | Request (9-phase thinking) |
| **Workflow** | Kanban only | 4 phases (Predesign → Design → Dev → Track) |
| **Design focus** | No | Yes (3 checkpoints in design phase) |
| **Figma integration** | None | Real-time sync + activity feed |
| **Post-handoff tracking** | None | Designer + Figma sync + dev alerts |
| **PM accountability** | None | Calibration tracking |
| **Idea sourcing** | PM only | Org-wide voting (Idea Board) |
| **Impact measurement** | None | Built-in impact tracking |

---

## Part 9: TECHNICAL STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL via Drizzle ORM) |
| Auth | Supabase Auth + `@supabase/ssr` |
| AI | Claude via Vercel AI SDK |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |
| **Figma Webhook** | Figma API + Vercel Functions |

---

## Part 10: PROJECT STRUCTURE

```
app/
  (auth)/login/
  (auth)/signup/
  (dashboard)/dashboard/
  (dashboard)/requests/[id]/    ← Shows 4-phase progress
  (dashboard)/idea-board/
  actions/auth.ts
  api/
    requests/route.ts
    ideas/route.ts
    figma/webhook.ts            ← NEW (Figma sync)
  layout.tsx

components/
  requests/
  ideas/
  figma/                         ← NEW (activity feed, alerts)
  ui/

db/
  schema/
    users.ts
    requests.ts
    ideas.ts
    figma_updates.ts            ← NEW

lib/
  ai/
    triage.ts
    idea-validator.ts
    designer-report.ts
  figma/                         ← NEW
    webhook-handler.ts
    sync.ts
  supabase/
```

---

## Part 11: DEVELOPMENT PHILOSOPHY

### Founder-Built, AI-Assisted

- **Simplicity > cleverness:** Monolith beats microservices
- **Third-party > custom:** Lean on Supabase, Figma API
- **Ship 70%:** Iterate on customer feedback
- **Specs matter:** AI builds to spec; vague specs = vague code

### Code Conventions

- Server components by default
- Client components only for interactivity
- Dark theme everywhere
- Type safety: Let TypeScript catch errors
- Secrets in `.env.local` (gitignored)

---

## Part 12: BUSINESS MODEL

### Pricing (Flat-Rate)
- **Starter:** $99/month (1-3 person design team)
- **Professional:** $299/month (4-10 person team)
- **Enterprise:** Custom (10+ seats, Linear integration, SLA)

Annual prepay: 8% discount

### GTM
- **Lead funnel:** Content → DM → Chaos Calculator → Email → Trial → Paid
- **Growth:** Content-driven, referrals, partnerships
- **Not doing:** Paid ads, enterprise sales

### Revenue Model (Lifestyle)
- Phase 1 (0-5K MRR): MVP → PMF
- Phase 2 (5-10K MRR): Reduce churn, integrations
- Phase 3 (10-20K MRR): Mature, reliable automation

---

## Part 13: FEATURE ROADMAP (UPDATED)

### **Week 1-4: PREDESIGN Phase (MVP Table-Stakes)**
- [x] Request intake (PM creates request)
- [x] AI triage (priority, complexity, type)
- [x] Context attachment (research, data)
- [x] Shaping (PM + Design Head define direction)
- [x] Betting (Design Head assigns designer)
- [x] Idea Board (org votes on ideas)
- [x] Idea validation (AI validates upvoted ideas)

### **Week 5-8: DESIGN Phase + Figma Sync**
- [x] Exploration (designer creates multiple concepts)
- [x] Figma linking (where's the design file?)
- [x] Validation gate (3 sign-offs: Designer ✅, PM ✅, Design Head ✅)
- [x] Handoff to dev (Figma locked, notes attached)
- [x] Figma history UI (FigmaHistory component, figma_updates table, post-handoff review)
- [ ] **FIGMA OAUTH** ← replaces webhook approach (connect once, polls Figma REST API — no per-team setup required)

### **Week 9-12: DEV Phase + Track Phase**
- [ ] Dev kanban board (To Do → In Progress → In Review → QA → Done)
- [ ] Designer post-handoff support
- [ ] Impact tracking (PM measures actual impact)
- [ ] PM calibration (variance calculated, accuracy tracked)
- [ ] AI weekly report (designers shipped, team health, recommendations)

### **Month 4+: Enhancements (DEFER)**
- [ ] Slack notifications (use Zapier initially)
- [ ] Email digests (not MVP priority)
- [ ] Linear integration (Phase 3, Month 3)
- [ ] Designer performance dashboard
- [ ] Duplicate detection (embeddings-based)

---

## Part 14: WHAT WE'RE NOT BUILDING (MVP)

### **DEFER to Phase 2+ (After Month 3):**

```
❌ Slack notifications
   └─ Can use Zapier temporarily
   └─ Build native only if high customer demand

❌ Email digest
   └─ Activity feed in-app is sufficient for MVP
   └─ Add weekly email later

❌ Auto-comment in Figma
   └─ Nice but low ROI
   └─ Figma notifications already exist

❌ Detailed change diffs
   └─ Too complex for MVP
   └─ Link to Figma is enough

❌ Version comparison tool
   └─ Too nice-to-have
   └─ Can defer 6+ months

❌ Advanced config options
   └─ Start with sensible defaults
   └─ Add toggles later if asked

❌ Linear integration (native)
   └─ Plan for Month 3
   └─ Not needed for MVP

❌ Figma plugin
   └─ Defer 6+ months
   └─ Link from web app is enough
```

---

## Part 15: FIGMA SYNC IMPLEMENTATION (Week 5-8)

### **What Actually Gets Built:**

**Week 5-6: Figma Webhook**
```javascript
// 1. Receive Figma webhook
POST /api/figma/webhook
  ├─ Verify Figma signature
  ├─ Extract: file_id, timestamp, user_id
  ├─ Create figma_updates DB entry
  ├─ Set post_handoff flag if request.phase === 'dev'
  └─ Return 200 OK

// 2. Store in DB
INSERT figma_updates {
  request_id,
  figma_file_url,
  updated_by,
  updated_at,
  change_description,
  post_handoff,
}

// 3. Create activity feed entry
Automatic activity feed display:
  "🎨 Ananya updated Figma"
```

**Week 7: Post-Handoff Alert Logic**
```javascript
// When figma update received
if (request.phase === 'dev') {
  ⚠️ Alert: "Design updated post-handoff"
  flag: dev_reviewed = false
  notify: dev (urgent), pm, design head
}
```

**Week 8: Test + Ship**
- Test Figma webhook in staging
- Test post-handoff alert logic
- Ship to production

---

## Part 16: ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
ANTHROPIC_API_KEY=
FIGMA_CLIENT_ID=              ← OAuth (future — when Figma OAuth is built)
FIGMA_CLIENT_SECRET=          ← OAuth (future)
# FIGMA_WEBHOOK_TOKEN removed — webhook approach dropped in favour of OAuth
```

---

## Part 17: COMMON COMMANDS

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

## Part 18: WHAT'S BUILT (As of Session 2)

- [x] Next.js 14 scaffolded, Vercel deployed
- [x] Supabase auth
- [x] Drizzle ORM schema
- [x] Request intake + AI triage
- [x] Dashboard
- [x] Auth middleware

---

## Part 19: WHAT'S NEXT (Weeks 1-12)

- [ ] Context attachment
- [ ] Shaping stage
- [ ] Betting stage
- [ ] Idea Board (submit, vote, validate)
- [ ] Design phase (explore, validate, handoff)
- [ ] **Figma Sync** (activity feed, post-handoff alerts)
- [ ] Dev kanban board
- [ ] Impact tracking
- [ ] PM calibration
- [ ] AI weekly report

---

## Part 20: FOUNDER CONTEXT

- **Role:** Head of Product Design at Airtel Payments Bank (full-time)
- **Building:** DesignQ as side project (50% time post-MVP)
- **Stage:** Live GTM, leads flowing in
- **Team:** Solo, non-technical, vibe-coding with Cursor + Claude Code
- **Timeline:** 12-week plan; MVP by Week 4; 10-15 customers by Week 12
- **Goal:** $5-20K MRR lifestyle business

---

## Part 21: UPDATE SCHEDULE

**Weekly (Monday):**
- Update "What's built" (add shipped features)
- Update metrics (signups, churn)
- Time: 15 min

**Bi-weekly:**
- Update roadmap (move completed items)
- Update business metrics
- Time: 30 min

**Monthly:**
- Update founder context (learnings, pivots)
- Reprioritize roadmap
- Time: 1 hour

**Quarterly:**
- Full vision review
- Pricing review
- Timeline review
- Time: 2 hours

---

## SUMMARY: The 4-Phase Model

**PHASE 1: PREDESIGN**
- PM creates request (problem → goal → user impact)
- Org votes on ideas (Idea Board)
- Design Head shapes + bets
- Output: "Ready for design" request + designer assigned

**PHASE 2: DESIGN**
- Designer explores multiple concepts
- Team provides feedback
- Validation gate (3 sign-offs)
- Figma files linked, updates tracked
- Output: Approved design + Figma locked

**PHASE 3: DEV**
- Dev uses kanban board (To Do → Done)
- Designer stays involved (observer, supporter)
- **Figma Sync:** If design changes post-handoff → Alert dev
- Output: Feature shipped to production

**PHASE 4: TRACK & IMPACT**
- PM measures actual impact
- System calculates variance
- PM calibration score updated
- AI weekly report generated
- Output: Impact recorded, accountability tracked

---

**Last Updated:** April 1, 2026  
**Status:** Ready for Phase 1 (Predesign build, Weeks 1-4)  
**Next Checkpoint:** April 15 (Week 2)  
**Version:** 4.0 (4-Phase Model + Figma Sync MVP)