# Production Cutover and Rollback Runbook

> **For agentic workers:** This runbook is an operating procedure, not an authorization. It does not change `AGENTS.md`, `REQUIREMENTS.md`, `lane-roadmap.md` or `DEFERRED.md`. Every step marked **[N: authorize]** needs Nikhil's explicit, per-step go-ahead in chat before it runs (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` §6.3: "each step needs its own explicit authorization"). Checkboxes are gates still to pass. None of them means anything has shipped.

**Goal:** Move `app.uselane.app` from the pre-Clerk app (`main` at `826e509`, Supabase project `tcfwabpoiydvfqxhtkur`) to the Clerk app on migrations 0013–0019, with one verified way back.

**Authority:** Plan `2026-10-10-mvp-launch-linear.md` §6.1 (first row, "A writes, N approves", ref C6), §6.3 and §9, accepted by Nikhil on 2026-10-10. The migration order and the staging-first rule come from `AGENTS.md:72-77` and `REQUIREMENTS.md` "Data and operations". The Clerk cutover evidence and the staging dump convention come from `docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md`.

**Status:** Draft for Nikhil's approval. Nothing in this document has been run against production. Staging (`jznepeqghjixcrpuddym`, `ap-northeast-1`) already has 0013–0019 applied and verified (`2026-10-08-saved-request-codes.md:46`).

**Owner key:** **N** = Nikhil (dashboard, secrets, decisions), **A** = agent (commands, verification, writing), **N+A** = both. **[N: authorize]** = the step writes to production, Vercel, Clerk, Supabase or GitHub and must not start without Nikhil saying so for that step.

---

## 0. What this cutover does, in plain words

1. Production today is the old app. Its database has tables with Supabase Auth user ids and its own membership and invite tables.
2. Migration `0013_clerk_clean_cutover.sql` drops every application table and recreates them keyed by Clerk ids (`user_*`, `org_*`). It is destructive on purpose: all production rows are disposable test data (plan §6.3 D1).
3. Migrations 0014–0019 add the safeguards, Projects, Expected impact, Request codes, design reviews and priority that the new app needs.
4. The moment 0013 commits, the old app breaks. The new app must already be built and waiting so it can be promoted within minutes.
5. After 0013, "redeploy the old code" does not work: the old code expects tables that no longer exist. Rollback means restoring the pre-cutover dump and then redeploying `826e509`. Section 7 is that procedure.

### Expected downtime window

| From | To | Expected | Budget |
|---|---|---|---|
| The first `DROP TABLE` in 0013 commits (step 5.5) | `app.uselane.app` serves the promoted new deployment (step 5.6) | 2–5 minutes: seven migration files that each ran in seconds on staging, one verification script, one `promote` | 15 minutes |
| If rollback is needed (section 7) | Old deployment serving again against the restored dump | about 10 minutes for a dump of this size (the staging dump was 311 KB) | 30 minutes |

Everyone's old session ends at cutover and every person creates a fresh Clerk account. That is a product decision (`2026-09-24-clerk-clean-cutover.md`, "Existing sessions end at cutover"), not downtime.

---

## 1. Preconditions (plan §6.1, every row as a gate)

Tick a box only with evidence. "Owner N/A" means the row is a decision or dashboard action that no agent can do.

