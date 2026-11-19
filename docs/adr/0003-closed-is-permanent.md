# Closed is permanent; corrections are append-only

A Closed Request never reopens, and its closure record (goal, result, evidence) is never overwritten
(confirmed 2026-09-28). Lane exists to show goal against actual result, so the closed record is the evidence the
Outcome report is built from: the Requester fixes a factual error with an attributed Correction shown beside the
unchanged original (#60, 2026-10-21), and further work becomes a linked Follow-up Request.

## Considered Options

- Reopening Closed Requests, or editing them in place: rejected because either lets a recorded result change
  after the fact without trace.

## Consequences

- Reopen exists only for Done, for 15 minutes and before a release is recorded.
- A typo or wrong evidence link is a Correction, not new work, and never inflates follow-up counts.

Source: `REQUIREMENTS.md` §5.
