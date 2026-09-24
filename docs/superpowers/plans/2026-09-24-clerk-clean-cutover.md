# Clerk clean-cutover implementation plan

## Outcome

Replace Supabase Auth and Lane-owned tenancy/invitation state with Clerk. Clerk is the only authority for users, sessions, organizations, memberships, organization roles, and invitations. Supabase remains the Postgres host and private attachment store. All current Lane users and application data are disposable test data and will be reset instead of migrated.

## Product decisions locked by this cutover

- No Supabase Auth compatibility layer and no user/password import.
- No local `workspace_members` or `invites` tables.
- Clerk user IDs (`user_*`) and organization IDs (`org_*`) are stored directly as Lane's ownership keys.
- `profiles.role` remains the non-permission PM / Designer / Developer label.
- **Approved 2026-09-24:** sign up → create/join Clerk workspace → choose functional label → Requests;
  Clerk Organizations remains **Membership required**.
- Clerk's built-in `org:admin` and `org:member` roles are the production roles on the free B2B tier.
- Lane's `guest` permission remains represented in code only if Clerk supplies `org:guest`; enabling that custom role in production requires Clerk Enhanced B2B. Lane will not recreate guest authorization in Postgres.
- Existing sessions end at cutover and all people create fresh Clerk accounts.

## Safety gates

1. Preserve the current dirty working tree; do not overwrite unrelated documentation work.
2. Create and verify a database export immediately before every staging or production migration.
3. Apply the canonical migration to Lane Staging first.
4. Verify sign-up, organization creation, active-organization enforcement, invitation acceptance, request isolation, and attachment authorization on staging.
5. Only after staging evidence passes, export production and apply the same migration there.
6. Never print or request Clerk, Supabase, or database secrets in chat or command output.

## Schema cutover

Create one destructive canonical migration that:

1. Empties test application data in dependency order.
2. Drops Supabase-auth-dependent policies/functions and the local `invites` and `workspace_members` tables.
3. Changes organization and user ownership columns from UUID to text.
4. Removes `profiles.org_id`; a Clerk user profile is global while organization context comes from the active Clerk organization.
5. Keeps `organizations` as a non-authoritative domain projection keyed by Clerk organization ID for relational integrity and request display data.
6. Keeps `profiles` as a non-authoritative domain projection keyed by Clerk user ID for Lane's functional-role label and request/comment attribution.
7. Updates every request, comment, notification, and attachment foreign key to the new text identifiers.
8. Revokes public Data API access to application tables; server-side Drizzle remains the application data path.

## Application cutover

### Authentication shell

- Install `@clerk/nextjs` and `@clerk/ui` through the official Clerk initializer.
- Mount `ClerkProvider` inside `<body>` and apply Clerk's shadcn theme.
- Replace Supabase session middleware with `clerkMiddleware` in `src/proxy.ts`.
- Replace login, signup, password recovery, callback, and sign-out behavior with Clerk components/helpers.
- Remove Supabase browser/server auth clients; retain only the service-role storage client.

### Tenant context and guards

- Rebuild `getWorkspace()` from awaited Clerk `auth()` plus `currentUser()`.
- Require an active Clerk organization for every application screen.
- Upsert only the current Clerk organization and user projection needed by Lane data.
- Rebuild shared guards from Clerk's `userId`, `orgId`, and `orgRole`; reject a client-passed organization that differs from the active Clerk organization.
- Preserve the rule that identity is always derived on the server and never accepted from action arguments.

### Onboarding

- Clerk's authentication components handle the pending `choose-organization` task before Lane onboarding:
  create a workspace or join through a Clerk invitation, then activate the organization.
- Resume interrupted organization setup through the existing `/login` route. Do not create a second Lane
  organization-setup route or treat a pending session as authorized app access.
- Require a valid active Clerk organization before reading Lane's onboarding profile or saving its label.
- Preserve Lane's role choice (PM / Designer / Developer) as the final onboarding step at `/onboarding`;
  it grants no permissions. Existing labels skip this step after organization activation.
- After both organization activation and label selection, project the organization/user needed by Lane's
  domain data and enter Requests. No organization-less Requests access.

### Members and invitations

- Replace Lane's invite/member CRUD with Clerk's Organization management component/API.
- Clerk sends and accepts invitation emails; remove Resend-based workspace invitation email code.
- Keep the Lane Members route as the product entry point while Clerk owns the underlying state and mutations.

### Existing domain actions

