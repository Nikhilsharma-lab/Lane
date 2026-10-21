# Product

## Register

product

## Users

Product leaders and design leaders are the initial buyers; PMs, designers, and developers work
together in Lane. They need requests framed as problems, design and engineering involved before
commitment, and released work followed through to an evidenced outcome. They use specialist tools
for design, engineering, and analytics; Lane coordinates the context and decisions between them.
They should not need another set of long documents, activity logs, or individual performance scores.

## Product Purpose

Lane has two product foundations, confirmed 2026-10-06:

1. **One source of truth for the product and its journeys:** connect Requests, agreed decisions,
   design/development references, journey changes, releases and results in a shared record.
2. **Expected impact compared with actual results:** record a prediction when a Request is created,
   measure after launch in the agreed timeframe, compare and learn, then show quarterly/yearly product
   results from the same records.

Optional reviewers can look at a Request before work starts; nothing waits on their sign-off. The person who submitted the
Request owns reporting its actual results and closing it. An explicit exception may close with a reason
and is excluded from measured-impact totals. Finishing work and closing its outcome are different.
Lane supports understanding the team's product results without time tracking, utilization or individual
rankings. These are product requirements; the current build does not yet implement the complete chain.

## Current Product Promise

Lane helps a team turn an unclear or solution-shaped design request into an accepted,
problem-framed **Request**, then move it transparently from Open → In Progress → Done. The
existing application scope is Requests: auth, onboarding, the compact Intake gate (with Expected impact,
optional Project, Request type, related link and private attachments), one shared board (with an optional status filter), request detail,
comments, invited guests, lightweight in-app notifications, members, and Profile settings
(including browser-local theme preference). A person can change their PM / Designer / Developer
label in Profile without changing access or permissions.

Expected impact is implemented locally as Metric or Verified result, preserved through signed review and
shown read-only on saved Request detail; local checks passed. An unknown current value remains valid.
Launch, actual-result closure and quarterly/yearly totals remain target only.

This describes the source-level MVP, not a fresh production verification. Its existing pickup/completion
behaviour remains until an explicitly scoped increment changes it. Deployment and cutover evidence live in
`lane-roadmap.md` and the Clerk cutover plan.

PM / Designer / Developer is always a functional label, never a permission tier. Clerk is the sole
authority for users, sessions, organizations, memberships, roles, and invitations. Lane recognizes
Clerk **admin | member | guest** organization roles; invited guests are limited workspace members who
see and discuss only their own Requests. Production guest invitations require Clerk Enhanced B2B, so
free-plan production is Admin/Member only. Public or anonymous Intake is a different, deferred decision.

## Approved Product Direction — confirmed 2026-09-28; clarified 2026-10-06, not fully implemented

**The pipeline:** Request → Review (optional) → Prioritization → Discovery and design → Development → Release
→ Measurement → Closure. These are journey moments, not eight mandatory board columns. Discovery and
delivery can overlap within the planned scope; specialist work remains in existing tools.

> **2026-10-21:** Optional reviewers replace the named PM/Designer/Developer agreement gate and every
> later trio plan: readiness sign-off, realignment after changes, and Designer assignment
> (`REQUIREMENTS.md` §4.4 and the 2026-10-21 ledger entries).

- A Request may have optional **reviewers**, added while creating it or by any member before pickup. Each
  answers **Looks good** or **Raise a concern** with a reason. Reviews never block pickup: open concerns or
  unanswered reviews only ask the person picking up to confirm. Editing the Request resets every answer.
- Any member picks up an Open Request; picking up assigns it to them and starts work. There is no separate
  assignment, start window or acknowledgement step. Request-specific responsibilities are not global
  permissions derived from `profiles.role`.
- Delivery needs one primary measurable or otherwise verifiable success criterion, evidence, and a review
  window. Expected impact starts at Request creation and is preserved through measurement. Build readiness
  and release readiness are checklists for the person doing the work: they guide and never block, and
  nobody else signs off.
- Active work stays **Open → In Progress → Done**. Outcome resolution is separate. The creator closes with
  an actual result or a truthful exception; `Done` does not mean impact was measured or expectations met.
- Outcome-closed Requests cannot reopen. Further work becomes a linked **follow-up Request**, with its own
  reviewers and outcome. Before pickup, a change is an edit, which resets every review. After pickup, a
  material change before release becomes a linked replacement Request; ordinary exploration does not. Post-release work uses follow-ups even while measurement is underway.
  Factual corrections to closed records are append-only, not silent rewrites.
