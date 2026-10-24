# Research: competitor landscape and pricing for design and PM tools (#179)

Question: what do Linear, Jira Product Discovery, Productboard, Dovetail, Notion Projects, Shortcut (and Height-style tools) and 2026 AI-native newcomers offer designers and PMs? Covers intake, discovery, impact/outcome tracking, agents, integrations and pricing (per seat? free requesters or viewers? AI limits). Where are the gaps Lane can own, especially predicted-vs-actual impact and "have we tried this before"?

Part of map #178. Findings only. No product decisions are made here.

Method: I read official pricing pages, product pages, docs and changelogs on 2026-10-24. Third-party sources appear only where no primary source answered the question, and they are marked **(secondary)**. Pricing pages change often, so treat every number as true on 2026-10-24 only.

## Short answer

- **Nobody closes the loop.** Every tool covers intake, discovery or delivery. None of them stores a prediction when work is requested and then checks it against the actual result after launch as a first-class record. The closest is Productboard Spark, which claims to "compare usage data and post-launch feedback against the objectives in the original spec". It is an AI feature on top of specs, not a stored prediction that gets closed with evidence, and it sits on contact-sales pricing.
- **"Have we tried this before?" is only half-done.** Linear Triage Intelligence and Dovetail's research repository find duplicates and related past items. Neither of them says whether the past work *worked*. Lane's planned product memory (closed Requests that carry their outcomes) has no direct equivalent.
- **Pricing pattern: the people who do the work pay, and the people who give input are free or capped.** Jira Product Discovery (free contributors), Productboard (only makers are billed; contributors are capped by plan) and Shortcut (read-only observers) all follow it. Linear is the exception: guests are billed as full members. Lane's planned "requesters paid, guests and view-only free" is *stricter* than JPD and Productboard, which let requesters and contributors in for free.
- **AI is moving to metered credits on top of seats.** Linear (coding sessions and Loops), Productboard (Spark credits per maker), Notion (Custom Agents at $10 per 1,000 credits) and Dovetail (agents only on Enterprise) all do this.

## Tool by tool

