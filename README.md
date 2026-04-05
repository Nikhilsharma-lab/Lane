# Lane
<p align="center">
  <img src="assets/lane-logo.png" alt="Lane Logo" width="80" height="80" />
</p>

<h1 align="center">Lane</h1>

<p align="center">
  <strong>The chief of staff your design team never had.</strong>
  <br />
  An AI-native DesignOps command center that triages requests, manages workload, detects blockers, and writes your impact reports — so you can lead design, not manage spreadsheets.
</p>

<p align="center">
  <a href="#-quickstart"><strong>Quickstart</strong></a> ·
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#%EF%B8%8F-architecture"><strong>Architecture</strong></a> ·
  <a href="#-contributing"><strong>Contributing</strong></a> ·
  <a href="#-roadmap"><strong>Roadmap</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-beta-6366f1" alt="Status: Beta" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/built%20with-Next.js%20%2B%20Supabase-000" alt="Built with Next.js + Supabase" />
  <img src="https://img.shields.io/badge/AI-Claude%20API-D97706" alt="AI: Claude API" />
</p>

---

## The Problem

Design teams at growing companies are drowning in operational chaos. The data is stark:

- **~45% of design team time** goes to operations — triaging requests, updating stakeholders, writing status reports — not actual design work.
- A team of 10 designers loses the equivalent of **4.5 full-time designers** to coordination overhead.
- Requests arrive from 5+ channels (Slack DMs, emails, Jira tickets, hallway conversations, "quick favors").
- Every Monday morning starts with 14+ unstructured requests and zero visibility into team capacity.

Existing tools (Jira, Asana, Linear, Notion) are horizontal project management platforms. None of them understand design workflows — intake phases, exploration phases, review loops, stakeholder feedback cycles, or design-specific handoff requirements. Design leaders are forced to build fragile ops systems on top of tools built for engineering.

**Lane fixes this.** It's not a project management tool with AI sprinkled on top. It's an AI operations manager purpose-built for design teams. The AI doesn't assist — it *runs* the operations layer, and the design leader oversees.

---

## ✨ Features

### 🎯 AI-Powered Request Intake & Triage

Requests come in through a single intake form (or detected from Slack). AI handles the rest.

- **Single intake form** — Replaces the 5-channel request chaos with one structured entry point
- **AI auto-triage** — Classifies type, estimates complexity (S/M/L/XL), validates priority, and explains its reasoning
- **Duplicate detection** — Catches "didn't we already get this request?" before it wastes anyone's time
- **"No Brief, No Work" enforcement** — Incomplete requests are returned automatically with a checklist

```
📥 NEW REQUEST TRIAGED

"Checkout success screen redesign" — submitted by Priya (Payments PM)

AI Assessment:
  Type:       Feature flow
  Complexity: Large (4–7 days)
  Priority:   High (blocking upcoming release)
  Reasoning:  "Touches a revenue-critical flow with 3 stakeholders.
               Similar complexity to the onboarding redesign (6 days)."

  [Approve triage] [Override] [Return to requester]
```

### 📊 Workload Intelligence

Real-time visibility into who's doing what — and who's about to burn out.

- **Capacity dashboard** — See each designer's current load weighted by complexity (not just ticket count)
- **Smart assignment** — AI suggests the best designer based on expertise, current load, and request type
- **Overload alerts** — Get warned before a designer hits 100% capacity, not after
- **Sprint auto-planner** — Shows what fits in the next sprint based on actual availability

### 🔄 Design Work Tracking

A Kanban board built for how design actually works — not how engineering ships code.

- **Design-specific states**: `Queued → In Design → In Review → Revisions → Ready for Dev`
- **Stall detection** — AI notices when a request hasn't moved in 48 hours and nudges the right person
- **Stakeholder auto-updates** — PMs get notified when their request changes status (zero manual effort from the designer)
- **AI-generated handoff checklists** — When a design moves to "Ready for Dev," AI generates a complete spec: states, edge cases, responsive behavior, accessibility notes, design tokens

### 📈 Impact Reporting (AI-Written)

The feature that sells the product. Leadership doesn't care about tickets closed — they care about business impact.

- **Weekly digest** — AI writes a narrative summary: what shipped, what's blocked, what needs attention
- **Quarterly impact report** — AI connects design output to business outcomes: "The checkout redesign contributed to a 12% conversion improvement"
- **Morning briefing** — A daily Slack message summarizing today's priorities, blockers, and decisions needed

### 👥 Multi-Persona Seats

Lane isn't just for designers. It creates value for every role in the product development cycle.

