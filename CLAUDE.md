# DesignQ2 — CLAUDE.md

AI-native design operations platform. PMs submit design requests → Claude triages them → designers get prioritized, well-specified work.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL via Drizzle ORM) |
| Auth | Supabase Auth + `@supabase/ssr` |
| AI | Claude via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |

## Project Structure

```
app/
  (auth)/login/         — Sign in page
  (auth)/signup/        — Sign up + creates org + profile
  (dashboard)/dashboard/— Main dashboard (server component, fetches requests)
  actions/auth.ts       — Server actions: login, signup, logout
  api/requests/route.ts — POST (create + AI triage), GET (list)
  layout.tsx
  page.tsx              — Redirects to /login

components/
  requests/
    new-request-form.tsx — Modal form for creating requests
    request-list.tsx     — Client component: list + "New request" button
  ui/                    — shadcn components (button, card, input)

db/
  index.ts              — Drizzle client (postgres driver)
  schema/
    users.ts            — organizations, profiles tables
    requests.ts         — requests, request_ai_analysis, comments tables
    workflow.ts         — assignments, request_stages tables

lib/
  ai/triage.ts          — Claude triage: returns priority/complexity/type/quality
  supabase/
    client.ts           — Browser Supabase client
    server.ts           — Server Supabase client (uses cookies)
  utils.ts              — cn() helper

middleware.ts           — Auth guard: /dashboard/* requires login
drizzle.config.ts       — Points to db/schema/index.ts, reads .env.local
```

## Database Schema (key tables)

**`requests`** — core entity
- `status`: draft → submitted → triaged → assigned → in_progress → in_review → blocked → completed → shipped
- `stage`: intake → context → shape → bet → explore → validate → handoff → build → impact (DesignQ 9-stage workflow)
- `priority`, `complexity`, `request_type` — all set by AI triage after submission

**`request_ai_analysis`** — one-to-one with requests
- `quality_score` (0–100), `quality_flags` (string[]), `summary`, `reasoning`, `suggestions`

**`profiles`** — links to Supabase `auth.users`, stores `role`: pm / designer / developer / lead / admin

**`organizations`** — multi-tenant root; first user on signup becomes lead + creates the org

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=                    # Supabase session pooler (port 5432)
ANTHROPIC_API_KEY=               # console.anthropic.com
```

## Common Commands

```bash
npm run dev          # Start dev server
npm run db:push      # Push schema changes to Supabase (interactive, run in terminal)
npm run db:generate  # Generate migration files
npm run db:studio    # Open Drizzle Studio
npx tsc --noEmit     # Type check
```

## AI Triage

`lib/ai/triage.ts` uses `generateObject` with `claude-3-5-haiku-20241022` and a Zod schema.
Called in `app/api/requests/route.ts` after inserting the request row.
Updates `requests.priority`, `requests.complexity`, `requests.request_type` and sets status to `"triaged"`.

## Key Conventions

- **Server components** fetch data directly via Drizzle. No client-side data fetching on initial load.
- **Client components** use `fetch("/api/...")` + `router.refresh()` to re-render after mutations.
- **Auth actions** live in `app/actions/auth.ts` as server actions.
- **Dark theme** throughout: `bg-zinc-950` base, `border-zinc-800` borders, `text-zinc-400` secondary text.
- **No Railway** — backend is Supabase (serverless functions run on Vercel edge/Node).
- Supabase anon key and DATABASE_URL are in `.env.local` (gitignored). Never commit secrets.

## What's Built (as of session 2)

- [x] Next.js 14 project scaffolded, deployed to Vercel
- [x] Supabase connected (auth + database)
- [x] Drizzle ORM schema: organizations, profiles, requests, request_ai_analysis, assignments, request_stages, comments
- [x] Auth flow: signup (creates org + profile), login, logout, middleware guard
- [x] Request creation form (modal) with AI triage on submit
- [x] Dashboard: requests list with priority badges, complexity bars, status labels
- [x] AI triage: Claude Haiku analyzes priority/complexity/type/quality/suggestions

## What's Next (MVP scope)

- [ ] Request detail page — full triage breakdown, quality score, suggestions
- [ ] Assignment UI — assign a designer from the request detail page
- [ ] Duplicate detection — embeddings-based similarity check on new requests
- [ ] Request quality gate — block low-quality submissions with AI feedback
- [ ] Email notifications — Resend integration for assignment alerts
- [ ] Figma plugin — submit requests directly from Figma
