# Signed-in browser checks on a local database

How to walk a change in the running app, signed in as any of Lane's four roles, without touching Lane Staging.
Use it for the browser half of "Verify production components in the running app".

Hard limits for every walk:

- The app talks to a **local** `lane_test_*` database. Hosted databases and their migrations are Nikhil's to run.
- The people, workspaces and invitations are local rows the e2e helpers make and delete. There is no cap and no
  outside identity service, and every role is real: never simulate one by editing code.
- Email goes only to Resend's test recipient (`delivered+<label>@resend.dev`, what `testEmail` and `createTestUser`
  use), and only where the walk needs a send. Resend Free allows 100 a day for everyone, so sign in by test cookie
  everywhere else.
- Never open, print, log or commit the main checkout's `.env.local` values. Never touch `.env.staging.local`.
- Screenshots, logs and notes live outside the repo, and not under `/tmp`, which macOS clears.

## 1. Local database with the full schema

The main Vitest configuration resets only the database assigned to the real Git checkout by
`src/test/test-database.ts`. It resolves the loopback `/lane_test` placeholder in `.env.test` to a
checkout-specific name. Never weaken that guard. Run the non-resetting safety suite first, then the one that
prepares the database:

```sh
pnpm exec vitest run --config vitest.architecture.config.ts
pnpm exec vitest run src/lib/env.test.ts
```

Use the exact name printed by `[test-setup]`. The reset applies migrations 0013 through the latest, with their
pre-migration fixtures. It is not a hosted restore. Once browser work starts, don't run reset-capable tests in that
checkout: the run lease stops two resets, but doesn't protect a running server. The UI configuration has no
database setup.

## 2. Env

Write the git-ignored `.env.local` in the worktree. Made-up values are enough to sign in and walk every screen:

```sh
cat > .env.local <<'EOF'
BETTER_AUTH_SECRET=any-made-up-local-value-of-32-characters
NEXT_PUBLIC_APP_URL=http://localhost:3400
NEXT_PUBLIC_SUPABASE_URL=https://jznepeqghjixcrpuddym.supabase.co
SUPABASE_SECRET_KEY=made-up
ANTHROPIC_API_KEY=made-up
TRIAGE_TOKEN_SECRET=made-up
GOOGLE_CLIENT_ID=made-up
GOOGLE_CLIENT_SECRET=made-up
EOF
chmod 600 .env.local
```

`NEXT_PUBLIC_SUPABASE_URL` is Lane Staging's on purpose: the safety check in `e2e/helpers/safety.ts` pins it, and
nothing reads it until an attachment is used. Playwright gives the app `BETTER_AUTH_URL` and Cloudflare's published
always-pass Turnstile keys, so `.env.local` holds neither.

Some walks need real values. For those, copy the main checkout's file instead (read-only source), take Lane Staging's
database out of your copy, and set `BETTER_AUTH_SECRET` to a made-up value:

```sh
cp /Users/nikhilsharma/Documents/Work/Lane/.env.local . && chmod 600 .env.local
sed -i '' -E '/^(DATABASE_SSL_CA|BETTER_AUTH_SECRET)=/d; s#^DATABASE_URL=.*#DATABASE_URL=postgresql://nikhilsharma@localhost:5432/<name from §1>#' .env.local
printf '\nBETTER_AUTH_SECRET=any-made-up-local-value-of-32-characters\n' >> .env.local
```

Do the `sed` before you start anything: `next.config.ts` loads `.env.local` **over** the shell's variables, so a
`DATABASE_URL` in front of `pnpm dev` or `pnpm build` doesn't win. Playwright's server is safe either way (it sets
`LANE_ENV_FILE=/dev/null`).

| The walk needs | Names |
|---|---|
| a code or invitation email that really sends | `RESEND_API_KEY`, `LANE_AUTH_EMAIL_FROM` |
| the AI check when filing a Request | `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| attachments (Lane Staging's private storage) | `SUPABASE_SECRET_KEY` |
| a Google round trip (§5) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Feature switches (`LANE_BILLING_ENFORCED`, … see `.env.example`) go in `.env.local` only for the walk.

## 3. Walk as each of the four roles

A walk is a throwaway Playwright spec that uses the e2e helpers, so the safety check, the fixtures and their
clean-up are the suites' own. Put it at `e2e/walk-<ticket>.spec.ts` and delete it before you commit:

```ts
import { expect, test } from "@playwright/test";
import { createRoleWorkspace } from "./helpers/role-workspace";