- Decisions, concerns, transfers, and changes remain attributable. Follow-up counts are not individual
  quality scores. PM calibration, rankings, and performance profiles remain permanently refused.
- Quarterly/yearly summaries derive from Request results, preserve outstanding measurements and show
  exceptions separately. Combine only compatible, non-overlapping measurements; do not total unrelated
  percentages or count the same product result once per contributing Request. The journey-record model
  and report-period rules remain focused design decisions.

`REQUIREMENTS.md` §§4–7 is the canonical behaviour contract, including exceptions and change boundaries.
This approval settles direction; it does not authorize building the whole pipeline, new routes/tables,
integrations, or background AI. `lane-roadmap.md` sequences separately approved increments. Keep typing
minimal and reuse existing artifacts rather than requiring duplicate PRDs, test reports, or daily logs.

## Product Vision — not current build scope

**Agentic design operations.** Lane may eventually use agents for bounded procedural work: organize
context, structure research, surface gaps and edge cases, and compose from an approved design
system. Humans retain interpretation, direction, ethics, taste, craft, and final decisions. Agent
reasoning must be inspectable and every output reviewable and overridable. This vision does not
authorize agent workflows in the current product.

## Enterprise-grade

For Lane, enterprise-grade means trustworthy operation: tenant isolation, session-derived identity,
safe membership controls, reliable auth, recoverable data, staged migrations, observable failures,
predictable performance, accessibility, complete states, controlled releases, and maintainable
boundaries. It does not automatically mean SSO, custom roles, custom workflows, integrations,
analytics suites, approval chains, or administrative surface area. Those require evidence and an
explicit product decision.

## Brand Personality

Precise, minimal, fast. The voice is a calm senior operator: confident, never chatty, never
cute. It earns trust by doing less, visibly and well. The interface should feel engineered — every
element deliberate, nothing decorative — and recede so the work (and the truth about it) is the
only thing on stage. The one place it raises its voice is the intake gate's reframing moment, which
should feel like a sharp, helpful colleague, not a wizard.

## Anti-references

- **Surveillance dashboards** (Jira-style utilization, "last active," activity graphs, scoreboards).
  This is the thing Lane exists to reject; no affordance may even hint at it.
- **Gamified PM SaaS** (streaks, badges, confetti, leaderboards, progress-pressure). Performance theater.
- **Generic AI-startup look** (purple gradients, glassmorphism, hero-metric templates, per-section
  eyebrow kickers, gradient text). The 2026 AI-slop tells.
- **Enterprise gray density** (cramped gray-on-gray, tiny text, no breathing room, joyless tooling).

## Design Principles

- **Support, not surveillance.** Never ship an affordance that measures, ranks, or times a person.
  When a feature could read as monitoring, cut it. The omission is the value.
- **Same shared view.** PM/Designer/Developer is a label, not a permission or UI tier. Clerk membership
  and Admin/Member/conditional Guest permissions define access. Named Request responsibilities define
  specific review and closure actions, not per-role dashboards or separate applications.
- **Make decisions legible.** Problem framing, reviews, readiness, and outcome closure should be clear
  without turning exploration into a stage machine or documentation exercise.
- **Pace to comprehension.** Restraint over output. One deliberate, legible thing beats five
  half-built ones. If it can't be explained in plain English, it shipped too fast.
- **Recede until needed.** Engineered minimalism, keyboard-fast. The tool is invisible until the
  user acts; nothing competes with the request on screen.

## Accessibility & Inclusion

WCAG 2.2 **AA is the floor**, pushed to **AAA where feasible** (notably text contrast on primary
surfaces). Exception (Nikhil, 2026-10-13): visual values are Supabase's tokens copied pixel-exact,
including colour pairs, outlines, badge sizes and target sizes that miss AA; see
`docs/design-system/supabase-tokens.md`. **Keyboard-first**: every action — submit, pick up, mark Done, comment, navigate the
board — must be fully operable from the keyboard with a visible focus ring (Supabase's green ring
carries focus). Honor `prefers-reduced-motion` with a crossfade/instant alternative for
every animation. Don't rely on color alone to convey lifecycle state (Open/In Progress/Done need a
label or shape, not just a hue). Placeholder and muted text must still meet body-contrast targets.
