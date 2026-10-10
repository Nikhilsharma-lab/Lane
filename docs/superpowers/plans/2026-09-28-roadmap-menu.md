# Lane — roadmap decision menu

**Snapshot: 28 September 2026. This is a decision aid, not a new product specification or build approval.**

> **Historical snapshot, superseded later on 2026-09-28:** Nikhil confirmed the inception-to-closure Request
> contract and selected trio alignment as the first increment to plan. The old ordering and the description
> of outcome learning as merely unselected below no longer govern. Use `REQUIREMENTS.md` §§4–5/15 and
> `lane-roadmap.md` §3 for current decisions. Line references and findings below belong to this earlier audit;
> subsequent documentation reconciliation may have corrected them. No implementation/release is implied.

This menu brings the current roadmap, deferred work, and longer-term ideas into one place. It does not
change `AGENTS.md`, `REQUIREMENTS.md`, `lane-roadmap.md`, or `DEFERRED.md`. Those remain authoritative.
The source references below use paths from the repository root and line numbers from this snapshot.

**Choosing an item authorizes planning that item—not implementation, deployment, purchases, new tables,
new routes, additional AI calls, or a silent expansion of scope.** Planning must resolve the user problem,
success signal, boundaries, and any required product decisions before a build is approved.

## My recommended order

1. **Finish the beta gates:** complete the live Clerk recovery/invitation checks, then prepare and verify
   the production cutover when approved. Keep the parallel auth fixes separate from feature work.
2. **Release N1 — Requests search:** the implementation already exists on an isolated branch. Review it,
   integrate it safely, verify it on staging, and obtain release approval; do not rebuild it.
3. **Choose one N2 — Intake improvement from observed friction:** watch a real person submit a Request,
   identify the specific difficulty, and improve that one moment.
4. **Let real usage choose the following increment.** A longer feature list is not evidence that Lane needs
   a larger product.

Lane's committed product is still **problem-first Intake → shared Requests → pick up → complete**, with
comments, private attachments, notifications, and workspace/profile settings. PM, Designer, and Developer
remain labels, not different permissions or dashboards.

Source: `AGENTS.md:11–28,43–68`; `lane-roadmap.md:71–84,163–169`;
`REQUIREMENTS.md:497–526`.

## How to read the status

- **Built in source** means the implementation was found in the current checkout. It does not prove that
  today's production deployment contains it or that a live user journey passed.
- **Recorded staging check** means the repository records a past staging result. This audit did not rerun
  tests, inspect service configuration, or verify deployments.
- **Candidate** means the direction is named in the roadmap, but its next bounded increment needs planning.
- **Conditional** means the stated need or trigger must be demonstrated before planning a build.
- **Future contract** preserves agreed product principles; it is not permission to implement them now.
- **Refused** means it is deliberately outside Lane's product, not a feature waiting for its turn.

## B — Beta and release gates

These make the current product safe and dependable. They are not an invitation to add more features.

### B1 — Finish sign-in, password recovery, and invitation return

**Value:** people can enter Lane and recover access without getting stranded. **Status:** Clerk recovery
fixes are local work in progress; the automatic return from the hosted invitation flow still needs a live
repeat check. **Next gate:** complete the real recovery and emailed-invitation journeys in staging; a later
manual visit to onboarding does not prove the invitation redirect worked.

Sources: `docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md:180–204`;
`REQUIREMENTS.md:398–410`.

### B2 — Complete the production Clerk cutover

**Value:** production uses the verified authentication and workspace system. **Status:** the current record
says staging is deployed and production is untouched. **Next gate:** after staging passes and production
configuration is ready, explicitly approve a verified backup, migrations, deployment, and live checks.

Sources: `lane-roadmap.md:118–127`;
`docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md:188–204`.

### B3 — Prove production workspace and attachment isolation

**Value:** a workspace cannot read another workspace's Requests or private files. **Status:** staging
checks are recorded as passed; production verification remains open. **Next gate:** verify with fresh
accounts in the production environment before real users enter that environment.

Sources: `AGENTS.md:98–99`; `lane-roadmap.md:138–141`.

### B4 — Review production invitation branding and delivery