test("walk", async ({ browser }) => {
  test.setTimeout(0);
  // One workspace; an Admin, a Member, a Guest and a Viewer, each signed in in a browser of their own.
  const team = await createRoleWorkspace(browser, "Walk Harbour");
  try {
    for (const { page, name } of Object.values(team.people)) {
      await page.goto("/");
      // The frame names the workspace for every role; the page's heading is "My Requests" for a Guest.
      await expect(page.getByRole("complementary", { name: "Workspace sidebar" }).getByRole("heading", { name: "Walk Harbour" })).toBeVisible();
      await page.screenshot({ path: `<scratch folder>/${name}.png` });
    }
  } finally {
    await team.close(); // deletes everyone and everything in it
  }
});
```

Run it holding the shared browser lock (`~/Documents/Work/lane-build-notes/e2e-lock.md`):

```sh
LANE_E2E_ALLOW_REMOTE=1 LANE_E2E_LOCAL_DATABASE=1 \
DATABASE_URL=postgresql://nikhilsharma@localhost:5432/<name from §1> E2E_BASE_URL=http://localhost:3400 \
caffeinate -i pnpm exec playwright test e2e/walk-<ticket>.spec.ts --workers=1 --output=<scratch folder>/pw-out
```

Done when the spec passes and there is a signed-in screenshot for each role.

- **By hand**: add `--headed`, and `await team.people.admin.page.pause()` where you want to take over. The people
  exist until you press Resume. To sign in from another browser, print `email` and `password` and use the form (§4).
- **More fixtures**: `createTestUser`, `createTestWorkspace`, `addTestMember`, `setTestMemberRole`,
  `removeTestMember`, `createTestInvitation` (`e2e/helpers/{test-user,workspaces}.ts`), `seedRoleRequest`.
  `signInTestUser(page, user, orgId?)` sets the session cookie and loads no page, so `goto` next.
  `readTestSession(page)` says whose session the browser holds. To end a session as a revoke does, `endTestSessions(id)`.
- A page is only its HTML until React has it. Before a press, wait with `hydrated(control)` or `formReady(page)`.
- A run that is killed leaves its rows. They are local; the next §1 reset clears them.

## 4. Sign in through the real form

The fixture's `email` and `password` work on `/login`. Import `test` from `e2e/helpers/auth-forms.ts` instead of
Playwright's: Better Auth limits sign-in calls by address and local browsers share one, so it gives each test an
address of its own.

- **Turnstile** passes by itself with the test keys; wait for it with `passHumanCheck(page)`. Its frame says "For
  testing only". Every send spends the token.
- **An emailed code**: press send, wait for the code screen, then `replaceEmailCode(email, "sign-in" |
  "email-verification" | "forget-password")` puts a code you know in its place (246810). The send must succeed, so
  this needs the Resend names. Without them the screen says it couldn't send, which is how you walk that state.
- **A refused password** that is really in a breach list (`password123`) asks Have I Been Pwned over the network.

## 5. Google

The suites stop at Google's door. A real round trip needs a person at Google's screen:

1. The local Google client's values are in `.env.local` (§2). Its redirect addresses are `localhost:3000` and
   `localhost:3100` only, so the app must run on one of those ports.
2. Start the app on the local database (`LANE_ENV_FILE=/dev/null` is what makes this `DATABASE_URL` win):
   `LANE_ENV_FILE=/dev/null DATABASE_URL=postgresql://nikhilsharma@localhost:5432/<name from §1> BETTER_AUTH_URL=http://localhost:3000 TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm dev`.
3. The person opens `http://localhost:3000/login`, presses Continue with Google and finishes there.
4. Delete their local rows with a §1 reset once the server is stopped.

## 6. What to cover, and what to record

- Light and dark; 390, 768, 1024 and 1440 with no sideways scroll; 200% zoom (a 720 px wide window).
- Keyboard only: focus order, focus return after dialogs and menus, Escape, focus on the first refused field.
- A touch phone (`isMobile`, `hasTouch`): a field's text is at least 16 px, or iOS zooms the page in on it.
- Reduced motion, accessible names and live announcements, and loading, empty, error (`context.setOffline(true)`)
  and long-content states. Long emails and workspace names are the ones that break a phone.

The hand-back lists what was walked and what was not (VoiceOver itself, a physical phone, hosted runs). Before it:
no walk spec, server or lock left behind, and `git status` shows only your intended changes.

## 7. Run e2e specs on the local database

`pnpm exec playwright test` normally targets Lane Staging. These switches run specs on your local database instead,
with the app on any local port (Playwright starts it; nothing may already be listening there):

```sh
LANE_E2E_ALLOW_REMOTE=1 LANE_E2E_LOCAL_DATABASE=1 \
DATABASE_URL=postgresql://nikhilsharma@localhost:5432/<name from §1> E2E_BASE_URL=http://localhost:<port> \
caffeinate -i pnpm exec playwright test e2e/<spec>.spec.ts --output=<scratch folder>/pw-out
```

- `LANE_E2E_LOCAL_DATABASE=1` accepts only a `lane_test_*` database on `localhost`/`127.0.0.1` and a local `http://`
  app. The run signs its test sessions with `.env.local`'s `BETTER_AUTH_SECRET`; the setup project proves the app
  accepts one before any suite runs.
- `LANE_E2E_ALLOW_REMOTE=1` is still needed, on purpose: it is the consent for what stays remote. Specs with
  attachments write to Lane Staging's file storage, and the few with a real send use Resend.
- `LANE_E2E_START=1` serves the production build with `next start` instead of `next dev`, for a run against what
  ships and steadier timing. Build first, with the Turnstile test key in the bundle:
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm build`.
- Keep the Mac awake and its lid open: asleep, a run only fails its time limits. With the display off, headed
  (native) suites draw no frames.
- A staging run needs Lane Staging's own `BETTER_AUTH_SECRET` in `.env.staging.local`, which is checked by
  fingerprint (`e2e/helpers/staging-pin.ts`). That file is Nikhil's.
