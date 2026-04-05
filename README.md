<p align="center">
  <img src="assets/lane-logo.png" alt="Lane Logo" width="80" height="80" />
</p>

<h1 align="center">Lane</h1>

<p align="center">
  <strong>Own your lane.</strong>
  <br /><br />
  Engineering teams have Linear.<br />
  Marketing teams have HubSpot.<br />
  Design teams have been borrowing tools ever since.
  <br /><br />
  Not because the tools are bad. Because design work is different.<br />
  Design is iterative, non-linear, and deeply human. It doesn't move in sprints. It doesn't close tickets. It explores, backtracks, versions, and validates — and then it ships something that either moves a metric or it doesn't.
  <br /><br />
  No existing tool was built for that reality. <strong>Lane is.</strong>
  <br /><br />
  An AI-native operating system built specifically for design teams — from the moment a PM has an idea to the moment you measure whether it actually worked. The AI handles the coordination. You handle the design.
</p>

<p align="center">
  <a href="#-the-problem"><strong>The Problem</strong></a> ·
  <a href="#-how-lane-works"><strong>How It Works</strong></a> ·
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-quickstart"><strong>Quickstart</strong></a> ·
  <a href="#%EF%B8%8F-architecture"><strong>Architecture</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-beta-6366f1" alt="Status: Beta" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/built%20with-Next.js%20%2B%20Supabase-000" alt="Built with Next.js + Supabase" />
  <img src="https://img.shields.io/badge/AI-Claude%20API-D97706" alt="AI: Claude API" />
</p>

---

## The Problem

Design teams at growing companies are drowning in operational chaos:

- Requests arrive from 5+ channels — Slack DMs, emails, hallway conversations, "quick favors"
- ~45% of design team time goes to coordination, not design work
- Existing tools (Jira, Linear, Notion) are built for engineering. None understand design workflows — intake gates, exploration phases, stakeholder review loops, or design-specific handoff
- Design leaders have no visibility into what's actually happening — only what people remember to update

Lane fixes this. It's not project management with AI sprinkled on. It's a structured operating model for design teams, with AI running the operations layer so humans can focus on the work.

---

## How Lane Works

Lane organizes every design request through four phases:

```
PREDESIGN → DESIGN → BUILD → TRACK
```

### Phase 1 — Predesign (PM + Org)
PMs submit requests through a single intake form. Lane's AI gate **blocks solution-specific requests** — requests must be problem-framed before entering the pipeline. From there, requests move through Context → Shape → Bet before a Design Head approves them for design work.

```
INTAKE GATE → CONTEXT → SHAPE → BET
```

### Phase 2 — Design (Designers)
Designers explore the problem through five non-linear stages. No due dates. No utilization tracking. Progress is captured through reflections, not forced status updates.

```
EXPLORE → VALIDATE → HANDOFF
```

A 3-sign-off validation gate (designer + PM + design head) is required before any work moves to dev.

### Phase 3 — Build (Developers)
When design is approved, the Figma file is locked and a dev kanban opens. Post-handoff Figma changes trigger alerts automatically. Dev cannot ship without designer sign-off on a Design QA step.

### Phase 4 — Track (PMs)
PMs log actual impact after shipping. Lane compares predicted vs. actual outcomes and builds a PM calibration score over time — framed as calibration, not performance management.

---

## Our Philosophy: Support, Not Surveillance

Most DesignOps tools are surveillance tools in disguise. Lane is built on the opposite principle.

**We will never build:**
- Individual utilization percentages
- "Last active" timestamps
- Per-designer speed comparisons or velocity rankings
- Automatic escalation of designer silence to leads
- Leaderboards ranking individual designers

**We always build:**
- AI nudges go to the designer privately first — never to their manager
- Leads see team health signals, not individual surveillance
- Designers set their own capacity preferences
- Every AI recommendation includes its reasoning — no black boxes
- Every AI suggestion is overridable by humans

*Surveillance produces performance. Support produces truth. Lane optimizes for truth.*

---

## ✨ Features

### AI-Powered Intake Gate
The single most important feature. Requests that describe a solution ("add a button", "make it like Stripe") are blocked at the gate. Lane's AI classifies requests as `problem_framed`, `solution_specific`, or `hybrid` — and prompts PMs to reframe before the work enters the pipeline.

### Predesign Workflow
Structured stages move requests from raw problem → shaped bet → approved for design. Each stage has clear exit criteria enforced by AI gates. Design Heads approve bets before design begins.

