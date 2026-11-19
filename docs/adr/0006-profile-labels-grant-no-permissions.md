# Profile labels grant no permissions

PM, Designer and Developer are editable profile labels that describe a person's usual contribution; they never
change screens, data, lifecycle actions or collaboration rights, and everyone gets the same view. What a person
may do comes from their Clerk workspace role (Admin, Member, Guest, Viewer) and from Request-scoped
responsibilities such as being its Requester, a Reviewer or the assignee.

## Consequences

- There are no per-label dashboards and no label-based gates; PM is not a permission to close.
- Changing a label is always safe: it can never grant review or closure authority.

Source: `REQUIREMENTS.md` §1 (permanent principles) and §2.
