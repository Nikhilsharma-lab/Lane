# Lane dev bootstrap procedure

How to populate an empty `lane dev` Supabase project with Lane's full
schema + dev-only test infrastructure. Used for first-time setup of a
fresh `lane dev` project and after a schema reset.

> **Placeholders.** This doc uses `<lane-dev-ref>` for the `lane dev`
> Supabase project ref and `<lane-app-ref>` for the `lane app`
> (production) project ref. Substitute your actual refs (from
> `.env.local` or the Supabase dashboard) before running any snippet —
> the `if (url.includes('<lane-app-ref>'))` guard only triggers after
> substitution.

> Procedure written against commit `fed633e` (A3 shipped, Phase A
> complete). **Revised 2026-04-21:** Step 1 uses `drizzle-kit migrate`
> (was push); new Step 0 (Reset) added. If Lane's schema files
> (`db/schema/`) or dev-only migrations (`db/migrations/dev_only_*.sql`)
> change materially, this doc needs review.
> **Last verified:** 2026-04-21 (corrected procedure: schema install
> via migrate + reset procedure verified end-to-end against commit
> `c171f5e` schema state).

**NOT for production.** This procedure applies dev-only migrations
(`dev_only_pgtap.sql`, `dev_only_sent_emails.sql`) that must never
reach production. Every command below is gated on `DIRECT_DATABASE_URL`
pointing at the `lane dev` project ref (`<lane-dev-ref>`).

## When to use this procedure

- First-time setup of `lane dev` (schema has never been pushed)
- After a schema reset (run Step 0 first; see Step 0.3 for why explicit drops)
- Onboarding a new collaborator who created their own `lane dev`-equivalent
  project

Do NOT use this procedure on production (`lane app`, ref
`<lane-app-ref>`). Production schema is applied via raw SQL in the
Supabase dashboard per the existing Lane workflow. This procedure is a
dev-only pattern.

## Canonical ordering

The order matters. **Drizzle-managed schema first, dev-only
infrastructure on top.** Reversing the order causes Drizzle to see
dev-only tables as "extra" and complicate subsequent migrations.

0. **(Only if bootstrapping onto non-empty state)** Reset to known-good
   empty state per Step 0 below
1. **Apply Lane's schema** via `drizzle-kit migrate` (applies tables +
   enums + RPCs + RLS policies + helper functions per
   `db/migrations/0000-NNNN_*.sql`)
2. **Install pg-tap** via `db/migrations/dev_only_pgtap.sql` (SQL-level
   testing, A1 harness)
3. **Install sent_emails capture** via `db/migrations/dev_only_sent_emails.sql`
   (e2e test email capture, A2b harness)
4. (Optional) **Apply test fixture** via `supabase/test-seed.sql`
   (deterministic test-baseline data, A3 harness)

## Pre-flight: verify you're targeting lane dev

Run this check once before any step below. If the ref isn't
`<lane-dev-ref>`, stop — do not proceed.

```bash
npx dotenv-cli -e .env.local -o -- node -e "
const url = process.env.DIRECT_DATABASE_URL;
const ref = url?.match(/postgres\.(\w+)/)?.[1];
console.log('project ref:', ref);
if (ref !== '<lane-dev-ref>') {
  console.error('NOT lane dev — refusing to proceed');
  process.exit(2);
}
"
```

Expected output: `project ref: <lane-dev-ref>` then exit 0.

## Step 0 (only if bootstrapping onto non-empty state) — Reset

Skip this section for fresh Supabase projects. Required only when lane
dev already contains tables, enums, or other Lane application objects
from a prior bootstrap.

### 0.1 Pre-reset safety check

Verify lane dev contains no application data worth preserving before any
DROP fires:

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('<lane-app-ref>')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
  const sql = postgres(url, { max: 1 });
  const tables = await sql\`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename\`;
  let totalRows = 0;
  for (const t of tables) {
    const cnt = await sql.unsafe('SELECT count(*)::int AS n FROM public.\"' + t.tablename + '\"');
    totalRows += cnt[0].n;
    if (cnt[0].n > 0) console.log('  ' + t.tablename + ': ' + cnt[0].n + ' rows');
  }
  console.log('Total rows across public tables:', totalRows);
  if (totalRows > 0) { console.error('FAIL: tables contain data — investigate before reset'); process.exit(1); }
  console.log('Safe to reset.');
  await sql.end();
});
"
```

Expected: `Total rows across public tables: 0` and `Safe to reset.` If
any table reports data, **STOP** and investigate before proceeding.

### 0.2 Drop tables, enums, and pgtap

