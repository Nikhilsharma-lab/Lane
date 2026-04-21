# Lane — Onboarding Spec

Standalone companion to `docs/nav-spec.md` and `CLAUDE.md`. Claude Code reads this whenever building onboarding, empty states, or progressive disclosure moments. If this file and a prompt disagree, this file wins. If this file and `CLAUDE.md` disagree on vocabulary, `CLAUDE.md` wins — this spec is aligned.

**Philosophy anchors:**
- Teach **one concept** in the first 60 seconds, not four. The one concept is **Requests moving through four phases**.
- Philosophy is taught **in context**, not in tours. Every claim is embedded in the moment the product enforces it.
- **Inline empty states** only. No tour libraries (Intro.js, Shepherd, Driver.js are banned).
- The **sidebar is part of onboarding.** Fewer items = faster mental model formation.
- **Respect the user.** Design leaders have been doing this for years. They don't need hand-holding.

---

## 1. Canonical vocabulary

See `nav-spec.md` section 1 for the full table. This spec uses the same vocabulary and never introduces new terms.

Key terms used in onboarding copy:
- **Request** (not Stream, not Ticket) — the primary unit
- **Predesign, Design, Build, Track** — the four phases
- **Sense, Frame, Diverge, Converge, Prove** — the five design stages
- **Intake** — where Requests land before they become work
- **intake check** — the AI pre-check on submissions
- **Prove** — the three-sign-off quality gate (also the fifth design stage)
- **Commitments** — what a team committed to this cycle
- **Ideas** — the upstream pool
- **Reflection** — the designer's own written thinking
- **weekly digest** — the Friday AI summary

### Banned words

Never use in any onboarding copy: ticket, issue, task, epic, sprint, backlog, kanban, bet, betting, gate (suffix), queue (suffix), stream (as a noun for the work unit), journey, adventure, magic, experience (as a noun), "let's," exclamation marks in body copy.

**Sentence case always.**

---

## 2. Arrival model (v1)

**First 90 days:** waitlist + manual approval. Public landing page has a "Request access" form. Approved users receive an email invitation to create their workspace. This keeps early users close to the ICP and creates a direct feedback loop.

**After 90 days or 50 paying customers:** hybrid — self-serve for small teams, demo-first for orgs with 10+ seats.

---

## 3. Three personas, three variants

| Persona | How they arrive | Role | Onboarding variant |
|---|---|---|---|
| **Design Head** | Approved from waitlist, creates workspace | `owner` | Full flow (4 screens + sample team option) |
| **Designer** | Invite link from a Design Head | `member` + team role `designer` | Lightweight (2 screens) |
| **PM** | Invite link from a Design Head | `member` + team role `pm` | Lightweight (2 screens) + intake check beat on first submission |

### Persona detection

`lib/onboarding/detect-persona.ts`:

```ts
export type OnboardingVariant = 'design_head' | 'designer' | 'pm';

export function detectOnboardingVariant(
  userId: string,
  workspaceId: string
): OnboardingVariant {
  const wm = getWorkspaceMember(userId, workspaceId);
  if (wm.role === 'owner' || wm.role === 'admin') return 'design_head';
  const tm = getFirstTeamMembership(userId, workspaceId);
  if (tm?.role === 'pm') return 'pm';
  return 'designer';
}
```

Ambiguous cases default to `designer` — the lightest variant.

### Completion tracking

```sql
-- Already in nav-spec section 4
-- workspace_members.onboarded_at timestamptz
```

Null means onboarding hasn't completed. Set to `now()` when finished or dismissed. Never run onboarding twice for the same user in the same workspace.

---

## 4. Design Head flow — full, 4 screens

Triggered when a user with `workspace_members.role IN ('owner', 'admin')` and `onboarded_at IS NULL` lands in their workspace.

### Screen 1 — Welcome (~10 seconds)

Full-screen takeover. Centered. Sidebar hidden.

**Visual:** Lane wordmark, small, top of screen.

**Heading:**
> Welcome, {first_name}. You're in.

**Subhead:**
> Design work has its own rhythm. Lane is built for it.

**Primary button:** `Show me around`
**Secondary link (smaller, muted):** `Skip — I'll explore on my own`

Skip is real. Respect it.

**If skip:** set `onboarded_at = now()`, drop on Home with the Screen 4 "What's next" card pinned.
**If primary:** Screen 2.

**Events:** `onboarding.welcome.shown` (persona), `onboarding.welcome.action` (persona, `tour | skip`).

### Screen 2 — How Requests move (~25 seconds)

