# PLANE-MAP — Architectural Reference for Lane

> Read-only map of [makeplane/plane](https://github.com/makeplane/plane) (`preview` branch, June 2025).
> Purpose: sequence Lane's growth by understanding what a mature product in this space looks like.
> No Plane code is pasted — patterns are paraphrased with file-path citations (AGPL).

---

## 1. Top-Level Architecture

### Monorepo Layout

Six apps, fifteen shared packages, orchestrated by pnpm workspaces + Turborepo.

| App | What it is | Stack | Path |
|-----|-----------|-------|------|
| **web** | Main product SPA | React 18, React Router 7, MobX, Tailwind v4 | `apps/web/` |
| **admin** | Instance admin panel ("God Mode") | Same frontend stack, separate deploy | `apps/admin/` |
| **space** | Public/published project views | Lighter React SPA | `apps/space/` |
| **api** | REST backend — all business logic + DB | Django + DRF, Python | `apps/api/` |
| **live** | Realtime collaboration server | Node.js, Express, Hocuspocus (Yjs), Redis | `apps/live/` |
| **proxy** | Reverse proxy for self-hosted deploys | Caddyfile | `apps/proxy/` |

| Package | Purpose |
|---------|---------|
| `types` | Shared TypeScript interfaces (workspace, project, issue, member, etc.) |
| `ui` | Shared UI component library (Avatar, CustomMenu, Loader, etc.) |
| `propel` | Newer design-system layer — icons, toast; emerging replacement for `ui` |
| `editor` | TipTap-based rich text editor (pages + issue descriptions) |
| `services` | HTTP service layer — typed API client wrappers per entity |
| `hooks` | Shared React hooks (utility: outside-click, local-storage, platform) |
| `constants` | Permission enums, feature flags, settings constants |
| `utils` | Pure utility functions (cn, ordering, URL helpers) |
| `i18n` | i18next internationalization + ICU message format |
| `shared-state` | Cross-app MobX state atoms |
| `logger` | Winston-based logging |
| `tailwind-config` | Shared Tailwind v4 theme/config |
| `typescript-config` | Shared tsconfig bases |
| `codemods` | jscodeshift migration scripts |
| `decorators` | TypeScript decorators (metadata) |

### CE/EE Extension Pattern

The web app uses a `core/` + `ce/` directory split:
- `apps/web/core/` — components, hooks, services, stores, constants shared by all editions.
- `apps/web/ce/` — Community Edition implementations. Extension points are abstract base classes
  in core with concrete implementations in `ce/`. EE replaces `ce/` without forking core.
- `apps/web/app/routes/extended.ts` is `[]` in CE. EE populates it with commercial routes.

### App Shell & Two-Tier Navigation

**Tier 1 — Workspace sidebar** (always visible):
- Workspace switcher dropdown (top)
- Home, Projects, Active Cycles, Analytics, Workspace Views, Drafts, Stickies, Notifications
- Favorites section (drag-and-drop, folders)
- Project list with expandable per-project sub-nav
- User menu (bottom) — profile settings, God Mode link (if admin), sign out

**Tier 2 — Project sub-nav** (within a project):
- Work Items, Cycles, Modules, Views, Pages, Intake
- Each is toggleable per-project via project feature settings
- Visibility is also permission-gated (Guests see fewer items)

### Complete Route Map

**Web app** (`apps/web/`):
```
Auth & Onboarding
  /                              Sign in
  /sign-up                       Sign up
  /accounts/forgot-password      Password reset request
  /accounts/reset-password       Password reset (with token)
  /accounts/set-password         Set password (OAuth users)
  /onboarding                    Post-signup onboarding steps
  /create-workspace              Workspace creation
  /invitations                   Accept workspace invitations (authed)
  /workspace-invitations         Accept invite via link (public)

Workspace-scoped (/:workspaceSlug)
  /:ws                           Workspace home / dashboard
  /:ws/projects                  Project list
  /:ws/active-cycles             Cross-project active cycles (EE gated)
  /:ws/analytics/:tabId          Workspace analytics (Overview / Work Items)
  /:ws/workspace-views           Workspace-level saved views
  /:ws/workspace-views/:id       Workspace view detail
  /:ws/drafts                    Draft work items
  /:ws/stickies                  Personal stickies
  /:ws/notifications             Notification inbox
  /:ws/browse/:workItem          Direct work-item deeplink by identifier
  /:ws/profile/:userId           Member profile + assigned/created/subscribed
  /:ws/profile/:userId/activity  Member activity log
  /:ws/projects/archives         Archived projects list

Project-scoped (/:ws/projects/:projectId)
  .../issues                     Work items list (all layouts)
  .../issues/:issueId            Work item detail
  .../cycles                     Cycle list
  .../cycles/:cycleId            Cycle detail
  .../modules                    Module list
  .../modules/:moduleId          Module detail
  .../views                      Saved views list
  .../views/:viewId              View detail
  .../pages                      Pages list
  .../pages/:pageId              Page editor
  .../intake                     Intake/triage queue
  .../archives/issues            Archived issues
  .../archives/issues/:id        Archived issue detail
  .../archives/cycles            Archived cycles
  .../archives/modules           Archived modules

Settings
  /:ws/settings                  Workspace general
  /:ws/settings/members          Workspace members & invites
  /:ws/settings/billing          Billing & plans (admin only)
  /:ws/settings/exports          Data exports
  /:ws/settings/webhooks         Webhooks list
  /:ws/settings/webhooks/:id     Webhook detail
  /:ws/settings/integrations     Integrations (page exists, not in route config — EE stub)
  /:ws/settings/projects         Project settings list
  /:ws/settings/projects/:pid    Project general settings
  /:ws/settings/projects/:pid/members        Project members
  /:ws/settings/projects/:pid/features/*     Feature toggles (cycles/modules/views/pages/intake)
  /:ws/settings/projects/:pid/states         Workflow states
  /:ws/settings/projects/:pid/labels         Labels
  /:ws/settings/projects/:pid/estimates      Estimate points
  /:ws/settings/projects/:pid/automations    Automations

Profile (outside workspace)
  /settings/profile/:tabId       Profile, Preferences, Notifications, Security, API Tokens
```

**Admin app** (`apps/admin/`):
```
  /                     Admin sign-in
  /general              Instance general settings
  /workspace            Workspace management + /workspace/create
  /email                SMTP/email config
  /authentication       Auth provider hub
  /authentication/github|gitlab|google|gitea   Per-provider config
  /ai                   AI provider config
  /image                Image storage config
```

**Space app** (`apps/space/`):
```
  /                              Landing
  /:workspaceSlug/:projectId     Public project view
  /issues/:anchor                Public issue deeplink
```

**Django API** (`apps/api/`) — 21 URL modules under `/api/`:
`analytic`, `api` (tokens), `asset`, `cycle`, `estimate`, `exporter`, `external`,
`intake`, `issue`, `module`, `notification`, `page`, `project`, `search`, `state`,
`timezone`, `user`, `views`, `webhook`, `workspace`
Plus: `/api/public/` (space), `/api/instances/` (admin), `/api/v1/` (external API), `/auth/` (authentication).

---

## 2. Complete Feature Inventory

### Auth
- **Email + password sign-in/sign-up** — credential-based auth. Entry: `/`, `/sign-up`.
- **Magic link sign-in** — passwordless OTP via email code. Entry: auth forms.
- **Google OAuth** — admin-configurable. Entry: auth flow.
- **GitHub OAuth** — admin-configurable.
- **GitLab OAuth** — admin-configurable.
- **Gitea OAuth** — admin-configurable.
- **Forgot/reset password** — email-based reset flow. Entry: `/accounts/forgot-password`.
- **Set password** — for OAuth users adding a password. Entry: `/accounts/set-password`.

### Onboarding
- **Profile setup** — display name, avatar, optional password. Entry: `/onboarding`.
- **Role selection** — Product Manager, Engineering Manager, Designer, Developer, Founder, Ops, Others.
- **Use case selection** — multi-select: roadmaps, sprints, cross-functional, tool replacement, exploring.
- **Create or join workspace** — name, slug, org size. Or accept pending invitations.
- **Invite members** — email + role picker. Skippable.
- **Workspace invitations** — accept/reject links. Entry: `/invitations`, `/workspace-invitations`.

### Home / Dashboard
- **Home page** — workspace landing with configurable widget grid. Entry: `/{ws}/`.
- **Quick links widget** — user-curated bookmarks.
- **Recent activity widget** — recently visited issues, pages, projects.
- **Stickies widget** — inline sticky notes on dashboard.
- **Manage widgets modal** — enable/disable/reorder dashboard widgets.

### Projects
- **Project list** — search/filter all projects. Entry: `/{ws}/projects/`.
- **Create project** — name, identifier, description, network (public/secret), emoji/icon.
- **Project settings** — name, description, cover, identifier, network. Entry: Settings > Projects.
- **Delete / archive / unarchive project** — soft-archive with restore.
- **Leave / join project** — self-service membership.
- **Favorite project** — star/unstar.
- **Publish project (Deploy Board)** — publish to public URL via Space app. Configurable layout, reactions, comments, votes.
- **Feature toggles** — enable/disable Cycles, Modules, Views, Pages, Intake per project.

### Work Items (Issues)
- **Issue list** — paginated with filters, grouping, ordering. Entry: `/{ws}/projects/{pid}/issues/`.
- **Create issue** — modal: title, rich-text description, state, priority, assignees, labels, dates, estimate, parent, cycle, module.
- **Issue detail** — full page: description editor, properties sidebar, activity/comments. Entry: `.../issues/{id}`.
- **Peek overview** — slide-over preview without navigating away from list/board.
- **Rich text editor** — block-based with realtime collaboration (Yjs via `apps/live/`). Mentions, slash commands.
- **Description version history** — view/restore past versions.
- **Comments** — threaded, rich text. Reactions on comments.
- **Issue reactions** — emoji reactions on issues.
- **Activity log** — full change history.
- **Sub-issues** — parent/child hierarchy.
- **Relations** — relates_to, duplicate, blocked_by, blocking.
- **Links** — external URLs attached to issues.
- **Attachments** — file uploads.
- **Subscribers** — subscribe/unsubscribe to notifications.
- **Bulk operations** — bulk delete, archive, date update, label creation. **[EE: full bulk ops with upgrade banner in CE]**

#### Issue Layouts
- **List** — traditional list view.
- **Kanban (Board)** — card-based board grouped by state/priority/etc.
- **Calendar** — calendar grid by date.
- **Spreadsheet** — tabular with inline editing.
- **Gantt chart** — timeline bars with drag-to-resize dates.

#### Filters & Grouping
- Filter by: state, priority, assignee, label, cycle, module, dates, created_by, subscriber, more.
- Group by: state, priority, assignee, label, cycle, module, created_by.
- Sub-grouping: nested within main group.
- Order by: manual, created/updated date, start/due date, priority.

### Browse
- **Browse by identifier** — navigate to any work item by `PROJ-123`. Entry: `/{ws}/browse/{id}`. Resolves project, redirects intake items.

### Cycles
- **Cycle list** — grouped by active/upcoming/completed. Entry: `/{ws}/projects/{pid}/cycles/`.
- **Create/edit cycle** — name, description, start/end dates.
- **Cycle detail** — issues in cycle with all layouts.
- **Add/remove issues** — assign existing issues to a cycle.
- **Analytics sidebar** — progress stats, distribution by state/priority/assignee.
- **Transfer issues** — move incomplete issues between cycles.
- **Favorite / archive cycles** — star, soft-archive. Archived at `.../archives/cycles/`.
- **Date validation** — prevent overlapping cycle dates.
- **Active cycles (workspace)** — cross-project active cycles. **[EE: CE shows upgrade prompt]**

### Modules
- **Module list** — Entry: `/{ws}/projects/{pid}/modules/`.
- **Create/edit module** — name, description, status (backlog/planned/in-progress/paused/completed/cancelled), dates, lead, members.
- **Module detail** — issues in module with all layouts.
- **Add/remove issues** — many-to-many (issue can be in multiple modules).
- **Analytics sidebar** — progress stats, distribution.
- **Module links** — external URLs.
- **Module Gantt chart** — timeline view of modules.
- **Favorite / archive modules** — star, soft-archive.

### Views
- **Project views** — saved filter presets within a project. Entry: `/{ws}/projects/{pid}/views/`.
- **Create/edit view** — define filters, save as named view.
- **View detail** — issues matching saved filters with all layouts.
- **Workspace views** — cross-project saved views. Entry: `/{ws}/workspace-views/`.
- **Favorite views** — star/unstar.

### Pages / Wiki
- **Page list** — tabbed: Public / Private / Archived. Entry: `/{ws}/projects/{pid}/pages/`.
- **Page editor** — full rich-text document with realtime collaboration. Entry: `.../pages/{pageId}/`.
- **Public / private toggle** — workspace-public vs creator-only.
- **Lock / unlock** — prevent edits.
- **Archive / unarchive** — soft-archive pages.
- **Version history** — view/restore previous versions.
- **Duplicate page** — copy a page.
- **Page outline** — auto-generated heading outline in nav pane.
- **Mentions** — @mention users in editor.
- **Favorite pages** — star/unstar.

### Intake (Inbox)
- **Intake list** — triage queue for incoming issues. Entry: `/{ws}/projects/{pid}/intake/`.
- **Create intake issue** — submit to triage queue.
- **Accept** — promote to full project issue.
- **Decline** — reject with reason.
- **Snooze** — hide until future date.
- **Mark as duplicate** — link to existing issue.
- **Delete** — permanently remove.
- **Filters/sorting** — filter and sort the queue.

### Stickies
- **Stickies page** — full-page sticky notes. Entry: `/{ws}/stickies/`.
- **Create/edit/delete** — quick notes with rich text.
- **Dashboard widget** — stickies on home dashboard.

### Drafts
- **Workspace drafts** — incomplete issues saved at workspace level. Entry: `/{ws}/drafts/`.
- **Create/edit/delete draft** — save incomplete issues.
- **Convert to issue** — promote draft to full project issue.

### Notifications
- **Notification list** — all user notifications. Entry: `/{ws}/notifications/`.
- **Read/unread toggle** — per-notification.
- **Archive/unarchive** — move to archive.
- **Mark all read** — bulk action.
- **Unread count** — real-time count.
- **Notification preferences** — per-user settings. Entry: Profile Settings > Notifications.

### Analytics
- **Overview analytics** — workspace-level project stats. Entry: `/{ws}/analytics/overview`.
- **Advanced analytics** — custom axis selection (x/y/segment). Entry: `/{ws}/analytics/work-items`.
- **Project-level analytics** — scoped to single project.
- **Export analytics** — CSV/JSON export.

### Archives
- **Archived projects** — Entry: `/{ws}/projects/archives/`.
- **Archived issues/cycles/modules** — per-project archive views.
- **Unarchive** — restore any archived entity.

### Search / Command Palette
- **Global search (Power-K)** — Cmd+K for quick search across workspace, projects, issues, cycles, modules, views, pages.
- **Command palette actions** — quick actions for creating entities, navigating, switching workspace.

### Profile / Your Work
- **Profile overview** — member profile with summary. Entry: `/{ws}/profile/{userId}/`.
- **Assigned/Created/Subscribed** — filtered issue views per user.
- **Activity log** — user activity history.

### Favorites
- **Favorites sidebar** — collapsible section with drag-and-drop ordering, folders.
- **Entity favorites** — projects, cycles, modules, views, pages.

### Settings

**Workspace settings:**
| Page | Route | Access |
|------|-------|--------|
| General | `/:ws/settings` | Admin, Member |
| Members | `/:ws/settings/members` | Admin, Member |
| Billing & Plans | `/:ws/settings/billing` | Admin only |
| Exports | `/:ws/settings/exports` | Admin, Member |
| Webhooks | `/:ws/settings/webhooks` | Admin only |
| Integrations | `/:ws/settings/integrations` | Admin only |

**Project settings:**
| Page | Route | Access |
|------|-------|--------|
| General | `/:ws/settings/projects/:pid` | Admin, Member, Guest |
| Members | `.../members` | Admin, Member, Guest |
| Cycles toggle | `.../features/cycles` | Admin only |
| Modules toggle | `.../features/modules` | Admin only |
| Views toggle | `.../features/views` | Admin only |
| Pages toggle | `.../features/pages` | Admin only |
| Intake toggle | `.../features/intake` | Admin only |
| States | `.../states` | Admin, Member |
| Labels | `.../labels` | Admin, Member |
| Estimates | `.../estimates` | Admin only |
| Automations | `.../automations` | Admin only |

**Profile settings:**
| Tab | Route | What |
|-----|-------|------|
| Profile | `/settings/profile/general` | Name, avatar, email, deactivate |
| Preferences | `.../preferences` | Theme, start of week, language |
| Notifications | `.../notifications` | Notification channel config |
| Security | `.../security` | Password, connected OAuth accounts |
| API Tokens | `.../api-tokens` | Personal API tokens |

### Integrations
- **GitHub** — connect repos to projects. Entry: workspace Settings > Integrations.
- **Slack** — connect channels to projects.
- **Unsplash** — search images for covers.

### AI Features
- **AI assistant** — text generation endpoints for editor. Entry: editor AI menu. **[Requires instance AI config]**

### Exports
- **Issue export** — workspace issues to CSV/JSON. Entry: Settings > Exports.
- **Analytics export** — analytics data export.
- **Activity export** — per-user activity export.

### Instance Admin (apps/admin/)
- **General** — instance name, admin config.
- **Email** — SMTP settings.
- **AI** — enable/disable AI, API keys.
- **Image storage** — upload provider config.
- **Auth providers** — configure Google, GitHub, GitLab, Gitea OAuth.
- **Workspace management** — list/create workspaces.

### Public Space App (apps/space/)
- **Published project view** — read-only public view of published project issues with configurable layout, reactions, comments, votes.

### Realtime Collaboration (apps/live/)
- **Collaborative editing** — Hocuspocus/Yjs-based realtime editing for pages and issue descriptions.

### EE-Only Feature Stubs (present in CE as empty components)
- **Epics** — `ce/components/epics/` renders empty. Store stubs in `ce/store/issue/epic/`.
- **Teams** — store stubs in `ce/store/issue/team/`, `ce/store/issue/team-project/`.
- **Workflows (state transitions)** — `ce/components/workflow/` renders empty.
- **Custom automations** — `ce/components/automations/root.tsx` renders empty (beyond auto-close/auto-archive).
- **De-duplication (AI)** — `ce/components/de-dupe/` renders empty.
- **Work item types** — issue type selector in create modal is a stub.
- **Work item templates** — template selector in create modal is a stub.
- **Worklogs (time tracking)** — `ce/components/issues/worklog/` renders empty.
- **Bulk operations (full)** — multi-select shows upgrade banner in CE.
- **Active cycles (workspace)** — CE shows upgrade/pricing CTA.

---

## 3. Data Model

### Architectural Patterns

**Base classes** (`apps/api/plane/db/models/base.py`, `apps/api/plane/db/mixins.py`):
- **BaseModel** — UUID primary key. Inherits `AuditModel` (composes `TimeAuditModel` + `UserAuditModel` + `SoftDeleteModel`). Every entity gets: `id` (UUID), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`.
- **Soft deletion is universal.** `SoftDeletionManager` filters `deleted_at__isnull=True` by default. `all_objects` manager bypasses the filter. Uniqueness constraints use `condition=Q(deleted_at__isnull=True)` so slugs can be reused after soft delete.
- **ProjectBaseModel** — adds `project` FK + `workspace` FK (auto-derived from project on save). Used by Issue, State, Cycle, Module, Estimate, Intake, and join tables.
- **WorkspaceBaseModel** — adds `workspace` FK + nullable `project` FK. Used by Label, IssueView, DraftIssue, UserFavorite, DeployBoard.
- **ChangeTrackerMixin** — tracks field changes between load and save for Issue and IssueComment.
- **sort_order pattern** — nearly every entity has a `FloatField(default=65535)` for manual ordering.

### Core Entities

**User** (`apps/api/plane/db/models/user.py`) — custom Django user extending `AbstractBaseUser`. NOT a BaseModel (no soft delete). Key fields: email (unique, login field), display_name, avatar, is_email_verified, masked_at. Has one Profile (1:1), many Accounts (OAuth), many WorkspaceMember, many ProjectMember.

**Profile** (1:1 with User) — role (free-text job title, NOT permission), theme (JSON), is_onboarded, onboarding_step (JSON), last_workspace_id.

**Workspace** — top-level organizational container. Key fields: name, slug (unique), owner (FK User), organization_size, timezone. Appends `__<epoch>` to slug on soft delete to free it up.

**WorkspaceMember** (join: Workspace ↔ User) — role (integer: 20=Admin, 15=Member, 5=Guest), is_active. Unique on (workspace, member) when not deleted.

**WorkspaceMemberInvite** — email, token, role, accepted, responded_at, message.

**Project** — primary container for Issues, Cycles, Modules, States, Estimates. Key fields: name (unique per workspace), identifier (uppercase, max 12 chars), network (0=Secret, 2=Public), default_assignee, project_lead, default_state, archived_at. Feature flags: cycle_view, module_view, page_view, intake_view, issue_views_view, is_time_tracking_enabled, is_issue_type_enabled, guest_view_all_features.

**ProjectMember** (join: Project ↔ User) — role (same 20/15/5 enum), is_active, preferences (JSON).

**State** — per-project workflow states with fixed group taxonomy. Groups: backlog, unstarted, started, completed, cancelled, triage. Default states seeded: Backlog, Todo, In Progress, Done, Cancelled, Triage. Three managers: `objects` (excludes triage), `triage_objects` (triage only), `all_state_objects`.

**Issue** — the central entity. Key fields: name, description_html/json/binary, priority (urgent/high/medium/low/none), state (FK), parent (self-ref), sequence_id (auto-incrementing per project via advisory lock), start_date, target_date, completed_at, estimate_point (FK EstimatePoint), is_draft, archived_at, type (FK IssueType). M2M: assignees (IssueAssignee), labels (IssueLabel). Auto-sets completed_at when state.group == "completed".

**Issue satellites** (all ProjectBaseModel):
- IssueComment — threaded (self-ref parent), rich text, access (internal/external).
- IssueActivity — audit trail: verb, field, old_value, new_value, actor.
- IssueRelation — bidirectional: duplicate, relates_to, blocked_by, start_before, finish_before, implemented_by.
- IssueLink, IssueSubscriber, IssueReaction, CommentReaction, IssueVote.
- IssueVersion, IssueDescriptionVersion — content snapshots.
- IssueMention — mentioned users.

**Label** — WorkspaceBaseModel. Can be workspace-level (project null) or project-level. Self-ref parent for hierarchy.

**Cycle** — time-boxed iteration. Key fields: name, start_date (DateTime), end_date, owned_by, progress_snapshot (JSON), archived_at. Issues linked via CycleIssue M2M.

**Module** — feature/goal grouping. Key fields: name (unique per project), status (backlog/planned/in-progress/paused/completed/cancelled), lead, dates, archived_at. M2M: members (ModuleMember), issues (ModuleIssue). Also ModuleLink.

**Page** — workspace-scoped documents. Key fields: name, description content, owned_by, access (public/private), parent (self-ref for nesting), archived_at, is_locked. M2M to projects via ProjectPage. Versioned via PageVersion.

**IssueView** — saved filter views. WorkspaceBaseModel (workspace or project scoped). Stores query, filters, display config as JSON.

**Intake** — per-project triage inbox. IntakeIssue links Intake to Issue with status (Pending/-2, Rejected/-1, Snoozed/0, Accepted/1, Duplicate/2), snoozed_till, duplicate_to.

**Estimate / EstimatePoint** — per-project. Estimate has type (categories or points). EstimatePoint has key (int) + value (string).

**IssueType** — workspace-level type definitions (Bug, Feature, Epic). Linked to projects via ProjectIssueType M2M.

**DraftIssue** — WorkspaceBaseModel. Mirrors Issue shape with optional project. Own M2M through tables.

**FileAsset** — polymorphic file storage. Nullable FKs to user, workspace, project, issue, comment, page, draft. Entity_type enum for context.

**Notification** — workspace + optional project. Key fields: data (JSON), entity_identifier, title, sender, triggered_by (FK User), receiver (FK User), read_at, snoozed_till, archived_at.

**Webhook** — workspace-scoped. URL, is_active, secret_key. Boolean toggles per entity type. WebhookLog for request/response. ProjectWebhook scopes to project.

**Other:** UserFavorite (polymorphic via entity_type, supports folders), DeployBoard (publish settings, anchor UUID for public URLs), Team (workspace grouping), Description/DescriptionVersion (standalone content for comments).

### Relationship Map

```
Workspace
  ├── has many → Project
  │     ├── has many → Issue (central entity)
  │     │     ├── belongs to → State (per project, 6 state groups)
  │     │     ├── M2M → Label (through IssueLabel)
  │     │     ├── M2M → User (through IssueAssignee)
  │     │     ├── self-ref → parent Issue (sub-issues)
  │     │     ├── FK → IssueType (workspace-level)
  │     │     ├── FK → EstimatePoint
  │     │     ├── has many → IssueComment (threaded)
  │     │     ├── has many → IssueActivity (audit log)
  │     │     ├── has many → IssueRelation (bidirectional)
  │     │     ├── has many → IssueLink, IssueSubscriber, IssueReaction, IssueVote
  │     │     └── has many → FileAsset (attachments)
  │     ├── has many → State (6 groups)
  │     ├── has many → Cycle → M2M Issues (CycleIssue)
  │     ├── has many → Module → M2M Issues (ModuleIssue), M2M Users (ModuleMember)
  │     ├── has many → Intake → has many IntakeIssue → links to Issue
  │     ├── has many → Estimate → has many EstimatePoint
  │     └── has many → ProjectMember (User + role)
  ├── has many → Label (workspace-level OR project-scoped)
  ├── has many → Page (M2M to projects via ProjectPage, self-ref parent)
  ├── has many → IssueView (workspace or project-scoped)
  ├── has many → DraftIssue (optional project)
  ├── has many → IssueType (linked to projects via ProjectIssueType)
  ├── has many → WorkspaceMember (User + role)
  ├── has many → WorkspaceMemberInvite
  ├── has many → Webhook → has many WebhookLog
  ├── has many → Notification (receiver + triggered_by)
  ├── has many → Team
  └── has many → DeployBoard (polymorphic publish)

User
  ├── 1:1 → Profile
  ├── has many → Account (OAuth)
  ├── owns → Workspace (owner FK)
  ├── M2M → Workspace (through WorkspaceMember)
  ├── M2M → Project (through ProjectMember)
  ├── M2M → Issue (through IssueAssignee)
  ├── has many → UserFavorite (polymorphic)
  ├── has many → Notification (as receiver)
  └── has many → FileAsset
```

**Key constraints:**
- An Issue belongs to exactly one Cycle (CycleIssue) but can belong to multiple Modules (ModuleIssue).
- Labels can be workspace-scoped or project-scoped, with different uniqueness constraints.
- Pages belong to Workspace directly, linked to Projects via ProjectPage M2M.
- The role integer enum (20/15/5) is reused at both workspace and project membership levels.

---

## 4. Permissions & Roles

### Role Levels

Three roles, three scopes:

| Role | Integer | Scope |
|------|---------|-------|
| Admin | 20 | Instance, Workspace, Project |
| Member | 15 | Workspace, Project |
| Guest | 5 | Workspace, Project |

Defined in parallel: Django enum (`apps/api/plane/db/models/project.py` ROLE class), TypeScript enums (`packages/types/src/workspace.ts` EUserWorkspaceRoles, `packages/constants/src/user.ts` EUserPermissions). No Viewer or Commenter role exists — the integer gap (10) suggests Viewer was removed.

### Scope Hierarchy & Interaction Rules

**Rule 1 — Workspace Admin overrides project role.** If a user is a workspace Admin AND an active project member, they get Admin-level access in that project regardless of assigned project role. Enforced backend (`allow_permission` decorator, `ProjectBasePermission`) and frontend (`getProjectRole` in permission store).

**Rule 2 — Workspace Guest caps project role.** A workspace Guest cannot be assigned Member or Admin in any project.

**Rule 3 — Demoting to workspace Guest cascades.** Changing a workspace member to Guest force-updates all their project memberships to Guest.

**Rule 4 — Cannot self-modify role.** Both workspace and project endpoints block users from changing their own role.

**Rule 5 — Last admin protection.** The system prevents the last Admin from leaving or being removed.

**Rule 6 — Invite role capping.** You cannot invite someone with a role higher than your own.

### Permission Matrix (Backend)

| Action | Admin | Member | Guest | Creator bypass? |
|--------|-------|--------|-------|-----------------|
| **Issues** list/read | Yes | Yes | Yes (own only if `guest_view_all_features=false`) | — |
| **Issues** create | Yes | Yes | No | — |
| **Issues** update | Yes | Yes | Own only | Yes |
| **Issues** delete | Yes | No | No | Yes (creator) |
| **Issues** archive/unarchive | Yes | Yes | No | — |
| **Comments** create | Yes | Yes | Yes | — |
| **Comments** update/delete | Yes | No | No | Yes (creator) |
| **Modules** create/update | Yes | Yes | No | — |
| **Modules** delete | Yes | No | No | Yes (creator) |
| **Labels** CRUD | Yes | No | No | — |
| **Project members** add/remove/update | Yes | No | No | — |
| **Workspace members** list | Yes | Yes | Yes | — |
| **Workspace members** update/remove | Yes | No | No | — |
| **Webhooks** all ops | Yes | No | No | — |
| **Pages** create/update | Yes | Yes | No | — |
| **Attachments** upload | Yes | Yes | Yes | — |
| **Attachments** delete | Yes | No | No | Yes (creator) |

The `guest_view_all_features` per-project flag (default false): when false, Guests see only their own issues, pages, views, comments. When true, Guests see all data but still can't perform restricted writes.

### Implementation Patterns

**Backend — two parallel mechanisms:**
1. **DRF Permission Classes** (class-level on ViewSet) — `permission_classes = [SomePermission]`. Broad gate evaluated before the view method. Located in `apps/api/plane/app/permissions/`.
2. **`@allow_permission` decorator** (method-level) — fine-grained per-action. Parameters: `allowed_roles`, `level` (WORKSPACE/PROJECT), `creator` (bool), `model`. Creator bypass: if user created the entity, they can edit/delete regardless of role. Located in `apps/api/plane/app/permissions/base.py`.

Both are often used on the same ViewSet.

**Frontend:**
- `BaseUserPermissionStore` in `apps/web/core/store/user/base-permissions.store.ts` — maintains role maps per workspace and project.
- Core method: `allowPermissions(allowedRoles[], level, workspaceSlug?, projectId?)` → boolean.
- Hook: `useUserPermissions()` — pulls store from MobX context.
- Sidebar/settings constants carry `access` arrays that are checked via `allowPermissions`.

---

## 5. Frontend Data-Layer Patterns

### Service Layer

All services inherit from `APIService` — a thin axios wrapper with `get/post/patch/delete` methods that return raw `AxiosPromise`. The web app version (`apps/web/core/services/api.service.ts`) adds a 401 interceptor that redirects to login.

Every service method follows the same skeleton:
```
async fetchWorkspaceMembers(workspaceSlug: string): Promise<IWorkspaceMember[]>
  → this.get(`/api/workspaces/${workspaceSlug}/members/`)
    .then(response => response?.data)
    .catch(error => { throw error?.response?.data })
```

Two layers: package-level (`packages/services/src/`) with focused per-domain classes, and app-level (`apps/web/core/services/`) with monolith facades that stores actually import.

### Store Layer

All stores use MobX with `makeObservable` and explicit decorator declarations:
- **Interface first** — every store has `IFooStore` interface, then implementing class.
- **Observables** are `Record<string, ...>` maps keyed by slug/ID (normalized, not arrays).
- **`computedFn`** from mobx-utils for parameterized computed values.
- **`runInAction`** wraps all post-async state mutations.
- **Optimistic updates with rollback** — snapshot original, apply optimistically, revert on error.
- **Service instantiation** in constructor: `this.workspaceService = new WorkspaceService()`.
- **Root store injection** — constructor takes `_rootStore` for cross-store access.
- **CE/EE extension** — core stores can be abstract; CE provides concrete implementations.

### Hook Layer

Every store gets a one-line hook — pure `useContext` wrappers with no logic:
```
export const useMember = (): IMemberRootStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("...");
  return context.memberRoot;
};
```

### SWR Integration

SWR is used alongside MobX as a "fetch-on-mount" scheduler. SWR triggers the fetch; MobX stores the data. Components never read `data` from useSWR — they read from MobX observables. SWR's cache/revalidation handles refetching; reactivity comes from MobX's `observer()` HOC.

### Root Store Composition

```
CoreRootStore (apps/web/core/store/root.store.ts)
  ├── router: RouterStore
  ├── commandPalette: CommandPaletteStore
  ├── instance: InstanceStore
  ├── user: UserStore
  ├── theme: ThemeStore
  ├── workspaceRoot: WorkspaceRootStore (CE extends Base)
  │     ├── webhook, apiToken, home
  ├── projectRoot: ProjectRootStore
  ├── memberRoot: MemberRootStore
  │     ├── workspace: WorkspaceMemberStore
  │     └── project: ProjectMemberStore
  ├── cycle, cycleFilter, module, moduleFilter
  ├── issue: IssueRootStore
  ├── state, label, dashboard, analytics
  ├── projectView, globalView, projectPages
  ├── projectInbox, projectEstimate
  ├── multipleSelect, favorite, stickyStore
  ├── editorAssetStore, workItemFilters, powerK
  └── workspaceNotification

