# Creation-to-outcome sketch

Status: draft for Nikhil's sign-off, 2026-10-11. Once signed it satisfies launch plan decision 8.5 and records the Request detail go-ahead (LP:298, LP:373, LP:598). It authorizes no code, schema, route or AI call.

Short references: R is `REQUIREMENTS.md`, LP is `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`, RM is `lane-roadmap.md`, AR is `docs/superpowers/plans/2026-10-09-ask-for-review.md`. Every alignment and outcome label here is provisional (R:265-266, R:853).

## Placement decision

Request detail reads as one document in journey order (Problem, Expected impact, Alignment, Work, Outcome, Conversation), so each agreement, concern and result sits beside the prediction it refers to. The right panel holds properties plus one summary row each for Alignment and Outcome, and the single 44px strip holds the viewer's one primary action or, when they owe nothing, one quiet line naming who does. In the composer, Expected impact stays required on the compose step and the trio is named on the review step just above Create Request, so creating the Request is visibly the creator's agreement to that version.

## Rules this sketch keeps

- Saving is not authorization. Work cannot start until all three named people agree on the same version (R:233-235, R:265-266).
- A recorded concern blocks. No creator, admin or timeout override, and no disabled override button (R:268-273).
- Work status and outcome status are separate rows, never one path. Done is not closure (R:410-420, R:829).
- Only the creator, or an explicitly transferred outcome owner, closes the outcome. A named PM does not (R:112-113, R:393-394, R:460-464).
- Closed never reopens. Corrections append. New work is a follow-up Request (R:467-472, R:480-485).
- Exceptions close with a reason, at the same weight as a measured result, and stay out of measured totals (R:442-456).
- Ask for review is feedback, not agreement. "Changes requested" never appears in Alignment, the panel or the list (AR:15).
- Phase 2 renders none of the target. No empty sections, placeholder rows, disabled controls or "coming soon" copy (LP:92, R:795-798).

## Composer

Compose step, in order. Phase 2 builds it and the alignment increment leaves it alone.

1. 44px strip: "New Request" and close. On /intake the strip reads "Workspace / New Request" (R:825-826). Today the crumb says "Intake" (`sidebar-view.tsx:115`).
2. Request title. Required, 3 to 200 characters. Borderless with a hidden label.
3. Description. Required, 10 to 5000 characters.
4. Chip row, unchanged: Project, Request type, Add link, Attach files. All optional.
5. Expected impact. Required (R:153, R:283-289). One disclosure row (decision 8.26). Expanding shows today's fields unchanged: Measure with, then Metric, Current value (optional), Target value and Unit, or Success criterion, then Data source and Measure after launch. Complete, it folds to a two-line summary. A failed submit expands it and focuses the first invalid field. The number row uses a container query, not `sm:grid-cols-3`.
6. Related link and the file list, unchanged.
7. Sticky footer with one primary: "Review Request" (Cmd/Ctrl+Enter).

Review step, in order: title with Project and Request type; Problem (read-only, or the editable "Problem to solve" with "Your original Request" and Suggested change); Expected impact summary; Links and files; then the Alignment block. Footer: "Edit Request" (ghost) and "Create Request" (primary).

Alignment block, alignment increment only:
- "Your seat": PM, Designer or Developer. No default. Never filled from the profile label (R:112, R:239-241).
- Two member pickers named for the other two seats. Members only. Each excludes you and the person already chosen.
- Optional at creation (open question 1), since naming before agreement is allowed (R:234). Hidden for guests until sponsorship is decided (R:231, R:242).
- Never sent to the AI. Seats post with the signed review and the server checks them, as it checks `editedProblemText` today (`intake/actions.ts:248-269`).
- One line above the footer buttons: "Creating this records your agreement to this version." (R:265).
- The create toast stops saying "Open and ready to be picked up." once the guard ships.

```
Compose, drawer 480px                                    Review, alignment increment
+------------------------------------------------------+ +------------------------------------------------------+
| New Request                                      [x] | | Review Request                                   [x] |
+------------------------------------------------------+ +------------------------------------------------------+
| Request title                                        | | Signup drops at the phone step                       |
| Add a description...                                 | | Checkout, Improvement                                |
| [Project] [Request type] [Add link] [Attach files]   | | Problem to solve  [Customers can't finish signup ]   |
| Expected impact                              [Add]   | | > Your original Request                              |
|   or, once complete:                                 | | Expected impact   Signup completion rate, 62% to 80% |
| Expected impact                             [Edit]   | |                   Amplitude, 30 days after launch    |
| Signup completion rate, 62% to 80%                   | | Links and files   1 file                             |
| Amplitude signup funnel, 30 days after launch        | | Alignment                                            |
| design-v3.fig  2.1 MB                     [Remove]   | | Your seat   ( ) PM   (o) Designer   ( ) Developer    |
|                                                      | | PM          [Search members                     v]   |
|                                                      | | Developer   [Search members                     v]   |
+------------------------------------------------------+ +------------------------------------------------------+
|                         [Review Request  Cmd+Enter]  | | Creating this records your agreement to this version.|
+------------------------------------------------------+ | [Edit Request]            [Create Request  Cmd+Enter]|
                                                         +------------------------------------------------------+
```