### Linear (linear.app)
Offers designers and PMs:
- **Intake:** Triage inbox. Linear Asks turns Slack (`/ask`), email and web forms into issues. Asks is Business and Enterprise only; web forms are Enterprise only ("Advanced Linear Asks"). The docs don't say whether a requester needs a seat. [Asks docs](https://linear.app/docs/linear-asks)
- **Discovery and feedback:** Customer Requests link customer feedback to issues and projects, with customer revenue, tier and size. Free plan: manual entries and Slack. Business adds Asks, Intercom, Zendesk and Front. Enterprise adds Salesforce. [Customer requests docs](https://linear.app/docs/customer-requests)
- **"Tried this before":** Triage Intelligence suggests a team, project, assignee and labels, and flags likely duplicates and related issues. Each suggestion shows its reasoning and can be auto-applied per team. Business and Enterprise only. [Triage Intelligence docs](https://linear.app/docs/triage-intelligence)
- **Impact and outcomes:** Initiatives, Insights and Dashboards measure delivery (Insights is Business). There is nothing for expected versus actual product results.
- **Agents:** Linear Agent and the agent platform are on every plan, including Free. Coding sessions and Loops (renamed from "Linear Agent automations") use AI credits. Since the [2026-08-20 changelog](https://linear.app/changelog/2026-08-20-coding-environments), model tokens are passed through at provider rates and the sandbox costs $0.25 per 20-minute block. [AI credits docs](https://linear.app/docs/ai-credits) Uncertain: older per-task cost estimates may still appear in the docs.

Pricing ([pricing page](https://linear.app/pricing), 2026-10-24):
- Free: $0, unlimited members, 2 teams, 250 issues.
- Basic: $10 per user per month, billed yearly.
- Business: $16 per user per month, billed yearly. Adds guests, Asks, Triage Intelligence, Insights, Zendesk and Intercom.
- Enterprise: custom.
- Guests "are billed as regular members". [Members and roles docs](https://linear.app/docs/members-roles) There is no free viewer role.

### Jira Product Discovery (Atlassian)
Offers designers and PMs:
- **Discovery:** Ideas, insights (evidence attached to ideas), custom fields and scoring for prioritisation, and board and timeline roadmaps. [Product page](https://www.atlassian.com/software/jira/product-discovery)
- **Intake:** Jira Service Management requests can become insights and ideas. The product page doesn't mention its own intake form.
- **Delivery:** Ideas link to Jira epics and issues, and to Atlassian Goals and Projects. Roadmaps embed in Confluence. [Pricing page](https://www.atlassian.com/software/jira/product-discovery/pricing)
- **Sharing:** Published views are read-only roadmaps for stakeholders without a licence, though they need a free Atlassian account. [Atlassian blog](https://www.atlassian.com/blog/jira-product-discovery/publish-views-external) Uncertain: which plan includes publishing.
- **Impact and outcomes:** Fields can score expected impact. The product page describes no measurement after launch, only "close the loop when work ships".
- **AI:** Rovo can brainstorm, summarise and analyse insights. It is on by default on Standard, Premium and Enterprise. [AI in JPD docs](https://support.atlassian.com/jira-product-discovery/docs/explore-atlassian-intelligence-in-jira-product-discovery/) The pricing page gives no AI usage limits.

Pricing ([pricing page](https://www.atlassian.com/software/jira/product-discovery/pricing), 2026-10-24):
- Free: up to 3 creators, 2 GB storage.
- Standard: $10.50 per creator per month.
- Premium: $26.25 per creator per month.
- Enterprise: contact sales.
- Annual billing saves "up to 17%".
- **Only creators are billed. Contributors are free** (they need an Atlassian account and can add ideas, insights, comments and votes). Anyone with Jira or JSM access is a contributor by default.

### Productboard
Offers designers and PMs:
- **Discovery:** Insights repository, customer boards, feedback forms, product portals (2 on Business), custom prioritisation formulas, feature hierarchy and dependency tracking. Objective hierarchy is Enterprise only. [Pricing page](https://www.productboard.com/pricing/)
- **Agents:** Spark is an AI agent that ranks opportunities weekly by evidence, analyses feedback with citations, writes specs (sharing them with Claude Code, Codex and Cursor over MCP), and drafts release notes. [Spark page](https://www.productboard.com/product/spark/)
- **Impact and outcomes:** Spark "compares usage data and post-launch feedback against the objectives in the original spec" and helps plan fast-follows. This is the closest competitor to predicted-vs-actual. Uncertain: the page shows no structured prediction field and no closure record, and I couldn't verify how deep the feature goes.
- **Integrations:** Jira and Azure DevOps (5 each on Business), Salesforce (Enterprise) and an API.

Pricing ([pricing page](https://www.productboard.com/pricing/), 2026-10-24):
- Business and Enterprise only, priced through a demo or sales. **No dollar price is published.** Minimum 5 makers. Annual billing saves 21%.
- **Billed per maker** ("the product managers and leads who own the product strategy").
- Contributors (engineers, designers, customer success) "don't count toward your maker limit". Business includes 25 contributors; Enterprise has unlimited.
- AI credits: Business includes 500 per maker per month. Enterprise includes 1,500 base plus 800 per extra maker. Top-ups cost $5 per 50 credits (monthly) or $60 per year for 600 credits (annual). When credits run out, Spark pauses.
- Spark is standard for new workspaces, and existing customers are being moved over.
- Note: older Starter (free), Essentials ($19/$25) and Pro ($59/$75) per-maker tiers still appear on third-party sites **(secondary)**. They look replaced by the current page.

### Dovetail
Offers designers and PMs:
- **Discovery:** A customer-research repository with channels, AI opportunity tracking, AI clustering, summaries, semantic search, AI dashboards, agents, CRM sync (Salesforce, HubSpot) and Slack/Teams chat queries. [Pricing page](https://dovetail.com/pricing/)
- **"Tried this before":** Semantic search over past research answers "have we heard this before". It does not cover whether a shipped change worked.
- **Impact and outcomes:** None.

Pricing (2026-10-24):
- Free: $0. Limited to 1 channel, 1 project and 1 dashboard.
- Enterprise: custom pricing, with unlimited agents, channels and projects.
- Billed per user, with Manager, Contributor and Viewer roles. The page doesn't say whether viewers are free. No middle tier is published.

### Notion Projects
Offers designers and PMs:
- **Intake:** Forms.
- **Work tracking:** Sprints, timelines, PRDs on task pages, automations, Figma and GitHub integrations, and a progress bar toward launch. [Projects page](https://www.notion.com/product/projects)
- **Agents:** Agents that "keep work moving 24/7", plus AI drafting and Autofill.
- **Impact and outcomes:** No goals or outcomes on the page. Teams build their own databases for this.

Pricing ([pricing page](https://www.notion.com/pricing), 2026-10-24):
- Free: $0.
- Plus: $10 per member per month.
- Business: $20 per member per month. Includes Notion Agent, AI Meeting Notes and Enterprise Search.
- Enterprise: custom.
- Yearly billing saves up to 20%.
- **Guests are free**: 10 on Free, unlimited on paid plans.
- Custom Agents use credits at $10 per 1,000 credits per month after a trial.
- Form conditional logic is Business only. Premium connections (GitHub, Asana) are Business.

### Shortcut (and Height)
Shortcut ([pricing page](https://www.shortcut.com/pricing), 2026-10-24):
- Plans: Free ($0, up to 10 users), Team ($8.50 per user per month), Business ($12) and Enterprise (custom). Yearly billing saves up to 25%.
- **Observers** (read-only) on paid plans: "up to 5 read-only users per paid seat". The trial has unlimited observers.
- Objectives and key results are Business and Enterprise.
- AI: "AI Agent Collaboration", an MCP server and Korey ("AI agent for product engineering workflows"). No AI pricing or limits are published.
- There is no intake feature and no outcome measurement beyond OKRs.

Height: shut down on 2025-09-24, after announcing it in March 2025 ([AlternativeTo](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/), **secondary**). Shortcut ran a Height import offer ([Shortcut import page](https://shortcut.com/import/height)). Reviewers blamed part of its decline on unwanted automatic AI changes in its 2.0 release **(secondary, opinion)**. That is a warning that supports Lane's "agents suggest, a person accepts" rule.

### 2026 AI-native newcomers (lower confidence)
- **ChatPRD** ([pricing page](https://www.chatprd.ai/pricing)): an AI writer for PRDs and documents, with document scorecards, a product knowledge map, competitor tracking, prototype handoff (v0, Cursor, Lovable, Replit), and Linear, Notion and Amplitude integrations over MCP. Pricing: Free (3 chats), Pro $15 per month, Teams $29 per seat per month. It is a document tool, not a system of record.
- **Devplan / Weaver** (Seattle): came out of stealth in June 2026 with $2.5M seed, as an "intelligence layer for AI-native product development". **(secondary, aggregator)**
- **Artus AI**: an "AI product manager" that scores ideas on value, feasibility, cost and risk. Pre-seed in 2026. **(secondary)**
- **ProductSense** (Finland, €1.5M) and **ProductNow** ($6M seed, July 2025): agentic tools that make sense of feedback. **(secondary)**
- Pattern: the newcomers automate writing specs and sorting feedback. None of them advertises tracking whether a shipped change worked. Most published "AI for PMs" stacks in 2026 are assembled from several tools (meeting notes, then Claude or Cursor, then Linear) **(secondary listicles)**. That suggests there is no default system of record for design and PM work.

## Comparison

| | Intake | Discovery / evidence | "Tried before" | Predicted vs actual | AI pricing | Free non-workers |
|---|---|---|---|---|---|---|
| Linear | Asks (Business+), Triage | Customer Requests | Duplicate and related suggestions | No | Credits (coding, Loops) | No: guests billed as members |
| JPD | Via JSM | Ideas + insights + scoring | No | No (scoring only) | Rovo included; limits unclear | Contributors free; published views |
| Productboard | Forms, portals | Strong | Evidence-ranked opportunities | Partly (Spark compares to spec objectives) | Credits per maker | Contributors not billed but capped (25 on Business) |
| Dovetail | Research channels | Strong (research) | Semantic search over research | No | Agents on Enterprise only | Unclear |
| Notion Projects | Forms | Build it yourself | Enterprise Search | No | Credits for Custom Agents | Guests free |
| Shortcut | No | No | No | OKRs only | Unpublished | Up to 5 observers per paid seat |

## Gaps Lane can own

1. **A recorded prediction that gets closed against the actual result.** No tool makes the expected impact recorded at intake into something that is measured on a due date and then closed with evidence by the person who asked. Productboard Spark is the only one heading there, and only as AI-generated comparison for strategy owners on enterprise-style pricing.
2. **Product memory that carries outcomes.** Linear and Dovetail find *similar* past items. None answers "we tried this in Q2, and it moved activation by +3% / did nothing". Closed Requests that carry their outcomes are a gap nobody has filled.
3. **The problem-first request as the unit of work.** Linear's unit is the issue, JPD's and Productboard's is the idea or feature, and Notion's is the task or page. A problem-framed Request with optional reviewers before work starts sits between discovery tools (for PMs) and delivery tools (for engineers). Designers are poorly served in every tool reviewed. Notion's Figma embed is the most designer-facing feature found.
4. **Results by product area, never per person.** Linear Insights and Shortcut focus on delivery and OKRs. Nobody makes an outcome report by product area, with no individual scores, a selling point.
5. **Agents that suggest, with trust built in.** Height's decline after unwanted automatic AI changes (secondary) shows the risk. Linear lets teams choose show, hide or auto-apply per property, and that pattern is worth copying.
6. **Connecting, not rebuilding.** Every incumbent fills the gap by growing sideways: Linear into feedback, Productboard into specs for coding agents, Notion into everything. Lane can be the record that links Figma, Linear or Jira, analytics and Slack.

## Pricing patterns relevant to "requesters paid, guests and view-only free"

- **Industry norm: bill the people who do the work, not the people who give input.** JPD bills creators only, and contributors (who can add ideas and insights) are free. Productboard bills makers only and caps contributors by plan. Shortcut gives up to 5 observers per paid seat. Notion gives unlimited free guests on paid plans.
- **Lane's planned model is stricter for requesters.** In JPD and Productboard, someone who only submits ideas or feedback pays nothing. In Lane, filing a Request means a paid seat. This is defensible because a Lane requester also owns reporting the result and closing the Request, which is real work rather than input. But buyers will compare it with JPD's free contributors. A product question for #178: whether a lightweight "submit only" path (for example, the deferred public form or Slack capture) should stay free.
- **Linear charges for guests**, so Lane's free guests are a clear difference from the tool designers and PMs already know.
- **Caps on free roles are common** (Productboard: 25 contributors on Business; Shortcut: 5 observers per seat; Notion Free: 10 guests). Caps stop teams from avoiding seats by labelling everyone a guest. Lane will likely need one once a view-only role exists.
- **AI is priced separately from seats.** Credits are metered per maker or workspace, with paid top-ups, and features pause when credits run out (Productboard). If Lane adds agents, a credit pool for the workspace with a visible usage meter is the current norm. Entry prices for the main per-seat work tier are about $8.50–$26 per seat per month (Shortcut $8.50–12, Linear $10–16, Notion $10–20, JPD $10.50–26.25).

## Uncertainty

- Productboard has no public dollar price. It is unclear whether its contributors are fully free or just "not counted".
- Linear's per-task AI cost guidance may be out of date in its docs. Whether a Linear Asks requester needs a seat is not documented.
- Which JPD plan includes published views, and JPD's AI limits.
- Dovetail's paid self-serve tier, if any, and whether its viewers are billed.
- The newcomer facts come from aggregators and press, not product pages.