- [ ] **Runbook approved.** Nikhil has read this document and approved it as the cutover procedure. Owner: N (A wrote it). Ref C6.
- [ ] **Preview env checked.** The `lane` project's Preview deployments do not point at the production database; Fluid compute and the Node version are confirmed. Owner: N/A (N). Ref C3, C4.
- [ ] **Clerk plan for team sizes** (decision 8.3) decided and recorded. The dev instance's unlimited-members paid feature is not cloned without approval. Owner: N/A (N). Ref G1, G8.
- [ ] **Clerk production instance exists** with Organizations on, Membership required, `org:admin` and `org:member`. Owner: N/A (N). Ref G1, G4.
- [ ] **DNS CNAMEs** in Vercel DNS: `clerk.`, `accounts.`, `clkmail.`, `clk._domainkey`, `clk2._domainkey`. Owner: N/A (N). Ref G2.
- [ ] **Sign-in and sign-up hosted on `/login` and `/signup`** in the production instance. Owner: N sets, A verifies on production only. Ref G5.
- [ ] **Clerk branding and email templates say "Lane"** (today staging sends as `My Application <invitations@accounts.dev>`, `2026-09-24-clerk-clean-cutover.md:174`). Owner: N/A (N). Ref G6.
- [ ] **Sign-up policy** (decision 8.9) and bot protection set; social providers have production OAuth credentials or are off. Owner: N/A (N). Ref G7, G9.
- [ ] **`allowedRedirectOrigins`** no longer lists localhost in production (`src/app/layout.tsx:37-43`). Owner: A. Ref G10.
- [ ] **Manual deletion procedure** written: `docs/operations/account-deletion.md`. Owner: N+A. Ref G11.
- [ ] **Startup env check** (zod) fails a production build or boot when a required key is missing; `.env.example` lists the KV keys. Owner: A. Ref I4, I5.
- [ ] **Vercel production env complete** on the `lane` project: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (a `pk_live` key), `CLERK_SECRET_KEY` (`sk_live`), `CLERK_JWT_KEY`, `DATABASE_URL` (transaction pooler), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `TRIAGE_TOKEN_SECRET`, `NEXT_PUBLIC_APP_URL` (`https://app.uselane.app`), `KV_REST_API_URL`, `KV_REST_API_TOKEN`. If decision 8.2 creates a new Supabase project, the three Supabase values change. Owner: N/A (N). Ref I3.
- [ ] **Upstash Redis created** and the KV keys set on prod and staging. Until then the limiter fails open (`src/lib/rate-limit.ts:6-13`). Owner: N/A (N). Ref J1.
- [ ] **Anthropic spend cap** with an alert at 50 percent. The AI gate is mandatory and times out at 15 s (`src/lib/ai/triage.ts:90`); the `(app)` layout allows 30 s (`src/app/(app)/layout.tsx:13`). Owner: N/A (N). Ref J2.
- [ ] **Security headers** in `next.config.ts` with CSP in Report-Only. Owner: A. Ref K1, K2.
- [ ] **Error monitoring, uptime monitor on `app.uselane.app`, Speed Insights** (decision 8.13). Owner: N decides, A wires. Ref M1, M3, M5.
- [ ] **Terms, Privacy and contact pages live** with the processor list (Clerk, Supabase, Vercel, Anthropic, Upstash, monitoring), `support@` inbound mail, the Clerk consent checkbox, and advice on DPDP/GDPR received. Owner: N content, A pages. Ref P1–P5, H3.
- [ ] **Linear-derived material** handled per decision 8.7; Arc Pro licence confirmed (8.8). Owner: N decides, A executes. Ref R1–R4.
- [ ] **Old Supabase-era test password** (public history, `01acf82`) is not reused anywhere. Owner: N/A (N). Ref D9.
- [ ] **Staging release candidate passed** §6.2 (deploy, golden journeys, manual walk-through, perf numbers recorded). Owner: N+A.
- [ ] **`main` is protected** (plan item 0.1) so PR #35 cannot merge before promotion. Owner: N/A (N).
- [ ] **Local tools present.** `pg_dump`, `pg_restore`, `psql`, `createdb`, `dropdb` (Homebrew PostgreSQL 17 is installed), `gpg` (installed), local PostgreSQL on `127.0.0.1:5432` (the one `src/test/global-setup.ts` uses). The Vercel CLI is not installed; the commands below run it with `pnpm dlx vercel@latest`, which adds no dependency to the repo. Owner: A.

---

## 2. Secrets handling for the whole day

- Production connection strings go into shell variables for the one terminal session, never into a file Next.js reads. Next.js loads `.env`, `.env.local`, `.env.production` and `.env.production.local`; a file named `.env.prod-cutover.local` is ignored by git (`.gitignore:40`) and never loaded by Next. Delete it after step 5.8.
- `pg_dump` and `psql` need a **session** connection (port 5432 on the Supabase pooler, or the direct host), not the transaction pooler on 6543 that `DATABASE_URL` uses for the app. Copy it from the Supabase dashboard "Connect" panel in session mode.
- Never print a value. Commands below print only counts, names and prefixes.

```bash
# Nikhil pastes these into one terminal; they are not stored anywhere.
export LANE_PROD_SESSION_URL='<session-mode connection string for tcfwabpoiydvfqxhtkur>'
export PGSSLMODE=require
export CUTOVER_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p backups && chmod 700 backups
```