At 390px the drawer is full width with a 16px gutter. Chips wrap. The impact number row and the seat rows stack, label above control. The footer stays sticky and the agreement line wraps above the buttons.

## Detail

- Strip: Workspace / Project / LAN-n, Copy link, Copy code, "2 / 5" with previous and next, one action slot, and an overflow menu only when it has items. The slot holds one filled button, or one quiet line saying who owes the next step.
- Main column (about 720px), each part a labelled region with an h2 and a stable id: problem (description, Original Request, Suggested change, Supporting details), expected-impact, alignment, files, ask-for-review, outcome, conversation.
- Right panel (about 280px): Status (glyph with its one allowed move as a quiet menu, LP:383), Alignment, Outcome, a divider, then Priority, Assignee (today "Owner", open question 4), Project, Type, Submitted. Alignment and Outcome rows are links that move focus to their section.
- An action that needs input opens a form inside its section. While it is open the strip button hides, so the form's submit is the only primary on screen.
- Overflow, target only: Withdraw Request (creator, reason required, R:278-279), Create follow-up Request (R:480-482), Add correction (R:469-472), Transfer outcome owner (admin, R:462-464).

| State | Panel rows | Primary action | Owner | Everyone else sees in the slot |
|---|---|---|---|---|
| Not aligned | Open; 1 of 3 agreed | Respond | each named person who has not answered | "Waiting on Ravi and Mei" |
| Seat empty | Open; Needs people | Name participants | creator | "Waiting on Asha to name people" |
| Concern recorded | Open; Concern | Revise Request | creator (open question 3) | "Waiting on Asha to revise" |
| Aligned | Open; Aligned, v2 | Pick up | eligible member today; target rules in R:322-324 | "Available to pick up" |
| In progress | In Progress; Aligned, v2 | Mark Done, with Undo | any non-guest (8.23, R:811-814) | "Ravi picked this up 3 days ago" |
| Done, launch not recorded | Done; Not started | none until the release increment | none | "Measuring starts when the launch is recorded" |
| Done, not launched or cancelled | Done; Not started | Close outcome | creator (R:455-456) | "Asha closes the outcome" |
| Measuring | Done; Measuring, due 14 Dec | none | none | "Asha records the result after 14 Dec" |
| Result due | Done; Result due since 14 Dec | Record result | creator or transferred owner | "Asha records the result" |
| Closed | Done; Closed, measured result | none | none | nothing |
| Closed by exception | Done; Closed, not launched | none | none | nothing |

- Respond opens the viewer's seat row with "Agree" and "Raise concern" as two radios of equal weight and no default. A concern needs "What must change before you can agree?" (R:270). The submit is "Send response".
- Pick up stays hidden, and the server refuses it, until all three agree. That holds in the list row menu and for direct calls (R:319-320, R:770-771).
- Revise Request opens the New Request drawer prefilled as the next version. Its review step lists who must agree again and keeps the concern on record (R:274). Whether the AI gate reruns is the alignment plan's call.
- A material change before release returns Alignment to "Not aligned" with a new version (R:312-313). An overdue result stays outstanding in neutral tone and never auto-closes (R:396).
- Guests see rows and quiet lines, never a button. Admins never see an override.