| Seat | For | Key Value |
|------|-----|-----------|
| **Designer** | Design team members | Full ops: intake, Kanban, handoff checklists, workload view |
| **PM** | Product managers | Request tracking, AI delivery estimates, sprint planning view |
| **Dev** | Developers | AI spec sheets, "Ask the Design" assistant, change alerts |
| **Leader** | Design directors/VPs | Impact dashboard, team analytics, morning briefing agent |
| **Viewer** | Anyone (free) | Submit requests, track status of own requests |

---

## 🏗️ Architecture

Lane is **AI-native** — the AI doesn't enhance a CRUD app, it *is* the operational brain. The dashboard is secondary. The primary interface is Slack messages, morning briefings, and alerts.

```
┌──────────────────────────────────────────────┐
│           SLACK / EMAIL / INTAKE FORM         │
│            (Input channels — requests)        │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│              AI INTAKE AGENT                  │
│  • Detects requests from Slack messages       │
│  • Parses form submissions                    │
│  • Classifies, triages, deduplicates          │
│  • Generates reasoning for each decision      │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│           CORE DATABASE (Supabase)            │
│   Requests · Designers · Capacity · History   │
└───────┬──────────┬───────────┬───────────────┘
        ▼          ▼           ▼
┌───────────┐ ┌───────────┐ ┌─────────────────┐
│ WORKLOAD  │ │   STALL   │ │   REPORTING     │
│  AGENT    │ │ DETECTOR  │ │     AGENT       │
│           │ │           │ │                 │
│ Assigns   │ │ Monitors  │ │ Weekly digest   │
│ Balances  │ │ Nudges    │ │ Quarterly report│
│ Alerts    │ │ Escalates │ │ Impact narrative│
└───────────┘ └───────────┘ └─────────────────┘
        │          │               │
        ▼          ▼               ▼
┌──────────────────────────────────────────────┐
│       NOTIFICATION LAYER (Slack / Email)      │
│ Morning briefing · Alerts · Nudges · Digests  │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│            DASHBOARD (Next.js)                │
│  For when humans want to see, override,       │
│  or explore — NOT the primary interface        │
└──────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js + Tailwind CSS | Fast, well-documented, AI-friendly for rapid iteration |
| **Backend** | Next.js API Routes | Keeps the stack simple — no separate backend service |
| **Database** | Supabase (Postgres) | Real-time subscriptions, row-level security, auth built in |
| **Auth** | Supabase Auth / Clerk | Social login + email/password out of the box |
| **AI** | Anthropic Claude API | Powers triage, assignment, spec generation, and reporting agents |
| **Notifications** | Slack API + Email (Resend) | Primary interface — the product comes to you |
| **Payments** | Stripe | Subscription billing with per-seat pricing |
| **Hosting** | Vercel | Zero-config deploys, edge functions, preview environments |

### Database Schema (Core Tables)

```
requests
├── id (uuid, PK)
├── title (text)
├── description (text)
├── status (enum: new → triaged → in_design → in_review → revisions → ready_dev → done)
├── priority (enum: low, medium, high, critical)
├── type (enum: feature_flow, marketing_asset, bug_fix, component_update, research, branding)
├── complexity (enum: S, M, L, XL)
├── requester_id (FK → users)
├── designer_id (FK → users, nullable)
├── team (text)
├── ai_triage_reasoning (text)
├── brief_url (text, nullable)
├── target_deadline (date)
├── created_at / updated_at (timestamps)

designers
├── id (uuid, PK)
├── name (text)
├── email (text)
├── specializations (text[])
├── max_capacity_points (int)
├── current_load_points (int, computed)

organizations
├── id (uuid, PK)
├── name (text)
├── plan (enum: free, starter, pro, enterprise)
├── slack_workspace_id (text, nullable)
```

---

## 🚀 Quickstart

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** or **yarn** or **pnpm**
- **Supabase** account ([supabase.com](https://supabase.com))
- **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- **Stripe** account (for billing — optional in dev)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Lane.git
cd Lane
```

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the project root and fill in your credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic (AI)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your_signing_secret

# Stripe (Billing)
STRIPE_SECRET_KEY=sk_test_your_stripe_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Set Up the Database

Run the Supabase migrations to create all required tables, RLS policies, and functions:

```bash
npx supabase db push
```

Or if you're setting up Supabase locally:

```bash
npx supabase start
npx supabase db reset
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the Lane dashboard.

### 6. (Optional) Connect Slack

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add the Bot Token Scopes: `chat:write`, `channels:history`, `commands`
3. Install to your workspace and copy the bot token to `.env.local`
4. Set the event subscription URL to `https://your-domain.com/api/slack/events`

---

## 🧪 Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Lint
npm run lint

