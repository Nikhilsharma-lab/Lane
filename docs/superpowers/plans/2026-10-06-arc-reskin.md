# Arc UI Reskin Implementation Plan

**Goal:** Reskin Lane's existing product screens with official Arc UI components and blocks, preserving every approved route, action, Request state, and permission boundary.

**Architecture:** Keep Lane's server actions, data queries, and Clerk tenancy. Install Arc source into `src/components/arc` and migrate one visible pattern at a time. Arc is the sole product theme and visual authority. Marketing is excluded by Nikhil's explicit instruction. Use Arc MCP `get_component` before each item, including Pro items; Pro CLI installs require `ARC_PRO_TOKEN`.

**Stack:** Next.js 16, React 19, TypeScript, CSS modules, Motion, Arc UI, existing Clerk/Supabase/Drizzle.

## Global constraints

- `REQUIREMENTS.md` controls product behavior. No new routes, tables, AI calls, or cron jobs.
- Preserve Requests, Intake, Open → In Progress → Done, named responsibilities, and submitter closure contract.
- Use Arc keyboard fill/selection behavior and verify reachable, identifiable focus.
- Use actual Arc registry source. Do not copy sample data or invent unsupported props.
- Preserve unsaved Request drafts, file upload recovery, auth, and workspace isolation.
- Review light/dark, 390/768/1024/1440 widths, long copy, loading/empty/error/success, keyboard and screen reader names.

## Inventory and mapping

| Lane region | Arc source used | Parity to verify |
| --- | --- | --- |
| Product shell | Licensed `sidebar-rail`, `user-menu`, `notification-center`, `avatar`, `tooltip` | Workspace identity, routes, mobile menu, keyboard, unread count |
| Requests empty state | `empty-state`, `button`, `skeleton` | One New Request action, admin invite action, guest copy |
| Requests populated list | `sortable-data-table`, `filter-toolbar`/`FilterMenu`, `search-field`, `select`, `pagination` | Filters, sort, deep links, status and project/type labels |
| Request detail | `avatar`, `badge`, `empty-state`, `input`, `textarea`, `alert` | Lifecycle, attachments, comments, expected impact, guest restrictions |
| Request composer and review | `drawer`, `input`, `textarea`, `search-field`, `popover`, `radio-group`, `progress`, `alert` | Draft persistence, validation, focus, retries, uploads, signed review |
| Auth and onboarding | `password-field`, `input`, `radio-group`, `button`, plus supported Clerk appearance variables | Sign-in, invites, reset, organization choice, role choice |
| Settings Profile/Members | `input`, `radio-group`, `button`, `skeleton`, plus Clerk's supported invitation UI | Role save, theme preference, invitations, admin/member/guest behavior |

## Execution order

- [x] Install the official Arc free skill, foundation, and first reusable controls; verify MCP Pro source access.
- [x] Replace the old theme cascade with the official Arc foundation, fonts, and native theme attributes.
- [x] Migrate Requests first-use to Arc Empty State and Button; keep its existing test contract and add a browser preview.
- [x] Migrate the product shell using the licensed `sidebar-rail` source and Lane's existing destinations.
- [x] Migrate populated Requests list and filtered/unavailable states.
- [x] Migrate Request detail and comments with real data and actions.
- [x] Migrate composer and review with draft, AI, upload, and failure recovery checks.
- [x] Migrate auth/onboarding hosts and Settings Profile/Members.
- [x] Remove unused competing design source and dependencies after active import searches; update `DESIGN.md`, Storybook, and the Arc source ledger.
- [x] Run typecheck, lint, Vitest (398 action/unit, 75 UI), Storybook (192 interactions), Next and Storybook builds, and Requests browser checks at 390/768/1024/1440 in light and dark themes. This is local verification; deployed Clerk and release gates remain separate.

Each line must leave its screen usable. Record installed Arc IDs, source links, adaptations, and checks in the design-system source ledger.
