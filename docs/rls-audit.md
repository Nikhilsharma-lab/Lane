# Lane — RLS Audit

**Date:** April 17, 2026
**Item:** 12 (Week 2)
**Status:** Audit complete. Migration plan ready for execution.

---

## Context

RLS is already enabled on ~20 tables with ~40 policies defined across migrations `0005_brisk_canary.sql` and `0006_alert_rls_tighten.sql`. Policies use a helper function layer (`current_app_user_id()`, `current_app_org_id()`, etc.) whose GUCs are set by `withUserDb` / `withUserSession` from `db/user.ts`.

47 files already use the RLS-aware helpers. 28 files still import raw `db` from `@/db` (system role, bypasses all RLS). This audit classifies those 28 and recommends a migration path.

---

## Architecture summary

### The two DB paths

| Path | Import | RLS enforced | Use when |
|---|---|---|---|
| System role | `import { db } from "@/db"` | No — bypasses all policies | Crons, auth bootstrap, system-level ops with no user context |
| User session | `withUserDb(userId, fn)` or `withUserSession(userId, fn)` | Yes — GUCs set, policies active | Any route with a known `auth.uid()` operating on user/org-scoped data |

### Helper functions (defined in migration 0005)

| Function | Returns | Used in policies for |
|---|---|---|
| `current_app_user_id()` | Session user ID from GUC | Owner checks, recipient checks |
| `current_app_org_id()` | Session org ID from GUC | Org membership scoping |
| `current_app_role()` | User role from GUC | Privileged-only mutations |
| `is_current_org_member(org_id)` | Boolean | Most table policies |
| `is_current_org_privileged()` | Boolean (lead/admin) | Figma connections, invites, idea validations, weekly digest mutations |
| `can_access_request(request_id)` | Boolean (org + guest check) | All request-child tables |
| `can_access_idea(idea_id)` | Boolean (org check) | Idea-child tables |

### `withUserDb` vs `withUserSession`

| Helper | Scope | Best for |
|---|---|---|
| `withUserDb(userId, fn)` | Transaction-wrapped, short-lived | Pure DB operations — page data fetches, simple mutations |
| `withUserSession(userId, fn)` | Session-level, longer-lived | Routes that also call external APIs (Anthropic, Figma, Resend) |

**Decision rule:** If the route calls any external API (AI triage, Figma sync, email), use `withUserSession`. Otherwise, `withUserDb`.

---

## Route inventory — 28 files on system role

### Classification key

- **MIGRATE** — should use RLS-aware helpers. User context is available and data is org-scoped.
- **KEEP** — legitimate system-role usage. No user context, or pre-auth bootstrap.
- **AMBIGUOUS** — needs further investigation before deciding.

### Dashboard pages (13 files)

| # | File | Classification | Reason | Helper |
|---|---|---|---|---|
| 1 | `app/(dashboard)/layout.tsx` | KEEP | Layout shell — runs before full auth context is available. Fetches nav structure, workspace metadata. Pre-auth bootstrap. | — |
| 2 | `app/(dashboard)/dashboard/page.tsx` | MIGRATE | Dashboard home. User is authenticated. Fetches org-scoped request counts, team data. | `withUserDb` |
| 3 | `app/(dashboard)/dashboard/radar/page.tsx` | MIGRATE | Design Radar. Authenticated, org-scoped. Read-only. | `withUserDb` |
| 4 | `app/(dashboard)/dashboard/inbox/page.tsx` | MIGRATE | Notification inbox. Authenticated, user-scoped. | `withUserDb` |
| 5 | `app/(dashboard)/dashboard/ideas/page.tsx` | MIGRATE | Ideas board. Authenticated, org-scoped. | `withUserDb` |
| 6 | `app/(dashboard)/dashboard/my-requests/page.tsx` | MIGRATE | My requests (just shipped). Authenticated, user-scoped. | `withUserDb` |
| 7 | `app/(dashboard)/dashboard/requests/page.tsx` | MIGRATE | All requests. Authenticated, org-scoped. | `withUserDb` |
| 8 | `app/(dashboard)/dashboard/initiatives/page.tsx` | MIGRATE | Initiatives list. Authenticated, org-scoped. | `withUserDb` |
| 9 | `app/(dashboard)/dashboard/initiatives/[id]/page.tsx` | MIGRATE | Initiative detail. Authenticated, org-scoped. | `withUserDb` |
| 10 | `app/views/[id]/page.tsx` | AMBIGUOUS | Published view — may be public/shared. Needs investigation: does it require auth? If public, keep on system role with explicit scoping. If auth-gated, migrate. | TBD |

### Settings pages (7 files)

