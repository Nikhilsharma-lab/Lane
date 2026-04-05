# Lane — Product Requirements Document

**Version:** 1.0 (MVP)
**Date:** 2026-03-29
**Status:** Active — features in development
**Founder:** Nikhil (Head of Product Design, Airtel Payments Bank)

---

## 1. Overview

Lane is an AI-native design operations platform. It replaces the spreadsheets, Slack threads, and manual triaging that design teams use to manage work.

**The core loop:**
PMs and stakeholders submit design requests → Claude analyzes and triages them → Design leaders assign and prioritize → Designers execute → Work is tracked through 9 stages to impact.

**What makes it AI-native:** AI isn't a feature sprinkled on top. The triage, prioritization, and quality gates _only work with AI_. Remove the AI and the system breaks — that's the test.

---

## 2. The Problem

Design teams — especially at high-growth companies — operate with chronic inefficiency at the intake and triage layer:

- Requests arrive via Slack, email, Notion docs, and verbal asks. Most get lost.
- Design leaders spend 2-3 hours per week manually triaging, estimating, and assigning work.
- PMs don't know how to write good design briefs. Designers waste hours getting context.
- There's no consistent way to say "yes, no, or later" to a request with reasoning.
- Leaders have no visibility into team workload, blockers, or impact without running status checks.

**Who feels this most:** Design leaders managing teams of 4-15 designers at B2B SaaS companies, product-led growth companies, or enterprise product orgs. Nikhil's team at Airtel Payments Bank is the reference customer.

---

## 3. Goals & Success Metrics

### Business Goals (V1 / MVP)
- First 10 paying teams using Lane within 90 days of launch
- Retention: 80%+ of teams active after 30 days
- Primary metric: Weekly Active Teams (teams with ≥1 request submitted/moved that week)

### Product Goals (V1)
| Goal | Metric | Target |
|------|--------|--------|
| Reduce triage time | Time from request submitted → assigned | < 5 minutes (from ~2 hours) |
| Improve brief quality | AI quality score on submitted requests | 70+ average |
| Improve visibility | Requests with up-to-date status | 90%+ |
| Reduce lost requests | Requests submitted through Lane vs. Slack | 80%+ for active teams |

---

## 4. Users & Personas

### Primary Persona: The Design Leader
**Who:** Head of Design, Design Manager, or Lead Designer managing a team
**Context:** 8-person design team (reference: Nikhil at Airtel Payments Bank), managing 20-40 concurrent requests across multiple products
**Core job:** Triage incoming requests, manage capacity, protect team from bad work, report on impact
**Pain:** Spends more time on ops (assigning, chasing, reporting) than on actual design leadership
**Success:** Opens Lane, sees 3 things needing attention, approves/redirects in 5 minutes. Rest is AI-handled.

### Secondary Persona: The PM / Stakeholder (Requester)
**Who:** Product managers, business stakeholders, or other designers submitting requests
**Context:** Not a designer. Doesn't know what makes a "good brief." Wants to know when their thing will ship.
**Core job:** Submit requests, track status, get updates without nagging designers
**Pain:** Black hole — submits request, hears nothing for weeks, escalates to Slack
**Success:** Submits a request, gets AI feedback on brief quality immediately, knows estimated timeline, gets notified when status changes

### Tertiary Persona: The Designer (Executor)
**Who:** Product designer, UX designer, or design generalist
**Context:** Assigned work, executing design in Figma, handing off to dev
**Core job:** Execute assigned work well, update status, complete handoff checklist
**Pain:** Gets bad briefs, unclear priorities, last-minute scope changes
**Success:** Sees their queue, knows what's priority, has the context they need to start immediately

---

## 5. Scope

### In Scope — V1 (Current)
- Multi-tenant org with auth (signup, login, logout)
- Request intake form with structured fields
- AI triage: priority, complexity, type, quality score, suggestions
- 9-stage request workflow with status tracking
- Assignment: assign designers to requests by role (lead / reviewer / contributor)
- Dashboard: list view of all org requests with priority and status

