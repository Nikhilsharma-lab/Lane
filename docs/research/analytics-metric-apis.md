# Research: which analytics tools an agent can read a metric from (#180)

Question: for PostHog, Amplitude, Mixpanel, Google Analytics 4 (GA4) and Statsig, can an agent fetch one
metric value for a date range (before vs after a Release) through an official API? What do the connection
model, access scopes or roles, rate limits, plan requirements and data residency look like? Can a saved
chart be referenced by URL? Is there an official MCP server?

Context: Lane stores an Expected impact per Request (a Metric with baseline and target, or a Verified
result). After Release it waits for the measurement due date. A proposed measurement agent would fetch
the actual value and draft the result for the Requester to confirm.

Sources: vendor documentation only, read 2026-10-24. Each claim links to its source. Items marked
**Unverified** could not be confirmed in first-party docs.

## Short answer

| Tool | One metric for a date range? | Saved chart by URL? | Connection for a third-party app | Rate limit that matters | Regions | Official MCP |
|---|---|---|---|---|---|---|
| PostHog | Yes (Query API, or saved insight with a date override) | Yes, `short_id` from the URL, plus `date_from`/`date_to` override | OAuth 2.0 for third-party apps, no pre-registration (CIMD); or personal / project API key | Query: 2,400/hour, 3 concurrent per project | US, EU (Frankfurt) | Yes, hosted, OAuth |
| Amplitude | Yes (Event Segmentation, Funnels endpoints with `start`/`end`) | Yes, chart ID from the URL, but the saved chart's own date range (no override documented) | Project API key + secret key (Basic auth); no OAuth for REST | 5 concurrent, 108,000 "cost"/hour per project | US, EU | Yes, hosted, OAuth |
| Mixpanel | Partly: ad-hoc Segmentation exists but is in maintenance mode | Yes, `bookmark_id` from the URL, but no date parameter documented | Service account (username + secret), created by Owner/Admin; no OAuth for REST | 60 queries/hour, 5 concurrent | US, EU, India | Yes, hosted, OAuth or service account |
| GA4 | Yes, best fit: `runReport` takes up to 4 date ranges in one call | No: the Data API runs a query you define; no saved-report endpoint | Google OAuth 2.0 (`analytics.readonly`) or a service account added to the property | 40,000 tokens/hour, 200,000/day, 10 concurrent per property (standard) | No storage-region choice documented | Yes, but local (run by the user), not hosted |
| Statsig | Partly: one metric's value for one date per call | No | Console API key per project (read-only option); no OAuth for REST | Reads not rate limited per docs | EU hosting only listed under Warehouse Native | Yes, hosted, OAuth |

**Recommendation: support PostHog first** (reasons at the end).

## PostHog