```
A. Not aligned. Viewer: Mei, named Developer.
+------------------------------------------------------------------------------------+
| Acme / Checkout / LAN-42        [Copy link] [Copy code]  2 / 5  [^] [v]  [Respond] |
+-------------------------------------------------------+----------------------------+
| Signup drops at the phone step                        | Status     Open            |
| Customers can't finish signup when the code fails...  | Alignment  1 of 3 agreed   |
| > Original Request    Supporting details              | Outcome    Not started     |
|-------------------------------------------------------|----------------------------|
| Expected impact                                       | Priority   High            |
| Signup completion rate   62% now, target 80%          | Assignee   No one yet      |
| Amplitude signup funnel, 30 days after launch         | Project    Checkout        |
|-------------------------------------------------------| Type       Improvement     |
| Alignment                                  Version 1  | Submitted  Asha Rao, 2d    |
| PM         Asha Rao   Agreed when created, 3 Oct      |                            |
| Designer   Ravi Shah  Waiting                         |                            |
| Developer  You        Waiting                         |                            |
|-------------------------------------------------------|                            |
| Files 2    Ask for review  Waiting for feedback       |                            |
| Conversation 3    [Add a comment...]                  |                            |
+-------------------------------------------------------+----------------------------+
After Respond (strip button hidden):
| Developer  You        Your response to version 1      |
|            ( ) Agree   ( ) Raise concern              |
|            What must change before you can agree? [ ] |
|                            [Cancel]  [Send response]  |

B. Concern recorded. Viewer: Asha, creator.
| Acme / Checkout / LAN-42 [Copy link] [Copy code]  2 / 5  [^] [v]  [Revise Request] |
| Alignment                                  Version 1  | Status     Open            |
| PM         You        Agreed when created, 3 Oct      | Alignment  Concern         |
| Designer   Ravi Shah  Agreed, 4 Oct                   | Outcome    Not started     |
| Developer  Mei Lin    Concern, 4 Oct                  |                            |
|            Phone verification needs the SMS vendor    |                            |
|            contract first. Scope this to email.       |                            |
| Work can't start until all three agree on one version.|                            |

C. Aligned and in progress. Viewer: Ravi, assignee.
| Acme / Checkout / LAN-42       [Copy link] [Copy code]  2 / 5  [^] [v] [Mark Done] |
| Alignment  Aligned on version 2, 5 Oct            [v] | Status     In Progress     |
| Files 4    Ask for review  Feedback received          | Alignment  Aligned, v2     |
|                                                       | Outcome    Not started     |

D. Done and measuring, result due. Viewer: Asha, after Record result.
| Acme / Checkout / LAN-42        [Copy link] [Copy code]  2 / 5  [^] [v]            |
| Outcome                                   Result due  | Status     Done            |
| Launched 14 Nov. Window 14 Nov to 14 Dec.             | Alignment  Aligned, v2     |
|                  Expected          Actual             | Outcome    Result due      |
| Signup rate      62% to 80%        Not recorded yet   |            since 14 Dec    |
| How it ended                                          |                            |
| ( ) Measured result          ( ) Inconclusive result  |                            |
| ( ) Measurement unavailable  ( ) Rolled back          |                            |
| ( ) Not launched or cancelled                         |                            |
| ( ) Superseded by another Request                     |                            |
| Actual value [ 74 ] %   Period [14 Nov] to [14 Dec]   |                            |
| Source [Amplitude signup funnel                    ]  |                            |
| Closed outcomes can't be reopened.                    |                            |
|                            [Cancel]  [Close outcome]  |                            |

E. Closed. Any viewer. The strip shows only the overflow.
| Outcome                                       Closed  | Outcome    Closed,         |
| Measured result, 14 Nov to 14 Dec                     |            measured result |
| Expected  62% to 80%     Actual  74%                  |                            |
| Source  Amplitude signup funnel                       |                            |
| Closed by Asha Rao, 20 Dec                            |                            |

F. Closed by exception. Same layout and weight as E.
| Outcome                                       Closed  | Outcome    Closed, not     |
| Not launched or cancelled                             |            launched        |
| Reason  Vendor contract fell through. Email signup    |                            |
|         shipped in LAN-51 instead.                    |                            |
| Expected  62% to 80%     Actual  No measured result   |                            |
| Closed by Asha Rao, 20 Dec                            |                            |
```

The closing form shows "Exceptions are reported separately from measured results." when an exception kind is chosen. Other kinds need a Reason. A measured result needs Actual value, Period and Source first (R:393-398).

At 390px: the strip keeps back, LAN-n, the action and the overflow (copy, previous and next move into it). Under the title, one state line ("Open, 1 of 3 agreed, High") opens Properties, and the quiet "who owes" line sits beneath it. Seat rows stack name over state. Expected and Actual become stacked pairs. Forms are full width with the submit stuck to the bottom. Keyboard: Cmd/Ctrl+Enter submits a form, Esc closes the form first and then returns to the list. No new letter shortcuts before decision 8.24.

## List

Phase 2 adds no column, group, token or toolbar control. Groups stay Open, In Progress and Done (R:410-411).

Target, each with its increment:
- One muted text token in the row's trailing metadata, only when the row waits on someone: "Needs people", "Awaiting agreement", "Concern", "Measuring" or "Result due 14 Dec".
- When the viewer owes the step, the token uses foreground text instead of muted. No dot, colour or names.
- Aligned, In Progress and Closed rows show nothing extra. Measured and exception closures look the same.
- No counts, sorts or per-person views (R:50-55, R:159-160). A later "Waiting on me" option would join the existing filter menu with its own approval.
- The token comes from fields loaded with the row. No query per row.

## What Phase 2 pages reserve now

