# Linear settings browser study

Inspected October 18, 2026 in the existing signed-in Chrome tab for https://linear.app/apbl/settings/account/profile. This records observed UI, not Linear backend guarantees or automatic approval to reproduce its product.

## Coverage and limits

Visited all 34 sidebar destinations below, plus Desktop/Mobile/Email/Slack notification detail pages and team General/Issue statuses/Workflows & automations/Triage/Cycles. Opened the comment-submit preference menu, theme menu, sidebar customization dialog, member filter and invitation dialog. Tested settings search with `theme` and followed its Interface theme anchor. Earlier inspection opened and cancelled Change email.

No settings were saved, invitations sent, integrations connected, keys generated, subscriptions changed or destructive controls invoked. Paid/trial-only functionality was inspected only as exposed in this free workspace. Responsive behavior, save timing, network failures, all nested integration pages and every creation dialog were not tested. The original Profile page was restored.

## Complete sidebar inventory

Every sidebar destination is accounted for. “Candidate” means a proposed Coming soon placeholder for this Settings design, not prior approval for its backend or a release date. “Reference only” means a current product conflict or no established Lane use; retain the evidence without promising delivery.

| Group / destination | Observed controls and logic | Lane disposition |
| --- | --- | --- |
| Personal / Preferences | Home view, displayed name format, week start, emoticon conversion, Enter vs Command+Enter comments; sidebar customization, font size, cursor/link behavior, animated media; interface/code themes; desktop opening; assignment automations | Theme working now; general preference candidates retained as Coming soon. Code themes/desktop app/automatic assignment reference only until those capabilities exist |
| Personal / Profile | Photo, email, full name, title, username; leave workspace disabled here | Clerk identity and Lane role working; username/title/leave flow candidates visible as Coming soon if not delivered in this increment |
| Personal / Notifications | Priority inbox, priority event selection, channel summary links; changelog/marketing/invitation/legal update subscriptions | Request notification preferences candidate; no fake email or push delivery; subscriptions/digests are not implicitly approved |
| Personal / Code & reviews | GitHub enablement, dependent review notifications, signed commits, coding tools, attachment title format, automatic status movement | Reference only: Lane's design reviews stay in Figma; do not revive retired review implementation |
| Personal / Security & access | Sessions, sign out, passkeys, personal API keys, commit-signing key, authorized apps | Existing Clerk account security where supported; additional capabilities candidates, never fake enforcement |
| Personal / Connected accounts | Slack, Google Calendar out-of-office, Notion, GitHub; link to agent MCP connectors | Coming soon integration category; no connection attempt or tokens |
| Personal / Agent personalization | Guidance editor, skills, MCP connectors | Reference only under current deferred agentic-operations contract |
| Issues / Labels | Search, filters, display options, sortable name/description/count/last-applied/created columns; groups, create, row menu, inline editing | Requests labels candidate; no copied Issue naming or new schema now |
| Issues / Templates | Workspace-wide templates with explanation of team-scoped alternatives, empty state, create action | Intake/Request templates candidate |
| Issues / SLAs | Plan gate and disabled automation-rule creation | Reference only; no established Lane SLA commitment |
| Projects / Labels | Search, filters, display options, create group/label, empty state | Candidate |
| Projects / Templates | Workspace scope explanation, empty state, create | Candidate |
| Projects / Statuses | Backlog/Planned/In Progress/Completed/Canceled groups, create and row menus | Reference only; do not replace Lane's locked Request lifecycle or invent a Project lifecycle |
| Projects / Updates | Expected update schedule, lead reminders, Slack channel connection | Reference only; recurring reporting/reminders not authorized |
| Features / AI & agents | Usage links, paid capability gates, agent configuration, installed agents/guidance, summaries, branch-name preference | Preserve current Intake AI behavior; no agent settings promise |
| Features / Loops | Scheduled/event-triggered agents; credits and plan gate | Reference only; cron/agent operations deferred |
| Features / Initiatives | Enable toggle, dependent schedule/Slack controls, labels | Reference only; explicitly banned until paying demand |
| Features / Documents | Document templates and empty/create state | Reference only; separate document product not approved |
| Features / Customer requests | Enable toggle, customer management, default routing team, statuses/tiers, revenue display, external source, domain exclusions | Reference only; different concept from Lane Requests, not a rename of our Intake |
| Features / Releases | Plan gate for issue shipment tracking | Reference only; not a substitute for Lane's confirmed launch/outcome contract |
| Features / Pulse | Enable toggle, workspace/personal daily/weekly summary schedules | Reference only; briefing/digest ban applies |
| Features / Asks | Slack/email structured intake, plan gate | Future Intake channel candidate; no public/anonymous/email ingestion now |
| Features / Emojis | Search, upload, empty state | Candidate only; no upload backend in this increment |
| Integrations / All integrations | Searchable categorized catalog; Essentials, Agents, AI clients, Engineering, Linear crafted, Bug reporting, Automations and further categories; integration detail links | Coming soon category. Do not copy the entire vendor catalog or claim integrations exist |
| Administration / Workspace | Logo, name, URL, first fiscal month, immutable region, gated onboarding message/announcements/home view, delete workspace | Current workspace identity via Clerk; fiscal period and onboarding candidates; deletion requires separate lifecycle handling |
| Administration / Teams | Search, active status selector, CSV export, create, sortable table, visibility/counts, row menus | Reference only; Lane currently has one workspace-wide view, no team tenancy |
| Administration / Members | Name/email search, filters, CSV, invite; name/email/status/team/joined/last-seen columns | Existing Clerk members/invitations working. Never adopt Last seen or online activity |
| Administration / Security | Invite links, allowed domains, authentication methods, scoped management permissions, upload restrictions, app approval, AI web/data-sharing/MCP policy, compliance | Coming soon advanced security category; existing protections remain enforced. No cosmetic switch implies policy is active |
| Administration / API | OAuth apps, webhooks, personal key creation policy and issued keys | Coming soon candidate; no key generation or API implementation |
| Administration / Applications | Authorized external apps, empty state | Coming soon candidate |
| Administration / Billing | Current plan/user count, plan options, upgrade, usage link, invoices | Coming soon placeholder; no payment CTA or invented prices |
| Administration / Usage & limits | Usage explorer, credits, reload controls | Workspace-level limits candidate; individual usage/rankings excluded |
| Administration / Import & export | Migration assistants, CLI importer link, asynchronous CSV export, private-team scope selector | Coming soon candidate; no data job or CSV export implementation now |
| Your teams / APB | Team settings hub, general/members/notifications, labels/templates/recurring issues, statuses/workflows/triage/cycles, agents, hierarchy and danger zone | Reference-only hub; map useful ideas individually rather than add Lane Teams |