- Convert database ownership identifiers and Zod validation from UUID to Clerk string IDs.
- Preserve request lifecycle and notification behavior.
- Keep Supabase Storage service-role operations, but authorize every operation with the Clerk guard before issuing a signed URL.

## Test-first sequence

1. Add failing unit tests for Clerk guard identity/org mismatch/admin/guest behavior.
2. Add failing tests for workspace-first onboarding, pending/no-active-organization denial, interrupted task
   recovery through `/login`, label-save authorization, and workspace projection.
3. Add failing contract tests proving no production file imports Supabase Auth or local membership/invite schema.
4. Implement the minimum auth/context changes to pass them.
5. Update action and page tests to mock Clerk server APIs.
6. Update Playwright helpers to create/delete Clerk test users and organizations without exposing secrets.
7. Run focused tests after each slice, then full lint, TypeScript, unit suite, production build, and staging browser E2E.

## Rollback

- Code rollback: redeploy the last Supabase-Auth commit.
- Data rollback: restore the verified pre-migration export. Because the cutover intentionally destroys test data and changes identifier types, there is no forward compatibility bridge.
- Clerk objects created during a failed staging rehearsal are test objects and can be deleted before retrying.

## Checkpoint — 2026-09-24

- Local implementation is on `codex/clerk-clean-cutover`; no commit, push, or deployment has been made.
- Lane Staging was resumed. The pre-cutover dump was created and its archive listing verified before
  migration `0013_clerk_clean_cutover.sql` was applied. Production has not been migrated or deployed.
- Clerk Organizations remains **Membership required**. An interrupted organization-selection task resumes
  at `/login`; neither Lane role selection nor Requests is available without an active recognized membership.
- Final local checks passed: 33 test files / 189 tests, TypeScript, ESLint, production build, and
  `git diff --check`.
- Focused browser checks used the local application with staging services: existing-member onboarding,
  organization-first onboarding and refresh recovery, workspace isolation, role-save retry, and role-selector
  keyboard/visual checks. The full browser suite has not been run.
- Intake recovery passed desktop/mobile in light/dark: real Clerk sign-in returned to the saved draft and
  Request creation succeeded. The expired-session fixture reloads the recovery URL to discard its stale
  in-memory Clerk session. Signed Intake reviews now accept opaque Clerk IDs while preserving signature,
  expiry, user, and organization binding.
- **Next gate:** deploy this branch to staging, then verify actual signup, emailed invitation acceptance,
  and attachment authorization on the deployed application. The old staging deployment is not compatible
  with the migrated schema; redeploying old `main` is not a cutover. Production remains blocked on this gate.

## Release attempt — 2026-09-24

- The user authorized completing staging deployment/verification and then the production cutover.
- Live Git inspection found commit `8490730` already pushed on `codex/clerk-clean-cutover`; `main` remains
  `826e509`. Vercel has a Ready preview for that commit in the separate `lane-staging` project:
  `dpl_BibXBgxWNZZc3Qmwz4dG7ky81aHw`. It has not been promoted to `lane-staging.vercel.app`.
- Release review found the three timestamp triggers absent after 0013. Live staging inspection also
  found RLS disabled on all six recreated tables (the local baseline's hosted auto-RLS helper had masked
  that difference); table grants remained revoked. Added canonical, non-destructive migration
  `0014_restore_clerk_table_safeguards.sql` and real database regressions.
- Before applying 0014, exported staging's public schema/data to
  `backups/lane-staging-pre-0014-2026-09-24T09-53-03-209Z.dump` (24,389 bytes, mode 0600).
  Verified its archive listing and a full archive read. Applied 0014 only to staging; verified all six
  RLS flags, denied anon/authenticated SELECT privileges, and all three restored timestamp triggers.
- Fresh local verification passed: 34 files / 205 tests, TypeScript, full ESLint, and diff checks.
  The production build passed before the database-only follow-up; no runtime application code changed.
- Added `e2e/clerk-attachments.spec.ts` for real upload/finalization/exact-byte download plus anonymous,
  foreign-workspace, forged-context, and public-storage denial. Its live deployed run is still pending.
- Dashboard automation safety review blocked the staging project's action named **Promote to Production**.
  Requested explicit confirmation that this is a staging-only promotion to `lane-staging.vercel.app`,
  with staging credentials, and does not affect `app.uselane.app`. Do not work around that pending approval.
- Production's Clerk live instance has not been created. The development instance has an unlimited-members
  paid feature selected; do not clone that into production or purchase an add-on without approval. Production
  requires its own live keys/domain configuration after staging gates pass. No production changes were made.