- **Fetch a value for a date range.** `POST /api/projects/:project_id/query/` runs a `TrendsQuery`,
  `FunnelsQuery` or HogQL (SQL) query with a `dateRange` such as `{"date_from": ...}`.
  Needs the "Query Read" permission. [Query API](https://posthog.com/docs/api/queries); scope
  `query:read` per the [OpenAPI spec](https://posthog.com/docs/open-api-spec/query_create.md).
- **Saved insight by URL.** `GET /api/projects/{project_id}/insights/{id}/` accepts the numeric ID *or the
  8-character `short_id`* (the one in the insight's URL). `filters_override` replaces `date_from` /
  `date_to` for that request only, without saving. `refresh=blocking` computes synchronously; the
  default `force_cache` only returns cached data. Scope `insight:read`.
  [insights_retrieve](https://posthog.com/docs/open-api-spec/insights_retrieve.md)
  - This is the cleanest fit for Lane. The Requester pastes the chart link. The agent reruns it once
    for the baseline window and once for the after-release window.
- **Connection model.** Three options: personal API keys, project secret API keys (beta; scoped to one
  project, only the scopes granted), and OAuth for apps that other PostHog users connect.
  [API overview](https://posthog.com/docs/api)
  - OAuth uses a Client ID Metadata Document (CIMD). The app hosts a JSON file on its own domain;
    no pre-registration. Verification is optional; it removes an "unverified application" notice.
    A region-agnostic OAuth host `https://oauth.posthog.com` routes US and EU users.
    Users pick access at consent time (all, specific orgs, or specific projects); an app can force
    `required_access_level=project`. Scopes are `resource:read|write`.
    [OAuth integration](https://posthog.com/docs/api/oauth.md)
- **Rate limits.** Query endpoint: 2,400/hour and 240/minute, 3 concurrent queries, 10 s max execution
  per query (some older accounts are limited to 120 queries/hour). Analytics endpoints such as
  insights: 240/minute, 1,200/hour. Most limits are per personal API key; OAuth requests don't count
  against them, but some budgets are shared per project.
  [Query API](https://posthog.com/docs/api/queries), [API overview](https://posthog.com/docs/api)
  - Note: PostHog calls `/query` "intended for ad-hoc analytics and embedded use cases". One read per
    Request per window is well inside that.
- **Plan / cost.** The API "is available for all users and instances". [API overview](https://posthog.com/docs/api).
  Free plan includes 1M events/month of product analytics. Paid is pay-as-you-go with a $0 base.
  [Pricing](https://posthog.com/pricing.md)
- **Data residency.** US Cloud (`us.posthog.com`) and EU Cloud (`eu.posthog.com`), the EU on servers in
  Frankfurt. [Data storage](https://posthog.com/docs/privacy/data-storage). Self-hosting is also possible.
- **MCP.** Official, hosted, free: `https://mcp.posthog.com/mcp` (US), `https://mcp-eu.posthog.com/mcp`
  (EU). OAuth is the default; a personal API key with the "MCP Server" preset is the fallback. Its own
  limit is 480/minute, 4,800/hour per credential. Tools include `query-trends`, `insight-get`,
  `insight-query`. [MCP overview](https://posthog.com/docs/model-context-protocol),
  [MCP FAQ](https://posthog.com/docs/model-context-protocol/faq.md),
  [MCP tools](https://posthog.com/docs/model-context-protocol/tools)

## Amplitude

- **Fetch a value for a date range.** Dashboard REST API: Event Segmentation
  `GET /api/2/events/segmentation` (event `e`, `start`, `end` as YYYYMMDD, optional metric `m`) and
  Funnels `GET /api/2/funnels` (one `e` per step, `start`, `end`).
  [Dashboard REST API](https://amplitude.com/docs/apis/analytics/dashboard-rest)
- **Saved chart by URL.** `GET /api/3/chart/:chart_id/csv` returns JSON for any saved chart. The ID is
  in the chart's URL (e.g. `abc123` in `.../chart/abc123`). No date-range override is documented for
  this endpoint, so the agent gets the chart's saved range. For before vs after, it would rebuild the
  query itself. [Dashboard REST API](https://amplitude.com/docs/apis/analytics/dashboard-rest)
- **Connection model.** HTTP Basic auth with the *project's* API key and secret key. Keys are per project.
  Managers and Admins generate secret keys, and the secret is shown only once. No OAuth is documented
  for the REST APIs. [Authentication](https://amplitude.com/docs/apis/authentication)
  - In practice a customer admin pastes a project secret into Lane. That is a heavier ask than OAuth,
    and the key isn't tied to one person's permissions.
- **Rate limits.** 5 concurrent requests across all REST endpoints, and 108,000 "cost" per hour per
  project, where cost = days x conditions x query-type cost. Exceeding either returns 429.
  [Dashboard REST API](https://amplitude.com/docs/apis/analytics/dashboard-rest)
  - Example: a 28-day segmentation on one event, no group-by, costs about 28.
- **Plan / cost.** **Unverified.** The docs don't say which plans include the Dashboard REST API;
  confirm with Amplitude.
- **Data residency.** US default (`amplitude.com`) and EU (`analytics.eu.amplitude.com`).
  [Dashboard REST API](https://amplitude.com/docs/apis/analytics/dashboard-rest)
- **MCP.** Official, hosted: `https://mcp.amplitude.com/mcp` and `https://mcp.eu.amplitude.com/mcp`.
  OAuth 2.0 using the user's own Amplitude permissions. Enabled by default at org level. Per project,
  the "Use MCP (read)" role action controls access. `query_amplitude_data` runs segmentation, funnels and
  retention, and queries existing charts by ID.
  [Amplitude MCP](https://amplitude.com/docs/amplitude-ai/amplitude-mcp)

## Mixpanel

- **Fetch a value for a date range.** The ad-hoc Segmentation endpoint (`GET /segmentation`,
  `event`, `from_date`, `to_date`) still exists but "is in maintenance mode. We recommend discontinuing
  new use of this endpoint". Mixpanel points to building an Insights report in-app and querying it.
  [Segmentation Query](https://docs.mixpanel.com/reference/segmentation-query.md)
- **Saved report by URL.** `GET /api/query/insights` with `project_id` and `bookmark_id`. The
  `bookmark_id` is in the report URL after `editor-card-id=%22report-`. The only parameters are
  `project_id`, `bookmark_id`, `workspace_id`, so no date override is documented. A Funnels saved-report
  endpoint exists too. [Insights Query](https://docs.mixpanel.com/reference/insights-query.md)
  - Net effect: over REST, before vs after needs either the deprecated endpoint or two saved reports.
- **Connection model.** Service accounts (username + secret, HTTP Basic) are the preferred method.
  Requests must include `project_id`. Service accounts get a role per project or workspace, and only
  Owners or Admins can create them.
  [Query API auth](https://docs.mixpanel.com/reference/query-api-authentication.md),
  [Service accounts](https://docs.mixpanel.com/reference/service-accounts.md).
  No third-party OAuth app program is documented for the Query API (OAuth appears only for MCP).
- **Rate limits.** 60 queries per hour, 5 concurrent. This is the tightest of the five.
  [Insights Query](https://docs.mixpanel.com/reference/insights-query.md)
- **Plan / cost.** Free plan: up to 1M events, 5 saved reports per user. Reports are blocked once the
  limit is hit, until the next month. [Pricing](https://docs.mixpanel.com/docs/pricing.md).
  The MCP docs warn that "Free plans can be subject to Query API access limits".
  [MCP](https://docs.mixpanel.com/docs/mcp.md)
- **Data residency.** US default, EU (`eu.mixpanel.com/api`) and India (`in.mixpanel.com`), chosen when
  the project is created. [EU residency](https://docs.mixpanel.com/docs/privacy/eu-residency.md)
- **MCP.** Official, hosted: `mcp.mixpanel.com`, `mcp-eu.mixpanel.com`, `mcp-in.mixpanel.com`.
  Connects by OAuth with the user's own permissions, or headless with a service account. An org admin
  must enable it, except on free and growth accounts created after 2026-08-01, where it's on by default.
  Tools: `Run-Query` (insights, funnels, retention) and `Get-Report` (saved report with results).
  [MCP](https://docs.mixpanel.com/docs/mcp.md)

## Google Analytics 4

- **Fetch a value for a date range.** Data API
  `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` with metrics, dimensions
  and `dateRanges`. [runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).
  It takes "up to 4 date ranges", so before and after come back in one call. Dates can be fixed or
  relative (`NdaysAgo`). [DateRange](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/DateRange)
- **Saved report by URL.** No. The Data API reference has no method to run a saved Exploration or
  library report. The agent must store the metric and filters itself.
- **Connection model.** Google OAuth 2.0 with `analytics.readonly` (or `analytics`), so access follows
  the user's GA permissions. A service account also works if it is added to the property.
  [runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).
  **Unverified:** whether `analytics.readonly` triggers Google's OAuth app-verification review for a
  public app. Check Google's scope classification before building.
- **Rate limits (standard property / Analytics 360).** 200,000 / 2,000,000 tokens per day;
  40,000 / 400,000 per hour; 14,000 / 140,000 per project per property per hour; 10 / 50 concurrent.
  [Quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- **Plan / cost.** The Data API works on standard (free) properties; 360 only raises quotas.
  [Quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- **Data residency.** No storage-region option is documented. Google says data from EU devices is
  collected on EU servers and EU IP addresses are dropped before logging.
  [GA EU data](https://support.google.com/analytics/answer/12017362)
- **MCP.** Official but local: `analytics-mcp` (PyPI; GitHub `googleanalytics/google-analytics-mcp`),
  run by the user with Application Default Credentials and `analytics.readonly`. Read-only tools include
  `run_report` and `run_funnel_report`. Not a hosted endpoint Lane could connect to.
  [GA MCP](https://developers.google.com/analytics/devguides/MCP)

## Statsig

- **Fetch a value for a date range.** Console API `GET /console/v1/metrics?id=<metric_id>::<type>&date=YYYY-MM-DD`
  returns one metric's value for **one date**, per unit type, with numerator and denominator for ratio
  metrics. [Read single metric value](https://docs.statsig.com/api-reference/metrics/read-single-metric-value).
  No range parameter is documented, so a 28-day window means 28 calls plus Lane doing the totals.
  This only works for metrics the customer already defined in Statsig.
- **Experiment results.** `GET /console/v1/experiments/{id}/summary_charts` (beta) returns per-metric
  means, p-values and unit counts.
  [Summary charts](https://docs.statsig.com/api-reference/experiments/retrieve-experiment-summary-charts-beta).
  This is a better fit for a *Verified result* when the Release was an experiment.
- **Saved chart by URL.** Not supported by any documented endpoint.
- **Connection model.** A Console API key in the `STATSIG-API-KEY` header, created in Project Settings.
  [Console API](https://docs.statsig.com/console-api/introduction). Keys can be read-only.
  [MCP setup](https://docs.statsig.com/integrations/mcp/manual-setup.md). No OAuth for the REST API.
- **Rate limits.** Only mutations are rate limited (about 1,800 per 15 minutes per project); reads are not.
  [Console API](https://docs.statsig.com/console-api/introduction)
- **Plan / cost.** Developer (free) plan: 2M events per month. Pro: $150/month.
  [Pricing](https://www.statsig.com/pricing). **Unverified:** whether the Console API is gated by plan.
- **Data residency.** The pricing page lists "EU hosting" only as a Warehouse Native feature
  (Enterprise). [Pricing](https://www.statsig.com/pricing)
- **MCP.** Official, hosted: `https://api.statsig.com/v3/mcp`. OAuth, which requires Personal Console
  API Keys to be enabled for the user's role, or a Console API key.
  [MCP setup](https://docs.statsig.com/integrations/mcp/manual-setup.md)

## Recommendation: support PostHog first

1. **Matches Lane's flow.** The Requester pastes the insight link. Lane rereads that same insight for
   the baseline window and the after-release window, using `short_id` plus a temporary date override.
   No other tool does both "reference by URL" and "change the dates" in one documented call.
2. **Lightest connection.** Standard OAuth that a third-party app can ship without pre-registration.
   One region-agnostic host covers US and EU customers. Access can be limited to a single project.
   Lane never holds a shared admin secret.
3. **No paywall, generous limits.** API on every plan, including free, and 2,400 queries/hour. Lane
   needs roughly two reads per Request per measurement.
4. **Fits Lane's market.** PostHog is common at 10–200 person product companies. That is a market
   observation, not a sourced claim.
5. **Official hosted MCP.** It exists if Lane's agent later works through MCP rather than REST.

**Second: Amplitude.** It has saved charts by URL, EU hosting and a hosted OAuth MCP. But REST needs a
project secret from a Manager or Admin, and saved charts return their own date range. **Third: GA4.**
Best date-range handling (four ranges in one call) and huge reach. But there are no saved reports by
URL, so Lane must capture the metric definition itself, and the consent may need Google's app review.
**Mixpanel** comes later: 60 queries/hour, no date override on saved reports, and the ad-hoc endpoint
is in maintenance mode. Its MCP is the better route there. **Statsig** fits experiment-backed *Verified
results* better than plain metric reads.

Design note for the build plan (not a decision): store a "metric source" on the Expected impact
(provider, project, saved chart link). Whatever the provider, the agent then only needs
"value for window A" and "value for window B". Per the map, the agent drafts and the Requester confirms.