---

## 3. Day minus one: dry run on a copy of production (plan §6.3 D3, part one)

These steps read production and write only to the laptop. They need **one** authorization because they open a production connection.

### 3.1 Take the pre-cutover dump **[N: authorize: read-only production dump]**

```bash
# Application schema and data, custom format, with ACLs so a production restore keeps its grants.
pg_dump --format=custom --schema=public \
  --file="backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" "$LANE_PROD_SESSION_URL"
chmod 600 "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"

# Best effort: Supabase Auth accounts, so a rollback before D8 keeps old logins working.
# Supabase may refuse parts of the auth schema to the postgres role; a failure here is
# recorded, not fixed, because D1 says every account is disposable test data.
pg_dump --format=custom --schema=auth \
  --file="backups/lane-prod-auth-pre-0013-${CUTOVER_TS}.dump" "$LANE_PROD_SESSION_URL" \
  || echo "auth schema dump failed; recorded, continue"
```

- [ ] **Verify the archive.** `pg_restore --list` must succeed and list the eight pre-Clerk tables.

```bash
pg_restore --list "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" | grep -c 'TABLE DATA'   # expect 8
pg_restore --list "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" | grep 'TABLE DATA' | awk '{print $NF, $(NF-1)}'
# expect: comments invites notifications organizations profiles request_attachments requests workspace_members (any order)
ls -l backups/lane-prod-pre-0013-*.dump
```

- [ ] **Encrypted off-machine copy** (plan §6.3 D3, E3: the laptop is the only machine). `gpg` prompts for a passphrase; Nikhil stores that passphrase in his password manager, not in this repo.

```bash
gpg --symmetric --cipher-algo AES256 "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"
# upload backups/lane-prod-pre-0013-${CUTOVER_TS}.dump.gpg to the off-machine location Nikhil chooses,
# then confirm the upload size matches:
ls -l "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump.gpg"
```

### 3.2 Restore into a local rehearsal database

Plain PostgreSQL has no `anon` or `authenticated` role, and the old policies name `authenticated`. Create the roles first so the restore and the 0013 `REVOKE` branch behave as they will on production. The old policies use `current_setting(...)`, not `auth.uid()`, so no `auth` schema stub is needed.

```bash
dropdb --if-exists -h 127.0.0.1 lane_prod_rehearsal
createdb -h 127.0.0.1 lane_prod_rehearsal
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d lane_prod_rehearsal -c "
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END \$\$;"
# The target database already has a public schema. Leave the dump's own "SCHEMA public"
# entry (present on newer pg_dump versions) out of the restore list so --exit-on-error
# is strict about everything else.
pg_restore --list "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" | grep -v ' SCHEMA - public ' \
  > "backups/lane-prod-pre-0013-${CUTOVER_TS}.list"
pg_restore --no-owner --no-acl --exit-on-error --use-list="backups/lane-prod-pre-0013-${CUTOVER_TS}.list" \
  -h 127.0.0.1 -d lane_prod_rehearsal "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"
```

- [ ] Row counts match what Nikhil expects from the dashboard (a sanity check, not a gate):

```bash
psql -X -h 127.0.0.1 -d lane_prod_rehearsal -c "
  SELECT 'organizations', count(*) FROM public.organizations UNION ALL
  SELECT 'profiles', count(*) FROM public.profiles UNION ALL
  SELECT 'requests', count(*) FROM public.requests UNION ALL
  SELECT 'request_attachments', count(*) FROM public.request_attachments;"
```

### 3.3 Apply 0013–0019 to the rehearsal database with `ON_ERROR_STOP`

0013 needs these to already exist (it keeps them): enums `plan`, `role`, `classification`, `request_status`, `notification_type` and the function `set_updated_at()` from `0002_updated_at_trigger.sql`. Check before applying:

```bash
# expect at least: classification, invite_status, notification_type, plan, request_status, role, workspace_role
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d lane_prod_rehearsal -c "
  SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e' ORDER BY 1;"
# expect 1 row
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d lane_prod_rehearsal -c "
  SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='set_updated_at';"
```

