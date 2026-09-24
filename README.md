# Lane

Lane is a problem-first product operating system for product teams. Its current product turns unclear or
solution-shaped Intake into an accepted Request, then carries that Request through a shared
Open → In Progress → Done workflow without surveillance or role-specific dashboards.

- Production: [app.uselane.app](https://app.uselane.app)
- Staging: [lane-staging.vercel.app](https://lane-staging.vercel.app)

## Start here

- `AGENTS.md` — repository rules and current build authority.
- `PRODUCT.md` — product thesis and permanent boundaries.
- `REQUIREMENTS.md` — behavioural requirements and decision status.
- `lane-roadmap.md` — validated sequence and phase gates.
- `DESIGN.md` — Lane's visual and component system.
- `phase-0-ux-skeleton.md` — current journeys, screens, and states.
- `conventions-plan.md` — Plane-grounded information architecture and interaction conventions.
- `PLANE-MAP.md` — read-only reference terrain from Plane.
- `DEFERRED.md` — deliberate deferrals and their revisit triggers.

## Local development

Use Node.js 20 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Link the repository to the Clerk development application and pull its local keys with `clerk init` followed
by `clerk env pull`; keep the generated values only in the ignored `.env.local`. Open
[http://localhost:3000](http://localhost:3000). Never paste secrets into documentation, source control, or chat.

Clerk owns identity and tenancy. Supabase supplies Postgres and private attachment storage only. Never add a
parallel Lane membership or invitation model.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

End-to-end tests use Lane Staging configuration. Database migrations are verified on staging before
production, with a verified manual export before every migration until managed backups are enabled.
