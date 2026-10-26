# Lane product vision spec

**Status:** approved by Nikhil on 2026-10-24. Written from the
[Wayfinder map: Lane as the go-to app for designers and PMs](https://github.com/Nikhilsharma-lab/Lane/issues/178).

Lane aims to be the default tool for designers and PMs, the way Linear is for developers. It
gets there with an opinionated method: frame the problem, predict the impact, prove the result. Speed
and craft are the bar. Lane connects the specialist tools rather than rebuilding them.

Each item below has its own ticket with the detail. Approving this spec agrees to the list and
its order; each item still gets its own build plan and approval before anything is built.
Approving an item also gives the written approval its `AGENTS.md` / `DEFERRED.md` ban requires,
for that item only (noted where it applies).

**Where Lane stands:** the predict → prove loop works today: a Request is filed with a prediction,
reviewed, picked up, Released, then closed with a result and shown on the Impact page. The work
below makes that loop part of people's daily routine, worth paying for, and easy to start.

## Before launch

What must exist before the first team pays. Pilot teams get items 1–3 first, so we learn from real
use before charging anyone.

1. **[Metrics library](https://github.com/Nikhilsharma-lab/Lane/issues/192).** Saved metric
   definitions that every prediction and guardrail picks from.
   *Why first:* every prediction typed without it becomes cleanup later, and results can only be
   added up honestly when they share a definition.
2. **[Inbox](https://github.com/Nikhilsharma-lab/Lane/issues/184), with email and Slack DM.** A page
   of what needs you, replacing the bell, including the single Result due reminder.
   *Why:* this makes Lane a daily habit. Without a Result due reminder, results never get
   recorded and the loop dies quietly.
   *Approval this gives:* email beyond sign-in and invites, connecting Slack for DMs, and the
   background job that sends items when they're due (the "any cron job" ban).
3. **[Outcome report](https://github.com/Nikhilsharma-lab/Lane/issues/185)**, which is also the
   "What we shipped" page. One live page of Released work and its results by Project, never by
   person, with the "What we learned" line and the Quarter note.
   *Why:* the payoff a leader sees, and the reason to pay. Needs the Metrics library.
4. **Roles: adding Viewer, and Reviewers on a paid seat**
   (from [Pricing, plans and the view-only role](https://github.com/Nikhilsharma-lab/Lane/issues/190)).
   *Why:* pricing depends on the four roles. Free Viewers are how the Outcome report reaches the
   whole company and brings in new teams.
5. **[Pricing and billing](https://github.com/Nikhilsharma-lab/Lane/issues/190).** 4 Free Requests,
   one plan at $30 per seat yearly or $36 monthly, a 3-seat minimum, the founding discount, and
   automatic seat counting.
   *Why:* nobody can pay without it. Before it's switched on: ask about 10 target teams what they'd
   pay and revisit the numbers, and move to Supabase Pro and Vercel Pro (`AGENTS.md`).
6. **First-run onboarding** built around the 4 Free Requests. There's no time-limited trial, so the
   first run has to sell Lane without a demo: show the front of the loop (framing, prediction,
   reviews, Release), and bring people back when a result is due. The screen-by-screen design is
   left to its build plan.
   *Why:* the Free Requests only turn into paying teams if people get through the loop alone.
   Needs pricing.
7. **[Related links](https://github.com/Nikhilsharma-lab/Lane/issues/193): Same problem links and
   iterations.** Shows every attempt at one problem with its prediction and result.
   *Why:* it shows whether a problem is getting solved over several tries. Useful but not
   urgent. It's a plain list built from records, not an "iteration summary".
8. **Saved views.** Save a filtered Request list and come back to it.
   *Why:* a small speed win for people who check the same list every day.

## After launch

Loosely ordered. Each one waits until real teams pull for it.

1. **Linear link.** Link a Request to Linear issues and show a small Lane card on each Linear issue.
   Releases are still recorded in Lane by a person, never detected from Linear.
   *Why:* engineers see the problem and prediction where they already work.
   ([research](https://github.com/Nikhilsharma-lab/Lane/issues/181))
2. **Backlog import.** CSV first, then Linear. Imported items arrive as drafts for someone to reframe
   as problems.
   *Why:* teams don't have to start from zero.
3. **Rich Figma context**, using Figma's embed only, not thumbnails.
   *Why:* show the design next to the Request. It's lower priority because the saved Design link
   already does most of this. *Approval needed:* lifts the "Figma integration" ban.
4. **Public request form** with no account. Kept deferred; Guests cover free submitters for now.
5. **Enterprise extras** (SSO, audit log, custom roles). Not ranked: built only when a customer
   asks. The pricing page shows "talk to us".
6. **Agents.** Their own map after launch: rules for what agents may do on their own, the
   measurement agent, Slack and email capture, product memory, and a Lane connector for people's own
   AI assistants.

## Never

Sprints, velocity, estimates, time tracking, utilization, individual scores or rankings. Also out:
journeys and any other design work, docs or wiki, whiteboards, design review inside Lane, native
mobile apps, AI-generated designs, and release detection from dev tools.

## Since approval

- `PRODUCT.md` and `REQUIREMENTS.md` no longer say "…and its journeys": journeys live in design tools.
- Each item above becomes its own build plan, in this order.
- 2026-10-25: the eight before-launch items are specified together in one approved spec,
  [#195](https://github.com/Nikhilsharma-lab/Lane/issues/195), and built together in
  [PR #220](https://github.com/Nikhilsharma-lab/Lane/pull/220).
