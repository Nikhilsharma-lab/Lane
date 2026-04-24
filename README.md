<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/lane-logo-dark.svg">
  <img alt="Lane" src="assets/lane-logo.svg" width="220">
</picture>

**The operating system for design teams.**

AI-native design ops — intake, exploration, sign-off, and impact tracking, built specifically for how design actually works.

[**Live app**](https://app.uselane.app) · [**Marketing**](https://uselane.app) · [**Philosophy**](#philosophy-support-not-surveillance) · [**Roadmap**](#roadmap) · [**Quickstart**](#quickstart)

![Status: Private beta](https://img.shields.io/badge/status-private%20beta-6366f1)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Stack: Next.js 15 + Supabase](https://img.shields.io/badge/stack-Next.js%2015%20%2B%20Supabase-000)
![AI: Claude](https://img.shields.io/badge/AI-Claude-D97706)

</div>

---

## Why Lane exists

Engineering has Linear. Marketing has HubSpot. Product has Jira. **Design has been borrowing tools ever since** — not because the tools are bad, but because design doesn't move the way engineering does.

Design is iterative, non-linear, and deeply human. It explores, backtracks, versions, and validates. It doesn't close tickets and it doesn't run in sprints.

The existing stack forces designers to pretend otherwise. So:

- **~45% of design team time** goes to coordination, not design
- Requests arrive from 5+ channels with no structure
- Leaders see what people remember to update — not what's happening
- AI has mostly been sprinkled on top of the wrong workflow

Lane is not project management with AI. It's a **structured operating model for design teams**, with AI running the operations layer so humans can focus on the work.

## How Lane works

Every design request moves through four phases:

```
PREDESIGN  →  DESIGN  →  BUILD  →  TRACK
```

### Phase 1 — Predesign (PM + org)

PMs submit through a single intake form. **Lane's AI gate blocks solution-specific requests** — requests must be problem-framed before entering the pipeline. From there work moves through:

```
INTAKE GATE  →  CONTEXT  →  SHAPE  →  BET
```

A Design Head approves each bet before it enters the design phase.

### Phase 2 — Design (designers)

Designers explore through five non-linear stages. No due dates, no utilization tracking. Progress surfaces through designer reflection, not forced status updates.

```
SENSE  →  FRAME  →  DIVERGE  →  CONVERGE  →  PROVE
```

**3-sign-off gate** — designer, PM, and design head must all approve before work reaches dev. Figma version locks at approval.

### Phase 3 — Build (developers)

Dev kanban opens. Post-handoff Figma edits trigger alerts automatically. Dev cannot ship without a Design QA sign-off from the original designer.

### Phase 4 — Track (PMs)

PMs log actual impact after shipping. Lane compares predicted vs. actual and builds a PM **calibration score** over time — framed as learning, not performance.

## Philosophy: Support, not surveillance

Most DesignOps tools are surveillance tools in disguise. Lane is the opposite.

**Lane will never build:**

- Individual utilization percentages
- "Last active" timestamps
- Per-designer speed comparisons or velocity rankings
- Automatic escalation of designer silence to managers
- Designer leaderboards

**Lane always builds:**

- AI nudges go to the designer privately first — never to their manager
- Leads see team-level health signals, not individual activity feeds
- Designers set their own capacity preferences
- Every AI recommendation shows its reasoning — no black boxes
- Every AI suggestion is overridable by humans

> *Surveillance produces performance. Support produces truth. Lane optimizes for truth.*

## Features

**AI-powered intake gate** — Classifies each request as `problem_framed`, `solution_specific`, or `hybrid`. Solution-specific requests are blocked at submission with a reframe prompt. The single most important feature.

**5-stage design flow** — Sense / Frame / Diverge / Converge / Prove. Each stage has its own panel with tailored UI: sensing summary textarea, structured design frame, iteration cards with rationale, decision log, completeness meter, and a 3-way Prove gate that auto-advances to dev when all three roles sign off.

**Smart AI agents**
- **Auto-triage** sets priority, complexity, and type — all with visible reasoning
- **Handoff brief** generator synthesizes designer sensing, frame, iterations, decisions, and engineering feasibility into a single artifact
- **Morning briefing** — daily 30-second role-specific brief, pushed at 8am UTC
- **Weekly digest** — Friday narrative summary of team health, shipped work, and recommendations

**Figma integration** — OAuth with AES-256-GCM token encryption at rest. Post-handoff file changes trigger dev alerts automatically.

**Role-based access**

| Role | Access |
|---|---|
| **Admin** | Full org access, all settings |
| **Lead (Design Head)** | Team health signals, bet approval, org-level reporting |
| **Designer** | Own work, reflections, private capacity preferences |
| **PM** | Their requests, impact logging, calibration score |
| **Developer** | Dev kanban, design specs, handoff docs |

Strictly enforced — no individual surveillance data is ever visible across role boundaries.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth + `@supabase/ssr` |
| AI | Anthropic Claude via Vercel AI SDK |
| Styling | Tailwind CSS + shadcn/ui |
| Rate limiting | Upstash Redis |
| Email | Resend |
| Hosting | Vercel (production at [app.uselane.app](https://app.uselane.app)) |
| Testing | Vitest (unit), Playwright (e2e), pg-tap (SQL) |

## Quickstart

### Prerequisites

- Node.js ≥ 18
- Supabase account ([supabase.com](https://supabase.com))
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### 1. Clone and install

```bash
git clone https://github.com/Nikhilsharma-lab/Lane.git
cd Lane
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# Supabase (get from supabase.com → project settings)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=              # Transaction pooler (port 6543)
DIRECT_DATABASE_URL=       # Session pooler (port 5432) — for withUserSession routes
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=

# Rate limiting (Upstash Redis)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Figma OAuth
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=
FIGMA_TOKEN_ENCRYPTION_KEY=   # 64 hex chars:
                               # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Email
RESEND_API_KEY=
EMAIL_FROM=Lane <hello@yourdomain.com>

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database

```bash
npm run db:push        # install schema
npm run db:seed        # optional — seed a sample workspace
```

### 4. Run

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test               # unit + integration (Vitest)
npm run test:sql       # SQL migration tests (pg-tap)
npm run test:e2e       # end-to-end (Playwright)
```

## Project structure

```
app/
  (auth)/                      ← login, signup
  auth/callback/               ← Supabase auth redirect handler
  (onboarding)/                ← 3-persona onboarding flow
  (dashboard)/                 ← main app shell
    dashboard/requests/[id]/   ← request detail + timeline
    dashboard/teams/[slug]/    ← team-scoped views
  actions/                     ← server actions (mutations)
  api/
    requests/[id]/             ← triage, advance-phase, validate, etc.
    cron/                      ← scheduled jobs (digest, briefing, alerts)
    figma/oauth/               ← Figma OAuth flow

components/
  requests/                    ← panels per design stage
  shell/                       ← sidebar, layout, detail-dock
  ui/                          ← shadcn/ui primitives

db/
  schema/                      ← Drizzle table definitions
  migrations/                  ← drizzle-kit migrations

lib/
  ai/                          ← agent prompts + clients
  alerts/                      ← detection (stall nudges, signoff overdue, figma drift)
  email/                       ← Resend templates
  encrypt.ts                   ← AES-256-GCM (Figma token encryption)
  rate-limit.ts                ← Upstash Redis rate limiting
  supabase/                    ← client (server + browser)

docs/                          ← specs (nav-spec, onboarding-spec, user-flows-spec)
DOCS BIG/                      ← roadmap, plans, working rules
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architectural reference — vocabulary lock, build rules, anti-surveillance invariants, role-based visibility table, infra gotchas.

## Roadmap

**Shipped** — foundation is complete. Details in [CHANGELOG.md](./CHANGELOG.md).

- 4-phase request model
- AI intake gate with problem/solution classification
- Role-based access + anti-surveillance invariants
- 5-stage design flow (Sense → Frame → Diverge → Converge → Prove)
- 3-sign-off Prove gate
- Figma OAuth with AES-256-GCM token encryption
- Dev kanban + post-handoff change detection
- Impact tracking + PM calibration
- Idea board with voting and AI validation
- System comment timeline (full audit trail)
- Weekly digest + daily morning briefing
- Upstash Redis rate limiting on all AI routes
- pg-tap SQL migration tests
- Design Radar (team-level health, phase heat map, risk panel)
- Onboarding flow (3 personas — Design Head / Designer / PM)

**In progress**

- Production schema drift reconciliation ([#64](https://github.com/Nikhilsharma-lab/Lane/issues/64))
- Dev / prod Supabase environment split ([#59](https://github.com/Nikhilsharma-lab/Lane/issues/59))
- Migrating all routes off bare `@/db` to RLS-aware `withUserDb` / `withUserSession` ([#42](https://github.com/Nikhilsharma-lab/Lane/issues/42))
- Week 7.5 auth/workspace foundation (migrations 0014, 0015)
- Stripe billing

**Deferred**

- pgvector duplicate detection (current: LLM-based; sufficient at current scale)
- Command palette / global search
- Reflections feature (awaiting beta user signal)

## Contributing

Lane is in private beta, not currently accepting external contributions. If you're interested as the app goes public, watch this repo or reach out.

Contributors touching production or database:

- Read [`CLAUDE.md`](./CLAUDE.md) Part 19 — **INFRA GOTCHAS** — before editing env vars, Supabase settings, or migrations
- Follow the CHANGELOG workflow (documented in Part 19)
- Verify via CLI before dictating dashboard paths
- Never run `vercel env pull` (dumps plaintext secrets)
- See [`DOCS BIG/docs/WORKING-RULES.md`](DOCS%20BIG/docs/WORKING-RULES.md) for session discipline

## License

[MIT](LICENSE)

---

<div align="center">

**[uselane.app](https://uselane.app)** · **[app.uselane.app](https://app.uselane.app)**

*Design teams deserve better ops.*

</div>
