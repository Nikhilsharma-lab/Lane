# Morning Briefing — Design Spec

**Date:** 2026-04-07
**Status:** Approved

---

## Goal

A daily 30-second brief appears at the top of `/dashboard` every morning. Role-specific, AI-generated, pushed not pulled. Shows active context, overnight changes, and one AI-recommended priority action. Dismissible for the day; regenerates the next morning.

---

## Architecture Overview

- **Daily cron (8am):** Generates one `morning_briefings` row per user across all orgs. Skips users who already have a row for today (idempotent).
- **Server component on `/dashboard`:** Reads today's brief from DB on page load — no client-side spinner on first paint.
- **Client component for dismiss:** `MorningBriefingCard` handles the dismiss POST and optimistically hides the card.
- **No email / no push notifications:** In-app only for now.

---

## Data Model

### New table: `morning_briefings`

```typescript
{
  id: uuid (PK, default gen_random_uuid())
  userId: uuid (FK → profiles.id, ON DELETE CASCADE)
  orgId: uuid (FK → organizations.id, ON DELETE CASCADE)
  date: date  // YYYY-MM-DD string, the day this brief is for
  role: text  // "designer" | "pm" | "lead" | "admin"
  content: jsonb  // MorningBriefContent shape
  generatedAt: timestamptz (default now())
  dismissedAt: timestamptz (nullable)

  UNIQUE(userId, date)
}
```

### Content shape (jsonb)

```typescript
interface MorningBriefContent {
  greeting: string          // "Good morning, Yash"
  items: BriefItem[]        // 3-5 role-specific bullets
  oneThing: string          // "Today: push checkout redesign to Prove"
}

interface BriefItem {
  icon: string              // emoji: "🔴" | "✅" | "💬" | "💡" | "⏳" | "🚀"
  text: string              // e.g. "Checkout redesign is in Converge — 3 days idle"
}
```

---

## AI Generation: `lib/ai/morning-briefing.ts`

### Function signature

```typescript
export async function generateMorningBriefing(input: {
  userId: string
  orgId: string
  role: "designer" | "pm" | "lead" | "admin" | "member"
  userName: string
}): Promise<MorningBriefContent>

// "member" role is treated the same as "designer" inside the function.
```

### Context gathered per role

**Designer:**
- Their active requests (phase, stage, last activity date)
- Overnight comments on their requests (created since midnight)
- Sign-offs they still need to give (requests in `prove` stage where their sign-off is missing)
- KF6 proactive alerts addressed to them (not dismissed)
- Figma drift alerts (figmaUpdates where devReviewed=false, postHandoff=true)

**PM:**
- Their submitted requests (status, stage)
- Requests where their sign-off is pending
- Impact predictions they need to log (requests in `track` with no `impactActual`)
- KF6 proactive alerts addressed to them

**Lead / Admin:**
- All org requests: counts by phase (active, stalled, completed this week)
- Top 2 risks: oldest stall_nudge/stall_escalation/signoff_overdue alerts not dismissed
- Requests that moved to `shipped` in the last 7 days
- Ideas board: top-voted ideas (>3 votes) not yet validated
- Team momentum: requests shipped this week vs. last week

### AI prompt strategy

Use `generateObject` (Vercel AI SDK) with a zod schema matching `MorningBriefContent`. Pass the context as a structured prompt block. Use `claude-3-5-haiku-20241022` (same model as triage/alerts — fast and cheap for daily generation).

Items should be conversational and specific — mention request titles, not generic status. `oneThing` should be a single concrete action the user can take in the next hour.

### Error handling

If generation fails for a user, log the error and skip that user — do not fail the entire cron run. A missing brief for a user means no card shows on their dashboard (silently absent, not broken).

---

## Cron Route: `app/api/cron/morning-briefing/route.ts`

```
Schedule: 0 8 * * *   (8am daily, all days)
Auth: CRON_SECRET bearer token (same pattern as alerts cron)
```

Logic:
1. Auth check — return 401 if no/wrong `CRON_SECRET`
2. Fetch all users across all orgs (`profiles` table, select id + orgId + role + fullName)
3. Get today's date string (`new Date().toISOString().slice(0, 10)`)
4. For each user:
   - Check if a `morning_briefings` row for (userId, today) already exists — skip if so
   - Call `generateMorningBriefing({ userId, orgId, role, userName })`
   - Insert row into `morning_briefings`
   - On error: log + continue (don't fail the entire run)
5. Return `{ ok: true, generated: N, skipped: M }`

Process users **sequentially** (same reasoning as alerts cron — parallel would saturate Claude API rate limits).

---

## API Routes

### `GET /api/morning-briefing`

- Auth: Supabase user required
- Returns today's brief for the current user:
  ```typescript
  { brief: MorningBriefingRow | null }
  ```
- If no row exists for today → `{ brief: null }` (not an error)

### `POST /api/morning-briefing/dismiss`

- Auth: Supabase user required
- Sets `dismissedAt = now()` on today's row for the current user
- Returns `{ ok: true }` or 404 if no row found

---

## Dashboard Integration

### Server component: `app/(dashboard)/dashboard/page.tsx`

Fetch today's brief server-side:
```typescript
const [briefRow] = await db
  .select()
  .from(morningBriefings)
  .where(and(
    eq(morningBriefings.userId, userId),
    eq(morningBriefings.date, todayString)
  ))
  .limit(1)
```

Pass to `<MorningBriefingCard>` as a prop. If `briefRow` is null or `dismissedAt` is set, pass `null` — card renders nothing.

### Client component: `components/dashboard/morning-briefing-card.tsx`

Props: `brief: MorningBriefingRow | null`

If `brief` is null → renders nothing (no card, no skeleton).

If brief exists and not dismissed:
```
┌─────────────────────────────────────────────────────┐
│  Good morning, Yash · Monday, April 7                    ×  │
├─────────────────────────────────────────────────────┤
│  ✅ Checkout redesign moved to Prove yesterday             │
│  💬 Nikhil left 2 comments on Mobile nav overnight        │
│  🔴 Search overhaul has been idle for 4 days              │
│  💡 3 ideas are waiting for your validation               │
├─────────────────────────────────────────────────────┤
│  Today: Review Nikhil's comments on Mobile nav and        │
│  respond before standup.                                  │
└─────────────────────────────────────────────────────┘
```

On dismiss click:
1. Optimistically hide the card (set local `dismissed = true`)
2. POST to `/api/morning-briefing/dismiss`
3. On failure: restore the card (rollback)

---

## Files Touched

| File | Action |
|------|--------|
| `db/schema/morning_briefings.ts` | **Create** — Drizzle schema + types |
| `db/schema/index.ts` | **Modify** — add export |
| `db/migrations/<auto-named>.sql` | **Create** — run `npm run db:generate` to produce this file |
| `lib/ai/morning-briefing.ts` | **Create** — AI generation function |
| `app/api/cron/morning-briefing/route.ts` | **Create** — daily cron handler |
| `app/api/morning-briefing/route.ts` | **Create** — GET today's brief |
| `app/api/morning-briefing/dismiss/route.ts` | **Create** — POST dismiss |
| `components/dashboard/morning-briefing-card.tsx` | **Create** — card UI |
| `app/(dashboard)/dashboard/page.tsx` | **Modify** — fetch brief + render card |
| `vercel.json` | **Modify** — add 8am daily cron |

---

## Out of Scope

- Email/push delivery (in-app only)
- Briefing history / past days (today only)
- Per-user time zone scheduling (all users get 8am UTC for now)
- User preference to disable briefing
- Briefing on mobile / responsive design changes