## Interactions inspected more deeply

- Settings search filters the sidebar inline. Searching `theme` reveals matching pages AND nested rows with fragment URLs. Clicking Interface theme navigates to its exact field. Arc may express this through its palette, but must retain section context and destination precision.
- The theme menu includes System preference, Light, Pure Light, Dark, Magic Blue, Classic Dark and Custom. System mode exposes separate light and dark choices. Lane keeps its agreed System/Light/Dark styling; this is not approval for new palettes.
- Comment submission offers Enter and Command+Enter. Sidebar customization uses a separate dialog: badge style plus per-item Always show / Show when badged / Don't show choices. No preference was changed.
- Member filter options: All, Members, Applications, Pending invites, Suspended, Left workspace. Invite opens an email field accepting multiple addresses and a Send invites action. No invite was submitted. Lane must represent only membership states actually supported by its Clerk integration.
- Email change explains verification to the new address and the cross-workspace scope. Lane should preserve Clerk's verification and identity ownership.
- Desktop notifications expose the categories but disable them until the desktop app is installed. Slack shows a connection requirement and disables dependent controls. Mobile has enable/priority gates, schedule days/hours, then categories. Email adds format and digest-specific controls. Notification categories remain visible when prerequisites are missing, with explanatory text.
- Notifications span assignments, status changes, comments/replies, mentions, reactions, subscriptions, documents, updates, deadlines, loops, integrations, billing and triage. Lane should map only real Request events; do not copy nonexistent notification types or build digests.
- Team General includes identifier, description, estimates, email intake, timezone and detailed history. Statuses are grouped by lifecycle category. Workflow automation includes PR events, parent/sub-issue closure, stale closure, timed archive and order-on-status-change. These are reference observations, not Lane behavior.
- Triage requires enablement and optionally explicit priority, with responsibility/AI gates. Cycles expose dependent automation checkboxes while disabled. This reinforces visible prerequisites; it does not authorize cycles or a second intake pipeline.

## Resulting design rules

1. Separate Personal settings from Workspace administration; distinguish personal identity, functional role and membership permission.
2. Maintain one complete catalog with availability metadata: working, coming soon, reference-only. Reference-only entries belong in this study, not fake product navigation.
3. Future items shown in Lane get a Coming soon badge in navigation/search and a concise explanatory surface. No working-looking Save, Connect, Enable, Upgrade or Delete action; no fabricated values.
4. A coming-soon item stays keyboard-discoverable; selecting it shows its explanation. Do not make the only explanation an inaccessible disabled-control tooltip.
5. Use the existing Settings route with local panels/anchors for placeholders, preserving Profile/Members deep links. No route/table/backend is needed per placeholder.
6. Group compact labeled rows with descriptions, clear dependency states and direct links to prerequisites. Keep current Arc components and Supabase tokens.
7. Preserve a reviewable inventory so deferred items cannot silently disappear. Coming soon is an availability label, with no invented delivery date.