Full-screen. Sidebar still hidden.

**Visual:** horizontal sequence of four labeled pills connected by thin lines — **Predesign → Design → Build → Track**. A small dot ("a Request") animates slowly along the path, pausing on each pill before moving on. Loops. One piece of motion in the whole product — keep it quiet.

Below the four phases, a secondary row of smaller pills shows the five Design stages (Sense, Frame, Diverge, Converge, Prove) as a subtle expansion of the second pill — suggesting "Design is where the non-linear work happens."

[TODO: animation implementation. Recommendation: pure CSS keyframes on an SVG. Framer Motion fine if already in stack.]

**Heading:**
> Design work lives in Requests.

**Body (two short paragraphs):**
> A Request starts when someone describes a problem. It moves through Predesign, Design, Build, and Track — but not in straight lines pretending to be certainty. Inside the Design phase, the work is non-linear: Sense, Frame, Diverge, Converge, Prove.
>
> You don't estimate a Request. You give it an appetite, shape it, let it breathe, and ship it when it's ready.

**Primary button:** `Got it`

**Events:** `onboarding.phase_model.shown`, `onboarding.phase_model.completed` (persona, `seconds_on_screen`).

**Discipline:** this is the only screen in the entire product that explains what a Request is and how it moves. After this, the word is used without definition everywhere else. Do not repeat this explanation in tooltips, help text, or empty states. Teach once, use forever.

### Screen 3 — Sample team or start real (~15 seconds)

Full-screen.

**Heading:**
> Want to poke around first?

**Body:**
> We can load a sample team — Consumer app, four Requests in different phases, a few fake teammates. Explore without commitment. Clear the sample when you're ready to start for real.

**Card 1 (recommended, 2px `--color-border-info` border, "Recommended" badge):**
- Label: `Start with a sample team`
- Subtext: `Realistic data, zero commitment. Clear it anytime.`
- Button: `Load sample`

**Card 2:**
- Label: `Create my real team`
- Subtext: `Skip the sample. Jump straight in.`
- Button: `Create team`

**If sample:** run `scripts/seed-sample-team.ts`. Creates a team named `Consumer app`, four Requests in design stages `sense`, `frame`, `diverge`, `converge` (one each), three fake members named Alex Rivera, Riya Patel, Sam Torres. Every seeded row gets `is_sample: true` for later cleanup.

**If real:** open the team creation modal from `nav-spec.md` section 15 inline.

**Events:** `onboarding.sample_choice.shown`, `onboarding.sample_choice.action` (persona, `sample | real`).

### Screen 4 — First-action prompt (~15 seconds)

Sidebar now visible for the first time. Home selected. A dismissible card sits at the top of Home.

**Card heading:** `Your first move`

**Card body:** `Submit a Request to your team's Intake. That's how work enters Lane.`

**Primary button:** `Submit first request` → opens the intake form, pre-scoped to the user's team
**Secondary link:** `Show me the sidebar instead` → dismisses the card, triggers a 2-second subtle pulse on the team section
**Dismiss (×):** closes the card, sets `onboarded_at = now()`

**Events:** `onboarding.first_action.shown`, `onboarding.first_action.action` (persona, `submit | sidebar | dismiss`).

### Sample data banner and clear flow

If the user chose sample, a persistent banner sits at the top of Home until cleared:

> You're exploring with sample data. [Clear sample and start for real]

**Clear modal:**
- **Heading:** `Clear sample data?`
- **Body:** `This deletes the sample team, its Requests, and the fake members. Anything you created yourself stays.`
- **Primary:** `Clear sample`
- **Secondary:** `Cancel`

On confirm: delete all rows where `is_sample = true`. If the user never created their own team, open the team creation modal immediately after.

**Event:** `onboarding.sample_cleared` (`days_since_onboarded`).

---

## 5. Designer flow — lightweight, 2 screens

Triggered when a user with `team_memberships.role != 'pm'` and `onboarded_at IS NULL` clicks an invite link.

### Screen 1 — Welcome

Full-screen. Sidebar hidden.

**Heading:**
> {inviter_first_name} added you to {workspace_name}.

**Subhead:**
> You're a designer on {team_name}. Lane will get you to your first Request in a moment.

**Primary button:** `Continue`

No philosophy reveal. Trust the inviter.

**Events:** `onboarding.designer_welcome.shown`, `onboarding.designer_welcome.completed` (`inviter_id`, `team_id`).

### Screen 2 — Land on first Request or waiting state

Does the user have any Requests assigned to them (`requests.designer_owner_id = user.id`)?