| # | File | Classification | Reason | Helper |
|---|---|---|---|---|
| 11 | `app/(settings)/settings/layout.tsx` | KEEP | Settings layout shell — same bootstrap pattern as dashboard layout. | — |
| 12 | `app/(settings)/settings/account/page.tsx` | MIGRATE | User's own account. Authenticated, user-scoped. | `withUserDb` |
| 13 | `app/(settings)/settings/members/page.tsx` | MIGRATE | Org members list. Authenticated, org-scoped, admin-gated. | `withUserDb` |
| 14 | `app/(settings)/settings/workspace/page.tsx` | MIGRATE | Workspace settings. Authenticated, org-scoped, admin-gated. | `withUserDb` |
| 15 | `app/(settings)/settings/projects/page.tsx` | MIGRATE | Projects/teams list. Authenticated, org-scoped. | `withUserDb` |
| 16 | `app/(settings)/settings/integrations/page.tsx` | MIGRATE | Figma integration settings. Authenticated, org-scoped. | `withUserDb` |
| 17 | `app/(settings)/settings/plan/page.tsx` | MIGRATE | Billing/plan. Authenticated, org-scoped, admin-gated. | `withUserDb` |
| 18 | `app/(settings)/settings/danger/page.tsx` | MIGRATE | Danger zone (delete workspace). Authenticated, admin-only. | `withUserDb` |

### API / cron routes (5 files)

| # | File | Classification | Reason | Helper |
|---|---|---|---|---|
| 19 | `app/api/cron/alerts/route.ts` | KEEP | Cron job — no user session. System-level alert detection across all orgs. | — |
| 20 | `app/api/cron/resurface/route.ts` | KEEP | Cron job — resurfaces deferred requests. System-level, cross-org. | — |
| 21 | `app/api/cron/morning-briefing/route.ts` | KEEP | Cron job — generates briefings for all users. System-level. | — |
| 22 | `app/api/nav/route.ts` | KEEP | Nav data endpoint — called by the layout shell. Same bootstrap pattern as the layout. Investigate later whether this can migrate once layout migrates. | — |
| 23 | `app/api/insights/digest/generate/route.ts` | KEEP | Digest generation — cron-adjacent, processes all orgs. | — |

### Lib files (5 files)

| # | File | Classification | Reason | Helper |
|---|---|---|---|---|
| 24 | `lib/alerts/detect.ts` | KEEP | Called by cron/alerts. System-level, no user context. | — |
| 25 | `lib/digest.ts` | KEEP | Called by digest generation. System-level. | — |
| 26 | `lib/queries/nav.ts` | KEEP | Called by /api/nav and layout. Bootstrap-level. | — |
| 27 | `lib/figma/sync.ts` | AMBIGUOUS | Could be called from user-initiated Figma sync (should be RLS-aware) or from a system process. Trace callers before deciding. | TBD |
| 28 | `lib/ai/morning-briefing.ts` | KEEP | Called by cron/morning-briefing. System-level. | — |

### Summary

| Classification | Count | Files |
|---|---|---|
| **MIGRATE** | 17 | #2-9, #12-18, #6 |
| **KEEP** | 9 | #1, #11, #19-23, #24-26, #28 |
| **AMBIGUOUS** | 2 | #10 (published views), #27 (figma sync) |

---

## Migration tiers

### Tier 1 — Migrate first (write paths + sensitive data)

These routes handle mutations or display sensitive org data. Highest risk if authorization is wrong.

| Priority | File | Risk reason |
|---|---|---|
| P1 | `settings/members/page.tsx` | Shows all org members. Admin-gated but no DB-level enforcement. |
| P2 | `settings/workspace/page.tsx` | Workspace configuration. Admin-gated. |
| P3 | `settings/danger/page.tsx` | Delete workspace. Admin-only. |
| P4 | `settings/plan/page.tsx` | Billing data. Admin-gated. |
| P5 | `settings/integrations/page.tsx` | Figma tokens (encrypted, but still org-scoped). |

### Tier 2 — Migrate next (read-only but org-scoped)

These display org data. Lower risk (behind auth middleware) but should be RLS-enforced for defense-in-depth.

| Priority | File |
|---|---|
| P6 | `dashboard/page.tsx` |
| P7 | `dashboard/requests/page.tsx` |
| P8 | `dashboard/my-requests/page.tsx` |
| P9 | `dashboard/ideas/page.tsx` |
| P10 | `dashboard/radar/page.tsx` |
| P11 | `dashboard/inbox/page.tsx` |
| P12 | `dashboard/initiatives/page.tsx` |
| P13 | `dashboard/initiatives/[id]/page.tsx` |
| P14 | `settings/account/page.tsx` |
| P15 | `settings/projects/page.tsx` |

### Tier 3 — Resolve ambiguity, then decide