RootStore (apps/web/ce/store/root.store.ts) extends CoreRootStore
```

Singleton, provided via `StoreContext`. `resetOnSignOut()` recreates all sub-stores.

### End-to-End Wiring: Workspace Members & Invites

**"Send Invite" flow:**

1. **Component** (`apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx`) — wrapped in `observer()`, calls `useMember()`, destructures `workspace.inviteMembersToWorkspace`.
2. **Store** (`apps/web/core/store/member/workspace/workspace-member.store.ts`) — `inviteMembersToWorkspace` calls service, then refetches invitations.
3. **Service** (`apps/web/core/services/workspace.service.ts`) — `inviteWorkspace(slug, data)` → `POST /api/workspaces/${slug}/invitations/`.
4. **API** (`apps/api/plane/app/urls/workspace.py`) → `WorkspaceInvitationsViewset.create`.

**"List Members" flow (initial page load):**

1. **Component** uses `useSWR` to trigger `fetchWorkspaceMembers` + `fetchWorkspaceMemberInvitations` on mount.
2. **Store** calls service, then in `runInAction`: populates `memberRoot.memberMap` (user details, shared across workspace/project) and `workspaceMemberMap[slug][userId]` (membership links).
3. **Service** → `GET /api/workspaces/${slug}/members/` and `GET /api/workspaces/${slug}/invitations/`.

**Full endpoint map for members/invites:**

| Service Method | HTTP | API Path |
|---|---|---|
| fetchWorkspaceMembers | GET | `/api/workspaces/{slug}/members/` |
| updateWorkspaceMember | PATCH | `/api/workspaces/{slug}/members/{id}/` |
| deleteWorkspaceMember | DELETE | `/api/workspaces/{slug}/members/{id}/` |
| workspaceInvitations | GET | `/api/workspaces/{slug}/invitations/` |
| inviteWorkspace | POST | `/api/workspaces/{slug}/invitations/` |
| updateWorkspaceInvitation | PATCH | `/api/workspaces/{slug}/invitations/{id}/` |
| deleteWorkspaceInvitations | DELETE | `/api/workspaces/{slug}/invitations/{id}/` |
| joinWorkspace | POST | `/api/workspaces/{slug}/invitations/{id}/join/` |
| userWorkspaceInvitations | GET | `/api/users/me/workspaces/invitations/` |
| joinWorkspaces (bulk) | POST | `/api/users/me/workspaces/invitations/` |

---

## 6. Cross-Cutting Flows

### Auth Flow

```
Landing (/) or Sign-Up (/sign-up)
  │
  ▼
