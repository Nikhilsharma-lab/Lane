# Product

## Register

product

## Users

Design-team practitioners — PMs, designers, and developers — at companies where design work
arrives as ad-hoc requests. They open Lane in the middle of real work: submitting a request,
checking what's on the shared board, or picking something up. They are software-literate power
users who live in keyboard-fast tools. Their job-to-be-done is simple and shared: get a design
request understood as a *problem* (not a pre-baked solution), see it on one workspace-wide board,
and move it Open → In Progress → Done. No one is here to be measured.

## Product Purpose

Lane is design-ops software built on one belief: **surveillance produces performance; support
produces truth.** It deliberately omits time tracking, "last active," and utilization metrics —
that omission is the product, not a gap. The core moment is the **intake gate**: an AI classifier
that catches solution-shaped requests and reframes them into a problem the submitter confirms
before anything is saved. Accepted requests live on a single shared board with a dead-simple
lifecycle (Open → In Progress → Done) that looks identical for every role. Success looks like a
design lead trusting the board enough to stop running a side spreadsheet — and a team that tells
the truth about its work because nothing here is watching them.

## Current Product Promise

Lane helps a team turn an unclear or solution-shaped design request into an accepted,
problem-framed **Request**, then move it transparently from Open → In Progress → Done. The
current product is Requests: auth, onboarding, the Intake gate, one shared board, request detail,
comments, invited guests, lightweight in-app notifications, members, and Profile settings. A person
can change their PM / Designer / Developer label in Profile without changing access or permissions.

PM / Designer / Developer is always a functional label, never a permission tier. Invited guests
are limited workspace members who see and discuss only their own Requests. Public or anonymous
Intake is a different, deferred product decision.

## Product Vision — not current build scope

**Outcome learning.** Lane may eventually let a requester state an expected measurable outcome,
then record what actually happened after shipping. The comparison belongs to the Request and its
retrospective, not to an individual score. Request `Done` and outcome-learning completion remain
separate: evidence can be delayed, unavailable, inconclusive, or impossible to attribute. The
requester owns the inputs; the PM label does not gate the action. PRDs may be optional supporting
context, never a universal Intake requirement. PM calibration scores, rankings, and performance
profiles are permanently refused.

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
- **Same view for everyone.** PM/Designer/Developer is a label, not a permission or UI tier. No
  role-gated dashboards, hidden actions, or per-role views. (Owner-vs-member is the only tier.)
- **The gate is the product.** Concentrate craft on the intake reframing moment; it's where Lane
  earns its belief. Everything else stays quiet so the gate can speak.
- **Pace to comprehension.** Restraint over output. One deliberate, legible thing beats five
  half-built ones. If it can't be explained in plain English, it shipped too fast.
- **Recede until needed.** Engineered minimalism, keyboard-fast. The tool is invisible until the
  user acts; nothing competes with the request on screen.

## Accessibility & Inclusion

WCAG 2.2 **AA is the floor**, pushed to **AAA where feasible** (notably text contrast on primary
surfaces). **Keyboard-first**: every action — submit, pick up, mark Done, comment, navigate the
board — must be fully operable from the keyboard with a visible focus ring (the raspberry interaction signature
already carries focus). Honor `prefers-reduced-motion` with a crossfade/instant alternative for
every animation. Don't rely on color alone to convey lifecycle state (Open/In Progress/Done need a
label or shape, not just a hue). Placeholder and muted text must still meet body-contrast targets.
