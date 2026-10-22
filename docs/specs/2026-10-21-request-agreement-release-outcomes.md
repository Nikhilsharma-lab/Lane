# Request agreement, release and outcome closure

Status: product decisions and testing approach confirmed by Nikhil on 20–21 October 2026. Approved for specification tracking with `ready-for-agent`; implementation requires a scoped plan.

> **Superseded in part (Nikhil, 2026-10-21, after seeing the built UI):** agreement is the three people agreeing to build the Request as written. Stories and decisions about a separate commitment form, Discovery/Delivery, frozen snapshots, concerns, withdrawal, linked replacements and Superseded no longer apply. Editing the Request clears agreement; the requester deletes an unwanted Request before pickup; after pickup, work closes without a result as Rolled back, Can't be measured or Other. See `REQUIREMENTS.md` §4.4 and migration `0031`.

> **Superseded in part 2026-10-22 (#127, Nikhil):** any active non-guest member records, corrects or voids a release while the Request is Done or Measuring and not closed, each change attributed in history. Closing (measured or without a result) and closure corrections stay with the Requester only. An admin may hand a Request to a new Requester at any point after pickup once the Requester has lost access. "Requester" replaces owner, creator and release and outcome owner. See `REQUIREMENTS.md` §5 "Who closes — the Requester".

Tracker: [GitHub issue #57](https://github.com/Nikhilsharma-lab/Lane/issues/57).

## Problem Statement

Lane currently ends active work at Done, still displays priority, and offers no release or outcome-closure journey. Teams can start before PM, Design and Development agree on the commitment, discovering feasibility objections late. Request creators cannot record actual audience exposure, see the resulting measurement deadline, or close with actual impact and evidence. Done can therefore be mistaken for released, measured or successful.

## Solution

Keep the existing Open → In Progress → Done work lifecycle, with agreement as a gate rather than another board column. Before pickup, three distinct named workspace members representing PM, Designer and Developer—or their designated leads—agree to the submitted commitment. The creator records release after Done. Actual exposure to the agreed audience starts a release-relative measurement window; an agreed fixed window stays fixed. Everyone sees the deadline and countdown. The creator records actual results and evidence to close, or explicitly records an exception. Closed remains permanent.

Material changes after submission create linked replacements with new agreement. Before release, the creator confirms the original as Superseded. After release, new work is a follow-up and does not erase the original measurement obligation.

## User Stories

1. As a creator, I want to edit my draft before submitting it for agreement, so that exploration does not create replacement Requests.
2. As a creator, I want to select existing workspace members for PM, Designer and Developer seats, so that responsibility is explicit.
3. As a creator, I want to select a designated lead for a discipline, so that the right representative can commit for that discipline.
4. As a participant, I want three distinct people in the three seats, so that one person cannot approve multiple disciplines.
5. As a creator, I want to occupy one seat when appropriate, so that creating the Request does not exclude me from participating.
6. As a workspace admin, I want to invite a missing participant through Clerk before submitting for agreement, so that they can join the process.
7. As a non-admin creator, I want to understand when an admin must invite someone, so that invitation permissions remain clear.
8. As a creator, I want agreement to be requestable while an invitation is pending, so that the proposed commitment can be prepared without pretending the invitee has agreed.
9. As a team member, I want pending membership or approval to block pickup, so that an invitation never substitutes for agreement.
10. As an approver, I want to review the problem, intended scope, expected impact, audience, timing, constraints and technical feasibility, so that I know what I am agreeing to.
11. As an approver, I want unresolved feasibility questions to block pickup, so that work does not start with a known unresolved commitment.
12. As an approver, I want Agree and Request changes actions, so that my decision is explicit.
13. As a creator, I want a reason for requested changes, so that I can address the disagreement.
14. As a team member, I want all three approvals before pickup, so that no creator or admin can override dissent.
15. As an approver, I want agreement bound to the submitted commitment, so that it cannot silently approve later material changes.
16. As a creator, I want minor spelling fixes and clarifications to remain attributable edits, so that they do not require a replacement Request.
17. As an approver, I want to withdraw agreement before release with a reason, so that a newly discovered blocker is visible.
18. As a team member, I want blocked work to retain its current column with an Agreement blocked state, so that history is preserved while advancement stops.
19. As a participant, I want discussion to remain available while blocked, so that we can resolve the issue.
20. As a creator, I want to replace an unavailable approver visibly, so that the new person can make their own decision.
21. As an unchanged approver, I want my approval preserved when another seat changes but the commitment does not, so that unrelated approvals are not needlessly repeated.
22. As a creator, I want a material change to create a linked replacement, so that the original commitment stays intact.
23. As a creator, I want unchanged context copied into the replacement and changed fields identified, so that I can review every affected data point.
24. As a replacement approver, I want fresh agreement from all three seats, so that previous approvals never carry forward as authority.
25. As a creator, I want to confirm the unreleased original as Superseded, so that only the replacement continues progressing.
26. As a reader, I want the original and replacement linked with preserved history, so that I can understand what changed and why.
27. As a team member, I want priority hidden on Done rows and detail, so that completed work no longer presents an active triage signal.
28. As a reader, I want historical priority retained, so that hiding it does not erase the earlier record.
29. As a creator, I want Mark as released after Done, so that work completion is separate from customer exposure.
30. As a creator, I want to record actual exposure date, audience and release evidence, so that release means the agreed audience received the work.
31. As a creator recording release late, I want to use the actual past exposure date, so that clicking late does not restart measurement.
32. As a team member, I want a relative window to start at agreed-audience exposure, so that a deployment or partial rollout alone does not start it prematurely.
33. As a participant, I want fixed measurement dates preserved when release is delayed, so that the commitment is not silently rewritten.
34. As a reader, I want a due date and day-based countdown, so that I know when outcome review is expected.
35. As a creator, I want Close Request when the agreed window ends, so that I can record the outcome at the right time.
36. As a creator, I want baseline and target beside actual impact, so that the comparison is visible.
37. As a creator, I want to supply evidence and relevant guardrail results, so that the outcome has an inspectable basis.
38. As a creator, I want to close a positive, neutral or negative measured result, so that target attainment is not a closure gate.
39. As a reader, I want overdue outcomes to remain outstanding with an overdue indicator, so that a deadline never silently closes a Request.
40. As a creator, I want a separate Close with exception action when measurement is unavailable, work is cancelled, or release is rolled back, so that I never invent an actual value.
41. As a reader, I want exception reasons and counts distinguished from measured impact, so that reporting does not treat missing measurements as measured results.
42. As a workspace admin, I want to transfer release and outcome ownership explicitly when the creator loses access, so that the obligation is not abandoned.
43. As a reader, I want to see who transferred ownership, to whom and why, so that authority changes are attributable.
44. As a creator doing new work after release, I want a linked follow-up while the original retains its measurement obligation, so that shipped work remains accountable.
45. As a creator, I want to explicitly close the original with an exception if a later change makes its outcome uninterpretable, so that follow-up work cannot erase that obligation automatically.
46. As a reader, I want Closed outcomes to stay immutable with attributable corrections alongside them, so that learning cannot be rewritten retrospectively.
47. As an existing user, I want current Request statuses and history preserved during rollout, so that migration does not invent approvals or release dates.
48. As a member working on an existing Open Request, I want missing agreement completed before pickup, so that old records follow the new gate prospectively.
49. As a creator of an existing In Progress or Done Request, I want missing agreement recorded before release, so that historical work is preserved without bypassing the release gate.
50. As a workspace member, I want these actions enforced on the server and isolated by workspace, so that changing client arguments cannot grant access or authority.
51. As a keyboard or mobile user, I want agreement, release and closure controls to remain usable with clear pending and error states, so that the workflow is accessible and recoverable.

## Implementation Decisions

- Keep work state Open/In Progress/Done and outcome state Not started/Measuring/Closed separate. Agreement is a condition on transitions, not a new board column or a functional-role permission.
- Extend the existing Request lifecycle actions, detail/properties presentation, Intake submission and measurement modules. Reuse Clerk membership/invitation authority and existing authorization guards. Do not recreate membership or invitation tables.
- Bind decisions to three named, distinct active workspace members and a submitted commitment snapshot. A designated lead occupies one seat rather than adding an approval. The creator may occupy one seat. Profile labels alone grant no action authority.
- Before submission, draft fields remain editable. Submission freezes the proposed commitment. Material changes to scope, feasibility, audience, expected impact or timing require a new Request. Minor corrections remain attributable edits without changing what was agreed.
- Agreement covers the intended work and known feasibility, not advance approval of an unseen final design. All seats must explicitly agree before pickup. Pending invitations and disagreement block advancement; no admin or creator override.
- Request changes and withdrawal require reasons. Withdrawal before release blocks pickup or further advancement, including release, without moving the Request backward between board columns. Discussion remains available. Lane cannot enforce pauses in external tools.
- Replacing a seat records the actor and replacement and requires that seat's fresh agreement. Unchanged seats keep approval only when the commitment remains unchanged. A new Request always starts with fresh approvals.
- Before release, linked replacement creation and creator-confirmed superseding preserve the original commitment and history. Superseded outcomes are exceptions, excluded from measured-impact totals. Prevent both predecessor and replacement from silently remaining authorized to progress after confirmed superseding.
- After release, create a linked follow-up rather than automatically superseding the measurement obligation. Explicit Requester-only exception closure is necessary if the original outcome becomes uninterpretable.
- Hide priority on Done list rows and both compact and desktop detail presentations; retain its saved historical value.
- Done does not mean released or measured. Any active non-guest workspace member can record, correct or void release after Done (#127; originally creator/owner only). Record exposure date, agreed audience and release evidence. A partial rollout starts measurement only if it satisfies the audience agreed for that measurement.
- Preserve the existing relative-window and fixed-date representations. Relative windows derive the due date from actual exposure, including a recorded past date. Never shift fixed dates automatically. Changing agreed fixed dates follows the material-change rule.
- Show a day-based countdown and due date to all permitted readers, followed by due/overdue text. It is derived from saved dates; no cron, automatic closure or analytics polling is required.
- Ordinary measured closure is Requester-only after the window ends. Record actual result, evidence/source, observation period and relevant guardrail outcomes; compare with the original expectation without rewriting targets. Support existing numeric and pass/fail measurement forms. Do not require a successful result or a retrospective essay.
- Offer separate exception closure with a reason, including cancellation/not launched, rollback, unavailable or inconclusive measurement, and superseding. Exceptions may close before a measurement deadline and must remain distinct from measured outcomes. This spec does not add aggregate reporting screens.
- Clerk organization admins may hand the Request to a new Requester, at any point after pickup, when the Requester loses access. Preserve original authorship and record actor, new owner and reason. Transfer does not bypass agreement or erase history.
- Closed Requests cannot reopen. Corrections are attributable additions beside the immutable closure record, not edits to the original outcome snapshot.
- Migration preserves legacy statuses and records. Existing Open Requests require agreement before pickup; existing In Progress/Done Requests require missing agreement before release. Do not backfill invented approvals, dates or actual results.
- Server actions receive rendered workspace context but derive user identity, active organization and organization role from the session through shared guards. Every mutation rechecks membership, authority, commitment version and transition eligibility; stale clients and concurrent actions must not bypass a gate.
- Persist approval history, commitment versions, links, release facts, ownership transfers and outcome records durably. Exact table layout and action signatures were not decided in the interview; propose them in the bounded implementation plan rather than treating a schema as already approved.
- Preserve existing private attachment boundaries, AI intake gate, draft recovery, guest restrictions, Arc behavior and shared production styling. Use existing Request/Intake/Settings surfaces rather than new dashboards.

## Testing Decisions

Testing boundaries confirmed by Nikhil on 21 October 2026:

- Main boundary: existing Request server actions backed by the test database, with controlled Clerk session/membership responses. Test externally observable results and persisted records rather than internal helper calls or component structure. Extend existing lifecycle concurrency and authorization tests; avoid introducing a second lifecycle engine just for tests.
- Exercise the complete approved transition contract: partial/all agreement, distinct seats, invited versus active members, dissent, withdrawal, replacement of a seat, unchanged approvals, frozen commitments, minor corrections, replacement/superseding and post-release follow-ups.
- Use two workspaces and multiple identities to verify foreign-resource denial, forged identity/ownership rejection, Requester-only closure, release by any active non-guest member, admin-only handover and invitation restrictions. Functional role changes must never grant authority.
- Race approval withdrawal against pickup/release, ownership transfer against release/closure, and duplicate replacement/release/closure submissions. Assert one consistent durable outcome and no duplicated or inherited authority. Lost responses and retries must recover without duplicating the transition.
- Test relative deadlines from actual exposure, past release recording, fixed-date preservation, before/at/after deadline eligibility, due/overdue rendering and no automatic closure. Use a controlled clock. Calendar timezone and exact deadline boundary must be documented before implementing these assertions; the interview did not settle that detail.
- Test numeric, pass/fail and guardrail outcomes, positive/neutral/negative results, required evidence, early exception closure, immutable closure records and attributable corrections. Verify exception classification without introducing aggregate reporting functionality.
- Migration fixtures cover Open, In Progress and Done legacy records and old measurement versions. Assert history survives and no agreement, exposure or result is fabricated. Follow existing measurement-schema test practice.
- Browser acceptance covers the shared Intake → agreement → pickup → Done → release → countdown → closure journey. Reuse the existing reliable lifecycle browser suite's desktop/mobile, light/dark, duplicate-click and failed-action recovery patterns. Include keyboard operation, focus, labels, invitation-pending states, error recovery and reload persistence.
- Verify priority disappears consistently from Done list/detail while its stored value survives. Prior art includes Request properties tests and shared detail stories, alongside existing Expected impact action and measurement tests.
- Back up and verify migrations on staging first, including a restore rehearsal where applicable; promote only after staged multi-user acceptance. Existing production happy-path checks do not establish this unimplemented contract.

## Out of Scope

- Implementing the feature as part of this spec-writing task, deploying it, or changing production data.
- New board columns, role-specific dashboards, individual scoring, time tracking or surveillance.
- Automatic release detection, deployment integrations, analytics ingestion or causal verification of impact.
- Cron jobs, scheduled reminders, digests, automatic closure or new notification channels.
- Quarterly/yearly reporting screens; this increment preserves outcome semantics for future reporting.
- New membership/invitation authority, paid Clerk roles, invitation permissions for non-admins, or agreement bypasses.
- Reopening Closed Requests, editing original closure snapshots, or fabricating legacy history.
- A generic workflow engine, arbitrary extra approval stages, and unrelated UI redesign.

## Further Notes

- The 26 interview answers are the product decision source. Existing requirements remain applicable where not superseded. The new decisions specifically move agreement/readiness upstream before pickup, make the creator the release actor, and require replacements for material changes after submission rather than same-Request material amendments before release.
- Existing work completion and relative/fixed measurement definitions are implemented. Agreement, release, outcome closure and their recovery controls are target behavior, not current production capabilities.
- Deliver as bounded increments, beginning with agreement before pickup, then replacement/recovery behavior, then release/measurement/closure. Do not ship a partial gate that claims the whole contract is enforced. Canonical requirements and roadmap must be reconciled as part of implementation planning.
- Remaining engineering precision includes calendar timezone/deadline boundaries, recovery from incorrectly recorded release facts, and exact persistence/action contracts. These were not settled and must not be represented as confirmed interview decisions.
- Track this spec in Nikhilsharma-lab/Lane GitHub Issues with `ready-for-agent`. Default triage labels and the testing boundaries above were explicitly confirmed by Nikhil.