```bash
for f in src/db/migrations/0013_clerk_clean_cutover.sql \
         src/db/migrations/0014_restore_clerk_table_safeguards.sql \
         src/db/migrations/0015_request_projects_and_types.sql \
         src/db/migrations/0016_request_expected_impact.sql \
         src/db/migrations/0017_request_codes.sql \
         src/db/migrations/0018_request_design_reviews.sql \
         src/db/migrations/0019_request_priority.sql; do
  echo "== $f"
  psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d lane_prod_rehearsal -f "$f" || { echo "FAILED at $f"; break; }
done
```

- [ ] All seven files exit 0.
- [ ] The verification script in section 4 passes against `lane_prod_rehearsal` (run it with `-h 127.0.0.1 -d lane_prod_rehearsal`).
- [ ] Two rehearsal inserts get Request numbers 1 and 2 (the same check used on staging, `2026-10-08-saved-request-codes.md:46`):

```bash
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d lane_prod_rehearsal -c "
  BEGIN;
  INSERT INTO public.organizations (id, name, slug) VALUES ('org_rehearsal', 'Rehearsal', 'rehearsal');
  INSERT INTO public.profiles (id, full_name, email) VALUES ('user_rehearsal', 'Rehearsal', 'rehearsal@example.invalid');
  INSERT INTO public.requests (org_id, title, description, created_by) VALUES ('org_rehearsal','a','a','user_rehearsal'), ('org_rehearsal','b','b','user_rehearsal');
  SELECT request_number FROM public.requests WHERE org_id='org_rehearsal' ORDER BY 1;
  SELECT last_request_number FROM public.organizations WHERE id='org_rehearsal';
  ROLLBACK;"
# expect request_number 1, 2 and last_request_number 2
```

If anything in 3.3 fails, stop. Fix the cause in a migration-safe way on staging first (`AGENTS.md:72-77`); do not book cutover day.

---

## 4. Post-migration verification script (used in 3.3, 5.5 and 7)

Save as `$HOME/lane-cutover/verify-0013-0019.sql` (outside the repo), or paste into `psql`. Every line states its expected result. The names come from the migration files, not from memory.

```sql
-- 4.1 Tables present (0013, 0015) and absent (dropped by 0013)
SELECT string_agg(relname, ', ' ORDER BY relname) AS tables
FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';
-- expect exactly: comments, notifications, organizations, profiles, projects, request_attachments, requests
-- must NOT contain: invites, workspace_members

-- 4.2 RLS enabled on all seven tables (0014, 0015)
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1;
-- expect relrowsecurity = t on every row; relforcerowsecurity stays f (0014: "Do not FORCE RLS")

-- 4.3 No Data API policies (0013 dropped them with CASCADE; nothing recreates them)
SELECT count(*) AS policies FROM pg_policies WHERE schemaname='public';   -- expect 0

-- 4.4 Grants revoked from anon and authenticated (0013, 0015)
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated');     -- expect 0 rows
SELECT has_table_privilege('anon','public.requests','SELECT') AS anon_select,
       has_table_privilege('authenticated','public.requests','SELECT') AS auth_select;  -- expect f, f

-- 4.5 Timestamp triggers restored (0014) and the Request-number triggers (0017)
SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY 1,2;
-- expect exactly these six rows:
--   organizations  guard_organization_request_counter
--   organizations  set_updated_at_organizations
--   profiles       set_updated_at_profiles
--   requests       allocate_request_number
--   requests       guard_request_number
--   requests       set_updated_at_requests

-- 4.6 Functions: the three from 0017 plus set_updated_at; the pre-Clerk ones gone (0013)
SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace;
-- expect: allocate_request_number, guard_organization_request_counter, guard_request_number, set_updated_at
-- (a hosted project may list extension helpers here too; that is not a miss)
-- must NOT contain: accept_invite_membership, get_invite_context, bootstrap_organization_membership,
--                   is_workspace_admin, is_current_org_member, current_app_org_id, current_app_role, current_app_user_id

-- 4.7 Columns added by 0015–0019
SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns
WHERE table_schema='public' AND table_name='requests'
  AND column_name IN ('project_id','request_type','expected_impact','request_number','design_reviews','design_review_version','priority');
-- expect all seven names
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='organizations' AND column_name='last_request_number';  -- expect 1 row

-- 4.8 Enums: 0015 request_type, 0019 request_priority, 0018 notification_type values; 0013 dropped two
SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e' ORDER BY 1;
-- expect: classification, notification_type, plan, request_priority, request_status, request_type, role
-- must NOT contain: invite_status, workspace_role
SELECT enumlabel FROM pg_enum WHERE enumtypid='public.notification_type'::regtype ORDER BY enumsortorder;
-- expect the four original values plus review_requested, review_responded

-- 4.9 Constraints named in 0016–0018
SELECT conname FROM pg_constraint WHERE conrelid='public.requests'::regclass AND conname IN
 ('requests_expected_impact_check','requests_request_number_check','requests_org_request_number_unique',
  'requests_design_reviews_check','requests_design_review_version_check','requests_project_workspace_fk')
ORDER BY 1;  -- expect all six
```