### 3-Sign-Off Validation
Before any design moves to dev, it needs sign-off from three roles: designer, PM, and design head. Rejections loop back with structured feedback. The Figma version is locked at the moment all three approve.

### Figma OAuth Integration
Connect your Figma account directly. Lane reads your files, locks the approved version at handoff, and detects post-handoff changes automatically — alerting dev when the design has changed after they started building.

### Token Encryption at Rest
Figma OAuth tokens are encrypted using AES-256-GCM before being stored in the database. Your credentials are never stored in plaintext.

### System Comment Timeline
Every phase transition, sign-off, and stage change is recorded as a system comment on the request — creating a full audit trail of how the work evolved.

### Role-Based Access
Five roles with strictly enforced visibility rules:

| Role | Key Access |
|------|-----------|
| **Admin** | Full org access, all settings |
| **Lead (Design Head)** | Team health signals, bet approval, org-level reporting |
| **Designer** | Own work, reflections, capacity preferences |
| **PM** | Their requests, impact logging, calibration score |
| **Developer** | Dev kanban, design specs, handoff details |

---

## 🚀 Quickstart

### Prerequisites

- **Node.js** ≥ 18.x
- **Supabase** account — [supabase.com](https://supabase.com)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)

### 1. Clone the Repository

```bash
git clone https://github.com/Nikhilsharma-lab/Lane.git
cd Lane
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_supabase_database_url

# Anthropic (AI)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Email (Resend) — optional in dev
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Lane <notifications@yourdomain.com>

# Figma OAuth — required for Figma integration
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret
FIGMA_TOKEN_ENCRYPTION_KEY=   # 64 hex chars — generate with:
                               # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Dev only — enables solo multi-role validation sign-off for local testing
# Never add this to production environment variables
ENABLE_MULTI_ROLE_TESTING=true
```

### 4. Push the Database Schema

```bash
npm run db:push
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) + TypeScript |
| **Database** | Supabase (PostgreSQL) |
| **ORM** | Drizzle ORM |
| **Auth** | Supabase Auth + `@supabase/ssr` |
| **AI** | Anthropic Claude API via Vercel AI SDK |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Hosting** | Vercel |
| **Email** | Resend |
| **Figma** | Figma OAuth API |

### Project Structure

```
app/
  (auth)/                     # Login, signup
  (dashboard)/
    dashboard/requests/[id]/  # Request detail — full timeline
    requests/new/             # Create request (intake gate)
    idea-board/
    betting-board/
  actions/                    # Server actions (mutations)
  api/
    requests/[id]/
      advance-phase/          # Phase transition logic
      validate/               # 3-sign-off validation
    figma/oauth/              # Figma OAuth flow
    ai/                       # AI triage, classify, digest

components/
  requests/                   # Request cards, forms
  shell/                      # Sidebar, layout shell
  ui/                         # shadcn/ui base components

db/
  schema/                     # Drizzle ORM table definitions

lib/
  ai/                         # AI agent logic
  email/                      # Email templates (Resend)
  encrypt.ts                  # AES-256-GCM token encryption
  supabase/                   # Supabase client (server + browser)
```

---

## 🗺️ Roadmap

### Foundation ✅
- [x] 4-phase request model (Predesign → Design → Build → Track)
- [x] AI intake gate (problem vs. solution classification)
- [x] Role-based access control (admin, lead, designer, PM, dev)
- [x] 3-sign-off validation gate
- [x] Figma OAuth integration with token encryption at rest
- [x] System comment timeline
- [x] Email notifications (stage transitions, validation requests, handoff alerts)
- [x] Org invites with role-based privilege controls

### In Progress
- [ ] AI auto-triage (priority, complexity, type with reasoning)
- [ ] Duplicate detection (pgvector semantic search)
- [ ] Smart assignment recommendations
- [ ] Request quality scoring

### Upcoming
- [ ] Weekly AI digest (narrative team summary for design leaders)
- [ ] Daily morning briefing (role-specific, pushed not pulled)
- [ ] Idea Board (anyone submits, org votes, top ideas auto-create requests)
- [ ] PM calibration dashboard (predicted vs. actual impact over time)
- [ ] Stripe billing

---

## 📄 License

[MIT](LICENSE)

---

## 🔗 Links

- **Issues**: [GitHub Issues](../../issues)

---

<p align="center">
  <em>Design teams deserve better ops.</em>
</p>
