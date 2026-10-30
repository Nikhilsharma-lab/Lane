# Signed-in browser checks on a local database

How to walk a change in the running app, signed in, without touching Lane Staging's data or the Clerk user
count. Use it for the browser half of "Verify production components in the running app".

Hard limits for every walk:

- The app talks to a **local** database. `.env.local`'s `DATABASE_URL` is Lane Staging, which lags the repo's
  migrations; hosted migrations are Nikhil-run.
- Reuse an existing `lane-e2e-*` Clerk user. Never create or delete Clerk users: the development instance has a
  100-user limit. If no `lane-e2e-*` user exists, stop and ask Nikhil.
- Existing task authorization takes precedence over this recipe. Reuse an already owned team when instructed; do not create organizations, change memberships, enable providers, or simulate roles merely because an example below does so.
- Any Clerk organization you create is temporary, marked in `privateMetadata`, and deleted before you hand back.
- Walk scripts, logs and screenshots live in a scratch folder outside the repo (`/tmp/lane-<ticket>-scratch/`).

## 1. Local database with the full schema

The main Vitest configuration resets only the database assigned to the real Git checkout by
`src/test/test-database.ts`. It resolves the loopback `/lane_test` placeholder in `.env.test` to a
checkout-specific name. Arbitrary names such as `lane_test_dev_<ticket>` are refused; never weaken that guard.
Run the non-resetting safety suite first, then the bounded application suite that prepares the database:

```sh
pnpm exec vitest run --config vitest.architecture.config.ts
pnpm exec vitest run src/lib/env.test.ts
```

Use the exact name printed by `[test-setup]` for this checkout's browser environment. The canonical reset applies
migrations 0013 through the latest migration, including their pre-migration fixtures. It is not a hosted restore.
The test-run lease prevents concurrent resets, but does not protect a running browser server: once browser work
starts, do not run reset-capable tests in that checkout until its runtime owner hands it back. Use another
isolated checkout for independent tests. The UI configuration has no database setup.

## 2. Dev server env

Copy `.env.local` from the main checkout (read-only source) and swap only the database:

```sh
cp /Users/nikhilsharma/Documents/Work/Lane/.env.local . && chmod 600 .env.local
sed -E 's#^DATABASE_URL=.*#DATABASE_URL=postgresql://nikhilsharma@localhost:5432/<exact-checkout-test-database>#' .env.local > .env.dev-local
chmod 600 .env.dev-local
LANE_ENV_FILE=.env.dev-local pnpm dev            # add -p 3200 if :3000 is busy
```

`next.config.ts` loads `LANE_ENV_FILE`. Keep the default `.next` dist dir (a custom `NEXT_DIST_DIR` makes
`next dev` edit `tsconfig.json`). Feature switches (`LANE_CUSTOM_ROLES`, `LANE_BILLING_ENFORCED`, …, see
`.env.example`) go in `.env.dev-local` only for the walk.

Done when `curl -sI http://localhost:3000/login` is 200 and `/` redirects to `/login`.

## 3. Seed script: users, temporary organization, rows