**If yes:** drop them on the most recently updated assigned Request's detail page. Inline card at the top:

> Welcome to Lane. This is your first Request — you're the designer owner. You'll move it through the Design phase at your own pace: Sense, Frame, Diverge, Converge, Prove. Hover any stage name to see what it means.

Dismissible. Sets `onboarded_at = now()` on dismiss.

**If no:** drop on Home with a card:

> You don't have any Requests yet. Your team lead will assign one soon. In the meantime, explore the sidebar — your team's work lives in {team_name}.

No button. Sets `onboarded_at = now()` on dismiss.

**Event:** `onboarding.designer_first_request.shown` (`state: assigned | waiting`).

---

## 6. PM flow — lightweight + intake check beat

### Screen 1 — Welcome

**Heading:**
> {inviter_first_name} added you to {workspace_name}.

**Subhead:**
> You're a PM on {team_name}. In Lane, PMs submit design work by describing problems — not proposing solutions. More on that in a second.

That second sentence is deliberate foreshadowing for the intake check.

**Primary button:** `Continue`

**Events:** `onboarding.pm_welcome.shown`, `onboarding.pm_welcome.completed`.

### Screen 2 — Land on Intake

Drop them on their team's Intake with a card:

> This is {team_name}'s Intake. Requests you submit here get shaped into design work. Ready to try it?

**Button:** `Submit your first request` → opens the intake form
Dismissible. Sets `onboarded_at = now()` on dismiss or first submission.

---

## 7. The intake check — the killer onboarding beat

Applies to everyone, not just PMs. Aligns exactly to `CLAUDE.md` Part 2 Stage 1 classifier (problem_framed / solution_specific / hybrid).

### Trigger

When any user submits a Request, the problem statement is sent to the Anthropic Claude API with a classifier prompt returning one of three values.

### Classifier prompt

```
You are the Intake Gate for Lane, a design operations tool. Evaluate the
following Request and classify it as exactly one of: problem_framed,
solution_specific, hybrid.

problem_framed: describes user behavior, a business gap, or a pain point
without prescribing a solution. References data, metrics, research, or
asks "why" something is happening.
Examples: "Users abandon at step 3 of onboarding" / "40% of merchants
can't find the refund button"

solution_specific: proposes a UI element, implementation, or fix without
problem context. Contains phrases like "add a button," "make it like
Stripe," "change the color." No user problem or business metric
mentioned.
Examples: "Build a date picker" / "Add a toggle to settings"

hybrid: contains both a problem AND a proposed solution. The problem
should be extracted and the solution flagged for reframing.
Examples: "Users can't pick dates easily, so build a date picker"

Respond with only the classification word. No explanation.

Request: {request_text}
```

Use `claude-haiku-4-5-20251001` for cost and speed. Check runs on blur from the problem field or on submit.

### If problem_framed

No warning. Submission proceeds. Affirming toast:

> Nice framing. Sent to {team_name}'s Intake.

### If solution_specific

Submit does not commit. Inline amber panel below the problem field using `--color-background-warning` and `--color-text-warning`:

**Panel heading:** `This looks like a solution, not a problem.`

**Panel body:**
> Lane works best when designers understand the WHY before the WHAT. When you submit "build a date picker," you've already decided the answer. The design team wants to know what users are struggling with so we can figure out the right fix together.
>
> **Try reframing:** instead of *"build a date picker,"* try *"users can't tell what date format the form expects, and 40% enter it wrong on first try."*
>
> What's the underlying problem you're seeing?

**Three buttons:**
- Primary: `Accept AI rewrite` (if AI extracted a problem) — inserts the AI's reframing into the problem field
- Secondary: `Let me reframe` — keeps form open, focuses problem field
- Tertiary (muted): `Submit anyway with justification` — opens a small text field for the user to explain why, then submits with `requests.ai_flagged = 'solution_specific'`

The escape hatch matters and is specified in `CLAUDE.md` Part 2: "Submit anyway with justification." Lane's AI is a collaborator, not a gatekeeper. The flag lets the triager make the final call.

### If hybrid

**Panel heading:** `We found a problem inside a solution.`

**Panel body:**
> You described both the problem and a proposed fix. Lane will keep the problem and set the solution aside — the design team will explore solutions after they understand the problem.
>
> **Problem we extracted:** "{ai_extracted_problem}"
> **Solution you proposed:** "{ai_extracted_solution}" (flagged for designer reference)
>
> Submit with just the problem, or edit if we got it wrong.

