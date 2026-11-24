---
status: superseded by ADR-0008
---

# Clerk owns identity and tenancy

Superseded by [ADR 0008](0008-better-auth-owns-identity-and-tenancy.md). The rest of this record is the decision as made
on 2026-09-24, kept as history.

Clerk is the only authority for users, sessions, organizations, memberships, roles and invitations; Supabase
only hosts Postgres and private attachments (clean cutover, 2026-09-24). Lane stores Clerk's `user_*` and
`org_*` IDs directly as ownership keys and keeps no membership or invitation tables, so identity, active
organization and organization role always come from the Clerk session, never from client arguments.

## Considered Options

- Supabase Auth with Lane-owned membership and invitation tables: what Lane ran before the cutover. Removed
  with no compatibility layer; existing users were test data and were reset, not migrated.

## Consequences

- Guest and Viewer exist only where Clerk supplies the `org:guest` and `org:viewer` custom roles, which needs
  Clerk Enhanced B2B in production. Free-plan production is Admin and Member only.
- Lane never recreates a permission Clerk lacks in Postgres; a missing role waits for Clerk.

Source: `docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md`, `REQUIREMENTS.md` §2.
