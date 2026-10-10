# Request properties and lifecycle follow-up

Status: broader capabilities remain planning only. On 2026-10-08 Nikhil chose “feature first” over trio agreement. Saved Request codes are the first bounded local implementation, specified in [the saved-code plan](2026-10-08-saved-request-codes.md); priority remains separate. This document does not authorize the other schema, route or lifecycle expansions below.

The current preview demonstrates priority, illustrative LAN codes, existing three statuses, picker, Project, Request type and Copy. Changes live only in Storybook memory. Production currently supports picking up Open Requests as the signed-in user and marking In Progress work Done. Arbitrary reassignment/status/project edits are not implemented.

## Selected first increment: saved code; priority remains separate

The saved-code plan uses fixed `LAN-n` workspace-local references allocated once, deterministic backfill and unchanged guest access. Never derive saved codes from row position or filtering. Priority still needs a decision about edit authority, defaults and how it differs from impact and readiness.

Then write the storage/action contract, authorize any migration, back up and verify staging, implement guarded workspace-scoped writes with session-derived identity, and verify reload, concurrent edits and cross-workspace isolation. No migration is part of the current visual work.

## Lifecycle decisions

Keep Open → In Progress → Done until an explicit replacement reconciles with REQUIREMENTS.md's confirmed named agreement, readiness, launch and creator-owned closure contract. Linear's Backlog/Todo/Cancelled/Duplicate are reference vocabulary, not approved Lane states. REQUIREMENTS.md §5 already places Cancelled, Stopped, Superseded and Not launched under Done completion reasons, with non-measured closure exceptions outside measured-impact totals. Preserve that decision. Decide how a duplicate links to its canonical Request without counting the same outcome twice. Closed must not reopen. Do not add a separate backlog screen.

## Menu capabilities to consider only after a product decision

| Capability | Decision required before implementation |
| --- | --- |
| Picker reassignment | Separate assignment from start; reconcile named responsibilities and guest limits |
| Project / Request type edits | Who can change saved context; concurrency and audit needs |
| Due date | Distinguish requested date from an agreed discovery/delivery commitment |
| Labels | Demonstrate a need not served by Project and Request type |
| Related / duplicate / copy | Preserve original context and impact accounting; avoid duplicate totals |
| Delete | Recovery, authorization, attachments and evidence retention |
| Favorite / reminder | User need and storage; no cron or notifications by inference |

Next review should select one bounded user-visible increment and approve its exact behaviour before implementation. Do not copy the full Linear menu as disabled or pretend-working features.


## Live toolbar inspection, 2026-10-08

Source: Linear's signed-in My issues → Assigned page in Chrome. All three controls were manually clicked through CUA. This is evidence about the inspected view, not a claim about every Linear screen.

| Control | Observed contents and behaviour | Lane preview decision |
| --- | --- | --- |
| Filter | Searchable field menu; Status opens a value submenu with checkboxes and result counts. Fields include Team, Status, Assignee, Creator, Priority, Labels, Relations, Dates, Project and others. AI/advanced filters also appear. | Retain Arc's two-step single-value Status, Project and Request type filters, title search and removable chips. Add supported result-count hints. Multi-value/advanced/AI filtering is not implied. |
| Display/sliders | List selected, Board disabled on this view. Grouping, group ordering, sub-grouping, ordering, completed recency, sub-issues and property toggles. Grouping offers No grouping, Focus, Status, Agent, Project, Priority, Cycle, Label, Team. | Use existing No grouping/Status/Project/Owner grouping, existing ordering and property toggles. Status visibility must actually hide the prefix glyph. Do not insert nonfunctional Board/sub-issue controls. |
| Panel | Opens a right-side list breakdown with Labels, Priority, Projects and Teams tabs. Priority shows counts; clicking High filters the list, and Clear Filters restores it. | Opt-in list summary for existing Status, Project and Request type data. Counts use the matching list before pagination, not the current page or selection. Clicking an active count clears that dimension. This is not Request detail or an impact report. |

The temporary High filter was cleared and the panel returned to its original Labels tab, then closed. Display preferences and Light theme were not changed.

## Extra statuses: explicit mapping before any build

| Reference or proposed state | Lane meaning and recommendation | Unresolved implementation decision |
| --- | --- | --- |
| Backlog / Todo | Both fit Open today. Keep a single Open group. | Only consider a distinction if pilot evidence shows a recurring need not served by agreement/capacity fields. No new backlog route. |
| In Progress | Work has started. Target assignment alone must not start it. | Named trio agreement, start window, readiness, permissible transitions and concurrent changes must be specified together. |
| Done / Completed | Active work ended, with a truthful completion reason. | Scope completion-reason storage/action and evidence preservation separately. No claim that impact was achieved. |
| Cancelled / Stopped / Not launched | Confirmed Done completion reasons, not extra work columns. | Who records the reason, required explanation and how creator-owned exception closure follows. |
| Duplicate / Superseded | Preserve the original record and link the canonical/replacement Request. Superseded is already a confirmed completion/closure reason. | Duplicate-link rules, self/cross-workspace/cycle prevention, authority and exclusion from duplicate impact accounting. |
| Measuring / Closed | Separate confirmed outcome lifecycle: Not started → Measuring → Closed. | Creator ownership/attributable transfer, agreed source/window, evidence, exceptions and append-only corrections. Closed never reopens. |
| Aligned / Ready / Blocked | Conditions on agreement/readiness, not profile permissions or extra board stages. | Named participant responsibilities and specific unresolved concerns. No bypass for creators/admins. |

