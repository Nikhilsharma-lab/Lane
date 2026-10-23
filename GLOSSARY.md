# Lane

Lane tracks product Requests from the first ask, through the work, to the measured result of that work.

## People

**Requester**:
The one person who owns a Request's outcome and is the only one who can close it. This is whoever created the Request, unless an admin hands it over to someone else.
_Avoid_: Owner, release and outcome owner, creator (when meaning who closes)

**Reviewer**:
A teammate asked for an optional "Looks good" or "Raise a concern" before the work is picked up. Their answer never blocks pickup.
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
