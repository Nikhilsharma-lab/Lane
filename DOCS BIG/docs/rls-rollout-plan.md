# RLS Rollout Plan

This rollout replaces the earlier RLS draft that added policies but did not
close the runtime-model gap for server-side Drizzle access or bootstrap flows.

## Decisions

- Normal authenticated app queries should run through a user-scoped DB session.
- Signup and invite redemption remain bootstrap exceptions and use trusted
  security-definer SQL functions instead of broad bootstrap RLS policies.
- Invite links remain token-based and usable before the recipient has an org
  profile.
- Background jobs and cron paths continue to use the privileged system DB path.

## Runtime Model

- `systemDb` / `systemSql`: trusted backend path for cron, email, migrations, and
  security-definer bootstrap helpers.
- `withUserDb()`: request-scoped path that sets `app.current_user_id` for RLS.
- `withAuthContext()`: convenience wrapper for authenticated routes using
  `withUserDb()`.

## Bootstrap Exceptions

- `bootstrap_organization_membership(...)` creates the initial organization and
  lead profile for a newly signed-up user.
- `get_invite_context(...)` exposes invite landing-page data without requiring an
  org profile.
- `accept_invite_membership(...)` validates an invite token and creates the
  invited profile atomically.

## Verification Targets

- Authenticated routes read only their org-scoped data under `withUserDb()`.
- Invite landing and acceptance still work before the user has a profile.
- Signup still creates the initial org and lead profile.
- Realtime subscriptions only emit rows allowed by RLS.