**Value:** invitations look trustworthy and reach the intended person. **Status:** the recorded Clerk
development invitation arrived in Spam with generic development branding; older Resend success does not
verify the new Clerk flow. **Next gate:** review production sender setup and verify delivery and acceptance
before treating invitations as launch-ready.

Source: `docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md:169–189`.

### B5 — Validate the Requests loop with real design leads

**Value:** learn whether the gate improves problem framing and the board becomes part of real work.
**Status:** this is the roadmap's validation gate, not something a code review can mark complete.
**Trigger for expansion:** the four committed design leads use Lane in real work and expose a specific
unmet need. Dates and enthusiasm do not advance the phase.

Sources: `lane-roadmap.md:80–84,163–169`; `REQUIREMENTS.md:517–526`.

### B6 — Meet the payment and data-protection gates

**Value:** operate responsibly when real money or valuable pilot data is involved. **Status:** a
20–30-person free, non-commercial pilot is approved on free tiers. **Trigger:** Vercel Pro is required
before payment; Supabase Pro is required at the first-payment/data-value trigger. Point-in-time recovery
is a separate cost decision. Until managed backups exist, verify a manual export before each migration.

Sources: `AGENTS.md:81–99`; `lane-roadmap.md:128–135`.

## N — Small next-increment candidates

These are the closest options to the current product. Choose one at a time, with a specific success test.

### N1 — Requests search

**Value:** find a Request by its title or problem without scanning the list. **Status:** implemented only
in the isolated `codex/requests-search` branch, commit `45336b3`; **unmerged and unreleased** at this
snapshot. **Next step:** review and release the existing increment through the agreed gates. This is
inline Requests search, not a global command palette.

Sources: isolated branch commit `45336b3`;
`docs/superpowers/plans/2026-09-25-requests-search.md` on that branch;
`lane-roadmap.md:80–84`.

### N2 — Improve one difficult Intake/gate moment

**Value:** make Lane's main differentiator easier to understand and use. **Status:** Phase 1 priority;
the multi-step form, optional evidence, private attachments, and session-draft recovery already exist.
**Trigger:** observe a concrete difficulty, then scope one improvement rather than restarting the whole form.

Sources: `lane-roadmap.md:80–84`; `REQUIREMENTS.md:412–419`;
`src/app/(app)/intake/intake-form.tsx:94–98,527–578,1583–1683`.

### N3 — Command palette and keyboard navigation

**Value:** move around or invoke frequent actions quickly from the keyboard. **Status:** a named later
increment, not built by N1. **Planning decision:** choose the smallest useful action set and keyboard
behaviour; do not make it a shortcut to unapproved features.

Sources: `lane-roadmap.md:80–84`; `conventions-plan.md:228–236`.

### N4 — Saved filters

**Value:** return to a useful Requests view without setting it up repeatedly. **Status:** named in
Phase 1; the basic status URL filter already exists. **Planning decisions:** what can be saved, who owns
it, and whether persistence is needed. New storage is not approved merely by selecting this item.

Sources: `lane-roadmap.md:80–84`;
`src/app/(app)/request-status-filter.tsx:22–65`.

### N5 — Refine Request detail

**Value:** make the problem, context, discussion, and next action easier to scan. **Status:** detail and
list-context viewing already exist in source; this is refinement, not a missing screen. **Trigger:** a
specific comprehension, accessibility, or interaction problem observed in the current layout.

Sources: `lane-roadmap.md:80–84`; `conventions-plan.md:214–224`;
`src/app/(app)/requests-workspace.tsx:1130–1158`.

### N6 — Broader/global search

**Value:** find information across more than the current Requests list, if that becomes necessary.
**Status:** separately named later-tier possibility; not authorized by inline search. **Trigger:** enough
content and repeated user need to justify defining a wider search scope.

Source: `conventions-plan.md:228–236`.

## L — Later improvements, with explicit triggers

- **L1 — Load more Requests.** Value: keep older work reachable at scale. Status: deferred, not a beta
  blocker. Trigger: roughly 120 active Requests in a workspace or the first enterprise-scale customer.
  Sources: `DEFERRED.md:47–58`; current query cap at
  `src/app/(app)/requests-workspace.tsx:1022–1044`.