AuthenticationWrapper checks currentUser via SWR
  ├── user exists + onboarded → redirect to /{lastWorkspaceSlug}
  ├── user exists + NOT onboarded → redirect to /onboarding
  └── no user → show AuthRoot form
        │
        ▼
    Step 1: EMAIL entry → POST /auth/email-check/
        ├── existing=true → SIGN_IN mode
        └── existing=false → SIGN_UP mode
            ├── CREDENTIAL → PASSWORD form
            └── MAGIC_CODE → UNIQUE_CODE form
        │
        ▼
    Step 2a: PASSWORD → POST /auth/sign-in/ or /auth/sign-up/
    Step 2b: MAGIC CODE → POST /auth/magic-generate/ → /auth/magic-sign-in/
    OR: OAuth → window.location to /auth/{provider}/ → callback
        │
        ▼
    Django: user_login() → session cookie → redirect
        │
        ▼
    Frontend: re-fetch user → /onboarding or /{workspace}
```

**Auth providers:** Email+password, magic code (email OTP), Google, GitHub, GitLab, Gitea — all instance-configurable.

**Session management:** Django sessions via cookie (NOT JWT). Custom `SessionMiddleware` handles cookie management. Separate cookie names for admin. CSRF tokens fetched via `GET /auth/get-csrf-token/`. No localStorage/sessionStorage token storage.

**Route gating:** `AuthenticationWrapper` component wraps pages with `pageType` prop:
- `NON_AUTHENTICATED` — login/signup only
- `AUTHENTICATED` — requires user + onboarded
- `ONBOARDING` — requires user, NOT onboarded
- `SET_PASSWORD` — requires user with autoset password
- `PUBLIC` — no auth check

### Onboarding Flow

| Step | Collects | Skippable? |
|------|----------|------------|
| 1. PROFILE_SETUP | first_name, avatar, optional password | No |
| 2. ROLE_SETUP | Job role (PM, Eng Manager, Designer, Developer, Founder, Ops, Other) | Yes |
| 3. USE_CASE_SETUP | Multi-select use cases (roadmaps, sprints, cross-functional, tool replacement, exploring) | Yes |
| 4. WORKSPACE_CREATE_OR_JOIN | Create (name, slug, org_size) or accept invitations | No |
| 5. INVITE_MEMBERS | Email + role for teammates (3 rows, expandable) | Yes ("I'll do it later") |

Self-hosted variation: steps 2 and 3 are skipped. If org size is "Just myself", step 5 is skipped. Completion sets `is_onboarded = true` on user profile.

### Settings IA

```
Workspace Settings (/{ws}/settings/)
  Administration
    ├── General        [Admin, Member]
    ├── Members        [Admin, Member]
    ├── Billing        [Admin only]
    └── Exports        [Admin, Member]
  Developer
    └── Webhooks       [Admin only]

