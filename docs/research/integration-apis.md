# Research: what Slack, Linear, Jira, GitHub and Figma let Lane do (#181)

Question: what do the official APIs of Slack, Linear, Jira Cloud, GitHub and Figma allow for (1) capturing a message or thread into Lane, (2) two-way links between a Request and dev issues/PRs, (3) detecting that linked work shipped, (4) showing a Figma thumbnail, (5) importing a backlog? Also: auth, app review / marketplace rules, rate limits, plan limits, official MCP servers, and anything that needs webhook endpoints or background jobs.

Sources: official developer docs only (docs.slack.dev, linear.app/developers, developer.atlassian.com, docs.github.com, developers.figma.com, vercel.com/docs), read 2026-10-24. Each claim links to the page that owns it. Items marked **(unverified)** could not be confirmed from a primary page.

Part of the map [#178](https://github.com/Nikhilsharma-lab/Lane/issues/178). Findings only; no product code changed.

Repo constraint: `AGENTS.md` "Do NOT build" lists **Figma integration** and **any cron job**, and says integrations remain deferred. Everything below needs Nikhil's written approval before it becomes a build plan.

## Short answer

| | Slack | Linear | Jira Cloud | GitHub | Figma |
|---|---|---|---|---|---|
| 1. Capture into Lane | Yes: message shortcut + modal. Thread replies need an extra call that is throttled for unlisted apps | n/a | n/a | n/a | n/a |
| 2. Two-way link | Unfurl Lane links in Slack | Yes: attachments (native, upsert by URL) | Yes: remote issue links | Partly: bot comment / Checks run; no attachment concept | Embed or thumbnail only |
| 3. Shipped detection | n/a | Yes: Issue webhook, state type `completed` | Yes, but webhooks expire every 30 days | Yes: PR merged, release published, deployment success | n/a (file-change webhooks exist) |
| 4. Figma thumbnail | n/a | n/a | n/a | n/a | API works but View/Collab seats get ~20 calls/month; the embed iframe needs no token |
| 5. Backlog import | n/a | Yes: GraphQL, cursor paging | Yes: `/search/jql`, points-based quota | Yes: REST issues, Projects v2 via GraphQL | n/a |
| Needs cron? | No | No | **Yes** (webhook refresh) | Advisable (no auto-retry) | Yes for thumbnails (links expire in 30 days) |
| Official MCP server | Yes | Yes | Yes (Rovo) | Yes | Yes |

**Recommendation: build Linear first** (two-way link + "work done → propose Release"). See the last section.

## 1. Capturing a Slack message or thread

- **Message shortcut** (`message_action`): the payload has `trigger_id`, `response_url`, `team`, `channel`, `user` and the full `message` (`ts`, `user`, `text`). It does not say thread replies are included. [shortcuts payload](https://docs.slack.dev/reference/interaction-payloads/shortcuts-interaction-payload)
- **Reply within 3 seconds** with HTTP 200 or the user sees an error. [implementing shortcuts](https://docs.slack.dev/interactivity/implementing-shortcuts)
- **Modal for the draft Request:** `views.open` with the `trigger_id`, which expires 3 seconds after receipt and works once. The modal's `view_submission` also needs a reply within 3 seconds. `views.open` is Tier 4 and needs no scope. [modals](https://docs.slack.dev/surfaces/modals), [views.open](https://docs.slack.dev/reference/methods/views.open)
- **Global shortcut** (`shortcut`): no message or channel. **Slash command:** form POST with `text`, `trigger_id`, `response_url`; 3000 ms reply limit; custom slash commands don't work inside threads. [slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands)
- **Whole thread:** needs `conversations.replies` with `channels:history`/`groups:history`/`im:history`/`mpim:history`. [conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies)
- **Big catch (May 29, 2025):** for commercially distributed apps that are **not in the Slack Marketplace**, `conversations.history` and `conversations.replies` drop to **1 request per minute, max 15 messages**. Applies to apps created on or after that date and to new installs of older unlisted apps. Marketplace apps and a customer's own internal apps are exempt. The updated terms call the Marketplace "the only appropriate channel" for commercial distribution. [changelog](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps)
- **Practical path:** capture just the message from the shortcut payload (plus a link back to it). That needs no history scopes and avoids both the throttle and enhanced review.
- **Security:** verify `X-Slack-Signature` (HMAC-SHA256 over `v0:{timestamp}:{raw body}`), reject timestamps more than 5 minutes off. [verifying requests](https://docs.slack.dev/authentication/verifying-requests-from-slack)
- **Unfurling Lane links in Slack:** `link_shared` event + `chat.unfurl` (Tier 3), scopes `links:read`/`links:write`, up to 5 registered domains; `user_auth_required` prompts sign-in for private content. [unfurling](https://docs.slack.dev/messaging/unfurling-links-in-messages). **Work Objects** (Oct 2025) add richer cards and a side panel via `chat.unfurl` `metadata`. [work objects](https://docs.slack.dev/messaging/work-objects)

## 2. Two-way links between a Request and dev work

### Linear
- `attachmentCreate(issueId, title, subtitle, url, iconUrl, metadata)`. Same issue + same URL **updates** the existing attachment, so Lane doesn't need to store attachment IDs. `attachmentsForURL` finds them by URL. Subtitle can show a relative date. [attachments](https://linear.app/developers/attachments)
- Lane can show the Request's status as the attachment subtitle and refresh it on each change.

### Jira Cloud
- `POST /rest/api/3/issue/{key}/remotelink`: `object.url` and `title` required; optional `summary`, `icon`, `status.resolved` (strikes through the title). `globalId` (≤255 chars) for upsert. Updates replace the whole link. [remote issue link fields](https://developer.atlassian.com/server/jira/platform/using-fields-in-remote-issue-links/) (server-era page; the Cloud reference would not load, **partly unverified**)

### GitHub
- No attachment concept. The Content Attachments API was a beta and no longer appears in the permissions or webhook docs (formal sunset notice **unverified**). [blog](https://github.blog/news-insights/product-news/introducing-content-attachments-api/)
- Options: a bot comment, editing the issue/PR body, or a Checks run on PRs (Checks write). Comments need Issues or Pull requests write. [webhook events and permissions](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

### Lane side
- In every case the other direction (Lane showing the linked issue and its status) is Lane's own UI, kept fresh by webhooks (section 3).

## 3. Detecting shipped work

### Linear
- Webhook resources include Issue and IssueAttachment. Payload: `action`, `type`, `data`, `updatedFrom`, `url`, `webhookTimestamp`. [webhooks](https://linear.app/developers/webhooks)
- "Done" = `data.state.type == "completed"` with `updatedFrom.stateId` present. The state type values come from the [filtering docs](https://linear.app/developers/filtering); the exact webhook check is **inference**.
- Verify `Linear-Signature` (HMAC-SHA256 of raw body), reject timestamps more than about 60s old, reply 200 within 5s. Retries 3 times (1 min, 1 h, 6 h), then may disable the webhook.
- **OAuth app webhooks are configured once on the app and Linear creates one per installing workspace.** No per-customer setup, no expiry.

### Jira Cloud
- OAuth 2.0 apps register webhooks via `POST /rest/api/3/webhook`, max 5 per app per user per site, with a limited JQL filter (project, status, issuetype, etc.). [webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/)
- **They expire 30 days after creation or last refresh**; `PUT` extends them another 30 days. [webhook API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/). **This is a scheduled job.**
- `jira:issue_updated` carries a changelog; look for a `status` item. Whether `statusCategory` is in the payload is **unverified**; plan to look it up via REST.
- Deliveries are signed with a JWT (app client secret). Up to 5 retries; dedupe on `X-Atlassian-Webhook-Identifier`.
- **Alternative:** a Forge app with Forge Remote forwards `avi:jira:updated:issue` events to Lane without expiry, but Lane would also have to build and maintain a Forge app. [Forge events](https://developer.atlassian.com/platform/forge/events-reference/jira/), [Forge Remote](https://developer.atlassian.com/platform/forge/remote/)
- Connect, the older framework, is being retired (end of support 31 Jan 2027). [Atlassian blog](https://www.atlassian.com/blog/development/connect-end-of-support-what-it-means-for-custom-apps-and-how-to-migrate-to-forge)

### GitHub
- `pull_request` `closed` with `merged=true`; `release` `published`; `deployment_status` (success); `issues` `closed`. Permissions: Pull requests / Contents / Deployments / Issues read, plus Metadata. [events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- `state_reason=completed` on closed issues is **unverified**.
- A GitHub App has one central webhook for all installs. [GitHub App vs OAuth app](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)
- Verify `X-Hub-Signature-256`; reply 2XX within 10s. [validating](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- **GitHub does not retry failed deliveries.** Its suggested fix is a scheduled script that redelivers failures via the API, within 3 days. [failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries), [redelivering](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)
- **Vercel deploys:** Vercel for GitHub sends `deployment_status` events by default (a user can switch them off) and `repository_dispatch` events like `vercel.deployment.success` / `vercel.deployment.promoted`. Read `environment` to separate production from preview. [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github)

### For Lane
- "Shipped" should **propose** a Release for a person to accept (matches the map's "agents suggest, a person accepts"). Merged code and a done issue do not prove the change reached users, so the person still confirms the release date and audience.

## 4. Figma thumbnails from the saved Design link

### REST API
- `GET /v1/files/:key/meta` returns `thumbnail_url`, `last_touched_at` and `version`; it is the cheaper call (Tier 3). `GET /v1/files/:key` returns `thumbnailUrl` (Tier 1). `GET /v1/images/:key?ids=1:2` renders a frame (Tier 1); **rendered links expire after 30 days.** [file endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/)
- File key and node ID parse from `figma.com/:file_type/:file_key/:name?node-id=1-2` (hyphen in URL → colon in API, **inference**).

### Rate limits (since Nov 17, 2025)
- **View and Collab seats get up to 20 Tier 1 calls per month, on every plan** (the page also says "up to 6 per month" for Starter files, which contradicts the table). Tier 3 is 10/min for those seats. [rate limits](https://developers.figma.com/docs/rest-api/rate-limits/)
- Dev/Full seats on paid plans: Tier 1 is 10–20/min, Tier 3 is 50–150/min.
- Limits count per user, per plan, per OAuth app.
- Many PMs hold View or Collab seats, so per-user frame renders are not viable for them. The `meta` endpoint (Tier 3) is the realistic thumbnail source.

### Auth
- OAuth app with granular scopes (`file_metadata:read`, `file_content:read`, `webhooks:read/write`). `files:read` is deprecated but still works. [scopes](https://developers.figma.com/docs/rest-api/scopes/)
- **A public OAuth app must pass Figma review before any outside user can authorize it, and every config change is reviewed again.** Access tokens last 90 days and can be refreshed. [OAuth apps](https://developers.figma.com/docs/rest-api/oauth-apps/)

### Embed, the no-auth alternative
- `https://embed.figma.com/design/:key?embed-host=lane` shows a live preview in an iframe, with no Lane token. [embed a file](https://developers.figma.com/docs/embeds/embed-figma-file/)
- The viewer's own Figma access applies: org-shared files ask the viewer to log in, and password-protected files can't be embedded. [help](https://help.figma.com/hc/en-us/articles/360039827134-Embed-files-and-prototypes)
- `GET /v1/oembed` (March 2026) is **not** token-free: it is Tier 3 and needs public link access. [oEmbed](https://developers.figma.com/docs/rest-api/oembed-endpoints/)

### Noticing file changes
- Webhooks v2: `FILE_UPDATE` (after 30 minutes with no edits), `FILE_VERSION_UPDATE`, `FILE_COMMENT`, `DEV_MODE_STATUS_UPDATE`, etc. Verified by a passcode in the payload. Retries at 5 min, 30 min and 3 h.
- Limits: 3 per file, 5 per folder, 20 per team. Plan caps on file webhooks are Professional 150, Organization 300, Enterprise 600; no Starter cap is listed (a paid-plan minimum is **unverified**).
- Team webhooks need a team admin; folder and file webhooks need edit access.
- [webhooks](https://developers.figma.com/docs/rest-api/webhooks/), [events](https://developers.figma.com/docs/rest-api/webhooks-events/)

## 5. Backlog import

### Linear
- GraphQL cursor paging (`first`/`after`, 50 per page by default). Filter by team, `state.type` or relative dates. [pagination](https://linear.app/developers/pagination), [filtering](https://linear.app/developers/filtering)
- Rate limits: API key 2,500 req/h; OAuth 5,000 req/h and 2M complexity points/h; 10,000 points max per query. [rate limiting](https://linear.app/developers/rate-limiting)

### Jira Cloud
- `/rest/api/3/search` is deprecated and returning "removed" errors. Use `/rest/api/3/search/jql` with `nextPageToken`; there is no `startAt`. [issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- **Points-based rate limits enforced from 2 Mar 2026:**
  - Each request costs 1 point plus 1 per issue returned.
  - Default pool: 65k points/h shared across all sites. A per-site pool needs Atlassian review.
  - **When the hourly quota runs out, every call fails until the next hour.**
  - [rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- Large imports must run in resumable chunks.

### GitHub
- `GET /repos/{o}/{r}/issues` returns PRs too; skip items with a `pull_request` key. 100 per page. [list issues](https://docs.github.com/en/rest/issues/issues#list-repository-issues)
- Projects v2 items and fields come only via GraphQL. [projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- Installation tokens get 5,000 req/h, scaling to 12,500; there are also secondary limits. [REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

### Fit with Lane
- Imported items are dev tickets (solutions), not problem-first Requests. Import fits best as **draft** Requests a person reframes, or as links from existing Requests.
- CSV import needs no API at all.

## Auth, review and plan limits

### Slack
- **Auth:** OAuth v2; bot token; no expiry unless rotation is on. [installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth)
- **Review and listing:** "Unlisted" public distribution works for pilots. [distribution](https://docs.slack.dev/distribution) Marketplace listing needs **10+ active workspaces**, justification for every scope (history scopes trigger enhanced review), a privacy policy and security checks. [guidelines](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/)
- **Plan limits:** Free Slack keeps 90 days of visible history and allows 10 app installs. [free limits](https://slack.com/help/articles/27204752526611-Feature-limitations-on-the-free-version-of-Slack)

### Linear
- **Auth:** OAuth2 with `actor=app`. Access tokens last 24 h; refresh tokens rotate. [OAuth](https://linear.app/developers/oauth-2-0-authentication), [actor](https://linear.app/developers/oauth-actor-authorization)
- **Review and listing:** Paid workspaces can require admin approval for apps. [approvals](https://linear.app/docs/third-party-application-approvals) The integration directory accepts only "formal companies". [directory](https://linear.app/developers/integration-directory)
- **Plan limits:** No API plan limit found; the Free plan is capped at 250 issues. [pricing](https://linear.app/pricing)

### Jira Cloud
- **Auth:** OAuth 2.0 (3LO) with `offline_access`. Refresh tokens rotate and expire after 90 days unused. Apps may not collect users' API tokens. [3LO apps](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- **Review and listing:** "Sharing" must be on, and unreviewed apps show users a warning. Marketplace listings for 3LO apps are informational only, with security requirements. [security requirements](https://developer.atlassian.com/platform/marketplace/security-requirements/)
- **Plan limits:** No API plan restriction found; Free gets its own rate tier.

### GitHub
- **Auth:** GitHub App. Installation tokens last 1 h; user tokens last 8 h, with 6-month refresh tokens. [installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [user token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- **Review and listing:** Free Marketplace listings need only contact details, a privacy policy and a support link. Paid listings need a verified publisher. [listing requirements](https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app) Installing without a listing is **unverified**, but is standard practice.
- **Plan limits:** Enterprise Cloud installs get higher limits.

### Figma
- **Auth:** OAuth app; tokens last 90 days.
- **Review and listing:** A public app needs Figma review, and again on every config change.
- **Plan limits:** Seat type drives the rate limits (see section 4).

### Competitors inside these tools
- Linear **Customer Requests** (all plans) and **Linear Asks** (Slack/email capture into issues; Business and above) overlap with Lane's capture and request side. [customer requests](https://linear.app/docs/customer-requests), [asks](https://linear.app/docs/linear-asks)
- Jira Product Discovery is Atlassian's equivalent (not researched here).

## Official MCP servers

- **Slack:** `https://mcp.slack.com/mcp`. Search, messages, canvases and users. Admin-approved; only Marketplace or internal apps may use it. [Slack MCP](https://docs.slack.dev/ai/slack-mcp-server/)
- **Linear:** `https://mcp.linear.app/mcp`, plus a read-only endpoint. OAuth 2.1 or an API key. [Linear MCP](https://linear.app/docs/mcp)
- **Atlassian Rovo:** `https://mcp.atlassian.com/v2/mcp`. Covers Jira and Confluence; uses Rovo credits. [Rovo MCP](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/)
- **GitHub:** `https://api.githubcopilot.com/mcp/`. Issues and PRs by default; projects is opt-in. [github-mcp-server](https://github.com/github/github-mcp-server)
- **Figma:** `https://mcp.figma.com/mcp`. Design context for code tools; some features need paid seats. [Figma MCP](https://developers.figma.com/docs/figma-mcp-server/)

These serve AI tools acting for a user. They do not replace Lane's own app install for webhooks or links, but they matter for any future Lane agent.

## Infrastructure Lane would need

Lane has no cron jobs today (`vercel.json` has none, and `AGENTS.md` bans them).

1. **Public, signature-checked webhook routes** (Linear, Jira, GitHub, Figma) and **interactivity routes** (Slack).
   - They must read the raw body and reply fast: 3s Slack, 5s Linear, 10s GitHub.
   - Heavy work runs after replying (for example Vercel `waitUntil`) or in a queue.
2. **Encrypted token storage per workspace**, with refresh on use.
   - Rotating refresh tokens: Linear, Jira, GitHub user tokens.
   - Refreshing on use needs no cron.
3. **Scheduled jobs, the ones that break the no-cron rule:**
   - Jira webhook refresh (every 30 days or less).
   - GitHub failed-delivery redelivery (advisable, since there is no automatic retry).
   - Figma thumbnail refresh (rendered links expire in 30 days).
   - Linear and Slack need none.
4. **Resumable import jobs** for large backlogs. Jira's hourly quota can block all calls.
5. **Idempotent event handling.**
   - Every vendor retries or redelivers, except GitHub without the script.
   - Dedupe on delivery IDs (`Linear-Delivery`, `X-Atlassian-Webhook-Identifier`, `X-GitHub-Delivery`).

## Recommended first integration: Linear

**Build the Linear link first:** link a Request to Linear issues, show a Lane attachment on each issue, and when linked issues reach "completed", propose a Release for the owner to accept.

Why:

1. **It closes Lane's core loop.** A Release starts Measuring, and Measuring is what makes Lane different from a ticket tracker. Auto-proposing a Release when the dev work is done feeds "prove the result" and Product memory directly. Capture only feeds the front of the funnel.
2. **It's the cleanest technically.**
   - OAuth app webhooks are configured once and created per workspace automatically.
   - They are signed, retried 3 times, and never expire.
   - Attachments upsert by URL.
   - No cron, no Forge app, no Marketplace gate to start.
3. **It fits the customer.** Lane's model is "like Linear for designers and PMs", and the 10–200 person product companies on the map are disproportionately on Linear.
4. **The rest is reusable.** The webhook route, token storage and "propose a Release" flow carry over to GitHub (PR merged / Vercel deploy) next. Jira comes later because of its 30-day webhook refresh and points quota.

Close second: **Slack capture from the message shortcut only** (no thread history).
- It needs no history scopes and no cron, so it dodges the 1-per-minute throttle and enhanced review.
- It works unlisted for pilots.
- Full-thread capture waits until Lane qualifies for the Slack Marketplace (10+ workspaces).

Hold:
- **Figma thumbnails via the API.** Seat-based limits make it unreliable for PMs. It is also on the "Do NOT build" list. If wanted, use the Figma embed iframe, which needs no token or cron.
- **Jira** until a customer asks.

Watch-out: Linear's own Customer Requests and Asks overlap with Lane's request side. Lane's link should stay about outcome (Request → shipped → measured), not duplicate intake inside Linear.