PostgreSQL DROP semantics: enums are independent of tables, so
`DROP TABLE CASCADE` does not remove them. Dropping just the tables
leaves orphan enums that block subsequent `CREATE TYPE` in migrations.
Composite types, domains, and standalone sequences behave the same way.
The enumeration below catches all Lane-application objects while
preserving Supabase platform infrastructure (see preservation note in
Step 0.3).

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('<lane-app-ref>')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  // Drop tables (one DROP TABLE per table — see preservation note for why not DROP SCHEMA)
  const tables = await sql\`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename\`;
  for (const t of tables) {
    await sql.unsafe('DROP TABLE IF EXISTS public.\"' + t.tablename + '\" CASCADE');
  }
  console.log('dropped ' + tables.length + ' tables');

  // Drop enums (dynamically generated — never hand-typed)
  const enumDrop = await sql\`
    SELECT string_agg('DROP TYPE IF EXISTS public.' || quote_ident(typname) || ' CASCADE', '; ') AS sql
    FROM pg_type
    WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public') AND typtype = 'e'
  \`;
  if (enumDrop[0].sql) {
    await sql.unsafe(enumDrop[0].sql);
    console.log('dropped enums');
  }

  // Drop pgtap (re-installed in Step 2)
  await sql.unsafe('DROP EXTENSION IF EXISTS pgtap CASCADE');
  console.log('dropped pgtap extension');

  await sql.end();
});
"
```