| File | Investigation needed |
|---|---|
| `app/views/[id]/page.tsx` | Does it require auth? If public, keep on system role with explicit ID-based scoping. If auth-gated, migrate. |
| `lib/figma/sync.ts` | Trace callers. If only called from user-initiated routes, it should receive a user-scoped DB handle from the caller rather than importing its own. |

---

## Policy gap check

### New columns shipped in Week 1

| Column | Table | Covered by existing policy? |
|---|---|---|
| `ai_flagged` | requests | Yes — `requests_org_access` covers all columns via `FOR ALL` on the row |
| `ai_classifier_result` | requests | Yes — same policy |
| `ai_extracted_problem` | requests | Yes — same policy |
| `ai_extracted_solution` | requests | Yes — same policy |
| `intake_justification` | requests | Yes — already existed, same policy |
| `designer_owner_id` | requests | Yes — same policy |

All new columns are on the `requests` table, which has a `FOR ALL` policy checking `is_current_org_member(org_id)`. Column-level changes don't require new policies. No gaps.

### Tables potentially missing RLS

These tables have `org_id` or user-scoped data but may not have `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements. Needs targeted verification:

- `cycles`
- `notifications`
- `stickies`
- `published_views`
- `initiatives`
- `notification_preferences`
- `activity_log`
- `iterations`
- `workspace_members` (composite key table)
- `project_members` (composite key table)
- `stream_guests` (composite key table)

**Recommended action:** Run a targeted grep for each table name against the migration files. For any table with RLS enabled but no policies, either add a policy or document the gap. For tables without RLS enabled at all, decide whether they need it (org-scoped data = yes, system-only data = maybe not).

---

## Migration plan

### Execution approach

Each file migration follows the same mechanical pattern:

1. Replace `import { db } from "@/db"` with the appropriate helper import
2. Wrap the data-fetching logic in `withUserDb(user.id, async (db) => { ... })`
3. Remove manual org-scoping (`WHERE org_id = profile.orgId`) — RLS handles it now
4. Run `npx tsc --noEmit`
5. Test the page/route manually

### Estimated effort

| Scope | Files | Effort | Notes |
|---|---|---|---|
| Tier 1 (settings, write paths) | 5 files | ~2 hours | Higher risk, needs careful testing |
| Tier 2 (dashboard, read-only) | 10 files | ~3 hours | Mechanical, lower risk |
| Tier 3 (ambiguous) | 2 files | ~1 hour | Investigation + decision + possible migration |
| Policy gap check | ~11 tables | ~30 min | Grep + classify + write missing policies if any |
| Documentation cleanup | — | ~30 min | Update db/client.ts comment (28 not 52), close GH #19 |
| **Total** | 17-19 files | **~7 hours** | Across 2 sessions |

### Recommended session split

**Session 1 (~4 hours):** Tier 1 (5 settings files) + policy gap check + documentation. This closes the highest-risk routes and produces the doc. Matches Item 12's original 4-hour budget.

**Session 2 (~3 hours):** Tier 2 (10 dashboard files) + Tier 3 (2 ambiguous files). Can be slotted into Week 3 or 4 slack.

---

## Roadmap updates needed

1. **Item 12 description:** Update from "Write CREATE POLICY SQL statements" to "Migrate 17 routes from system role to RLS-aware helpers. Policy gap check on ~11 tables."
2. **New parking lot item:** "Session 2 of RLS migration — Tier 2 dashboard pages + Tier 3 ambiguous files (~3 hours)"
3. **db/client.ts comment:** Update "~52 routes" to "~28 routes (as of April 17 audit)" after migration work begins.
4. **GitHub issue #19:** Reference this audit doc. Close once all tiers are migrated.

---

## Appendix: Policy patterns reference

For use when writing any new policies during the gap check.

### Pattern A: Org-scoped table with direct `org_id`

```sql
CREATE POLICY "tablename_org_access" ON public.tablename
  FOR ALL USING (public.is_current_org_member(org_id));
```

### Pattern B: Child table scoped via parent request

```sql
CREATE POLICY "tablename_request_access" ON public.tablename
  FOR ALL USING (public.can_access_request(request_id));
```

### Pattern C: Split operations (different rules for read vs write)

```sql
CREATE POLICY "tablename_select" ON public.tablename
  FOR SELECT USING (public.is_current_org_member(org_id));

CREATE POLICY "tablename_mutate" ON public.tablename
  FOR ALL USING (
    public.is_current_org_member(org_id)
    AND public.is_current_org_privileged()
  );
```

### Pattern D: Owner-scoped (user sees only their own rows within org)

```sql
CREATE POLICY "tablename_owner" ON public.tablename
  FOR ALL USING (
    public.is_current_org_member(org_id)
    AND user_id = public.current_app_user_id()
  );
```