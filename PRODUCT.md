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
board — must be fully operable from the keyboard with a visible focus ring (the evergreen signature
already carries focus). Honor `prefers-reduced-motion` with a crossfade/instant alternative for
every animation. Don't rely on color alone to convey lifecycle state (Open/In Progress/Done need a
label or shape, not just a hue). Placeholder and muted text must still meet body-contrast targets.