A Node script in the scratch folder loads packages from the worktree with
`createRequire("<worktree>/package.json")` (`postgres`, `@clerk/backend` from `node_modules/.pnpm`) and reads
`.env.dev-local`. Before anything else it refuses to run unless `DATABASE_URL` is exactly your local dev database
and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test_`.

- `setup`:
  1. Find users: `clerk.users.getUserList({ query: "lane-e2e", limit: 50 })`, keeping those with a `lane-e2e`
     email. Take as many as the walk needs (Admin, Member, …).
  2. Create the organization: `clerk.organizations.createOrganization({ name, createdBy: admin.id, privateMetadata: { lane<ticket>: true } })`,
     then `createOrganizationMembership({ organizationId, userId, role: "org:member" })` per teammate.
  3. Insert the local rows the way `provisionTestWorkspace` in `e2e/helpers/cleanup.ts` does: `profiles` (with a
     `role` label, which skips onboarding), `organizations`, finished `first_run_progress` rows unless the walk
     covers the first run, then whatever Projects/Requests the walk needs.
  4. Write ids and emails to `state.json` in the scratch folder.
- `teardown`: read `state.json`, fetch the organization, refuse unless its `privateMetadata` carries your marker,
  `deleteOrganization`, then `delete from organizations where id = …` locally.

To walk organization creation itself, sign in a reused user and create the workspace through Clerk's task in
the browser; delete that organization in teardown the same way (check `createdBy` and its name first).

## 4. Walk script: sign in with a Clerk testing token

Use `@playwright/test`'s `chromium` and `@clerk/testing/playwright`. Set `process.env.CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` from `.env.dev-local`, then:

```js
await clerkSetup();                                   // once per script: fetches the testing token
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await setupClerkTestingToken({ page });
await page.goto(`${base}/login`);
await clerk.signIn({ page, emailAddress: state.memberEmail });   // no password, no email sent
await page.evaluate(async id => { await window.Clerk.setActive({ organization: id }); }, state.orgId);
```

One context per person; log `pageerror` and console errors. Invitations in a walk go to `…+clerk_test@example.com`
addresses so Clerk sends no email. To run a whole e2e spec on the local database, use §7 instead.

Cover: light and dark (Settings → Profile theme), 390/768/1024/1440 with no horizontal overflow, keyboard only
(focus order, focus return after dialogs/menus, Escape), accessible names and live announcements in the DOM,
and loading, empty, error (go offline with `context.setOffline(true)`) and long-content states.

## 5. Roles and providers the dev instance lacks

The Clerk development instance has no `org:guest` or `org:viewer` role, and Stripe/Slack/email are off. For those
walks, make an **uncommitted** local change (e.g. map `org:member` to `"guest"` in `clerkWorkspacePermission`, or a
walk-only stand-in provider), walk, then revert it. Confirm `git status` is clean afterwards and say in the hand-back
that the role was simulated; the action tests are the real coverage.

## 6. Clean up and record

Run only the teardown authorized for this walk (do not delete reused organizations), stop the dev server, `dropdb -h localhost <exact-checkout-test-database>`, and remove `.env.dev-local` if
you created it. Done when the temporary organization is gone from Clerk, `git status` shows only your intended
changes, and the hand-back lists what was walked and what was not (VoiceOver itself, simulated roles, hosted runs).

## 7. Run e2e specs on the local database

`pnpm exec playwright test` normally targets Lane Staging. Two opt-in switches run specs on your local database
instead, with the app on any local port (Playwright starts it; nothing may already be listening there):

```sh
LANE_E2E_ALLOW_REMOTE=1 LANE_E2E_LOCAL_DATABASE=1 LANE_E2E_REUSE_USERS=1 \
DATABASE_URL=postgresql://nikhilsharma@localhost:5432/lane_test_<name> E2E_BASE_URL=http://localhost:<port> \
pnpm exec playwright test e2e/<spec>.spec.ts --output=/tmp/lane-<ticket>-scratch/pw-out
```

- Needs `.env.local` in the worktree (§2) and a migrated `lane_test_*` database (§1). `LANE_E2E_LOCAL_DATABASE=1`
  accepts only a `lane_test_*` database on `localhost`/`127.0.0.1` and a local `http://` app; every Clerk check in
  `e2e/helpers/safety.ts` still applies.
- `LANE_E2E_ALLOW_REMOTE=1` is still needed on a local run, on purpose: only the database is local. The run still
  creates and deletes users and organizations in the remote Clerk development instance, and specs with
  attachments write to Lane Staging's file storage. `LANE_E2E_ALLOW_REMOTE=1` is the consent to change those remote
  services; `LANE_E2E_LOCAL_DATABASE=1` only moves the database and never stands in for that consent.
- `LANE_E2E_REUSE_USERS=1`: when Clerk is at its user cap, fixtures borrow a free `lane-e2e-*` user (no
  organization, the fixture password), mark it, and give it back with its own name instead of deleting it. It runs
  one worker. A crashed run leaves `laneE2EBorrowedBy` in that user's `privateMetadata`, so it isn't borrowed again
  until someone clears it.
- Only the database moves: Clerk and file storage stay the services `.env.local` names. Fixtures still create (and
  delete) their own Clerk users while Clerk has room; borrowing starts only at the cap.
