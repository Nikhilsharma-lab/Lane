# Request Projects and Types Implementation Plan

**Goal:** Make the approved composer controls useful end to end: optional saved Project and Request type, inline Project creation for anyone in the workspace, clear supporting context, and visible/filterable metadata on Requests.

**Authority:** Nikhil defined Projects as App/Website/Marketing/B2B App/B2C App work areas, allowed anyone to create them, selected Bug/Improvement/New feature as the starting categories, and instructed “now make the changes.” This authorizes this bounded persistence and UI increment. It does not authorize unrelated project-management screens, generic labels, automatic assignment, priority, new AI calls, production migration or deployment.

## Contract

- One optional workspace Project per Request; searchable selection and inline name-based creation. Existing names are reused case-insensitively. Optional description is supported without requiring it at creation.
- One optional Request type: Bug, Improvement, New feature. Initially unset, clearable, recorded as the requester's categorization. The AI problem/solution/hybrid review remains separate and required.
- Anyone with active workspace membership can create a Project. PM/Designer/Developer profile labels do not gate it. Guests retain their own-Request visibility: Project discovery/selection is limited to their created Projects and Projects referenced by their own Requests.
- Borderless main title/description with accessible names, focus and validation. Context reveals audience/desired change; Evidence reveals observations/link/uncertainty. Private attachments remain available and recoverable.
- Saved Project/type are visible in existing list/detail and usable in existing list filters. No new route or management screen.
- Signed review tokens and scoped drafts include metadata; old drafts/tokens remain compatible. Server validation and a composite database relation prevent cross-workspace Project attachment.

## Implementation and ownership

- [x] Data: `src/db/schema/projects.ts`, Requests schema/export and additive migration; client-safe property definitions; guarded Project actions; request schema, signed token, draft and save integration. Verify auth, foreign-workspace/guest restrictions, duplicate names and metadata recovery.
- [x] Composer: reuse actual free ReUI combobox source, adapt the existing Intake form, add relevant mocked Storybook behaviors and preserve the prior recovery suite.
- [x] Saved views: extend workspace-scoped read models, list/detail presentation and Project/type filters through the existing ReUI compositions.
- [x] Database: inspect target, verify a staging backup, apply the additive migration only to Lane Staging, verify constraints/RLS/grants and preserve existing rows. Update the disposable local test bootstrap with the canonical migration. Production remains unchanged.
- [x] Verification: focused unit/database/browser coverage, TypeScript, scoped lint and production build. Inspect desktop/light and phone/dark together, fix material issues, show the actual running local app. Record evidence and limits below.

## Evidence

ReUI source: free [`c-combobox-10` popup example](https://reui.io/preview/base/components/c-combobox-10?ref=mcp), [supplied Base UI API](https://ui.shadcn.com/docs/components/base/combobox), [CLI hashes and adaptations](../../design-system/project-picker-source-hashes.json).

- Staging target allowlisted as Supabase `jznepeqghjixcrpuddym`. Verified custom-format public-schema/data backup `backups/lane-staging-pre-0015-2026-10-05T13-00-27-546Z.dump` (27,287 bytes, mode 0600; verified 2026-10-05 13:00:46 UTC). Archive table/data entries and full restore parsing passed before migration.
- Canonical `0015_request_projects_and_types.sql` applied to staging only. Existing counts preserved: organizations 2, profiles 3, Requests/comments/notifications/attachments 0. Verified Project RLS, no anon/authenticated SELECT or INSERT grants, and the workspace/Project composite foreign key. Evidence: `.next-audit/projects-staging-migration.log`.
- Fresh disposable local PostgreSQL bootstrap through 0015: 72 tests across 7 files pass. Focused property schema/draft/token/action suite: 48 tests across 6 files pass. These suites overlap; counts are not additive. Real Drizzle list/detail query checks plus existing overview tests: 8 pass. Evidence: `.next-audit/request-projects-db-tests.log`, `request-projects-unit-final.log`, `project-views-unit.log`.
- Existing Requests/list/detail browser coverage plus new property filters: 34 desktop/light and 34 phone/dark cases pass; 2 static property stories also pass. Composer/Intake: 47 desktop/light and 47 phone/dark cases pass, including accessibility scans, async Project failure recovery, draft/upload/AI flows and nested Escape handling. Evidence: `.next-audit/project-views-{desktop,phone}.log` and `.next-audit/request-properties-{desktop,phone}.log`.
- Final production build (13 generated pages), TypeScript, scoped ESLint and `git diff --check` pass after the picker focus fix. Evidence: `.next-audit/request-projects-build.log`, `.next-audit/project-composer-{typecheck,lint}.log`, `.next-audit/request-projects-{typecheck,lint}.log`. The initial sandboxed build could not fetch the existing Google fonts; the network-enabled build passed. The disposable local database was stopped after verification.
- Visually inspected all 12 captures in `test-results/request-properties/`: compose/Project/type/review in desktop/light and phone/dark, plus populated list/detail at both sizes. Fixtures are synthetic Storybook data.
- Live local app against staging: opened New Request, loaded the real empty Project picker, created **Website**, verified automatic selection and displayed the three Request type choices. After rebuilding/reloading, Website remained available from the server and Escape dismissed only its picker. This leaves one meaningful Website Project in the staging test workspace. No fabricated Request or real AI call was needed for this live check; AI/save recovery is covered by controlled browser fixtures and action/token/database tests. Final build is running on `http://localhost:3000/`, and the New Request composer was visually inspected and left open in Codex.

## Boundaries

- Production schema/application were not migrated or deployed; promotion still needs the existing production backup and release gates.
- No full Project-management screen, generic Labels, editing existing Request metadata, assignment or priority behavior was added.
- Request list filters operate on the existing latest-200 fetch. Broader historical access remains separate.
- Existing unrelated auth/settings source-contract failures from the preceding pass are not represented as passing. OAuth, invitations and provider delivery were not part of this verification.

## Focus and copy correction — 2026-10-05

Nikhil rejected the heavy search field and editor bounding boxes in focused screenshots. Root cause: consumer focus-ring classes on title/description; InputGroup border, fill and ring on popup search; and missing `reui-theme` on portalled picker content, which inherited legacy global tokens. The explicit correction uses a composer-scoped CSS module, preserves ReUI/Base UI behavior and ordinary control focus, removes editor rectangles/resize handles, and makes both searches flat rows with one separator. Native text carets and field-associated validation remain. Description now reads **“Add a description…”**, with the accessible label **“Description”**; direct-entry and dialog instructions now say to add a title and description.

Verification: all eight desktop/light and phone/dark focused title/description/Project/type captures were visually inspected; computed-style checks confirm no painted editor border/outline/shadow, transparent search rows with one bottom separator, and neutral popup tokens. Existing browser coverage passed 47/47 on phone; desktop passed 46/47 initially, with its sole transition-sensitive Project-clearing case passing unchanged on targeted retry. Final production build (including TypeScript), scoped lint and whitespace checks pass. Evidence: `test-results/request-composer-polish/`, `.next-audit/composer-polish-{desktop,desktop-retry,phone,capture}.log`, `.next-audit/request-composer-polish-{build,lint}.log`. The empty Requests entry copy now also says to submit a design Request and add a title/description, removing the same vague wording. No backend or data changes in this correction.