- **L2 — Instant pickup/completion feedback.** Value: make lifecycle actions feel faster while preserving
  rollback on failure. Status: deferred. Trigger: transitions still feel slow after Tokyo co-location.
  Source: `DEFERRED.md:27–32`.
- **L3 — Clean up assignments after Guest demotion.** Value: avoid work remaining assigned to someone
  who can no longer act on it. Status: deferred. Trigger: real use exposes the problem. The existing
  claim that owners can manually reassign needs correction; see the appendix.
  Source: `DEFERRED.md:147–152`.
- **L4 — Offer Guest invitations in production.** Value: let invited external requesters see only their
  own Requests. Status: access restrictions are implemented, but production custom roles require Clerk
  Enhanced B2B. Trigger: explicit plan/cost approval, then live verification.
  Source: `AGENTS.md:26`.
- **L5 — Load more comments.** Value: keep long discussions usable if they occur. Status: no separately
  approved feature; the deferred entry records a security requirement. Trigger: a standalone comment
  fetch or pagination is justified; it must check workspace ownership itself.
  Source: `DEFERRED.md:163–169`.
- **L6 — Archive or snooze notifications.** Value: reduce clutter when notification lists become
  unwieldy. Status: deferred. Trigger: actual volume demonstrates the need; data changes and any
  scheduling mechanism require separate approval.
  Source: `DEFERRED.md:217–225`.
- **L7 — Request-activity email and email preferences.** Value: reach people who repeatedly miss
  actionable in-app activity. Status: deferred. Trigger: real pilot evidence of missed activity;
  preferences follow only if activity emails exist.
  Source: `DEFERRED.md:238–247`.
- **L8 — Notification tabs and filters.** Value: make a busy list easier to scan. Status: deferred.
  Trigger: a meaningful second category or demonstrated scanning difficulty. This does not authorize
  a watch-all-activity subscription system.
  Source: `DEFERRED.md:249–257`.
- **L9 — Load more notifications.** Value: avoid losing access to older notifications. Status: currently
  capped at 30. Trigger: teams regularly hit that cap.
  Sources: `DEFERRED.md:259–262`; `src/app/(app)/notifications/actions.ts:7–34`.
- **L10 — A dedicated notification inbox.** Value: read activity alongside its Request when a popover
  no longer works well. Status: conditional reassessment, not an approved route. Trigger: demonstrated
  need for coexisting detail or controls that need more room; the old prerequisite text is stale.
  Source: `DEFERRED.md:264–274`.
- **L11 — Public/anonymous Intake.** Value: accept Requests from people without an invited membership.
  Status: separate from the existing Guest experience and deferred. Trigger: an explicit product decision
  to accept non-invited submissions, followed by a security and abuse-control plan.
  Source: `DEFERRED.md:293–299`.
- **L12 — Reserved workspace names in URLs.** Value: prevent routing collisions. Status: unnecessary
  in the current URL structure. Trigger: workspace slugs become part of routing.
  Source: `DEFERRED.md:306–313`.
- **L13 — Favorites, archives, exports, and additional preferences.** Value: small conveniences for
  repeated real-work needs. Status: usage-pulled, not a committed bundle. Trigger: select the single
  convenience supported by observed use.
  Source: `lane-roadmap.md:157–161`.
- **L14 — Activity history, undo-friendly deletion, and rollout flags.** Value: possible support for
  understanding changes, recovery, or controlled releases. Status: reference/architecture ideas, not
  current build authority. Trigger: a named need and explicit approval; audit-history UI is specifically
  outside the MVP.
  Sources: `lane-roadmap.md:20–23,175–188`; `conventions-plan.md:252`.

## H — Longer-term hypotheses, not promised apps

Requests is the only committed product. These ideas stay visible so they are not forgotten, but selecting
one starts discovery and planning—not an automatic expansion of Lane.

- **H1 — Ideas.** Possible value: capture something lighter than a Request. Status: unselected hypothesis.
  Decision: prove that lighter capture solves a distinct problem rather than creating a second inbox.
- **H2 — Docs.** Possible value: keep problem context near the work. Status: unselected hypothesis.
  Decision: prove teams need documents inside Lane instead of links to their existing tools.