**Buttons:**
- Primary: `Submit with extracted problem`
- Secondary: `Let me edit`
- Tertiary: `Submit anyway with justification`

### Schema additions (per CLAUDE.md — already aligned)

```sql
alter table requests add column ai_flagged text;
alter table requests add column ai_classifier_result text;
alter table requests add column ai_extracted_problem text;
alter table requests add column ai_extracted_solution text;
-- Note: intake_justification column already exists (added in prior work).
-- Spec originally named this submit_justification; codebase uses intake_justification.
-- The two refer to the same field — justification text the user provides when
-- submitting a flagged request anyway.
```

### Events

- `intake_check.submission_attempted` (`classifier_result`, persona)
- `intake_check.ai_rewrite_accepted` (persona)
- `intake_check.reframed` (`original_classification`, persona)
- `intake_check.submitted_anyway` (`classification`, persona, `justification_length`)

Healthy ratio: most flagged submissions get reframed or AI-rewritten. Unhealthy: most get bypassed (warning too weak) or abandoned (warning too strong). Track weekly.

---

## 8. Progressive disclosure — concepts taught in context

None of these trigger on a timer. Each is triggered by user action.

### Design stages — hover tooltips on Request detail

Stage indicator at the top of every Request has hover tooltips:

- **Sense:** `Deep understanding before proposing anything. Related research, past decisions, nothing rushed.`
- **Frame:** `Define what problem is actually being solved. Success criteria, constraints, open questions.`
- **Diverge:** `Generate multiple solution directions. Breadth over depth. 2-5+ iterations.`
- **Converge:** `Narrow to a refined solution through critique and iteration.`
- **Prove:** `Three-sign-off validation before handoff: designer, PM, design lead.`

Tooltips appear only until `workspace_members.requests_opened_count >= 5`. After that, they become noise.

### Prove — first-time modal on Converge → Prove advance

User clicks the stage advance button. Modal appears:

**Heading:** `Prove`

**Body:**
> Before a Request moves from Converge to Prove, it needs three sign-offs: you (the designer), the PM, and the design lead. This is Lane's one deliberate slow-down — the place where non-linear work becomes intentional.
>
> Ready to request sign-off from all three?

**Primary:** `Request sign-off`
**Secondary:** `Not ready yet`

First-time only. Tracked on `workspace_members.prove_gates_passed`. After 1, becomes a quieter confirmation.

### Reflection — taught on first Request detail visit for the designer owner

When a designer opens a Request they own for the first time, an inline hint appears above the reflection field:

> **Reflections are your own thinking, in your own words.**
> Share what you're working through, what's stuck, what surprised you. Not a status update — just notes from inside the work. Your team sees them; leads see health signals, not individual entries.

Dismissible. Tracked on `workspace_members.reflection_hint_seen`.

### Ideas — empty state on first visit

**Heading:** `Ideas go here before they become work.`

**Body:**
> Ideas is upstream of Intake. Anyone can post a thought — "users keep asking about X," "what if we redesigned Y," "we should probably fix Z." No shaping, no commitments, no stages. Just ideas.
>
> Ideas that gather signal — votes, AI validation — can be promoted to Requests by a PM or design lead. Most ideas never get promoted, and that's the point. Ideas is where possibilities come to be tested cheaply.

**Button:** `Post an idea`

### Commitments — empty state on first visit

**Heading:** `What this team committed to this cycle.`

**Body:**
> Active requests shows everything in progress. Commitments is different — it's what this team deliberately picked to run in the current cycle. Usually set during a planning meeting.
>
> Nothing's committed yet. When your team picks what to work on next, it shows up here.

No button. Auto-dismisses once the team has committed Requests.

### Weekly digest — Friday email via Resend

Triggered for any user with `workspace_members.role IN ('owner', 'admin')` and at least 7 days of workspace activity.

**Subject:** `Your first weekly digest is ready — {workspace_name}`

**Body:**
> Every Friday, Lane looks at the week's activity across your teams and writes you a briefing: what moved, what stalled, who's blocked, where predictions held up and where they didn't. No dashboards to configure. No filters to set. Just the read.
>
> Your first digest is ready.
>
> [Open in Lane]

First digest opens in-app with an inline header:

> This is your weekly Lane digest. You'll get one every Friday. You can turn them off in Settings, but most design leads keep them because they're the one thing that shows up without being asked for.

Subsequent digests: no preamble. Tracked on `workspace_members.weekly_digests_received`.

---

## 9. Copy voice — tests every string must pass

