---
status: proposed
---

# Better Auth in Lane's Postgres owns identity and tenancy

Proposed to supersede ADR 0001 at cutover; until then ADR 0001 stays in force. Better Auth, running inside Lane
with its tables in Lane's Postgres, becomes the one authority for accounts, sessions, workspaces, memberships,
roles and invitations. No other Lane table duplicates membership, role or invitation state, and identity, the
active workspace and the role come only from the server-side session and its membership row, never from client
arguments. Lane moves because Clerk charges for what it needs (custom roles at $100/mo, badge removal at $25/mo)
and Lane wants sign-in forms it owns; the price is rebuilt screens, owned auth email and patching within days of
each advisory (decided 2026-11-20).

## Considered Options

- Staying on Clerk: free at pilot size, but Guest and Viewer would wait for a paid plan.
- Better Auth's built-in `owner` role: rejected because it adds a rank above Admin. The creator is a plain Admin,
  all Admins are equal, and a workspace always keeps at least one Admin.
- Separate Better Auth `user` and `organization` tables beside `profiles` and `organizations`: rejected because the
  copied name and email drift. Better Auth's tables map onto Lane's.
- Better Auth's cookie cache for the role: rejected because it delays revocation. Each request reads the
  membership row.

## Consequences

- Every Better Auth upgrade that adds columns is a Lane migration, run on staging after a verified export.
- Postgres now holds password hashes and sessions, so manual exports are handled as secrets.

Source: [Decision: Better Auth architecture within the free pilot budget](https://github.com/Nikhilsharma-lab/Lane/issues/333#issuecomment-7032864198).