# Type check
npm run type-check
```

---

## 📁 Project Structure

```
lane/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Authentication pages
│   ├── (dashboard)/          # Main app pages
│   │   ├── requests/         # Request queue & detail views
│   │   ├── board/            # Kanban board
│   │   ├── workload/         # Team capacity dashboard
│   │   ├── reports/          # Impact reporting & digests
│   │   └── settings/         # Org & team settings
│   └── api/                  # API routes
│       ├── ai/               # AI agent endpoints (triage, assign, report)
│       ├── slack/             # Slack event handlers & commands
│       ├── stripe/            # Billing webhooks
│       └── requests/          # CRUD for requests
├── components/               # Shared UI components
│   ├── ui/                   # Base design system (buttons, inputs, etc.)
│   ├── request/              # Request-specific components
│   ├── board/                # Kanban board components
│   └── reports/              # Reporting & chart components
├── lib/                      # Shared utilities
│   ├── ai/                   # AI agent logic & prompt templates
│   │   ├── triage.ts         # Request triage agent
│   │   ├── assign.ts         # Smart assignment agent
│   │   ├── digest.ts         # Weekly digest generator
│   │   └── spec-gen.ts       # Handoff spec generator
│   ├── supabase/             # Database client & queries
│   ├── slack/                # Slack integration helpers
│   └── stripe/               # Billing utilities
├── supabase/
│   └── migrations/           # Database migrations
├── public/                   # Static assets
│   └── assets/               # Logo, images
├── tests/                    # Test files
├── .env.local                # Local environment variables (create this file)
├── tailwind.config.ts        # Tailwind configuration
├── next.config.ts            # Next.js configuration
└── package.json
```

---

## 🗺️ Roadmap

Lane is being built in public. Here's where we are and where we're headed:

### Phase 1: Request Intake + Queue ✅ (Weeks 1–3)
- [x] Public intake form with structured fields
- [x] AI auto-triage (type, complexity, priority, reasoning)
- [x] Duplicate detection
- [x] Request queue dashboard with filters & sorting

### Phase 2: Kanban + Assignment 🔨 (Weeks 4–6)
- [ ] Kanban board with design-specific states
- [ ] Designer profiles with capacity tracking
- [ ] Smart assignment suggestions (AI)
- [ ] Slack/email notifications on status changes

### Phase 3: Impact Dashboard (Weeks 7–9)
- [ ] AI-written weekly digest
- [ ] Auto-generated metrics dashboard
- [ ] Quarterly impact narrative generator
- [ ] Export as PDF for leadership meetings

### Phase 4: Polish + Launch (Weeks 10–12)
- [ ] Stripe billing integration
- [ ] Onboarding flow for new teams
- [ ] Product Hunt launch
- [ ] Founding member pricing

### Phase 5: Multi-Persona Expansion (Months 4–7)
- [ ] PM seats — request tracker, AI delivery estimates, sprint planning view
- [ ] Dev seats — AI spec sheets, "Ask the Design" assistant, change alerts, handoff quality score
- [ ] Cross-role viral loops (designer → PM, designer → dev)

### Phase 6: Advanced AI (Months 8–12)
- [ ] Morning briefing agent (daily Slack summary for leaders)
- [ ] Sprint auto-planner
- [ ] Quarterly narrative generator with business outcome connections
- [ ] MCP server for AI ecosystem interoperability

### Future Considerations
- Linear integration (additive positioning — Lane feeds into Linear)
- Jira integration (AI spec → Jira ticket on "Ready for Dev")
- Enterprise features (SSO, SAML, API access)
- Figma plugin for bi-directional design status sync

---

## 🤝 Contributing

We welcome contributions from designers, developers, and design ops practitioners! Lane is built in public and community input makes it better.

### Getting Started

1. **Fork the repo** and clone your fork locally
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Make your changes** — see the guidelines below
4. **Test your changes** — make sure existing tests pass and add new ones if applicable
5. **Push and open a PR** against the `main` branch

### Branch Naming Convention

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New feature | `feat/slack-request-detection` |
| `fix/` | Bug fix | `fix/triage-priority-override` |
| `docs/` | Documentation | `docs/api-endpoint-reference` |
| `refactor/` | Code refactor (no behavior change) | `refactor/ai-prompt-templates` |
| `test/` | Adding or updating tests | `test/triage-agent-edge-cases` |
| `chore/` | Tooling, CI, dependencies | `chore/upgrade-supabase-client` |

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

# Examples:
feat(triage): add duplicate request detection with similarity scoring
fix(board): prevent drag-drop crash when request has no designer
docs(readme): add API environment setup instructions
refactor(ai): extract prompt templates into separate module
```

### Pull Request Guidelines

- **Keep PRs focused** — One feature or fix per PR. Large PRs are hard to review.
- **Write a clear description** — Explain *what* changed and *why*. Include screenshots for any UI changes.
- **Update documentation** — If your change affects setup, config, or usage, update the relevant docs.
- **Add tests** — New features should include tests. Bug fixes should include a regression test.
- **Follow existing patterns** — Look at how similar code is structured before introducing new patterns.

