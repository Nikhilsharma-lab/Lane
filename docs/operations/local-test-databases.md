# Disposable local test databases

Every real Git checkout, including the main checkout, owns one database named
`lane_test_<readable checkout name>_<path digest>` (at most 63 characters). The
identity is the canonical real checkout root: a branch change, subfolder, or
symlink alias keeps it; a different or moved root changes it. Tool-specific
worktree locations are not special. Unknown checkout identity fails closed.

## Configuration and verification

Keep local server credentials in the ignored `.env.test`. `DATABASE_URL` must use
`postgres:` or `postgresql:`, an explicit user, `localhost` or `127.0.0.1`, and a
valid port (omitting the port means 5432). Query strings and fragments are refused,
including empty `?` and `#`. Never use a hosted or production URL.

The pathname `/lane_test` is a configuration placeholder. Vitest replaces it with
this checkout's assigned database before setup or workers start. An explicit
pathname is accepted only if it exactly matches that assigned name; another
checkout's database is an error. Database tests and reset both use the same
validator and require the resolved URL, rather than accepting a prefix match.
Reset strips inherited `PG*` routing and uses `psql -X -v ON_ERROR_STOP=1`.

Bootstrap before running any reset-capable suite:

```sh
pnpm exec vitest run --config vitest.architecture.config.ts
pnpm test
pnpm test:ui
```

The architecture configuration loads no environment file or global setup. Its
Git fixtures, filesystem locks and child processes are temporary; its reset tests
mock PostgreSQL subprocesses. The main `pnpm test` suite **does reset** its assigned
local database, even when filtered to a single test. The setup log prints only the
assigned database name, never the credentials. The UI configuration has no reset.

## Ownership and recovery

The runner claims the target before the first reset command, retains ownership
through all tests, and releases at teardown or failed setup. Normal process exit
also releases when no other process-group member remains. Concurrent runs of the same checkout fail as **already running**;
different checkout targets can run independently. Both loopback hostname spellings
share a lock; changing credentials cannot bypass ownership.

Locks live in `/tmp/lane-test-run-locks/`, independent of checkout,
branch, OS user and `TMPDIR`. Another OS user without access fails closed; separate
per-user lock directories must not bypass the machine-wide lock. The error identifies one `.json` ownership record and its
`.guard` directory. The record contains a random run token, PID, process group, machine/boot
identity and target information; it contains no credentials. The guard serializes
acquisition, release and stale recovery. Cleanup checks its own token, so an old
teardown cannot release a successor.

On macOS, reading `kern.boottime` may require permission outside a tool sandbox;
on Linux, `/proc/sys/kernel/random/boot_id` supplies boot identity. Unavailable
identity fails closed. This lock implementation supports these two platforms.

Automatic crash recovery requires intact metadata from this machine and this
boot, a valid run token, and OS-confirmed absence (`ESRCH`) of both the PID and its process group.
A dead runner can leave workers or a PostgreSQL client running, so PID absence
alone is insufficient. Vitest workers and reset clients inherit that group; database
work must not be launched as detached processes. A live or reused PID/group, permission failure, another boot, corrupt/incomplete metadata, or leftover
guard is ambiguous and is never recovered based on elapsed time. Competing
recovery attempts pass through the same atomic guard.

For ambiguous ownership:

1. Stop test runners for this target and coordinate with other local sessions.
2. Read only the exact lock record identified in the error. Inspect its PID,
   process group, checkout and port; inspect running Vitest/Node/PostgreSQL client processes and
   verify that no work for this target is still active. A missing PID or old
   timestamp alone does not authorize manual deletion, especially after a reboot
   or when metadata is incomplete.
3. If ownership is still uncertain, leave both paths in place. Resolve the
   uncertainty with the session owner; do not bypass the lock or change its token.
4. Once the target is confirmed idle, preserve the record for diagnosis and
   explicitly remove only that target's `.json` and, if present, empty `.guard`
   directory. Never clear the whole lock directory. Then rerun bootstrap/tests.

## Obsolete databases

Moving or deleting a checkout does not delete its former database. Ordinary test
execution never enumerates or opportunistically deletes old targets. The legacy
shared `lane_test` database is likewise left alone.

For explicit cleanup, first stop relevant runners and inspect databases on the
configured **local** server with its intended user and port. List candidates with
`SELECT datname FROM pg_database WHERE datname LIKE 'lane_test%';`, compare the
exact names with current checkouts, and inspect their contents and
`pg_stat_activity` before deciding they are disposable. Back up anything whose
origin or value is uncertain. Only after this inspection, explicitly run `dropdb`
for the one confirmed obsolete name with explicit loopback host, port and user,
with inherited `PG*` routing cleared. Never use wildcard/batch deletion or
terminate other sessions automatically. This is an operator action, not part of
test startup.
