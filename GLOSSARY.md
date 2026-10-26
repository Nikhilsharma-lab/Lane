# Lane

Lane tracks product Requests from the first ask, through the work, to the measured result of that work.
`AGENTS.md` holds the locked vocabulary; this file defines the terms for people, Request status, reviewing a
Request and closing it, and names the words retired with earlier designs.

## People

**Requester**:
The one person who owns a Request's outcome and is the only one who can close it. This is whoever created the Request, unless an admin hands it over to someone else.
_Avoid_: Owner, release and outcome owner, creator (when meaning who closes)

**Reviewer**:
A teammate asked for an optional "Looks good" or "Raise a concern" before the work is picked up. Their answer never blocks pickup. See Reviewing a Request.
_Avoid_: Approver, agreement

## Request status

A Request has one status line that is shown everywhere:
**Open → In progress → Done → Measuring → Closed**

**Open**:
Nobody has picked the Request up yet. It can still be deleted.

**In progress**:
Someone has picked the Request up and is working on it.

**Done**:
The work is finished but has not reached its audience yet.

**Release**:
The recorded moment the work reached its agreed audience. A release starts Measuring.
_Avoid_: Launch, ship, deploy
_Exception (2026-10-26)_: "Shipped" is allowed only in the Outcome report ("What we shipped", the At a glance count).

**Measuring**:
The work is live, and Lane is waiting for the measurement due date so the Requester can record the result.

**Closed**:
The Requester recorded the actual result against what was expected. The result can be good, neutral or bad. A closed Request never reopens.
_Avoid_: Complete, successful, resolved

**Closed without a result**:
A form of Closed for picked-up work that could not be measured, such as work that was rolled back. It always carries a reason.
_Avoid_: Exception, cancelled, superseded

## After closing

**Correction**:
A fix the Requester adds to a closed Request. It sits beside the original record, and the original stays visible.
_Avoid_: Edit, amendment

**Follow-up Request**:
A new Request linked to a released one, for further work. It starts again at Open, and reviewers answer it again.
_Avoid_: Reopen, child Request

## Reviewing a Request

**Reviewer** (detail):
A workspace member or admin, or an invited email address, asked to look at a Request before work starts.
Optional; a Request may have none.
_Avoid_: approver, agreement seat, participant

**Review answer**:
A Reviewer's response: **Looks good**, or **Raise a concern** with a reason. Editing the Request clears it.
_Avoid_: decision, approval, changes requested

**Concern**:
A Review answer that raises a concern. It stays open until that Reviewer changes their answer or the
Request is edited.
_Avoid_: objection, block

**Concern marker**:
The "N concerns" note on a Request row in the list.

**Pickup confirmation**:
The "Pick up anyway?" question asked when a Request with open concerns or unanswered reviews is picked up.
_Avoid_: gate, block

**Design link**:
The saved link to a Request's design, normally in Figma. Design discussion and decisions happen in Figma.

## Retired words

**Agreement**:
The named PM/Designer/Developer gate that Reviewers replaced on 2026-10-21. Say Reviewer or Review answer.

**Design review** / **Ask for review**:
Lane's former in-app design feedback rounds, retired on 2026-10-18. Saved rounds keep only their Design link.