Go/no-go: every expectation holds. One miss is a no-go; on production that means section 7.

---

## 5. Cutover day (plan §6.3, in order)

Do the steps in this order. Each **[N: authorize]** waits for a fresh, explicit "go" for that step.

### 5.1 D1: confirm production data is disposable **[N: authorize]**

- [ ] Nikhil states in chat that every row in production is disposable test data and that 0013 may drop every application table.
- [ ] Nikhil confirms there is no one signed in whose work matters.

### 5.2 D2: final database region **[N: authorize if it changes]**

Decision 8.2 default: keep `hnd1` (`vercel.json`) and the database in Tokyo. If Nikhil chooses a new region, create the new Supabase project now (free tier allows two projects), move staging with it, and repeat section 3 against the new project before continuing. The three Supabase env values on the `lane` project change in that case.

### 5.3 Build a staged production deployment, not promoted **[N: authorize]**

`NEXT_PUBLIC_*` values are baked in at build time, so the build must use the `lane` project's Production environment. `--skip-domain` creates a production deployment without assigning `app.uselane.app` (Vercel's staged production pattern); `promote` assigns it later.

```bash
pnpm dlx vercel@latest login                      # Nikhil, in the browser
pnpm dlx vercel@latest link --yes --project lane  # writes .vercel/, which is gitignored
pnpm dlx vercel@latest deploy --prod --skip-domain 2>&1 | tee /tmp/lane-staged-deploy.txt
# the last line is the deployment URL; keep it in STAGED_URL
export STAGED_URL="$(grep -o 'https://[a-z0-9.-]*\.vercel\.app' /tmp/lane-staged-deploy.txt | tail -1)"
```

- [ ] The deployment is **Ready** and the build log shows it used the Production environment.
- [ ] `app.uselane.app` still serves the old deployment (`5Wz85bAKY8XCx8NA3fucLk9BdLqG`, `main` at `826e509`).

### 5.4 Check the served page carries a `pk_live` Clerk key (no value printed)

```bash
curl -sL "$STAGED_URL/login" -o /tmp/lane-staged.html -w 'HTTP %{http_code}\n'
grep -c 'pk_live_' /tmp/lane-staged.html      # expect 1 or more
grep -c 'pk_test_' /tmp/lane-staged.html      # expect 0
# If the HTML has neither, the key sits in a chunk:
grep -o '/_next/static/chunks/[^"]*\.js' /tmp/lane-staged.html | sort -u \
  | while read -r p; do curl -s "$STAGED_URL$p"; done | grep -c 'pk_live_'   # expect 1 or more
rm -f /tmp/lane-staged.html
```

If `curl` gets a 401 page, the deployment has Vercel protection on; Nikhil opens `$STAGED_URL/login` in a signed-in browser, uses View Source and searches for `pk_live_` (present) and `pk_test_` (absent). Do not paste the page into chat.

- [ ] `pk_live_` present, `pk_test_` absent. A miss here is a stop: fix the Production env and rebuild (5.3) before touching the database.

### 5.5 D3 and D4: final dump, then apply 0013–0019 to production **[N: authorize, separately for the dump and for the apply]**

The day-minus-one dump is a rehearsal artefact. Take a **fresh** dump right before the apply so the rollback point is current. Downtime starts the moment the apply begins.

```bash
# D3 again, fresh
export CUTOVER_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
pg_dump --format=custom --schema=public \
  --file="backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" "$LANE_PROD_SESSION_URL"
chmod 600 "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"
pg_restore --list "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" | grep -c 'TABLE DATA'   # expect 8
gpg --symmetric --cipher-algo AES256 "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"      # copy the .gpg off-machine now
```

