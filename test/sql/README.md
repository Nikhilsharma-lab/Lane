# pg-tap SQL tests

SQL-level tests for Lane's migrations and Postgres RPCs, written using
[pg-tap](https://pgtap.org/). These complement the existing Vitest layer
(pure-function unit tests in `test/*.test.ts`) and the planned Playwright
layer (`e2e/`) by catching schema and RPC bugs at the database level
before they reach app code.

## Scope

Tests in this directory cover migrations 0011-0014 (per
`docs/user-flows-spec.md` §15 Phase B) and the RPCs they introduce:

- `0011_populate_workspace_members.sql` — workspace_members + audit_log + waitlist_approvals + idempotent bootstrap/accept RPCs
- `0012_invite_team_scoping.sql` — invite team_id/team_role + unique pending invite index
- `0013_ownership_transfer.sql` — transfer_workspace_ownership RPC
- `0014_profiles_left_at.sql` — profiles.left_at + orphaned workspace admin view

See `docs/user-flows-spec.md` §14 for the full test matrix
(~20 pg-tap test cases across these migrations).

## Running locally

```
npm run test:sql
```

Runs all `test/sql/*.sql` files against the database pointed to by
`DIRECT_DATABASE_URL` in `.env.local`. Each file runs inside a single
transaction with `ROLLBACK` at the end, so tests do not pollute the DB
between runs.

## Production safety

pg-tap is **dev-only**. The extension is installed via
`db/migrations/dev_only_pgtap.sql` (deliberately unnumbered so
`drizzle-kit push` and `drizzle-kit migrate` never apply it). Tests
in this directory will only run against `DIRECT_DATABASE_URL`, which
points at the `lane dev` Supabase project — never production. See
`docs/WORKING-RULES.md` "Supabase connection strings" section for
the connection-URL contract.

## Naming convention

`test_<target>.sql` where `<target>` describes what's under test:

- `test_smoke.sql` — sanity check that the harness itself works
- `test_migration_0011.sql` — assertions for migration 0011 schema + RPCs
- `test_migration_0012.sql` — etc.
- `test_transfer_ownership.sql` — RPC-specific test outside a migration
- `test_orphan_view.sql` — view-specific test

## Test file template

```sql
BEGIN;
SELECT plan(N);                       -- declare expected number of assertions

-- ... assertions using ok(), is(), has_table(), has_column(), throws_ok(), etc.

SELECT * FROM finish();
ROLLBACK;
```

Wrap every test in `BEGIN`/`ROLLBACK` so the DB state is unchanged after
the test runs. `SELECT plan(N)` declares how many assertions the file
will run; `finish()` verifies that count matches what actually ran.