### In Scope — V1 Next (90 days)
- Request detail page: full AI triage breakdown, comments, stage history
- Invite teammates to org
- Request status updates: move through stages, log transitions
- Duplicate detection: semantic similarity check on new requests
- Quality gate: block low-quality requests before submission with AI coaching
- Email notifications (Resend): assignment, mention, status change
- Figma plugin: submit requests directly from within Figma

### Out of Scope — V1
- Slack integration (V2)
- Kanban board view (V2)
- Time tracking (V2)
- Figma design preview in-app (V2)
- Capacity management dashboard (V2)
- Developer handoff features (V3)
- AI Morning Briefing (V4)
- MCP Server (V4)

---

## 6. Functional Requirements

### 6.1 Authentication
- Users sign up with email + password + name + org name
- Signup creates an organization, assigns the user the "lead" role
- Login redirects to /dashboard
- Auth state persists via Supabase session cookies
- Protected routes: all /dashboard/* require authenticated session
- Logout clears session and redirects to /login

### 6.2 Organizations & Profiles
- Multi-tenant: each user belongs to exactly one org (V1)
- Roles: pm, designer, developer, lead, admin
- First user to sign up becomes "lead"
- Org has a unique slug (auto-generated from org name + random suffix)
- Users in same org can see all org requests

### 6.3 Request Intake
- Required fields: title, description, business context, success metrics
- Optional fields: request type, deadline
- Submission triggers AI triage (async, within 3 seconds)
- Draft state: requests can be created without submitting (future)

### 6.4 AI Triage (Claude Haiku)
- Input: title, description, business context, success metrics
- Output: priority (P0-P3), complexity (1-5), request type, quality score (0-100), quality flags, summary, reasoning, suggestions
- Runs via Vercel AI SDK `generateObject` with Zod schema
- Results stored in `request_ai_analysis` table
- Gracefully skipped when ANTHROPIC_API_KEY is not set
- Quality flags surface specific issues: vague success metrics, missing context, no deadline, competing priorities

### 6.5 Request Management
- 9 statuses: draft → submitted → triaged → assigned → in_progress → in_review → blocked → completed → shipped
- 9 stages: intake → context → shape → bet → explore → validate → handoff → build → impact
- Requests filterable/sortable by status, priority, stage (future)
- All requests visible to all org members (V1 — no private requests)

### 6.6 Assignment
- Design leader assigns team members to a request
- Roles: lead (primary owner), reviewer, contributor
- One lead per request (enforced)
- Multiple reviewers and contributors allowed
- Assignment updates request status to "assigned"
- Remove assignment returns to "triaged" (if no other assignments remain)

### 6.7 Dashboard
- Lists all org requests, ordered by creation date
- Shows: title, priority badge (P0/P1/P2/P3), complexity bars, status pill, requester, created date
- "New request" button opens modal form
- Responsive, dark theme

---

## 7. Non-Functional Requirements

### Performance
- Dashboard load time: < 1s (server component, Drizzle direct query)
- AI triage: < 5s per request
- API responses: < 200ms p95 (excluding AI calls)

### Reliability
- Auth session: persistent via Supabase cookies, survives page refresh
- DB connection: Supabase session pooler (port 5432), `prepare: false`, no manual SSL options
- Error handling: AI triage failures are caught, request created without triage

### Security
- No RLS in V1 (org-level isolation enforced in application code)
- RLS policies required before production launch (V1.1)
- API routes validate org membership before returning data
- ANTHROPIC_API_KEY server-side only (never exposed to client)

### Scalability
- Session pooler supports up to 10,000 concurrent connections
- Each org isolated by `org_id` FK on all tables
- No file storage in V1 (Figma plugin adds this in V1.1)

---

## 8. Technical Architecture

### Stack
| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 App Router | Full-stack; server components for fast initial load |
| Database | Supabase PostgreSQL | Managed Postgres + auth + storage in one |
| ORM | Drizzle ORM | Type-safe queries; works with Supabase session pooler |
| Auth | Supabase Auth + `@supabase/ssr` | Cookie-based sessions for server components |
| AI | Vercel AI SDK + Claude Haiku | `generateObject` for structured triage output |
| Styling | Tailwind CSS + shadcn/ui | Consistent design system; dark theme |
| Hosting | Vercel | Zero-config Next.js deploy |

### Key Files
```
app/actions/auth.ts          — login, signup, logout server actions
app/api/requests/route.ts    — POST create + triage, GET list
app/(dashboard)/dashboard/   — main dashboard, request detail, request form
db/schema/                   — Drizzle schema: users.ts, requests.ts, workflow.ts
lib/ai/triage.ts             — Claude triage logic
lib/supabase/server.ts       — SSR Supabase client
middleware.ts                — Auth guard on /dashboard/*
```

### Database Schema (abbreviated)
```
organizations  → id, name, slug (unique), plan, timestamps
profiles       → id (ref auth.users), org_id, full_name, email, role, timestamps
requests       → id, org_id, requester_id, title, description, business_context,
                  success_metrics, status, stage, priority, complexity, request_type,
                  deadline_at, timestamps
request_ai_analysis → request_id (unique), priority, complexity, request_type,
                       quality_score, quality_flags, summary, reasoning, suggestions,
                       ai_model, tokens_used
assignments    → request_id, assignee_id, assigned_by_id, role, notes, assigned_at
comments       → id, request_id, author_id, body, is_system, timestamps
```

---

## 9. User Flows

### 9.1 Signup → Dashboard (First-time user)
1. Land on `/` → redirect to `/login`
2. Click "Create account" → `/signup`
3. Fill: email, password, full name, org name
4. Submit → Supabase user created → org row created (slug: `{name}-{rand}`) → profile row created with role "lead"
5. Redirect to `/dashboard`
6. Dashboard shows: empty request list + "New request" button

### 9.2 Submit a Request (PM)
1. Click "New request" → modal opens
2. Fill: title, description, business context, success metrics, (opt) type, deadline
3. Submit → POST /api/requests
4. Server: inserts request row → runs AI triage → updates request with priority/complexity/type/status="triaged"
5. Modal closes → dashboard refreshes → request appears with AI-assigned priority badge

### 9.3 Review + Assign (Design Leader)
1. Click request in dashboard → request detail page
2. See: full brief, AI summary, quality score, reasoning, flags, suggestions
3. Click "Assign" in sidebar → assignment panel opens
4. Select team member → pick role (lead/reviewer/contributor) → save
5. Request status updates to "assigned"
6. Assignee appears in sidebar

---

## 10. Open Questions

| Question | Who Decides | Priority |
|----------|-------------|---------|
| Should PMs be able to see all requests or only their own? | Nikhil | Medium |
| Quality gate: block submission below score X, or warn only? | Nikhil | High |
| Should design leader be able to override AI priority? | Nikhil | High |
| Duplicate detection threshold: what % similarity = duplicate? | Test empirically | Low |
| Invite flow: email link or shareable org invite link? | Nikhil | Medium |

---

## 11. Assumptions & Dependencies

- **Email confirmation is disabled** in Supabase Auth (free tier rate limits make this impractical during development)
- **RLS is disabled** on all tables during development. Must be enabled before any external users access the system.
- **ANTHROPIC_API_KEY** is not set in development; triage is skipped gracefully. Add key to enable.
- **One org per user** in V1. Multi-org membership is a V3+ concern.
- **No file storage** in V1. Figma assets are referenced by URL, not stored.

---

## 12. What's Built (as of 2026-03-29)

- [x] Auth: signup, login, logout, session persistence, middleware guard
- [x] Org + profile creation on signup
- [x] Request intake form (modal)
- [x] AI triage: priority, complexity, type, quality score, flags, reasoning, suggestions
- [x] Dashboard: request list with priority badges, complexity bars, status labels
- [x] Assignment: assign designers to requests with role picker
- [x] Dark theme UI throughout

## 13. What's Next (in order)

1. **Request detail page** — full triage breakdown, quality score, suggestions, comments
2. **Stage progression** — move request through 9 stages with transitions logged
3. **Invite teammates** — invite by email, receive link, join org
4. **Duplicate detection** — embeddings similarity on new requests
5. **Email notifications** — Resend: assignment alert, status change, mention
6. **Figma plugin** — submit requests from Figma context
7. **Enable RLS** — row-level security policies before any external access