- [ ] Fresh dump verified and its encrypted copy is off the laptop. **Do not continue without this.**

```bash
# D4: downtime starts here. lock_timeout stops 0013 from queueing behind an old-app connection.
for f in src/db/migrations/0013_clerk_clean_cutover.sql \
         src/db/migrations/0014_restore_clerk_table_safeguards.sql \
         src/db/migrations/0015_request_projects_and_types.sql \
         src/db/migrations/0016_request_expected_impact.sql \
         src/db/migrations/0017_request_codes.sql \
         src/db/migrations/0018_request_design_reviews.sql \
         src/db/migrations/0019_request_priority.sql; do
  echo "== $f"
  psql -X -v ON_ERROR_STOP=1 -c "SET lock_timeout = '10s'" -f "$f" "$LANE_PROD_SESSION_URL" \
    || { echo "FAILED at $f"; break; }
done
```

Each file is its own `BEGIN ... COMMIT`. If file N fails, files before N are committed and file N rolled back. A failure in 0013 itself is the clean case (production unchanged, retry or stop). A failure in 0014–0019 leaves production on a partial schema: run section 4 to see what applied, then either fix forward with a corrected statement Nikhil authorizes line by line, or roll back (section 7).

- [ ] All seven files exit 0.
- [ ] Section 4 passes against production:

```bash
psql -X -v ON_ERROR_STOP=1 -f "$HOME/lane-cutover/verify-0013-0019.sql" "$LANE_PROD_SESSION_URL"
```

### 5.6 Promote the staged deployment immediately **[N: authorize]**

```bash
pnpm dlx vercel@latest promote "$STAGED_URL" --yes
curl -sI https://app.uselane.app/login | grep -i '^x-vercel-id'    # should now answer from hnd1
```

- [ ] `app.uselane.app` serves the new deployment; `/login` renders the Clerk sign-in. Downtime ends.

### 5.7 Merge PR #35 only after promotion **[N: authorize]**

Production is now ahead of `main`. Merge PR #35 so `main` matches what is live. With `main` protected (item 0.1), Nikhil merges through GitHub. Vercel then builds `main` with the same Production environment and assigns `app.uselane.app` to it automatically. Repeat the 5.4 check against `https://app.uselane.app/login` once that deployment is Ready.

- [ ] PR #35 merged; the `main` deployment is Ready and `app.uselane.app` passes 5.4.

### 5.8 D7: configure the `request-attachments` bucket on production **[N: authorize]**

`scripts/configure-request-attachments-bucket.mjs` takes an env-file path and needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Put those two keys for production in `.env.prod-cutover.local` (not a Next.js env name; gitignored), run, then delete the file.

```bash
node scripts/configure-request-attachments-bucket.mjs .env.prod-cutover.local
# prints: [storage] request-attachments is private with a 10 MB per-file limit on <host>
rm -f .env.prod-cutover.local
```

- [ ] The bucket is private, 10 MB per file, with the MIME allowlist from the script (PDF, DOCX, text, markdown, PNG, JPEG, WebP).

### 5.9 L3: production-only checks with fresh Clerk accounts (go/no-go lines)

Nikhil creates the accounts (an agent never holds real credentials). Each line is a go/no-go. One "no" means pilot zero does not open; decide between fix-forward and section 7.