Project Settings (/{ws}/settings/projects/{pid}/)
  General
    ├── General        [Admin, Member, Guest]
    └── Members        [Admin, Member, Guest]
  Features
    ├── Cycles         [Admin only]
    ├── Modules        [Admin only]
    ├── Views          [Admin only]
    ├── Pages          [Admin only]
    └── Intake         [Admin only]
  Work Structure
    ├── States         [Admin, Member]
    ├── Labels         [Admin, Member]
    └── Estimates      [Admin only]
  Execution
    └── Automations    [Admin only]

Profile Settings (/settings/profile/)
  Your Profile
    ├── Profile        (name, avatar, email)
    ├── Preferences    (theme, start of week)
    ├── Notifications  (channel config)
    └── Security       (password, OAuth accounts)
  Developer
    └── API Tokens
```

---

## 7. Patterns Worth Borrowing & Patterns to Skip

### Worth Borrowing for Lane

1. **CE/EE extension seam** — `core/` for shared logic, `ce/` for edition-specific overrides via abstract base classes with concrete implementations. Clean path from open-source to commercial without forking. Lane doesn't need EE now, but the pattern is cheap to adopt early and expensive to retrofit.

2. **Normalized MobX stores with SWR fetch scheduling** — stores hold `Record<id, Entity>` maps (not arrays), SWR handles fetch-on-mount and revalidation, MobX handles reactivity. Clean separation: SWR decides *when* to fetch, stores decide *how* to store, components just read observables. (Lane uses different state management, but the normalized-map + fetch-scheduler separation is portable.)

3. **Optimistic update with rollback** — snapshot original state, apply mutation to store immediately, call API, revert on error. Every mutation store method follows this. Makes the UI feel instant.

4. **`@allow_permission` decorator with creator bypass** — method-level permission checks with a "you can always edit your own stuff" escape hatch. Simpler than a full RBAC matrix, covers 90% of cases. The `creator=True, model=Model` parameter pair is elegant.

5. **Feature toggles per project** — boolean flags on the Project model (`cycle_view`, `module_view`, etc.) that hide/show sidebar items and gate routes. Lets teams adopt features incrementally. Lane's "same view for everyone" rule means Lane wouldn't use these for *role-gating*, but could use them for *feature-gating* as the product grows.

6. **Soft delete with slug recycling** — `deleted_at` filter on all managers, uniqueness constraints scoped to `deleted_at__isnull=True`, slug gets `__<epoch>` suffix on delete to free it. Enables undo without orphaned slugs.

### Deliberately NOT Worth Adopting

1. **Django + separate SPA split** — Plane runs a Python API server plus 3 separate React SPAs, requiring cross-process session management, CORS, proxy config, and duplicate type definitions. Lane's Next.js monolith with server actions is dramatically simpler. The Django/React split is justified at Plane's scale (20+ developers, self-hosted deployment) but would be pure overhead for Lane.

2. **MobX + SWR dual state layer** — two reactive systems (MobX observables + SWR cache) co-existing is powerful but complex. Every data path has to reason about both. Lane should pick one state management approach and stay there.

3. **Polymorphic file assets with nullable FKs** — FileAsset has nullable FKs to 7+ parent types plus an `entity_type` enum. Works at scale, but the nullable-FK approach is fragile and hard to query. A simpler single-FK-per-use-case model (or a join table) is cleaner for Lane's scope.

4. **Duplicate permission modules** — Plane has parallel permission implementations in `apps/api/plane/app/permissions/` and `apps/api/plane/utils/permissions/` with subtle behavioral differences. This is technical debt, not a pattern. Lane should have one permission path.