### PR Template

When you open a PR, please include:

```markdown
## What does this PR do?
Brief description of the change.

## Why is this needed?
Context on the problem or improvement.

## How to test
Steps to verify the change works.

## Screenshots (if UI change)
Before/after screenshots or a short recording.

## Checklist
- [ ] I've tested this locally
- [ ] I've added/updated tests where applicable
- [ ] I've updated documentation if needed
- [ ] My code follows the existing code style
- [ ] This PR is focused on a single change
```

### Code Style

- **TypeScript** — Strict mode enabled. No `any` types unless absolutely necessary (and documented why).
- **Formatting** — Follow the existing file style in the repo. There is currently no dedicated formatting script in `package.json`.
- **Linting** — ESLint with the Next.js recommended config. Run `npm run lint` to check.
- **Type checking** — Run `npx tsc --noEmit` before committing to catch TypeScript issues.
- **Component naming** — PascalCase for components, camelCase for utilities, kebab-case for file names.
- **AI prompts** — All AI prompt templates live in `lib/ai/`. If you're modifying an AI agent's behavior, update the prompt template, not the API route.

### Where to Contribute

Not sure where to start? Here are some good areas:

- 🐛 **Bug fixes** — Check [open issues](../../issues) labeled `bug`
- 📝 **Documentation** — API docs, inline code comments, setup guides
- 🎨 **UI/UX improvements** — We're a design tool — polish matters
- 🧪 **Tests** — Increase test coverage, especially for AI agent logic
- 🌐 **Integrations** — Slack commands, Linear/Jira connectors, Figma plugin groundwork
- ♿ **Accessibility** — Keyboard navigation, screen reader support, color contrast

### Reporting Issues

Found a bug or have a feature idea? [Open an issue](../../issues/new/choose) with:

- **Bug reports**: Steps to reproduce, expected vs. actual behavior, screenshots if applicable
- **Feature requests**: The problem you're trying to solve, your proposed solution, alternatives you considered

---

## 🧠 Key Concepts

A few terms and concepts that are central to how Lane works:

**Coordination Tax** — The hidden cost of design team operations. Approximately 45% of design team time goes to non-design work: triaging requests, attending status meetings, writing reports, chasing stakeholders. Lane exists to eliminate this tax.

**Behavior-Based Design Pods** — A proprietary framework for organizing design teams around behavioral outcomes rather than feature areas. This influences how Lane models team structure and workload distribution.

**AI-Native vs. AI-Sprinkled** — Lane passes the "Remove the AI" test. If you remove the AI, most features stop working entirely — triage doesn't happen, specs don't get generated, digests don't get written. The AI isn't a feature; it's the foundation.

**The Dashboard is Secondary** — In an AI-native product, the primary interface is Slack messages, morning briefings, and automated alerts. The design leader barely needs to open the app — the app comes to *them*.

---

## 📊 Competitive Positioning

Lane is **not** a horizontal project management tool. Here's how it relates to tools design teams currently misuse:

| Tool | Their Strength | Where They Fail for Design | Lane's Position |
|------|---------------|---------------------------|-------------------|
| **Jira** | Engineering sprint tracking | No design capacity model, no visual context, handoff is a Figma link in a comment | Lane manages upstream design workflow; feeds completed specs *into* Jira |
| **Asana** | Clean work management | No AI triage, no design-specific states, no impact reporting for design leaders | Lane replaces the fragile design ops system teams build on top of Asana |
| **Linear** | Fast, opinionated engineering tracker | Built around engineering sprint cycles, no public intake, no cross-functional handoff | Lane is additive to Linear — same philosophy, different workflow |
| **Notion** | Flexible documentation | Too flexible — every team reinvents the wheel, no automation, no AI agents | Lane is opinionated where Notion is blank-canvas |

**Integration philosophy**: Lane doesn't replace your engineering tools. It feeds *into* them. When a design hits "Ready for Dev," the AI-generated spec automatically creates a ticket in Jira or Linear.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🔗 Links

- **Website**: [lane.app](https://lane.app) *(coming soon)*
- **Documentation**: [docs.lane.app](https://docs.lane.app) *(coming soon)*
- **Twitter/X**: [@lane_app](https://twitter.com/lane_app)
- **LinkedIn**: Follow the build-in-public journey

---

## 💬 Support

- **Issues**: [GitHub Issues](../../issues) for bugs and feature requests
- **Discussions**: [GitHub Discussions](../../discussions) for questions and ideas
- **Email**: nikhil@lane.app

---

<p align="center">
  <strong>Built with ❤️ by <a href="https://www.linkedin.com/in/nikhil">Nikhil</a></strong>
  <br />
  Head of Product Design @ Airtel Payments Bank
  <br />
  <em>Building Lane nights & weekends because design teams deserve better ops.</em>
</p>
