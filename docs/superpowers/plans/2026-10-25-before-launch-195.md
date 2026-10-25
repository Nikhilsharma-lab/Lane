# Build plan: #195 before-launch spec (tickets #196–#219)

**Date:** 2026-10-25. **Base:** `origin/main` at `d2491bc`. **Branch:** `feat/195-before-launch` (integration). Spec: #195, built from the approved
`docs/product-vision-spec.md` (#178). Each ticket is built in its own worktree off this branch and merged back here; the branch goes to `main` only
with Nikhil's approval.

## Decisions (Nikhil, 2026-10-25)

1. All 8 items are built now, on this one integration branch, in the spec's order.
2. Work that touches what #167's unfinished #171 (Impact loading), #176 (Intake save/upload recovery) and #172 (Requests navigation) change is built
   on today's `main`. Whichever branch merges second reconciles the other (`origin/codex/spec-167-integration`). Most likely overlaps: #198/#199
   with #176, #201/#203/#208 with #171, and #204/#219 with #172.
3. Paid and external services are built behind adapters with recording stand-ins. Each stays **off** until Nikhil approves it:
   - Email and Slack DM send nothing in production until approved.
   - Stripe checkout is unavailable without keys.
   - The Viewer and Guest custom roles are not offered in production invitations until Clerk Enhanced B2B is approved.
   - All billing enforcement, including the Free Requests block, sits behind one switch that is off by default. Pilot workspaces are never
     blocked before billing is approved.
4. Hosted migrations follow the usual rule: verified backup, then staging, then production, run by Nikhil. Staging is on 0034 today. E2E specs
   that need #195 tables run on staging only after that.

## Switches and env vars

These follow the existing pattern: names are checked in `src/lib/env.ts` (warnings only, never values), documented in `.env.example`, and a switch
is on only when its value is `"1"` (like `LANE_ALLOW_HOSTED_DB`). One module, `src/lib/feature-switches.ts`, reads them. No other code reads
`process.env` for these.

| Switch / vars | Default | Effect when off |
| --- | --- | --- |
| `LANE_EMAIL_DELIVERY` + `RESEND_API_KEY`, `LANE_EMAIL_FROM` | off | The messenger is the recording stand-in. Nothing is sent, and the delivery log still records "would send". |
| `LANE_SLACK_DELIVERY` + `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `LANE_SLACK_TOKEN_KEY` (32-byte key that encrypts stored tokens) | off | No Slack connect button, no Slack DM choice, no sends. |
| `CRON_SECRET` | unset | The daily job route refuses every call. Its `vercel.json` cron entry is added only in the PR that switches email on. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_FOUNDING_COUPON` | unset | Checkout and the hosted billing pages show "not available yet". |
| `LANE_BILLING_ENFORCED` | off | Free Requests and seats are counted and shown, but nothing is blocked and no seat confirmation is asked. |
| `LANE_CUSTOM_ROLES` | off | Lane's own invite and role controls offer Admin and Member only. Turn it on for staging and local work. |

There is no transactional email in the repo today: `package.json` has no SDK, and Clerk sends auth and invitation email. Resend was used as SMTP
in the Supabase era (`DEFERRED.md`), so the Email adapter targets Resend's API.

As built in #206: the Email adapter calls Resend's `POST /emails` with `fetch` (no SDK added), and the one daily job is
`GET /api/inbox/daily`. Both are built under decision 3 and send nothing until Nikhil approves switching them on:
`src/lib/feature-switches.ts` reads `LANE_EMAIL_DELIVERY`, `RESEND_API_KEY`, `LANE_EMAIL_FROM` and `CRON_SECRET`, and the
`vercel.json` cron entry is left for the change that switches email on (`DEFERRED.md`, "Switching Inbox email on").

As built in #207: Slack DM uses Slack's Web API with `fetch` (no SDK added) and is built under decision 3, so it sends
nothing until Nikhil approves the Slack app below and switches it on. `SLACK_SIGNING_SECRET` was dropped from the
switch: it only verifies requests Slack sends to Lane, and this Lane app receives none (no events, slash commands or
buttons). Migration 0042 adds `slack_connections`; the route is `GET /api/slack/callback`; the Settings section is
"Slack" (Admins only). People Slack can't find by their Lane email address, or any item while Slack refuses the
workspace's token, go by Email instead.

### The Slack app (for approval)

**Status: proposed, waiting for Nikhil's approval. Nothing is created in Slack and the switch stays off until then.**

- **Name:** Lane. One app, distributed to other Slack workspaces (Slack's "Manage distribution"), not listed in the
  Slack Marketplace.
- **Bot token scopes, and nothing else:** `chat:write` (send the DMs), `users:read` and `users:read.email` (find each
  person by the email address Lane knows them by). No user token scopes.
- **Redirect URL:** `<NEXT_PUBLIC_APP_URL>/api/slack/callback` for each environment (local, staging, production).
- **App Home:** Messages tab on, "Allow users to send messages" off (Lane reads nothing people write to it).
- **No** event subscriptions, interactivity, slash commands or incoming webhooks; Lane never reads Slack content.
- **What it stores:** per workspace, the Slack team id and name, who connected it and when, and the bot token sealed with
  AES-256-GCM under `LANE_SLACK_TOKEN_KEY`. Disconnecting deletes the row and revokes the token (`auth.revoke`).
- **To switch on (after approval):** create the app at api.slack.com/apps with the above, then set `LANE_SLACK_DELIVERY=1`,
  `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `LANE_SLACK_TOKEN_KEY` (`openssl rand -base64 32`), once migration 0042 is
  on the target database (`DEFERRED.md`, "Switching Slack DM on").

## Per item

| # | Tickets | New tables (migrations from 0037, one per ticket) | Routes | Job / external |
| --- | --- | --- | --- | --- |
| 1 Metrics library | #196–#203 | `metric_definitions`, `metric_definition_history` (append-only, revision per definition, edit-blocking trigger, writes in caller's tx), `metric_definition_aliases` (built-in key or typed name+unit → definition, #200). Prediction v5 validator (`request_measurement_valid_v5`) plus a reference-check trigger on `requests` | `/settings/metrics`, `/settings/metrics/[id]` (Settings entry; link from the prediction form) | none |
| 2 Inbox | #204–#207 | `delivery_preferences` (org, user, email/slack/off), `delivery_log` (org, user, item key, channel, sent_at; unique per item), `slack_connections` (org, encrypted token). Retire reminder types; remove the lazy writer | `/inbox`; `GET /api/inbox/daily` (cron); `GET /api/slack/callback` (OAuth); Settings sections "Inbox delivery" (personal) and "Slack" (Admin) | one daily job; Resend; Slack app |
| 3 Outcome report | #208–#209 | `quarter_notes` (org, year, quarter, text, editor, edited_at). New `valid_outcome_closure` / `valid_closure_corrections` accepting What we learned | none (Impact tab "Outcome report"; month periods) | none |
| 4 Roles | #210–#212 | none for Viewer. Migration removing invitation (email) Reviewers. Guest-submission state on `requests` (waiting / taken on) | none | Clerk Enhanced B2B (production) |
| 5 Billing | #213–#216 | `workspace_billing` (plan state, provider ids, founding flag, seats), `free_request_allowances` (company domain or personal email → workspace, used count) | Settings section "Billing" (Admin); `POST /api/billing/webhook` | Stripe; Supabase Pro + Vercel Pro before switching on |
| 6 First run | #217 | `first_run_progress` (org, user, steps, skipped_at) | none (guide on `/` and `/intake`; "First-run guide" in the user menu as help) | none |
| 7 Related links | #218 | `same_problem_members` (org, request unique, group id), history events | none (section on Request detail) | none |
| 8 Saved views | #219 | `saved_views` (org, owner, name, filters jsonb) | none (applied on `/` through the normal list) | none |

Every new table is `org_id`-scoped with RLS enabled, all public access revoked, and a schema test. `AGENTS.md`, `REQUIREMENTS.md` (the
2026-10-20 "no catalogue table" line is superseded), `DEFERRED.md` and `lane-roadmap.md` are updated as each item lands.

## Done for every ticket

Type checking, linting, `pnpm design:check`, `pnpm test`, `pnpm test:ui` and `pnpm build` all pass. `pnpm bundle:check` passes too; a new route
updates the baseline, with a waiver. The ticket is then checked in the running app against a local database (no Storybook): light and dark, at
390, 768, 1024 and 1440 wide, by keyboard and with a screen reader. Setup for running tests in parallel worktrees: each worktree exports its own
`DATABASE_URL=…/lane_test_195_<ticket>`.