1. **Direct, not cute.** "Your first move" beats "Let's get started." No exclamation marks. No emoji.
2. **Sentences with verbs.** "Submit a Request" beats "Request submission."
3. **One-sentence why.** If a rationale takes more than one sentence, the rationale is weak.
4. **Treats the user as a professional.** No cheerleading.
5. **No brand voice in friction copy.** When the intake check rejects a submission, be clear and helpful, not witty.
6. **Sentence case always.**
7. **Banned words** from section 1.
8. **Capitalization:** Request, Intake, Prove, Commitments, Ideas, Reflection, Team — capitalized when referring to Lane concepts.

---

## 10. Instrumentation — non-negotiable for v1

```sql
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  event_name text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index analytics_events_user_time on analytics_events (user_id, created_at desc);
create index analytics_events_name_time on analytics_events (event_name, created_at desc);
```

### Events

| Event | Key properties |
|---|---|
| `onboarding.welcome.shown` | persona |
| `onboarding.welcome.action` | persona, action |
| `onboarding.phase_model.shown` | persona |
| `onboarding.phase_model.completed` | persona, seconds_on_screen |
| `onboarding.sample_choice.shown` | persona |
| `onboarding.sample_choice.action` | persona, action |
| `onboarding.first_action.shown` | persona |
| `onboarding.first_action.action` | persona, action |
| `onboarding.sample_cleared` | days_since_onboarded |
| `onboarding.designer_welcome.shown` | inviter_id, team_id |
| `onboarding.designer_welcome.completed` | inviter_id, team_id |
| `onboarding.designer_first_request.shown` | state |
| `onboarding.pm_welcome.shown` | inviter_id, team_id |
| `onboarding.pm_welcome.completed` | inviter_id, team_id |
| `intake_check.submission_attempted` | classifier_result, persona |
| `intake_check.ai_rewrite_accepted` | persona |
| `intake_check.reframed` | original_classification, persona |
| `intake_check.submitted_anyway` | classification, persona |
| `progressive.stage_tooltip_hovered` | stage_name, requests_opened_count |
| `progressive.prove_modal_shown` | first_time |
| `progressive.reflection_hint_seen` | |
| `progressive.ideas_empty_state_shown` | |
| `progressive.commitments_empty_state_shown` | team_id |
| `progressive.weekly_digest_opened` | digest_number |

### Key funnels to watch post-launch

1. **Design Head funnel:** welcome.shown → phase_model.completed → sample_choice.action → first_action.action
2. **Intake check health:** ratio of solution_specific flags → reframed / ai_rewrite_accepted vs. submitted_anyway
3. **Designer time-to-first-reflection:** designer_welcome.completed → first reflection entry
4. **Weekly digest stickiness:** percent of Design Heads opening the digest each Friday

---

## 11. Build order

1. Schema additions: `onboarded_at`, `ai_flagged`, `ai_classifier_result`, `ai_extracted_problem`, `ai_extracted_solution`, `intake_justification` (already exists), `analytics_events` table, tracking columns
2. `lib/onboarding/detect-persona.ts` + unit tests per persona
3. `lib/analytics/track.ts` — single `track(eventName, properties)` function
4. Persona-routing logic on first login
5. Design Head variant — Screens 1-4 in `components/onboarding/design-head/`
6. `scripts/seed-sample-team.ts` with `is_sample: true` on every row
7. Sample banner and clear flow
8. Designer variant — 2 screens in `components/onboarding/designer/`
9. PM variant — 2 screens in `components/onboarding/pm/`
10. Intake check: API call, classifier prompt, three panel UIs (problem_framed, solution_specific, hybrid), escape buttons, `ai_flagged` writes
11. Progressive disclosure: stage tooltips, Prove first-time modal, Reflection hint, Ideas empty state, Commitments empty state
12. Weekly digest email via Resend + first-time header
13. Verify every event in section 10 fires

### Non-negotiables

- No tour libraries. Inline empty states only.
- No concepts or features not in this spec or `CLAUDE.md`.
- No renaming anything in section 1 or `nav-spec.md` section 1. Vocabulary is locked.
- No skipping analytics wiring.
- No triggering onboarding twice for the same user in the same workspace.
- No modifying the Home page layout from `nav-spec.md`.

---

## 12. Out of scope for v1

- Three fully custom persona flows with equal depth (v2 deepens whichever the data picks)
- Video onboarding
- Tour libraries (Intro.js, Shepherd, Driver.js)
- Gamification (progress bars, checklists, badges, streaks)
- Onboarding email sequences / drip campaigns
- Locale / language support beyond English
- A/B testing of onboarding copy