- [ ] **Workspace isolation (J8a):** two fresh accounts in two workspaces; A's Request is not visible to B on the list, at its `/requests/[id]` URL, or through an attachment URL.
- [ ] **Signup, onboarding, Intake with the AI gate, attachments:** a fresh account creates a workspace, picks a role, creates a Request through the gate (the 15 s gate inside the 30 s layout limit), uploads one file, downloads it back.
- [ ] **Invite auto-return:** an emailed invitation returns to Lane after the hosted Clerk portal (the remaining staging gate, `DEFERRED.md:196-205`).
- [ ] **Real reset:** `/forgot-password` then `/reset-password` completes with a real email.
- [ ] **Invite and reset emails land in the Inbox**, not Spam (staging's did not, `2026-09-24-clerk-clean-cutover.md:177-181`).

### 5.10 D8: Supabase cleanup on production **[N: authorize]**, then check staging (L2)

Only after 5.9 passes. After this step, a rollback can no longer restore old logins (the `auth.users` rows are gone), so do it last.

1. Delete legacy Supabase Auth users (Dashboard → Authentication → Users, or SQL editor: `DELETE FROM auth.users;`).
2. Disable Supabase Auth sign-ups (Dashboard → Authentication → Providers: Email off; "Allow new users to sign up" off).
3. Purge orphaned storage: 0013 emptied `public.request_attachments`, so every object left in `request-attachments` is orphaned. Empty the bucket from Dashboard → Storage (or a one-off `storage.from("request-attachments").list()` + `remove()` using `createServiceClient()` from `src/lib/supabase/admin.ts`).
4. Confirm the Data API does not expose `public` (Dashboard → Project Settings → API → Exposed schemas). The grants are revoked anyway (section 4.4); this is defence in depth.
5. L2: repeat check 4 on staging (`jznepeqghjixcrpuddym`).

- [ ] All five done, with dashboard screenshots kept outside the repo.

### 5.11 S1: tick the `AGENTS.md:79-91` boxes with production evidence only **[N: authorize the doc edit]**

The two open boxes that cutover can close are "Confirm deployed workspace isolation before anyone real signs up" (from 5.9 line 1) and the production half of "Split prod / staging". Supabase Pro and Vercel Pro stay open.

### 5.12 Start the weekly `pg_dump` routine (until Supabase Pro, decision 8.14)

Every week, same day, until managed backups exist:

```bash
export LANE_PROD_SESSION_URL='<session-mode connection string>'   # pasted, not stored
export PGSSLMODE=require
TS="$(date -u +%Y-%m-%d)"
pg_dump --format=custom --schema=public --file="backups/lane-prod-weekly-${TS}.dump" "$LANE_PROD_SESSION_URL"
chmod 600 "backups/lane-prod-weekly-${TS}.dump"
pg_restore --list "backups/lane-prod-weekly-${TS}.dump" | grep -c 'TABLE DATA'   # expect 7
gpg --symmetric --cipher-algo AES256 "backups/lane-prod-weekly-${TS}.dump"        # copy the .gpg off-machine
# storage watch (free tier: 1 GB database, attachments up to 10 MB each)
psql -X -c "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;" "$LANE_PROD_SESSION_URL"
psql -X -c "SELECT count(*) AS attachments, pg_size_pretty(coalesce(sum(size_bytes),0)) AS bytes FROM public.request_attachments;" "$LANE_PROD_SESSION_URL"
```

Retention default (Nikhil to confirm, it also sets the backup line on the Privacy page; see `docs/operations/account-deletion.md`): keep the last four weekly dumps and delete older ones; delete each pre-migration dump 30 days after that migration is verified. The pre-cutover dumps hold test data only.

---

## 6. Promotion stop rules

Stop and do not promote (5.6) if any of these is true after 5.5:

- Section 4 reports one miss on production.
- The staged deployment is no longer Ready, or 5.4 was not repeated after a rebuild.
- Nikhil is unavailable to authorize 5.6 within the 15-minute budget. In that case, roll back (section 7) rather than leave production broken.

---

## 7. Rollback runbook

### 7.1 Why a code rollback alone fails

After 0013, the tables the old app queries (`workspace_members`, `invites`, uuid-keyed `profiles` and `organizations`, the `current_app_*` and `bootstrap_organization_membership` functions, the RLS policies) no longer exist, and the surviving table names now have `text` ids holding `user_*` and `org_*`. Redeploying `826e509` gives a running app that fails every query. Rollback therefore has two halves, and the database half goes first so the old code works the moment it is live.

### 7.2 When to roll back

- Any 5.5 failure that cannot be fixed forward within the 15-minute budget.
- A section 4 miss on production.
- A 5.9 "no" that Nikhil decides not to fix forward.

Rollback after 5.10 (D8) restores Requests and workspaces but not old Supabase Auth logins unless the `auth` dump from 3.1 succeeded; the people on the old app were test accounts (D1), so that is acceptable and must be stated when Nikhil authorizes.

### 7.3 Option A (default): restore the pre-cutover dump into the same project, redeploy `826e509`

**[N: authorize each numbered step]**

1. **Stop traffic to the new schema.** If 5.6 ran, nothing else is needed yet; the new app will be replaced in step 4. If PR #35 was merged (5.7), tell Nikhil now: `main` has moved and step 5 reverts it.
2. **Drop the migrated application schema.** Every 0013–0019 object lives in `public`; Supabase's own schemas (`auth`, `storage`, `extensions`) are untouched. Dropping the schema also drops the new `projects` table, the three 0017 functions and the two new enums, which a plain `pg_restore --clean` would leave behind and trip over.

```bash
psql -X -v ON_ERROR_STOP=1 "$LANE_PROD_SESSION_URL" -c "
  BEGIN;
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON SCHEMA public TO postgres;
  COMMIT;"
```

3. **Restore the dump** (the fresh one from 5.5; the 3.1 one only if 5.5's does not exist). ACLs are in the dump, so the old app's `authenticated` grants and policies come back with it. The schema was recreated in step 2, so the dump's own "SCHEMA public" entry is left out as in 3.2.

```bash
pg_restore --list "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump" | grep -v ' SCHEMA - public ' \
  > "backups/lane-prod-pre-0013-${CUTOVER_TS}.list"
pg_restore --no-owner --exit-on-error --use-list="backups/lane-prod-pre-0013-${CUTOVER_TS}.list" \
  -d "$LANE_PROD_SESSION_URL" "backups/lane-prod-pre-0013-${CUTOVER_TS}.dump"
# if the auth dump from 3.1 exists and D8 already deleted auth.users:
pg_restore --no-owner --no-acl --data-only -d "$LANE_PROD_SESSION_URL" "backups/lane-prod-auth-pre-0013-${CUTOVER_TS}.dump" || echo "auth restore failed; old logins must be recreated"
```

- [ ] Verify the old shape is back:

```bash
psql -X "$LANE_PROD_SESSION_URL" -c "
  SELECT string_agg(relname, ', ' ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';"
# expect: comments, invites, notifications, organizations, profiles, request_attachments, requests, workspace_members
psql -X "$LANE_PROD_SESSION_URL" -c "SELECT count(*) FROM pg_policies WHERE schemaname='public';"   # expect > 0 (old RLS policies)
psql -X "$LANE_PROD_SESSION_URL" -c "SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='current_app_user_id';"  # expect 1 row
```

4. **Redeploy `826e509`.** The old production deployment still exists; promote it instead of rebuilding (a rebuild of `826e509` would bake today's env, which now holds `pk_live` Clerk keys the old app does not use, but is harmless).

```bash
pnpm dlx vercel@latest promote 5Wz85bAKY8XCx8NA3fucLk9BdLqG --yes
# or, if that deployment was deleted: pnpm dlx vercel@latest rollback   (pick the 826e509 deployment)
curl -sI https://app.uselane.app/ -o /dev/null -w 'HTTP %{http_code}\n'
```

- [ ] `app.uselane.app` serves the old app; a test account from the dump can sign in (if `auth.users` survived) or a new Supabase Auth account can sign up (if Auth sign-ups were not yet disabled in 5.10; re-enable them if they were).

5. **Put `main` back** only if 5.7 happened: Nikhil reverts the merge commit on GitHub (`git revert -m 1 <merge-sha>` through a PR, since `main` is protected) so the next auto-deploy is the old app again. The new work stays on `codex/requests-plane-sidebar` and PR #35 can be reopened.
6. **Record** the failure, the step it failed at, and the evidence in this file under a dated "Rollback record" heading. Do not retry cutover until the cause is fixed on staging first.

### 7.4 Option B: fresh Supabase project restored from the dump

Use only if the production project itself is unusable (for example a Supabase incident during 5.5). Create a new project in the same region, restore with 7.3 step 3 into it, then change `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` on the `lane` project and **rebuild** `826e509` (the `NEXT_PUBLIC_SUPABASE_URL` is baked in, so promoting the old deployment is not enough). Storage objects do not travel in a `pg_dump`; attachments from the old project are lost in Option B unless copied by hand. Prefer Option A.

### 7.5 What rollback does not undo

- The Clerk production instance and its DNS records. They are harmless to the old app and stay for the retry.
- The staged deployment. Leave it; it is not assigned to the domain.
- Off-machine encrypted dumps. Keep them until the retry succeeds and the retention window in 5.12 passes.

---

## 8. Record of runs

Append one dated entry per attempt (dry run, cutover, rollback): who authorized which step, exit codes, section 4 results, timings for the downtime window, and anything that deviated from this document. No values from any env file, dump or connection string.

- (none yet)