2.0 frame
- One 44px strip per page. On detail and /intake the crumbs become the strip.
- One strip anatomy: crumbs, tools, one action slot (a filled button or a quiet line), overflow only when it has items.
- Skeletons match it: detail is strip, main column and two-group panel; /intake is strip and compose step.

2.3 composer
- The strip, borderless title and description, and the Expected impact disclosure with a container query.
- The review step is an ordered list of blocks with the sticky footer last. The footer allows one line above its buttons without moving them.
- The create toast copy lives in one place. Remove the "Request created" eyebrow (`intake-form.tsx:1377-1384`).

2.4 list
- The trailing metadata has room for one more short token at 1440 without wrapping. It is hidden at 390.
- The row menu moves (`request-row-actions.tsx:123`) and the detail strip read one shared allowed-move function, so a later guard changes one place.

2.5 detail
- The strip, with Pick up or Mark Done and Undo in the action slot, reading the pending overlay. Today the badge reads server props (`detail-view.tsx:142-146`).
- Main column order and section ids as above. Supporting details moves up into Problem. The alignment slot follows expected-impact; the outcome slot follows ask-for-review.
- Panel: Status, divider, Priority, Assignee, Project, Type, Submitted. Alignment and Outcome rows later insert under Status.
- Remove the People section, the Project and Type line under the title, and the duplicate mobile lifecycle block.
- Phone: back, LAN-n and the action in the strip; one state line under the title opens Properties. Esc closes an open form or menu first, then returns to the list.
- Copy: "Mark Done", the heading "Ask for review", and "Expected result" becomes "Desired change".

## What waits for the alignment and outcome increments

Alignment increment, after its own plan is approved (R:169-170, R:784-787, RM:106-119):
- Composer Alignment block, agreement line, new toast copy, and member search before a Request exists. `/api/reviewers` needs a Request id and excludes the caller, so this needs a route approval (AGENTS.md:46).
- Detail Alignment section and panel row; Respond, Name participants and Revise Request; versions and concern history; Withdraw Request.
- The server guard on Pick up from detail, list and direct calls, covering creator, admin and stale versions (RM:116-118).
- Notifications to named people. The alignment list tokens.

Release increment: the launch record that anchors "days after launch" (R:382-386), and Done reasons (R:422-428).

Outcome increment, shipped only with exceptions, no-reopen and follow-ups (R:789-791, RM:125-126): the Outcome section and panel row, Record result and Close outcome, the six closure kinds, the closed snapshot, corrections, Create follow-up Request, owner transfer, and the Measuring and Result due tokens.

## Rejected alternatives

- Alignment and Outcome as panel blocks: a blocking concern and a six-kind closing form neither fit nor stand out in a 280px column.
- A checkpoint stepper under the title: a second strip with six steps reads as a stage system, fuses two lifecycles into one path (R:174, R:410-411) and pulls the action out of the header that LP:387 keeps.
- Overview, Work, Build and Outcome tabs: R:534 calls them views, and tabs hide a blocking state behind a click. The section order maps onto tabs later if wanted.
- Seat chips in the composer property row: they read as assignee chips, which LP:346 does not adopt.
- Seats on the compose step: more weight before the AI gate, and the agreement is not visible where it happens.
- A one-click Agree button in the strip: it invites rubber-stamping. Respond keeps Agree and Raise concern at equal weight.
- Editing Problem and Expected impact in place on detail: the material-edit rule is still open (R:853). Revision goes through the composer.
- Placeholder Alignment or Outcome rows in Phase 2: LP:92 and R:795-798 forbid promising or pre-building them.

## Plan fixes on sign-off

- LP:298 and LP:598 cite R:856-857 for the replan. The text is now R:877-881.
- LP:340 cites 8.23 for the Expected impact disclosure. It is 8.26.
- LP:379 says Undo on detail needs a ledger amendment. R:811-814 already allows it.

## References (REQUIREMENTS.md)

- Creation, Expected impact and saving: R:127-129, R:153, R:233-235, R:283-291.
- Trio, seats and guests: R:100, R:112-113, R:231, R:239-242.
- Agreement, concern, no bypass and versions: R:149-150, R:265-279, R:312-315, R:839-840.
- Assignment and pick up: R:319-331. Release record: R:382-386.
- Measure, close, both lifecycles and closure kinds: R:390-404, R:410-456.
- Ownership, permanence, corrections and follow-ups: R:460-490, R:872-876.
- Views not stages, and no person scores: R:499-534, R:50-55, R:604-606.
- Planning boundaries and one subsystem at a time: R:169-174, R:784-798.
- Undo, breadcrumb, replan and open labels: R:811-814, R:825-827, R:853-856, R:877-881.