## Remaining capability decisions

| Capability | Smallest useful proposal | Approval and verification gate |
| --- | --- | --- |
| Stable public codes | A code allocated once per workspace and retained through edits | Confirm format, collision/concurrency strategy, backfill and visibility. Explicit migration approval; codes remain stable after sorting/filtering/deletion. |
| Priority | One optional human-set field; never an impact prediction or person score | Decide edit authority, defaults, vocabulary, history and conflict behaviour. Verify guest/tenant boundaries and reload persistence. |
| Assignment / Picker | Name the person responsible without silently starting work | Reconcile target agreement/start rules and departing-member recovery first. Preserve current picker identity in avatars. |
| Saved Project/type edits | Correct classification without losing original problem/impact | Decide who edits, material-change/realignment boundary, audit and concurrent edit handling. No production in-memory imitation. |
| Due date | An agreed discovery/delivery commitment where supported by the target | Distinguish requested date from commitment; define timezone, unknown dates and amendments. No reminder scheduler by inference. |
| Multi-value filters | Several values within one existing field; OR within field and AND across fields | Approve URL semantics, All/None behaviour, chip clearing and restored navigation. Verify combinations, unavailable Projects, guests and empty results. |
| Saved display preferences | Remember personal grouping/order/visible fields | Decide browser-only vs account persistence and workspace/sign-out boundaries. No new database storage without approval. |
| More display properties | Code/priority after saved fields exist; existing submitted metadata first | Each toggle must map to an actual visible field. Keep responsive disclosure truthful; hidden pills remain available through their property/menu surface. |
| Sub-grouping / group order | Consider only if a pilot repeatedly cannot scan current grouping | Specify stable ordering, empty/collapsed groups, pagination and keyboard restoration. No second hierarchy by default. |
| Completed recency | A time filter using a real completion timestamp | Confirm whether the needed timestamp is trustworthy and define inclusive boundaries/timezone. Never substitute created/updated dates. |
| Labels | Only if Project and Request type fail a demonstrated classification need | Decide vocabulary ownership, duplication and tenancy before storage. |
| Related / copy / duplicate | Distinguish a copied draft, a duplicate disposition and an outcome follow-up | Copies must return through Intake/AI review and create Open. Follow-ups retain fresh agreement/impact ownership. Copy link must point to a stable saved Request. |
| Delete / archive | A recoverable disposition if evidence retention permits it | Explicit authorization, restore period, attachment handling and closed-record preservation. No silent hard deletion. |
| Favorites / reminders | Only after an observed retrieval or follow-up need | Decide storage and notifications separately. Cron stays banned without explicit written approval. |
| Board layout | Not part of this Requests list refinement | Separate product decision, real drag/transition semantics and keyboard alternative. Never bypass lifecycle guards. |
| AI filters / agents / cycles / teams / subscribers / time in status | Not adopted from the reference | AI/agent operations remain deferred; cycles/teams need independent product justification. No individual monitoring, rankings or time tracking. |

## Suggested review sequence

1. Finish and review this opt-in Requests/sidebar increment. Production activation needs an explicit scoped decision and normal Arc regressions; Request detail remains excluded.
2. Execute saved Request codes as selected by Nikhil's 2026-10-08 “feature first” response. Keep hosted migration/release verification separate from local implementation.
3. Return to the trio agreement contract before saved status edits. Priority remains a separate choice rather than a dependency forced into the codes build.
4. Add truthful completion reasons and creator-owned measurement/closure in separately approved increments. Preserve the permanent Closed boundary and exception accounting.
5. Reassess optional filters, saved preferences and related-record features using real usage; do not turn this table into a committed roadmap.

## Implementation handoff after a decision

- [ ] Record the chosen behaviour and affected screens in REQUIREMENTS.md and this plan; name the responsible actor and guest restrictions.
- [ ] Specify the smallest action/storage contract. Actions receive workspace context, derive identity from Clerk guards and reject stale/cross-workspace writes.
- [ ] Write a failing behaviour test for the chosen transition or persistence boundary, then implement only that increment.
- [ ] For a migration, obtain explicit written approval, take and verify an export, apply/verify on staging before production. Schema source alone is not migration evidence.
- [ ] Verify reload, concurrency, keyboard/focus recovery, responsive states, permission failures and unchanged data on failed writes. Record local versus hosted evidence separately.
- [ ] Let real design leads use the shipped increment before choosing the next phase.

Except for the selected saved-code local increment in its focused plan, this planning document authorizes none of the additional storage, statuses, routes, AI calls, cron jobs or production activation listed above.