If lane dev has composite types, domains, or standalone sequences
(uncommon for Lane's schema), enumerate and drop them similarly:
- composites: `pg_type` filter `typtype='c'` (only standalone — table-row composites auto-vanish with their tables)
- domains: `pg_type` filter `typtype='d'`
- sequences: `pg_class` filter `relkind='S'` (only standalone — SERIAL-column sequences auto-vanish with their tables)

### 0.3 Preservation note — DO NOT DROP

**Do NOT drop functions in `public` schema indiscriminately.** Supabase
provisions `rls_auto_enable`, an event trigger that fires on every
`CREATE TABLE` in the public schema and automatically runs
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on the new table. This is
why Lane's tables have RLS enabled even without explicit `ENABLE`
statements in most migrations. Dropping it silently disables auto-RLS
for all future tables on the project.

**Do NOT use `DROP SCHEMA public CASCADE`** on Supabase projects. It
removes platform-provided event triggers, helper functions, and extensions
along with Lane's application objects. Always use the explicit
`DROP TABLE` and `DROP TYPE` enumeration in Step 0.2.

### 0.4 Verify reset state

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const sql = postgres(process.env.DIRECT_DATABASE_URL, { max: 1 });
  const tables = await sql\`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'\`;
  const enums = await sql\`SELECT count(*)::int AS n FROM pg_type WHERE typnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') AND typtype='e'\`;
  const fns = await sql\`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'\`;
  const pgtap = await sql\`SELECT extversion FROM pg_extension WHERE extname='pgtap'\`;
  console.log('tables:', tables[0].n, '(expect 0)');
  console.log('enums:', enums[0].n, '(expect 0)');
  console.log('functions:', fns[0].n, '(expect 1+ — at minimum rls_auto_enable)');
  console.log('pgtap:', pgtap.length ? pgtap[0].extversion : '<not installed>');
  if (tables[0].n !== 0 || enums[0].n !== 0 || fns[0].n < 1 || pgtap.length !== 0) {
    console.error('FAIL: reset incomplete'); process.exit(1);
  }
  console.log('reset verified');
  await sql.end();
});
"
```

Expected: `tables: 0`, `enums: 0`, `functions: 1+` (1 or more —
`rls_auto_enable` always; Supabase may add others over time as the
platform evolves), `pgtap: <not installed>`, `reset verified`. The
remaining function(s) are Supabase platform infrastructure — preserved
by design per 0.3.

After verification passes, proceed to Step 1.

## Step 1 — Apply Lane schema via Drizzle

```bash
npx dotenv-cli -e .env.local -o -- npx drizzle-kit migrate
```

`drizzle-kit migrate` walks `db/migrations/_journal.json` and applies every
numbered migration not yet recorded in `drizzle.__drizzle_migrations`. This
is the canonical install path: it produces tables + enums + RPCs + RLS
policies + helper functions, matching production's structure.

(`drizzle-kit push` applies schema files only — tables and enums — and is
NOT used for bootstrap. Push misses RPCs and RLS policies that Lane
depends on.)

Expected: 10 migrations apply (0000 through 0009 as of 2026-04-21), under
30 seconds. Final line: `[✓] migrations applied successfully!`

**Verify (required — silent-success failures are the most dangerous):**

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const sql = postgres(process.env.DIRECT_DATABASE_URL, { max: 1 });
  const tables = await sql\`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'\`;
  const migs = await sql\`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations\`;
  const rpcs = await sql\`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('accept_invite_membership','bootstrap_organization_membership')\`;
  console.log('public base tables:', tables[0].n);
  console.log('__drizzle_migrations rows:', migs[0].n);
  console.log('Lane RPCs present:', rpcs[0].n, '/ 2');
  if (tables[0].n < 20) { console.error('FAIL: expected 20+ Lane tables, got', tables[0].n); process.exit(1); }
  if (migs[0].n === 0) { console.error('FAIL: __drizzle_migrations empty — migrate did not run'); process.exit(1); }
  if (rpcs[0].n !== 2) { console.error('FAIL: expected 2 Lane RPCs, got', rpcs[0].n); process.exit(1); }
  await sql.end();
});
"
```

Expected: `public base tables: 34+`, `__drizzle_migrations rows: 10+`,
`Lane RPCs present: 2 / 2`, exit 0.

If any check fails: `drizzle-kit migrate` did not fully apply. **Stop
here and diagnose** (check migrate output for errors, verify no migration
was rejected) before proceeding to Step 2.

## Step 2 — Install pg-tap

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const { readFileSync } = await import('fs');
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('<lane-app-ref>')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
  const sql = postgres(url, { max: 1 });
  const text = readFileSync('db/migrations/dev_only_pgtap.sql', 'utf8');
  await sql.unsafe(text);
  const r = await sql\`SELECT extversion FROM pg_extension WHERE extname='pgtap'\`;
  if (r.length === 0) { console.error('FAIL: pgtap not installed after apply'); process.exit(1); }
  console.log('pgtap version:', r[0].extversion);
  await sql.end();
});
"
```

Expected: `pgtap version: 1.3.3` (or newer), exit 0.

If no row returned or exit non-zero: pgtap install failed. **Stop
here and diagnose** (check Supabase extension allowlist, re-read
`db/migrations/dev_only_pgtap.sql`) before proceeding to Step 3.

## Step 3 — Install sent_emails capture table

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const { readFileSync } = await import('fs');
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('<lane-app-ref>')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
  const sql = postgres(url, { max: 1 });
  const text = readFileSync('db/migrations/dev_only_sent_emails.sql', 'utf8');
  await sql.unsafe(text);
  // Verify: table exists AND has the 6 expected columns
  const cols = await sql\`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sent_emails'
    ORDER BY ordinal_position
  \`;
  const expected = ['id','to_address','subject','body_html','template_name','created_at'];
  const actual = cols.map(c => c.column_name);
  const match = expected.length === actual.length && expected.every((c, i) => c === actual[i]);
  if (!match) { console.error('FAIL: sent_emails columns do not match expected.\\n  expected:', expected, '\\n  actual:', actual); process.exit(1); }
  const r = await sql\`SELECT count(*)::int AS n FROM sent_emails\`;
  console.log('sent_emails columns:', actual.join(', '));
  console.log('sent_emails rows:', r[0].n);
  await sql.end();
});
"
```

Expected: columns match verbatim (`id, to_address, subject, body_html, template_name, created_at`), `sent_emails rows: 0`, exit 0.

If columns don't match: `dev_only_sent_emails.sql` has drifted from
the schema this doc was written against. **Stop here and diagnose**
(re-read the migration file, compare against A2b commit `ec41cf2`)
before proceeding to Step 4.

## Step 4 (optional) — Apply A3 test fixture

Use only when tests are about to consume the fixture. Not required for
the baseline bootstrap.

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const { readFileSync } = await import('fs');
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('<lane-app-ref>')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
  const sql = postgres(url, { max: 1 });
  const text = readFileSync('supabase/test-seed.sql', 'utf8');
  await sql.unsafe(text);
  console.log('test-seed applied');
  await sql.end();
});
"
```

**Verify fixture counts** (copy-pastable node one-liner with explicit fail-stop):

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const sql = postgres(process.env.DIRECT_DATABASE_URL, { max: 1 });
  const checks = [
    { name: 'organizations', q: sql\`SELECT count(*)::int AS n FROM organizations WHERE slug LIKE 'test-%'\`, expected: 1 },
    { name: 'profiles',      q: sql\`SELECT count(*)::int AS n FROM profiles WHERE email LIKE '%@e2e.lane.test'\`, expected: 4 },
    { name: 'workspace_members', q: sql\`SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = '00000000-0000-0000-0000-000000000001'\`, expected: 4 },
    { name: 'invites',       q: sql\`SELECT count(*)::int AS n FROM invites WHERE email LIKE '%@e2e.lane.test'\`, expected: 1 },
  ];
  let allMatch = true;
  for (const c of checks) {
    const [row] = await c.q;
    const ok = row.n === c.expected;
    console.log(\`  \${c.name}: \${row.n} (expected \${c.expected}) \${ok ? '✓' : '✗'}\`);
    if (!ok) allMatch = false;
  }
  await sql.end();
  if (!allMatch) process.exit(1);
});
"
```

Expected: all 4 checks pass with `✓`, exit 0.

If any count mismatches: `supabase/test-seed.sql` either failed to
apply cleanly or drifted from the expected fixture. **Stop here and
diagnose** (re-read `supabase/test-seed.sql`, check for FK errors in
the apply output, compare against A3 commit `fed633e`).

## After bootstrap completes

- `npm run test:sql` should pass (pg-tap smoke test)
- `npm run test:e2e` should pass (Playwright smoke tests)
- Lane dev is ready for Phase B migration work

## If the bootstrap gets wedged

Run Step 0 (Reset) to clear lane dev to a known-good empty state, then
re-run this procedure from Step 1. **Do not use `DROP SCHEMA public
CASCADE`** — see Step 0.3 for why.

## Future improvements (parking lot candidates)

The node-inline commands above are functional but verbose. A
`scripts/apply-dev-only-sql.mjs` wrapper that takes a SQL file path +
enforces the production-ref guard would make these steps one-liners.
Not done yet — write when the third or fourth dev-only migration lands
and the pattern is clearly established.
