# Request status is derived, never stored

A Request's status (Open → In progress → Done → Measuring → Closed) has no column: it is read from three saved
facts, the work status, the release and the closure, so the list, board, peek and Request page always show the
same line (#127, 2026-10-22). "Closed without a result" is a form of Closed, not a sixth status.

## Consequences

- Changing what a status means changes the derivation, not stored rows, and a status can never disagree with
  the facts behind it.
- Readiness checklists stay guidance: they are not board columns, roles or gates, because there is no status
  field for them to hold.

Source: `REQUIREMENTS.md` §5.
