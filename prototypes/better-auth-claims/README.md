# PROTOTYPE: confirm Better Auth's unverified claims locally (#344)

**Throwaway. Never merged.** It lives on the `prototype/better-auth-claims` branch as a primary source for
[Prototype: confirm Better Auth's unverified claims locally](https://github.com/Nikhilsharma-lab/Lane/issues/344)
on the map [Wayfinder map: Clerk to Better Auth migration](https://github.com/Nikhilsharma-lab/Lane/issues/331).

**Question.** Do the documentation claims behind the chosen architecture
([Decision: Better Auth architecture within the free pilot budget](https://github.com/Nikhilsharma-lab/Lane/issues/333))
hold on real code, before the cutover plan relies on them?

**Shape.** This is a harness, not a clickable HTML demo: the question is about real library behaviour, so it
runs Better Auth 1.7.26 (latest on 2026-11-20) on Lane's exact `next` 16.3.8, `react` 19.2.4, `drizzle-orm`
0.45.2 and `postgres` 3.4.9. A scratch database (`prototype_wipe_me_ba_344`) sits behind a local PgBouncer in
transaction mode with prepared statements off, standing in for Supabase's pooler. Email goes to an in-memory
outbox. Turnstile uses Cloudflare's published always-pass test keys, with real calls to Cloudflare. Have I
Been Pwned is called for real. Google is real Better Auth callback code with only Google's token response faked.

## Run

```sh
pnpm install --ignore-workspace
pnpm checks            # = bash scripts/run-all.sh, about two minutes; writes results/*.log
```

Needs local Postgres as `$USER` and `brew install pgbouncer`. `results/` holds the logs from the run on
2026-11-20 (MacBook, local Postgres 17; numbers are local, not hosted).

| File | What it pushes through |
|---|---|
| `lib/auth.ts` | The decided setup: `creatorRole: "admin"`, custom admin/member/guest/viewer, deletion off, verified-email invitations, 7-day invitations, email code with `disableSignUp`, Turnstile, HIBP, database rate limits, cookie cache off, Lane's role allow-list |
| `checks/claims.ts` | Adapter, email-code flows, roles without Owner, per-request cost, revocation |
| `checks/owner-hole.ts` | The same roles without Lane's allow-list |
| `checks/google-image.ts` | Google sign-in with and without an `image` column, with each way of dropping the picture |
| `checks/browser-walk.ts` | The production build in Chromium: login speed, sign-in, `proxy.ts`, server actions, revocation, sign-out |
| `checks/signin-server-cost.ts` | Server time of sign-up and sign-in with Turnstile on and off |

## Verdict by claim

1. **Custom roles with no `owner`: holds, with one hole to plug.** `creatorRole: "admin"` moves Better Auth's
   owner protections onto Admin: the only Admin can't leave, demote themselves or remove themselves, and all
   Admins are equal (a newer Admin can demote the creator). No owner-only path blocked anything Lane needs.
   **Hole:** Better Auth always accepts its built-in role names, so an Admin could invite someone as `owner` or
   change a role to `owner`. That membership carries no permissions, so it isn't an escalation, but Lane's guards
   wouldn't recognise it. An allow-list in `beforeCreateInvitation` and `beforeUpdateMemberRole` closes it
   (verified). Better Auth's error text says "owner", so Lane maps the codes to its own sentences.
2. **Next.js 16 `proxy.ts` and server actions: hold.** `getSession` works in `proxy.ts` on the default Node
   runtime. Server actions read the session from `headers()`; `nextCookies()` sets the cookie on sign-in and
   clears it on sign-out. **Cost:** `getSession` is 2 queries (session, then user), about 0.8 ms locally.
   Better Auth's own `getActiveMember` re-reads the session, so session plus role through Better Auth is 6
   queries. A Lane guard that checks the cookie signature and reads session ⋈ member is 1 query (0.3 ms). The
   prototype page, with a full session check in both proxy and page, cost 7 queries. Once a day a session is
   extended on read (5 queries, once).
   **Finding:** `auth.api.*` called from a server action skips Turnstile. Every sign-in, sign-up, code and
   reset form must call `/api/auth` from the browser.
3. **Drizzle adapter on `drizzle-orm` 0.45.2 through a transaction-mode pooler: holds.** Nothing failed with
   `prepare: false` behind PgBouncer. `user` maps onto `profiles` (`name` → `full_name`) and `organization` onto
   `organizations`. Lane's own columns can't be set from the browser. Checked against PgBouncer, not Supabase's
   Supavisor itself.
4. **Resend at its daily cap: not tested.** It needs a Resend account and about 100 real sends (see below).
   **Finding that applies whatever Resend returns:** Better Auth catches a failed send, logs it and still answers
   `200 {"success":true}`. Lane's "We couldn't send the code right now…" can't come from Better Auth's response.
5. **Sign-in timing with Turnstile: the form meets the target, but Turnstile itself takes 2–3 s.** The login
   form is on screen and usable in about 25–60 ms. That beats the ≤1.0 s target and Clerk's ~1,026 ms. Clicking
   "Sign in" with a token already issued reaches the signed-in page in about 0.22–0.36 s. Cloudflare's server
   check adds about 50–90 ms per request. But Turnstile takes **2.5–2.7 s** (median) to issue its token, even
   with the always-pass test key and in a visible browser. So someone who submits at once (a password manager)
   waits about **2.9 s**. Test keys don't show what a real key's challenge costs.
6. **Email-code flow: holds, with two findings.** A 6-digit code verifies the email at sign-up; password sign-in
   is refused until then. The sign-in code works once. Three wrong attempts burn it. A reset code sets a new
   password, refusing breached ones. Codes never create accounts.
   **Findings:** for an unknown address Better Auth sends nothing but answers the same success. Lane's "No Lane
   account uses this email. Sign up instead." needs its own lookup. A password reset leaves other devices signed
   in unless `revokeSessionsOnPasswordReset` is set. Rate limits are per IP and path, not per email address, so
   "about 3 per address per 10 minutes" needs a Lane-side check. Counters do live in Postgres.
7. **How quickly revocation takes effect: on the next request.** With the cookie cache off, a role change
   reached the person's next request 8 ms later in-process, and their next server action in the running app 74–82 ms later (including the click). Removal applied on the next page load. "Sign out
   other devices" ended the other session on its next request.
   **Finding:** after removal the session still names the workspace as active, so Lane must never trust
   `activeOrganizationId` without the member row.
8. **`image` column (#345 Q5): Better Auth requires it.** Without `profiles.image` (and `organizations.logo`
   and `.metadata`) the Drizzle adapter refuses to start. `advanced.database.validateSchema: false` gets past
   that, but Google sign-in then works only if `mapProfileToUser` returns exactly `image: undefined`. `null` or
   leaving the picture in breaks sign-up. With the column kept, `image: null` keeps Google's photo out, but
   `/update-user` still lets a person store a picture URL, and `/organization/update` still stores a logo. One
   `databaseHooks.user` create/update hook that blanks `image` covers Google and `/update-user` (verified).

## Not covered

- Resend's real behaviour at 100 a day (needs Nikhil's Resend account and a decision to spend a day's quota).
- A real Turnstile site key, a hosted deployment, and Supabase's Supavisor. Every number here is local.
- Account linking rules (#333 Q11), Have I Been Pwned's failure mode, Lane's actual guards and tables.
