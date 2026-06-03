# SALVAGE.md — what to copy out of the old `lane-archive` repo

You are starting a clean repo (`lane`). You are **not** copying the old repo. You lift **three** things
and leave the other ~58,000 lines behind. The old repo is cloned locally as the sibling folder
`../lane-archive` (read-only reference). Hand this list to Claude Code and tell it: *copy only what's
listed here, nothing else.*

> Auth is NOT salvaged. It is built fresh on the current Supabase SSR pattern (@supabase/ssr) plus
> shadcn's login block — the two-month-old auth code would need rewriting for Next 16 anyway, so porting
> it saves nothing.

---

## 1. The core database tables (copy the Drizzle definitions, then regenerate migrations — see note)

```
db/schema/users.ts               ← defines `organizations` (= workspace) AND `profiles` (profiles link to Supabase auth.users)
db/schema/workspace-members.ts   ← defines `workspace_members`
db/schema/invites.ts             ← defines `invites`
db/schema/requests.ts            ← defines `requests`  ⚠️ TRIM THIS (see below)
db/index.ts  ·  db/user.ts       ← the db connection + withUserSession helper
```

**⚠️ Trim `requests.ts` hard when you copy it.** The old one has SEVEN status/stage enums (requestStatus,
stage, phase, predesignStage, designStage, kanbanState, trackStage) plus impact/Figma/handoff/iteration/
prediction fields — all dropped. Collapse to ONE status enum and keep only these columns:
`id, orgId, title, description, classification, reframedProblem, extractedSolution,
status, assignedTo, createdBy, createdAt, updatedAt`.
- `status` = a single new enum: `open` -> `in_progress` -> `done`. Delete all seven old stage/phase/kanban enums.
- `assignedTo` = nullable uuid -> the designer who picked the request up (null = nobody yet).
- Also trim `roleEnum` in `db/schema/users.ts` to `["pm", "designer", "developer"]` (drop "lead"/"admin" —
  those conflate with the permission role). `profiles.role` is the single home for PM/Designer/Developer.

## 2. The intake gate — your actual IP (copy almost verbatim)

```
lib/ai/triage.ts                       ← the prompt that classifies problem/solution/hybrid + reframes
app/api/requests/preflight/route.ts    ← the route that calls it (reference for wiring; adapt to Next 16)
lib/rate-limit.ts                      ← so the AI endpoint can't be hammered
```

You can simplify `triage.ts`: the MVP only needs `classification`, `reframedProblem`, `extractedSolution`,
`qualityScore`, `qualityFlags`, `suggestions`. You may drop `priority`, `complexity`, `requestType`,
`potentialDuplicates` for v1 and add them back later if anyone asks.

## 2b. The onboarding role picker (reference the look, rewire the data)

```
components/onboarding/functional-tag-picker.tsx   ← the PM / Designer / Developer card picker — use as VISUAL reference
```

Keep its three cards and labels (they describe the MVP flow well): PM "creates requests", Designer
"picks up requests", Developer "reserved for later". But change two things when you rebuild it:
- **Single-select**, not multi-select (one role per person for the MVP).
- **Write to `profiles.role`**, NOT `user_functional_tags`. Do NOT salvage the `user_functional_tags`
  table, the `setFunctionalTags` action, or `detect-persona.ts` — they're the redundant second role system.

The role is a LABEL, not a permission gate — the view and available actions are identical for every role.
Anyone can submit a request, and anyone can pick up an Open one (sets status=in_progress, assignedTo=them)
and mark it Done. (PM/Designer/Developer just describes what a person typically does.) Role is set at
onboarding and editable later in Settings -> Profile; both write to `profiles.role`. Do NOT build role-based
view gating, per-role dashboards, hidden actions, or salvage `lib/structural-role.ts`'s functional-role gating.

## 3. The RLS security policies (copy the SQL, not the migration files)

The hard-won fix from the old repo (the "zero policies = silent lockout" bug) lives in:

```
db/migrations/0018_workspace_members_rls_policies.sql
db/migrations/0019_is_workspace_admin_helper_high1_fix.sql
```

Copy the **policy SQL** out of these. Don't copy them as numbered migrations into the new repo.

---

## ⚠️ The one thing NOT to do: do not copy the 34-migration chain

The old repo's schema was built across 30+ migrations that reference each other in order. You cannot
cleanly pull "just the identity-table migrations" out of that chain — that's the same dangerous surgery
as carving up the app. Instead:

1. Copy the trimmed Drizzle schema files above into the new repo.
2. Let Drizzle generate **one fresh `0000` migration** from them.
3. Add the RLS policy SQL (from §3) as a second clean migration.

You end up with **2 migrations**, not 34. Clean slate, same proven schema shape.

---

## Everything else in `../lane-archive`: leave it.

Do not copy: the auth code (build fresh), the 250KB CLAUDE.md, the 332KB CHANGELOG, `DOCS BIG/`, the 7
cron routes, the Figma `lib/figma` and `app/api/figma`, `lib/ai/morning-briefing.ts` and the other 8 AI
files, every dashboard sub-page (ideas, radar, stickies, initiatives, reflections, insights, etc.), and
all the settings sub-pages except members.