- **H3 — Problem-pattern insights.** Possible value: learn which problems recur and where process friction
  clusters. Status: unselected hypothesis. Decision: define useful workspace-level signals without
  measuring or ranking people.
- **H4 — Outcome learning.** Possible value: compare an expected outcome with what actually happened.
  Status: a future contract exists, but implementation is gated. Decisions: exact impact fields,
  prediction timing/amendments, evidence rules, and a named first increment. Work being Done stays
  separate from outcome closure; the creator closes the outcome, including truthful exceptions.
- **H5 — Nonlinear design work and release context.** Possible value: connect artifacts, decisions, and
  release information without requiring a diary. Status: future contract/proposed boundaries.
  Decisions: what Lane owns at handoff and what remains in Figma, engineering tools, or other sources.
- **H6 — One bounded design-operations agent.** Possible value: organize supplied context, structure
  research, identify gaps, or prepare a reviewable draft. Status: vision only; no AI beyond the Intake
  gate is currently authorized. Decisions: the first task, inputs, provenance, quality/failure checks,
  human confirmation, and a measurable value test.
- **H7 — Whole customer journeys across related Requests.** Possible value: preserve end-to-end context
  while keeping work independently understandable. Status: proposed. Decisions: the independently
  measurable Request rule and the lightest useful relationship between Requests—not an epic hierarchy.
- **H8 — More than one Lane app.** Possible value: navigation between separately validated products.
  Status: an architectural option only. Trigger: a second app earns its place; do not display empty
  suite navigation to imply a larger product.

Sources: `lane-roadmap.md:50–65`; `REQUIREMENTS.md:161–193,195–280,284–367,371–392,566–589`.

### Other parked territory

For completeness, `AGENTS.md:72–79` also parks the following until a paying customer asks and a specific
scope decision changes the ban. They are not recommendations or scheduled work:

- **H9 — Integrations:** Figma and other external-tool integrations. Possible value must be established
  from an actual handoff/context problem, not integration count.
- **H10 — Scheduled communication/automation:** morning briefings, weekly digests, and cron jobs.
  Possible value must outweigh noise and maintenance; a customer request does not itself approve a job.
- **H11 — Additional planning surfaces:** radar, stickies, initiatives, reflections, published views,
  multi-workspace, and the older Year-2 PM / Year-3 Research directions. Their distinct user need remains
  unproven; permanently refused hierarchy and surveillance patterns remain excluded.
- **H12 — Additional process machinery:** prediction confidence, handoff briefs, iteration summaries,
  design-stage/phase/track models, and extra functional-role tag storage. These are not implied by the
  future outcome contract and must not be added as speculative infrastructure.

Impact prediction and design-ROI/Insights also appear in this ban; H3/H4 do not override it. PM calibration
scores and rankings are not merely parked—they are permanently refused below.

## R — Firm exclusions, not selectable backlog

- **R1 — Individual surveillance:** time tracking, last-active/presence, utilization, keystroke/activity
  monitoring, and managerial behaviour histories. Lane supports people; it does not monitor them.
- **R2 — Individual performance scoring:** PM calibration, designer/developer effectiveness rankings,
  individual speed/throughput/accuracy scores, and role comparisons. Outcomes belong to Requests,
  not scorecards about people.
- **R3 — Throughput-management machinery:** cycles/sprints, modules, story points/estimates,
  burndown/velocity, initiatives → epics → cycles, and per-project custom workflow states. The deliberately
  simple Open → In Progress → Done lifecycle is a product choice.
- **R4 — Watch-all-activity subscriptions:** a system for observing everything another Request or person
  does. The current `@mentions + subscriber model` entry refuses the combined pattern; whether a much
  narrower direct-mention notification could ever be useful is unresolved, not approved.

Sources: `AGENTS.md:8–9,79`; `lane-roadmap.md:38–46,199–200`;
`REQUIREMENTS.md:371–392`; `DEFERRED.md:227–236`.

## How to choose

Reply with an ID and the difficulty you want it to solve—for example:

> Plan N4. I keep returning to the same filtered Requests view and want to save it.

The next deliverable is then a small problem statement, success test, boundaries, required decisions,
and a reviewable design/implementation plan. A selection is not permission to ship to production or
quietly add the surrounding features in this menu.

