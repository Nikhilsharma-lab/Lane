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

## Workspace roles

Every person in a workspace has exactly one of these four roles. Roles never mix: someone who needs to see
everything and also file Requests is a Member.

**Admin**:
A Member who also manages the workspace's people and settings. Takes a paid seat.

**Member**:
A person who files and works Requests: picks them up, reviews them, records Releases and closes them. Takes a
paid seat.
_Avoid_: User, seat (when meaning the person)

**Guest**:
A free person who files Requests and sees only their own. A Member takes each submission on as its Requester.
_Avoid_: Submitter, external requester, contributor

**Viewer**:
A free person who sees everything a Member sees, except managing people, and changes nothing: no filing,
commenting or reviewing. Nothing ever needs a Viewer.
_Avoid_: View-only member, observer, read-only member, stakeholder

**Paid seat**:
What each Admin and Member takes. Guests and Viewers are free and unlimited.
_Avoid_: License, creator, maker

**Free Requests**:
The first four Requests every workspace gets before it pays, with no time limit. Deleting one does not give
it back.
_Avoid_: Trial, free plan, credits

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
A workspace member or admin on a paid seat, asked to look at a Request before work starts. Guests and
email addresses without a seat cannot be Reviewers. Optional; a Request may have none.
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

## Inbox

**Inbox**:
A person's own list of what needs them and what happened to their work in Lane.
_Avoid_: Notifications, feed, activity

**Needs you**:
An Inbox item only you can act on: a review asked of you, a concern on your Request, a Release to record,
or a result due. It clears itself once the thing is done, and it never repeats.
_Avoid_: Reminder, task, to-do

**For your information**:
An Inbox item about something that happened to your work. It clears when you read it.
_Avoid_: Notification, update

## Reporting

**Outcome report**:
The shared page showing everything Released in a month, quarter or year, with each Request's prediction and
its result once known, grouped by Project. It is built from Request records, kept up to date as results
arrive, and never shows people.
_Avoid_: What we shipped, dashboard, impact summary, scorecard

**What we learned**:
The optional one line a Requester adds when closing a Request. It shows on the Request and in the Outcome report.
_Avoid_: Retro, lesson, notes

**Quarter note**:
An optional short note an admin writes for one quarter, shown at the end of that quarter's Outcome report.
_Avoid_: Summary, commentary

## Retired words

**Agreement**:
The named PM/Designer/Developer gate that Reviewers replaced on 2026-10-21. Say Reviewer or Review answer.

**Design review** / **Ask for review**:
Lane's former in-app design feedback rounds, retired on 2026-10-18. Saved rounds keep only their Design link.
