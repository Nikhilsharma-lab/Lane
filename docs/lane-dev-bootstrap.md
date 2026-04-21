# Lane dev bootstrap procedure

How to populate an empty `lane dev` Supabase project with Lane's full
schema + dev-only test infrastructure. Used for first-time setup of a
fresh `lane dev` project and after a schema reset.

> Procedure written against commit `fed633e` (A3 shipped, Phase A
> complete). If Lane's schema files (`db/schema/`) or dev-only
> migrations (`db/migrations/dev_only_*.sql`) change materially, this
> doc needs review. **Last verified:** 2026-04-20 (first successful
> bootstrap run — commit `fed633e` schema state).

**NOT for production.** This procedure applies dev-only migrations
(`dev_only_pgtap.sql`, `dev_only_sent_emails.sql`) that must never
reach production. Every command below is gated on `DIRECT_DATABASE_URL`
pointing at the `lane dev` project ref (`clbtrqaazyurnnupiasc`).

## When to use this procedure

- First-time setup of `lane dev` (schema has never been pushed)
- After a schema reset (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
- Onboarding a new collaborator who created their own `lane dev`-equivalent
  project

Do NOT use this procedure on production (`lane app`, ref
`dsivjzwalqqpojopcmyb`). Production schema is applied via raw SQL in the
Supabase dashboard per the existing Lane workflow. The `drizzle-kit push`
step here is explicitly a dev-only pattern.

## Canonical ordering

The order matters. **Drizzle-managed schema first, dev-only
infrastructure on top.** Reversing the order causes `drizzle-kit push`
to see dev-only tables as "extra" and propose to drop them.

1. **Apply Lane's schema** via `drizzle-kit push` (creates all Lane tables
   per `db/schema/*.ts`)
2. **Install pg-tap** via `db/migrations/dev_only_pgtap.sql` (SQL-level
   testing, A1 harness)
3. **Install sent_emails capture** via `db/migrations/dev_only_sent_emails.sql`
   (e2e test email capture, A2b harness)
4. (Optional) **Apply test fixture** via `supabase/test-seed.sql`
   (deterministic test-baseline data, A3 harness)

## Pre-flight: verify you're targeting lane dev

Run this check once before any step below. If the ref isn't
`clbtrqaazyurnnupiasc`, stop — do not proceed.

```bash
npx dotenv-cli -e .env.local -o -- node -e "
const url = process.env.DIRECT_DATABASE_URL;
const ref = url?.match(/postgres\.(\w+)/)?.[1];
console.log('project ref:', ref);
if (ref !== 'clbtrqaazyurnnupiasc') {
  console.error('NOT lane dev — refusing to proceed');
  process.exit(2);
}
"
```

Expected output: `project ref: clbtrqaazyurnnupiasc` then exit 0.

## Step 1 — Apply Lane schema via Drizzle

```bash
npx dotenv-cli -e .env.local -o -- npx drizzle-kit push
```

Drizzle Kit reads `drizzle.config.ts` (which points at `DIRECT_DATABASE_URL`)
and prompts interactively before applying. For a truly empty public schema,
expect a list of `CREATE TABLE` statements per file in `db/schema/`. No
`DROP` statements should appear. Confirm to apply.

If `DROP` appears: **abort** (Ctrl-C at the prompt). This means the public
schema has pre-existing tables outside Drizzle's managed set — investigate
before proceeding.

**Verify (required — silent-success failures are the most dangerous):**

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const sql = postgres(process.env.DIRECT_DATABASE_URL, { max: 1 });
  const r = await sql\`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'\`;
  console.log('public base tables:', r[0].n);
  if (r[0].n < 20) { console.error('FAIL: expected 20+ Lane tables, got', r[0].n); process.exit(1); }
  await sql.end();
});
"
```

Expected: `public base tables: 20+` (matches `db/schema/*.ts` file count), exit 0.

If count < 20: `drizzle-kit push` did not fully apply. **Stop here
and diagnose** (check the push output for errors, verify no CREATE
TABLE was rejected) before proceeding to Step 2.

## Step 2 — Install pg-tap

```bash
npx dotenv-cli -e .env.local -o -- node -e "
import('postgres').then(async ({default: postgres}) => {
  const { readFileSync } = await import('fs');
  const url = process.env.DIRECT_DATABASE_URL;
  if (url.includes('dsivjzwalqqpojopcmyb')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
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
  if (url.includes('dsivjzwalqqpojopcmyb')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
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
  if (url.includes('dsivjzwalqqpojopcmyb')) { console.error('PRODUCTION REF — REFUSING'); process.exit(2); }
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

Emergency reset — wipes ALL data on lane dev (harmless for dev, NEVER for prod):

```sql
-- Run via psql or node-script against DIRECT_DATABASE_URL (lane dev only)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

Then re-run this procedure from Step 1.

## Future improvements (parking lot candidates)

The node-inline commands above are functional but verbose. A
`scripts/apply-dev-only-sql.mjs` wrapper that takes a SQL file path +
enforces the production-ref guard would make these steps one-liners.
Not done yet — write when the third or fourth dev-only migration lands
and the pattern is clearly established.