## Appendix — stale or conflicting records found

These findings are recorded here so the menu does not turn old notes into new work. Canonical documents
were deliberately left unchanged during this audit.

1. **Auth is described too broadly as shipped.** `REQUIREMENTS.md:88–101` calls the current product
   shipped, but the cutover record still leaves hosted invitation return and production verification
   open. Recovery changes are local work. Use the detailed release evidence, not the headline.
2. **Request peek is no longer wholly unbuilt.** `DEFERRED.md:198–210` says it is deliberately absent;
   `src/app/(app)/requests-workspace.tsx:1130–1158` already renders list and selected detail together.
   This also weakens the old notification-inbox rationale at `DEFERRED.md:264–274`; it does not
   automatically approve an inbox route.
3. **Profile has conflicting status in one document.** `conventions-plan.md:184` says unimplemented,
   while `:242–244` says shipped. Role and theme controls exist in
   `src/app/(app)/settings/profile/page.tsx:29–50`.
4. **Auth-form deduplication is a legacy entry.** `DEFERRED.md:303–304` describes the old duplicated
   forms and a hypothetical third password-reset screen. It is not a current Clerk implementation plan.
5. **Old invitation behaviour must not recreate local plumbing.** Copy-link fallback and old delivery
   wording at `REQUIREMENTS.md:423–426` / `conventions-plan.md:242–243` need reconciliation with
   Clerk ownership. Current Members renders `OrganizationProfile` at
   `src/app/(app)/settings/members/page.tsx:24–34`.
6. **Manual reassignment is asserted but not found in the inspected actions.** `DEFERRED.md:150–151`
   says an owner can manually reassign after Guest demotion. Current
   `src/app/(app)/requests/[id]/actions.ts` exports pickup (`:15`), completion (`:69`), commenting
   (`:131`), and attachment download (`:188`), not reassignment.
7. **Static backlog counts are stale.** `AGENTS.md:104`, `lane-roadmap.md:95`, and
   `lane-roadmap.md:150–153` mix old counts with resolved, superseded, and trigger-deferred items.
   They should not be read as a literal number of features still to build.
8. **“Add soft-delete schema now” conflicts with the approval rule.**
   `lane-roadmap.md:181–182` says adopt early, while `AGENTS.md:55` requires explicit table/schema
   scope decisions and `lane-roadmap.md:161` makes archives usage-pulled. Do not pre-build it.
9. **An old two-tier permissions sentence is stale.** `PRODUCT.md:90` says owner-versus-member is the
   only tier; `PRODUCT.md:37–41` and `AGENTS.md:58` define Clerk admin/member/guest, separately from
   PM/Designer/Developer labels.
10. **Some settings inventory exceeds the current screen list.** `phase-0-ux-skeleton.md:70` and
    `conventions-plan.md:178` mention workspace/general settings. The current whitelist at
    `AGENTS.md:17–28` does not authorize additional settings screens by implication.
11. **Draft recovery already exists.** The ADOPT bucket at `lane-roadmap.md:20–23` is not evidence
    that Drafts are missing. Scoped session restoration exists at
    `src/app/(app)/intake/intake-form.tsx:527–578`; server-saved or cross-device drafts are a separate
    unapproved capability.
12. **Historical infrastructure success is not current Clerk production proof.** Old Supabase/Resend
    checks and source paths remain in the ledgers. `lane-roadmap.md:125–127` explicitly says they
    do not satisfy the Clerk release gate. `DEFERRED.md:75–80` also already closes the old triage-secret
    provisioning residue despite the roadmap's older reference to it.
13. **The mention/subscriber refusal has mixed wording.** `DEFERRED.md:227–236` says “not a backlog
    item” and also supplies a narrow revisit condition. Keep watch-all subscriptions refused; any
    direct-mention proposal needs its own decision rather than being treated as approved backlog.

### Audit boundary

This snapshot read the current canonical documents and relevant source. It did not change them, read
environment secrets, run tests, inspect live accounts, or make external changes. Search branch existence
and commit contents were inspected read-only. Deployment claims above are explicitly repository-recorded,
not newly verified live results.
