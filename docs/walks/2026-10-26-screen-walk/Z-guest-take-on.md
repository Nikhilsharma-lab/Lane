# Guest submission: Take this on (walked by the coordinator)

## Covered
LAN-31 (Guest submission waiting to be taken on) as `dev` (Member): before, Take this on, the "Write the prediction" dialog, after. 1440 light, 390 dark. Escape and focus return.

## Findings
| # | Where | What's wrong | Severity | Tag | Seen at | Screenshot |
|---|---|---|---|---|---|---|
| Z1 | Request detail → Write the prediction dialog (phone) | The Request title is a one-line field scrolled to its end, so the start of the title is cut off ("ce PDF has the wrong company address"). Elsewhere long titles wrap. | rough | fix | 390 dark | [guest-prediction-dialog-390-dark](shots/Z/guest-prediction-dialog-390-dark.webp) |
| Z2 | Request detail → Guest submission, after Take this on | The text says "write its prediction before the work is picked up", but the green Pick up button in the top bar is live, so the work can be picked up with no prediction. | inconsistent | needs a decision: should Pick up wait until the prediction is written, or should the text stop implying it must? | 1440 light, 390 dark | [guest-after-takeon-390-dark](shots/Z/guest-after-takeon-390-dark.webp) |
| Z3 | Write the prediction dialog | The dialog is titled "Write the prediction", its section is "Expected impact" and its button is "Save changes": three names for one thing. | inconsistent | fix (button → the dialog's own words); "Expected impact" naming is part of C's naming decision | 1440 light | [guest-takeon-click-1440-light](shots/Z/guest-takeon-click-1440-light.webp) |
| Z4 | Request detail → Guest submission, before Take this on | Two main actions compete: a greyed "Pick up" top right (explained only on hover, same as B19) and the green "Take this on" in the page. The Journey also says "Waiting for someone to pick this up" although nobody can pick it up yet. | rough | fix (Journey wording for a Guest submission waiting to be taken on) | 1440 light | [guest-before-1440-light](shots/Z/guest-before-1440-light.webp) |

Take this on itself worked: it takes the Request on straight away and opens the prediction dialog; Escape closes the dialog, keeps the Request taken on, and leaves a "Write the prediction" button. Focus returned to that button. "Requester: Review Developer" after taking on is B6 (two names).

## Hard-to-read text
| Where | Text | Theme | Measured contrast |
|---|---|---|---|
| Request detail → Guest submission badge | "Waiting to be taken on" (9px) | light | 2.65:1 (same as A2's list badge) |
