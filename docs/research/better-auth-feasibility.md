# Research: Better Auth feasibility and free pilot constraints (#332)

Question (#332, map #331): can Better Auth replace Lane's Clerk responsibilities while keeping accounts, data and
permissions, with no paid services before revenue?

Scope: planning only. No app code, database, deployment, Clerk or provider setting was changed. No `.env` file or
secret was read, no Clerk Backend API call was made and no personal data was exported.

Evidence and its limits:
- **Local code:** Lane `main` at `24e077e0`, read on 2026-11-20.
- **External:** primary sources only. These are Better Auth's docs, GitHub repo, advisories and npm registry, plus
  Clerk, Resend, Postmark, Brevo, Supabase and Vercel first-party pages, all accessed 2026-11-20. Better Auth docs
  were read as rendered pages and as MDX source at better-auth commit `3a7e13c5`.
- **Not done:** nothing was checked against integration, staging or deployed systems. Every claim about how a
  migration would behave comes from documentation and needs a disposable prototype before anyone relies on it
  (§10).

References are numbered `[n]` and listed at the end.

---

## 1. Verdict

**Feasible, with conditions. It is not a drop-in swap.**

- Better Auth's MIT library plus its organization plugin covers each Clerk job Lane uses: sessions, workspaces,
  memberships, roles, invitations and email/password with verification and reset. Custom roles cost nothing, so
  Admin, Member, Guest and Viewer can all exist with no paid plan [3][4].
- Accounts and data can be kept.
  - Clerk's `user_*` and `org_*` IDs can stay as the primary keys, so none of Lane's roughly 30 ID columns needs
    rewriting [5][6].
  - Bcrypt password hashes from Clerk's dashboard CSV can be checked by a custom verifier, so password users need no
    reset [5][7].
- The cost is not money. It is a large rebuild plus permanent maintenance.
  - **Rebuild:** every Clerk-hosted screen and popup, all auth email, Lane's own membership and invitation tables,
    and about 100 files that import `@clerk/*`.
  - **Maintenance:** Better Auth published 49 security advisories between Dec 2024 and Nov 2026, 39 of them in
    2026 [9]. Lane would have to patch promptly.

**The three claims tested:**

| Claim | Finding |
|---|---|
| "It's free" | **True for the library:** MIT, $0, no user caps [2][10]. The paid part is the optional Better Auth Infrastructure (Starter $0, Pro $20/mo), which Lane doesn't need [11][12]. But **Clerk is also free for Lane's pilot:** 50,000 monthly retained users, 100 retained organizations, up to 20 members per organization [13]. What Clerk charges for is custom roles (Enhanced B2B, $100/mo) and removing its badge (Pro, $25/mo) [13]. So the saving is $100–125/mo of add-ons, paid for with engineering time and new free-tier email limits (§3). |
| "It's open source" | **True.** MIT licence, copyright Bereket Engida [2]. Vercel acquired the company on 2026-07-07 and said "The library remains free and open source under MIT" [14][15]. Funding: a $5M seed round in June 2025 [16]. Better Auth's team has also maintained Auth.js since 2025-09-22 [17]. |
| "It has more features for Lane" | **Partly true.** Three differences matter for Lane: free custom roles, no "Secured by Clerk" badge, and sign-in forms Lane owns and can make fast. Most other extras (passkeys, 2FA, magic link, SSO, SCIM, teams, admin roles that create roles, API keys) are things Lane hasn't approved. Under AGENTS.md they would be new capabilities needing written approval (§8). Better Auth also ships **no first-party UI**. Clerk's sign-in, sign-up, workspace task, account and members popups would all become Lane screens built with Arc [18]. |

**Password resets and invitation reissues, stated plainly:**
- **Password resets can be avoided** for users who sign in with a Clerk password, if three things hold:
  - the dashboard CSV (the only export with password hashes) is imported;
  - Better Auth is configured with Clerk's bcrypt verify;
  - a prototype confirms both [5][7].
- **Invitation reissues can't be avoided by any documented mechanism.**
  - Clerk's emails link to Clerk's Account Portal. Lane passes no `redirectUrl` (`src/app/(app)/settings/members/actions.ts:57`) [19][20].
  - Those links can't be redeemed in Better Auth.
  - Reissues are avoided only if **zero invitations are pending at cutover**. That means they've all been
    accepted, or have expired (Clerk's default is 30 days [20]). Revoking them counts as needing a reissue.

---

## 2. Responsibility-by-responsibility mapping

"Main" means live on `main` at `24e077e0`. The switches are in `src/lib/feature-switches.ts`; each is on only when
its value is `"1"`, and all are off by default.

| # | Responsibility (status) | Clerk today (files) | Better Auth equivalent | Gap / work for Lane |
|---|---|---|---|---|
| 1 | **Session guard and middleware** (main) | `src/proxy.ts`: `clerkMiddleware`, task redirects through `src/lib/session-task-urls.ts`, `/__clerk` matcher. `src/lib/auth-guard.ts`: `guardActiveMember`, `guardCanChange`, `guardCanContribute`, `guardOwnerOrAdmin` and `require*`, called from about 20 action files. `src/lib/ensure-workspace.ts` `getMember()`. `src/app/api/_lib/read-route.ts` | `auth.api.getSession({ headers })` in server components, actions and route handlers. `proxy.ts` on the Node runtime can do full checks. `getSessionCookie` is a cookie-only, "NOT SECURE" optimistic check. Needs the `nextCookies()` plugin, placed last, so server actions can set cookies [1] | Clerk puts `orgId` and `orgRole` in the session token. In Better Auth the session carries only `activeOrganizationId` [3], so the role needs a `member` lookup per guard unless it's cached. Caching makes role changes and revocations lag: see advisory GHSA-fvxx-76fc-893x, "Revoked sessions can stay valid with … the cookie cache" [9]. The guards keep their shape (identity from the session, never from arguments), with a new implementation inside. `src/lib/action-call.ts` uses `window.Clerk.session.getToken` to replay expired actions and must be replaced. |
| 2 | **Sign-in, sign-up and recovery UI** (main) | `src/app/layout.tsx` `<ClerkProvider ui prefetchUI={false} localization taskUrls>`. `src/components/auth/clerk-sign-in.tsx` (`<SignIn routing="hash">`, `<TaskChooseOrganization>`, `<TaskResetPassword>`). `signup/page.tsx` `<SignUp>`. `password-recovery-form.tsx` and `password-recovery-flow.ts` (`@clerk/nextjs/legacy` `reset_password_email_code`). `clerk-appearance.ts`, `clerk-localization.ts`, `clerk-profile.module.css` | Email/password with `sendVerificationEmail`, `requireEmailVerification` and `sendResetPassword` [7][21]. Verification and reset use links by default. The `emailOTP` plugin gives 6-digit codes that expire after 300 s, with 3 attempts [22]. No first-party components [18] | Lane builds sign-in, sign-up, verify, forgot and reset screens with Arc, plus their states (REQUIREMENTS §10). Clerk's appearance and localization files go away. Clerk's bot protection (`challenges.cloudflare.com` in `src/lib/security-headers.ts`) has no automatic replacement. |
| 3 | **Workspace creation, choose-organization task, onboarding, switching** (main) | Organizations are created only in Clerk's `TaskChooseOrganization`, with "Membership required". `src/app/(auth)/onboarding/actions.ts` (`auth()`, `currentUser()`, upsert `profiles`). `src/components/shell/use-workspace-switcher.ts` and `workspace-switcher.ts` (`useOrganizationList`, `setActive`). `sidebar.tsx:61` `useOrganization()` | `organization.create`, `setActive`, `listOrganizations`. `allowUserToCreateOrganization` and `organizationLimit` exist [3]. "By default when the user is signed in the active organization is set to `null`"; a `databaseHooks.session.create.before` hook can set it [3] | There are no session tasks. Lane writes the "no active workspace → create or join" redirect in its guards, the create-workspace form, and the hook that restores the active workspace at sign-in. Better Auth's `organization` table has no `createdBy`: its columns are id, name, slug, logo, metadata, createdAt [3]. Lane reads `createdBy` in `src/lib/first-run.ts:53` and `src/lib/billing.ts:98`, so it needs `additionalFields` or Lane's existing `organizations.owner_id`. |
| 4 | **Members, invitations and roles** (main for Admin/Member; Guest/Viewer behind `LANE_CUSTOM_ROLES`) | `src/lib/role-rules.ts` `clerkWorkspacePermission` maps `org:admin`, `org:member`, `org:guest` and `org:viewer`. `src/lib/member-role-rules.ts` (`rolesOffered`, `clerkRoleOf`, `isPaidSeat`). `settings/members/actions.ts`: `createOrganizationInvitation`, `updateOrganizationMembership`, `revokeOrganizationInvitation`. `workspace-members.tsx` reads `useOrganization({memberships, invitations})`. Removal and leaving happen in Clerk's popups (`clerk-members-remove.tsx`, `clerk-members-profile.tsx`) | `createAccessControl` and `ac.newRole` take any role names, free [3][4]. `creatorRole` can be `"admin"` [3]. Endpoints for invite, accept, reject, cancel, list, `updateMemberRole`, `removeMember`, `leave` and server-only `addMember` [3]. `sendInvitationEmail` is Lane's to write. Invitations expire after 48 h by default and cap at 100 per organization; memberships cap at 100 per organization [3] | Admin/Member/Guest/Viewer, or Admin/Member/Guest after #311, become plain Better Auth roles, and `LANE_CUSTOM_ROLES` can be deleted. Better Auth's built-in `owner` concept needs a decision: map Lane's Admin onto it, or set `creatorRole: "admin"` and grant `organization:delete` to admin. Lane builds the Members removal and leave UI that Clerk's popups provide today. This **reverses** ADR 0001 and the AGENTS.md rule "Lane never recreates membership or invitation tables": Better Auth's `member` and `invitation` tables, inside Lane's database, become the one authority. |
| 5 | **User profile reads** (main) | Postgres `profiles` projection (name, email, `avatar_url`) is written at onboarding and by `syncAccountName`. Joined in `src/lib/data/requests.ts`, `inbox.ts`, `impact.ts`, `shell.ts`, `inbox-delivery.ts`, `slack-connection.ts`. The live roster is `src/lib/workspace-roster.ts` (`getOrganizationMembershipList`, `publicUserData`), used by reviewers, intake, transitions, journey, inbox delivery and billing. Account popup: `account-profile.tsx` (`useUser`, `openUserProfile`) | `user` table (id, name, email, emailVerified, image, createdAt, updatedAt) [6]. Members join `user` in Lane's own database | The roster becomes a Drizzle join, with no network call. Lane builds the account screen that `openUserProfile` provides today (name, email change, password change, sessions); each part is a scope decision. **Avatars and workspace logos are hosted at `img.clerk.com`** (CSP, `profiles.avatar_url`). They stop loading once Clerk is deleted, unless they're copied (to Supabase Storage, 1 GB free [23]) or dropped for initials. |
| 6 | **Billing seats and Free Requests** (seat following behind `LANE_BILLING_ENFORCED`; Free Requests counting always on) | Seats: `paidSeats(workspaceRoster().length)` in `src/lib/billing.ts:370` and `followSeatChanges`, `:395`. Free Requests: `decideFreeRequests` (`billing.ts:94`) reads the Clerk organization's `createdBy`, then `users.getUser(createdBy)` for the email domain | Count `member` rows where role is admin or member. Creator email comes from `user` | The count gets cheaper. The creator needs a stored field (row 3). Stripe is unaffected (`src/lib/payment-provider.ts`, `api/billing/webhook`). |
| 7 | **Email: who sends what today** | **Clerk sends** organization invitations, sign-up email verification codes and password-reset codes. The cutover plan records dev invitation mail from `invitations@accounts.dev` landing in Spam. **Lane sends** Inbox delivery through Resend (`src/lib/messenger.ts`, `fetch` to `api.resend.com`), behind `LANE_EMAIL_DELIVERY` and off. Recipients come from the Clerk roster's `publicUserData.identifier` | Better Auth sends nothing. It calls Lane's `sendVerificationEmail`, `sendResetPassword`, `sendInvitationEmail` or `sendVerificationOTP` [3][7][21][22] | **All auth email becomes Lane's.** It's needed on day one: sign-up can't verify without it. Today Nikhil hasn't switched any Lane email on (REQUIREMENTS §10, Inbox delivery), so this is a new approval (§8). It shares the one Resend free quota with Inbox delivery (§3). |
| 8 | **Slack DM** (behind `LANE_SLACK_DELIVERY`) | `messenger.ts:84-118` uses Slack `users.lookupByEmail` with the Clerk roster email. OAuth through `src/lib/slack-install.ts`, token in `slack_connections` | Same email, read from `user.email` | Only the email source changes. |
| 9 | **Webhooks** | None. Clerk webhooks are absent by design (`docs/operations/account-deletion.md`) | Not needed; Better Auth runs inside Lane | None. |
| 10 | **Postgres IDs** | `text` columns hold `user_*` and `org_*` in `organizations`, `profiles`, `requests`, `comments`, `notifications`, `request_attachments`, `projects`, `workspace_labels`, `metric_definitions` (+ history and aliases), `request_expected_impact_revisions`, `request_agreements` (+ events), `same_problem_*`, `quarter_notes`, `saved_views`, `delivery_preferences`, `delivery_log`, `first_run_progress`, `slack_connections`, `workspace_billing` and `free_request_allowances`. RLS is enabled with no policies, and anon/authenticated grants were revoked (migrations 0013, 0014) | IDs are strings. The Clerk guide inserts users with Clerk's `id` using `forceAllowId: true` [5]. `generateId` is configurable [6] | Keeping the IDs means no rewrite. New users get Better Auth's random IDs, so the formats will mix; one comment assumes the `user_` prefix (`src/components/impact/impact-screen.tsx:18`). **The new auth tables must get the 0013/0014 treatment** (RLS on, grants revoked): on Supabase "a new table in public starts with every privilege already granted" to anon and authenticated [24], and these tables would hold password hashes and session tokens. Don't use the Drizzle doc's example `pgSchema("auth")` [8]: `auth` is Supabase Auth's own schema. |
| 11 | **Testing** (main) | `e2e/clerk.setup.ts` (`clerkSetup`). `e2e/helpers/safety.ts` pins the dev instance. `e2e/helpers/test-user.ts` uses the Backend API to create users and organizations. `setupClerkTestingToken`. About 59 of 74 e2e files sign in through these helpers. `vi.mock("@clerk/nextjs/server")` appears 58 times in unit tests | `testUtils()` plugin: factories, `login`, `getCookies` for Playwright, and `captureOTP`. Keep it in a separate test-only auth instance [25] | Rewrite the e2e helpers and unit mocks. The Clerk-specific specs (`clerk-signup`, `clerk-password-recovery`, `clerk-sign-in-words`, `clerk-member-windows`, `clerk-attachments`, `theme-parity`) need rewriting or deleting. |
| 12 | **Other** | `src/lib/env.ts` requires the Clerk keys. CSP `CLERK_HOSTS`. `docs/operations/account-deletion.md` §1.1 deletes through the Clerk Dashboard | Better Auth secret and base URL. `deleteUser` | The deletion procedure, Privacy page processor list and backup-retention rule need updating. Lane's backups would then contain password hashes and sessions. |

---

## 3. Bounded free pilot envelope

The pilot is 20–30 users (AGENTS.md "FREE PILOT → FIRST PAYMENT").

| Service | Free allowance | What happens when it runs out |
|---|---|---|
| **Better Auth library** | $0, MIT, no user cap [2][10]. Configurable defaults: 100 members and 100 invitations per organization [3]. Telemetry is off by default [26] | Nothing is metered. The limits are config values. |
| **Resend Free** (the email service REQUIREMENTS already names) | 3,000 emails/mo, **100/day**, 3 domains, 30-day retention [27] | No overage on Free. Resend "will notify" and offer an upgrade (Pro $20/mo for 50,000) [27]. **The page doesn't say whether sending is blocked.** Prototype it. If sends fail, verification, reset and invitation stall until the next day. The 100/day is shared with Inbox delivery once that's switched on. |
| Postmark Developer | 100 emails/mo, free forever, "No overages allowed" [28] | Too small for auth plus Inbox. |
| Brevo Free | 300/day, API and SMTP included (vendor marketing pages; not checked on a pricing table) [29] | Daily cap. A new account must be approved before it can send [29]. |
| **Supabase built-in SMTP** | Not usable. It serves Supabase Auth only, "2 messages per hour", delivers only to the project's team, and is "not meant for production use" [30] | Not applicable. |
| **Supabase Free** (production and Lane Staging) | 500 MB database, 5 GB egress, 1 GB storage, **2 active projects**, paused after 1 week of inactivity, **no backups** [23] | The auth tables are tiny at pilot scale. But a pause now takes sign-in down too, and the 2-project limit means a prototype needs local Postgres, not a third Supabase project. |
| **Vercel Hobby** | 1M function invocations, 4 active-CPU hours, 360 GB-hrs memory, 100 GB fast data transfer per month [31]. "personal or non-commercial use" only [32] | "you will have to wait until 30 days have passed before you can use the feature again" [31]. Auth calls add invocations and CPU (bcrypt and scrypt are deliberately slow) but should be small at 30 users. Measure it. |
| **Rate-limit storage** | Default is in memory, "not suitable… in serverless" [33]. Free options: `storage: "database"` (adds a `rateLimit` table) or secondary storage [33] | With memory storage on Vercel, limits are per instance and close to meaningless. Database storage adds a write per limited request. |
| Clerk Hobby (for comparison) | 50,000 retained users, 100 retained organizations, 20 members per organization; custom roles need Enhanced B2B at $100/mo [13] | Keeping Clerk alive during a transition costs $0. |

**Conflicts with the "FREE PILOT → FIRST PAYMENT" gates.** The migration doesn't relax any gate; it raises the
stakes of three:
1. **"Take and verify a manual database export before every migration."**
   - The database would now hold every account, password hash and membership.
   - Losing it means losing the accounts, not just pilot work. Today accounts survive in Clerk.
   - This strengthens the existing trigger "pilot data becomes valuable enough that losing it would materially hurt"
     for Supabase Pro ($25/mo, daily backups for 7 days [23]).
   - Point-in-time recovery stays a separate paid decision (AGENTS.md).
   - Manual exports would also contain credential hashes, which makes the 28-day expiry rule in
     `docs/operations/account-deletion.md` more sensitive.
2. **"Run and verify migrations on staging first."** Staging uses Clerk's development instance today. A Better Auth
   staging needs its own secret and database rows only, so this is workable, and it is free.
3. **"Hobby is non-commercial."** No change. Payment still waits for Vercel Pro.

---

## 4. Maintenance Lane would take on

- **Security patches.**
  - 49 advisories have been published on `better-auth/better-auth` (Dec 2024 to Nov 2026), 39 of them in 2026
    (4 critical, 19 high, 13 medium, 3 low) [9].
  - Several sit in code Lane would use:
    - invitations accepted by an unverified account (GHSA-fmh4-wcc4-5jm3, high)
    - an owner invited through a padded role name (GHSA-c85h-5mrr-mgx4)
    - revoked sessions staying valid with the cookie cache (GHSA-fvxx-76fc-893x)
    - an unverified OAuth email treated as verified (GHSA-9hm7-xhfp-cx58)
    - rate-limit bypass by rotating IPv6 addresses (GHSA-p6v2-xcpg-h6xw)
    - paths with repeated slashes bypassing disabled paths and rate limits (GHSA-x732-6j76-qmhm)
    - concurrent requests exceeding rate limits on PostgreSQL in the Drizzle adapter (GHSA-44jh-23m7-hpcf) [9]
  - `SECURITY.md`: "We only support the latest version" [34]. In practice the 1.6 line still gets backports (1.6.35 on
    2026-11-19) [10].
  - Release cadence: 1.7.x shipped 19 releases between 2026-10-14 and 2026-11-18, often several a week. 1.8 is in
    beta [10].
  - Lane needs a standing duty to read advisories and upgrade within days. Clerk absorbs this today.
- **Email deliverability.** Lane owns the sending domain's SPF, DKIM and DMARC, the templates, bounces and spam
  placement for every auth email. Clerk's dev invitation mail already landed in Spam (cutover plan). Quota exhaustion
  becomes a sign-in outage (§3).
- **Abuse and rate limiting.**
  - Defaults: 100 requests per 10 s, and 3 per 10 s on `/sign-in/email`. Limits apply only to client requests, not
    to `auth.api` calls [33].
  - IP detection reads `X-Forwarded-For` unless configured, so Lane must set it for Vercel [33].
  - Durable storage is needed (§3).
  - Clerk's bot protection (Cloudflare Turnstile) disappears. Replacing it is a new external service (§8).
- **Session bugs and performance.**
  - Sessions last 7 days and refresh daily by default. `freshAge` is 1 day [35].
  - The cookie cache saves database reads but delays revocation until its `maxAge` [35].
  - Server components can't refresh it [1].
  - Lane's speed budgets (DEFERRED "Sign-in form speed", 48-byte first-load headroom on Settings) would need
    re-measuring with Lane's own forms and a database-backed session.
- **Schema upgrades.** The Better Auth CLI only generates a Drizzle schema. `migrate` works only with the Kysely
  adapter [6]. Each Better Auth upgrade that adds columns becomes a Lane migration, run on staging first with a
  verified backup.

---

## 5. Migration constraints

| Item | Source of truth for export | Can it be kept? | Notes |
|---|---|---|---|
| **User IDs** (`user_*`) | CSV or Backend API | **Yes.** Insert users with Clerk's `id` via `forceAllowId: true` [5] | No Lane data rewrite. |
| **Workspace IDs** (`org_*`), names, slugs, logos | Backend API only. The export article names no org export [7] | Yes: insert `organization` rows directly with the same `id` | Not covered by the Better Auth guide: "doesn't currently show you how to migrate Organization" [5]. Logos are Clerk-hosted (row 5). |
| **Passwords** | **Dashboard CSV only.** "The CLI and Backend API exports don't include them" [7] | **Yes, in principle.** Configure `password.hash`/`verify` with bcrypt, because "Clerk uses bcrypt… Better Auth uses `scrypt`" [5] | The guide ignores `password_hasher` [5], so check each row is bcrypt. The CSV holds personal data and secrets; the export needs Nikhil's approval and handling under the privacy policy. |
| **Verified email state** | CSV and API | Yes, mapped to `emailVerified` [5] | Primary email only [5]. |
| **Google (or other OAuth) links** | Backend API `external_accounts` | Yes, as `account` rows (`providerId`, `accountId` = provider user ID) [5] | Lane must own OAuth client credentials. Whether provider user IDs match under Lane's own client needs a prototype. Tokens are not migrated [5]. |
| **TOTP 2FA** | CSV | The secret is kept; backup codes are not exported, so new ones are generated [5][7] | Only if Clerk 2FA is enabled (unknown). |
| **Sessions** | — | **No.** "This migration will invalidate all active sessions" [5] | Signing in again is approved. |
| **Memberships and roles** | Backend API `getOrganizationMembershipList` per workspace | Yes: insert `member` rows. Role `org:admin` → `admin`, and so on (`org:viewer` → `guest` once #311 lands) | Not in any CSV. Lane writes the script. |
| **Pending invitations** | Backend API `getOrganizationInvitationList` (`status: pending`; fields include `emailAddress`, `role`, `expiresAt`, `url`) [36][37] | **The rows can be copied; the emailed links can't.** The invitee's email points at Clerk's Account Portal [19] | Without a reissue, a copied row is only useful if the invitee comes to Lane on their own and verifies the same email. `listUserInvitations` requires a verified email [3]. That relies on behaviour nobody has designed or approved. **Plan to cut over with zero pending invitations.** |
| **Accounts created during cutover** | — | Lost unless sign-up and invitations are frozen between export and switch-over | Needs a freeze window and a final count. |
| **Rollback** | — | Keep the Clerk instance untouched (free) until Better Auth is verified | Accounts created under Better Auth after switch-over have non-Clerk IDs, so a rollback would orphan them. |

Order with #311: #311 slices 3–6 change Lane's role type, not Clerk, and read `org:guest` and `org:viewer` as
`guest` (#311 body, "Auth"). If #311 lands first, the migration maps `org:viewer` to `guest`. If the migration lands
first, it must carry `viewer` until #311 retires it.

---

## 6. Which DEFERRED items this would unblock

| `DEFERRED.md` entry | Effect |
|---|---|
| **CLERK BRANDING** ("Secured by Clerk" in Clerk's popups) | **Removed rather than unblocked**: the popups no longer exist. Their replacements are Lane screens. |
| **SIGN-IN FORM SPEED** (speed fix 6) | **Unblocked in principle.** The trigger depended on Clerk documenting a preload. The ~570 ms of Clerk environment and client requests and the Suspense reveal inside Clerk's lazy tree go away, and Lane's forms render with the page. Prove it by re-measuring; it isn't automatic. |
| **AUTH SURFACE TOUCH** ("Future auth work must use Clerk configuration and components") | Superseded again. It must be rewritten when the migration is approved. |
| **LOW PRIORITY: Auth form DRY** | Its trigger ("a third auth screen (password reset)") becomes real, because Lane would own login, signup and reset. |
| Not in DEFERRED, but blocked by Clerk: **Guest and Viewer in production** (`LANE_CUSTOM_ROLES`, ADR 0001 "Consequences") | **Unblocked.** Custom roles are free [3][4]. |
| Not in DEFERRED: the open AGENTS.md staging gate, "automatic return to Lane after the hosted portal" for invitations | Becomes moot: Lane owns the accept-invitation page. |

---

## 7. What has to be superseded, not relaxed

- ADR 0001 "Clerk owns identity and tenancy" needs a successor ADR.
- AGENTS.md, in several places:
  - "Clerk alone owns tenancy"
  - "Lane never recreates membership or invitation authority"
  - "Lane must never recreate local membership or invitation tables"
  - guards derived "from Clerk `auth()`"
  - the Stack line
  - the screen list wording "Clerk workspace"
- REQUIREMENTS.md:
  - §2, the access model paragraphs and "Clerk is the sole authority…"
  - §10, Authentication and onboarding, and Membership and notifications ("Clerk owns email-bound invitations…",
    "without recreating invitation tokens or a parallel mailer")
- GLOSSARY.md, PRODUCT.md, the Privacy page and `docs/operations/account-deletion.md`.

The map's destination already expects "one authoritative membership/invitation system". The new rule should be that
Better Auth's tables are that system, and no Lane table may duplicate them.

---

## 8. Better Auth features and changes that need Nikhil's written approval

AGENTS.md: "No new tables, routes, AI calls, or cron jobs without explicit written approval", plus the screen list
and "Nothing else under settings".

**Needed for the migration itself:**
- **New tables:** `user`, `session`, `account`, `verification`, `organization` (or mapped onto Lane's existing
  `organizations`), `member`, `invitation`, and `rateLimit` if database storage is used [3][6][33].
- **New routes:**
  - `/api/auth/[...all]` [1]
  - accept-invitation, verify-email and reset-password pages, inside the existing Auth screen
  - a create-workspace step, inside Onboarding
- **Account management** that replaces Clerk's `openUserProfile` (email change, password change, sessions). This
  goes under Settings, which "Nothing else under settings" restricts.
- **Members removal and leave UI**, replacing Clerk's popups.
- **Switching on email for auth**: Resend sends from day one, with Lane-written templates. Today nothing is sent
  until Nikhil switches it on.
- **Bot protection replacement**, if any. Better Auth has a captcha plugin, and Cloudflare Turnstile would be a new
  external service.
- **The Clerk CSV export** (personal data and password hashes) and the Backend API reads for organizations,
  memberships and invitations.

**New capabilities. Approve each one, or leave it off:** passkeys, two-factor, magic link, email-OTP sign-in (unless
Clerk production already offers email-code sign-in), social providers beyond those enabled today, teams, dynamic
access control (Admins creating roles; also "redesigned permissions", which the map rules out of scope), the admin
plugin (ban or impersonate), multi-session, SSO, SCIM, API keys, the Stripe plugin (Lane already has its own
Stripe), and Better Auth Infrastructure (`@better-auth/infra` `dash()`, a paid product with a free Starter tier;
Pro email is $0.001 per email [11][12]).

---

## 9. Open unknowns (candidates for fog or tickets on #331)

1. **Clerk production sign-in configuration.** It's set in the dashboard, not the repo. Which strategies are on
   (password, email code, Google)? Is MFA on? Is there a non-bcrypt hasher? This decides which users can be kept
   without a reset, and whether email-OTP sign-in is a replacement or a new capability. Read it from the dashboard
   with no export.
2. **Pending invitation count, and the drain plan.** How many are pending at cutover? Is a freeze window acceptable
   (no new invitations for up to 30 days, or Admins nudging invitees to accept)? Needs a decision from Nikhil.
3. **Better Auth `owner` versus Lane `admin`.** Does the plugin hard-code owner-only paths (deleting an organization,
   the last owner leaving)? Can `creatorRole: "admin"` with a custom `ac` keep Lane's "Admins are equal" model?
   Read the source or prototype.
4. **Where the role lives per request.** A `member` query in every guard, `customSession`, or the cookie cache?
   Each trades speed against how quickly a revocation takes effect.
5. **Resend at quota.** Is sending blocked, does it error, or does it queue? How does Lane show it? How is the
   100/day split between auth and Inbox delivery?
6. **Avatars and logos.** Copy them from `img.clerk.com` to Supabase Storage, or drop them? This affects privacy and
   storage quota.
7. **Table naming.** Map Better Auth's `user` and `organization` onto Lane's `profiles` and `organizations`, or add
   separate tables? That changes migration size and whether the projections survive.
8. **Rate-limit storage on Vercel Hobby.** Database rows or something else? Database storage adds a table and
   writes.
9. **Bot protection.** Accept losing Clerk's, or approve a replacement?
10. **Ordering with #311** and with Build 9's speed re-measure.
11. **Governance after the Vercel acquisition.** The MIT commitment is public [14]. Whether Better Auth
    Infrastructure continues isn't stated [15]. Watch it; this doesn't block anything.

---

## 10. Claims that need a disposable prototype

Run these on local Postgres with a Clerk **development** instance and throwaway users. Supabase Free allows only 2
active projects [23], and production data must not be used.

1. Bcrypt digests from a Clerk dev CSV export verify under Better Auth's custom `verify`. Sign-in works with the
   original password, and no reset is needed.
2. Users, organizations and memberships inserted with Clerk's `user_*` and `org_*` IDs work through every
   organization endpoint, including `setActive`, `updateMemberRole` and invite/accept.
3. Custom roles `admin`, `member` and `guest` (plus `viewer`) with `creatorRole: "admin"`, and no `owner` role, have
   no hidden owner-only failures.
4. Next.js 16.3.8 `proxy.ts` with `getSession` on the Node runtime, `nextCookies()` in server actions, and Lane's
   guard shape all work. Also measure the cost per request.
5. The Drizzle adapter on `drizzle-orm` 0.45.2, Lane's version and the stated peer [10], against postgres-js with
   `prepare: false` (Supabase pooler).
6. A Google account's `sub` from Clerk's `external_accounts` matches what Lane's own Google client returns.
7. Resend free-tier behaviour at the daily cap.
8. Sign-in and sign-up time against the DEFERRED speed targets.
9. Revoking a role or removing a member takes effect within the chosen session strategy.

---

## References (all accessed 2026-11-20)

1. Better Auth, Next.js integration. https://www.better-auth.com/docs/integrations/next
2. better-auth/better-auth `LICENSE.md` (MIT, "Copyright (c) 2024 - present, Bereket Engida"); repo metadata via the GitHub API (MIT, ~30.8k stars, last push 2026-11-20). https://github.com/better-auth/better-auth
3. Better Auth, Organization plugin (roles, access control, invitations, active organization, teams, schema, options), rendered page and MDX at commit `3a7e13c5`. https://www.better-auth.com/docs/plugins/organization
4. Ibid., "Custom Permissions" and "Dynamic Access Control" sections (`createAccessControl`, `ac.newRole`, `organizationRole`).
5. Better Auth, Migrating from Clerk. https://www.better-auth.com/docs/guides/clerk-migration-guide
6. Better Auth, Database (core schema, ID generation, CLI). https://www.better-auth.com/docs/concepts/database
7. Clerk, Exporting users. https://clerk.com/docs/deployments/exporting-users
8. Better Auth, Drizzle adapter. https://www.better-auth.com/docs/adapters/drizzle
9. better-auth/better-auth security advisories (49 published), via the GitHub API. https://github.com/better-auth/better-auth/security/advisories
10. npm registry, `better-auth` (latest 1.7.26 on 2026-11-18; release-1.6 1.6.35 on 2026-11-19; beta 1.8.0-beta.10; MIT; peers `next ^14 || ^15 || ^16`, `drizzle-orm ^0.45.2 || >=1.0.0-rc.1`). https://registry.npmjs.org/better-auth
11. Better Auth, Pricing ("The Better Auth framework is free and open source. Pricing below is for our managed infrastructure."). https://better-auth.com/pricing
12. Better Auth Infrastructure introduction ("a paid service…"; `dash()` from `@better-auth/infra`). https://www.better-auth.com/docs/infrastructure/introduction
13. Clerk, Pricing. https://clerk.com/pricing
14. Vercel, "Vercel acquires Better Auth" (2026-07-07). https://vercel.com/blog/vercel-acquires-better-auth
15. Better Auth, "Better Auth joins Vercel" (2026-07-07). https://better-auth.com/blog/better-auth-joins-vercel
16. Better Auth, "Announcing our $5M seed round". https://www.better-auth.com/blog/seed-round
17. Better Auth, "Auth.js is now part of Better Auth" (2025-09-22). https://better-auth.com/blog/authjs-joins-better-auth
18. Better Auth docs contain no first-party UI components; the UI kits found (better-auth-ui.com, daveyplate/better-auth-ui) are third-party. https://better-auth-ui.com/
19. Clerk, Organization invitations ("Visiting the link sends the user to the Account Portal sign-in page… or to your `redirect_url`"). https://clerk.com/docs/organizations/invitations
20. Clerk, `createOrganizationInvitation()` (`expiresInDays` "Defaults to `30`"). https://clerk.com/docs/reference/backend/organization/create-organization-invitation
21. Better Auth, Email concepts ("Bring Your Own Email Provider"). https://www.better-auth.com/docs/concepts/email ; Email & Password. https://www.better-auth.com/docs/authentication/email-password
22. Better Auth, Email OTP plugin. https://www.better-auth.com/docs/plugins/email-otp
23. Supabase, Pricing. https://supabase.com/pricing
24. Supabase, Row Level Security. https://supabase.com/docs/guides/database/postgres/row-level-security
25. Better Auth, Test Utils plugin. https://www.better-auth.com/docs/plugins/test-utils
26. Better Auth, Telemetry ("disabled by default"). https://www.better-auth.com/docs/reference/telemetry
27. Resend, Pricing. https://resend.com/pricing
28. Postmark, Pricing. https://postmarkapp.com/pricing
29. Brevo, Free SMTP server and Transactional email pages (vendor pages, seen through search). https://www.brevo.com/free-smtp-server/ , https://www.brevo.com/products/transactional-email/
30. Supabase, Custom SMTP / default SMTP limits. https://supabase.com/docs/guides/auth/auth-smtp
31. Vercel, Hobby plan (last updated 2026-11-12). https://vercel.com/docs/plans/hobby
32. Vercel, Terms of Service §4 ("You shall only use the Services under a Hobby plan for your personal or non-commercial use."). https://vercel.com/legal/terms
33. Better Auth, Rate limit. https://www.better-auth.com/docs/concepts/rate-limit
34. better-auth/better-auth `SECURITY.md` ("We only support the latest version of Better Auth."). https://github.com/better-auth/better-auth/blob/main/SECURITY.md
35. Better Auth, Session management (expiry, freshness, cookie cache). https://www.better-auth.com/docs/concepts/session-management
36. Clerk, `getOrganizationInvitationList()` (status `pending | accepted | revoked | expired`). https://clerk.com/docs/reference/backend/organization/get-organization-invitation-list
37. Clerk, Backend `OrganizationInvitation` object (`emailAddress`, `role`, `status`, `expiresAt`, `url`). https://clerk.com/docs/reference/backend/types/backend-organization-invitation
