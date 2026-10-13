# Lane security audit — 11 October 2026

Status: the six findings have implementation fixes in the local working tree after Nikhil approved “fix these”. Local verification passed: 686 tests and 46 browser interaction checks, plus typecheck, lint, design-source checks, the production build, and the bundle budget. No hosted migration or deployment has been performed. The requested [vibe-security skill](https://github.com/raroque/vibe-security-skill) was installed at `/Users/nikhilsharma/.codex/skills/vibe-security` and used for this review.

Scope: the current Lane application working tree based on `13c7462`, including the pending cleanup. The independent marketing repository is excluded. This was source and dependency review with isolated local proofs. No deployed Lane endpoint was attacked, and no hosted database, upload or AI operation was performed. Production configuration and deployed revision were not verified.

## Original findings

| ID | Severity | Finding | Practical impact |
| --- | --- | --- | --- |
| SEC-01 | High | Vulnerable Next.js Server Action request handling | Crafted unauthenticated requests can monopolize server CPU and block other requests. |
| SEC-02 | Medium | Cancelling an upload frees its quota but leaves its signed URL usable | A Request creator can create untracked private files beyond the Request attachment limit. |
| SEC-03 | Medium | Hosted database TLS skips certificate verification | An attacker able to intercept the database connection can impersonate the database server. |
| SEC-04 | Medium | AI limits allow requests during Redis errors/timeouts | Authenticated users can exceed the paid AI limit when its protection is unavailable. |
| SEC-05 | Low | Different errors reveal whether a hidden Request UUID exists | Someone with a valid session and a separately obtained UUID can check its existence. |
| SEC-06 | Low, development only | Next.js development MCP endpoint lacks an origin check | A malicious website visited while `next dev` runs can read development logs and error snippets. |

These ratings describe the inspected code and applicable advisory conditions. They do not assert that the current production deployment is exploitable. No Critical application exploit was confirmed.

### SEC-01 — Next.js Server Action denial of service

**Audit-time evidence:** `package.json:43` pins `next` to `16.2.7`; the lockfile and installed package agree. Lane uses the App Router and multiple Server Actions, including `src/app/(app)/intake/actions.ts` and `src/app/(app)/requests/[id]/actions.ts`. Its proxy establishes Clerk context; authorization runs inside the actions.

The [official Next.js advisory GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) covers this version and architecture. Crafted requests can cause excessive CPU use and prevent the same process from handling other requests. The advisory requires no user privileges. Application authorization does not repair the affected framework request handling.

**Confidence:** high for affected dependency and applicable architecture; no denial-of-service payload was executed. Deployed revision and edge protections remain unverified.

**Recommended repair at audit time:** upgrade Next.js and its matching ESLint package to a supported release covering the current advisory set, refresh the lockfile, then verify Lane's auth/actions and rerun the audit. Version `16.2.11` is the minimum patch for this specific advisory, not a recommendation that it addresses every newer alert.

### SEC-02 — Cancelled upload capabilities bypass quotas

**Audit-time evidence:** `src/app/(app)/intake/attachment-actions.ts:146–164` counts current reservations; `197–208` returns a signed upload URL; `378–393` removes an object and immediately deletes its reservation on cancellation.

An authenticated Request creator can prepare an upload, retain the URL, cancel, and repeat. Uploading through the retained URLs afterwards produces objects that Lane no longer counts or lists. This also applies to a guest acting on their own Request. Supabase documents that [signed upload URLs work without further authentication for two hours](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl). The provider capability does not consult Lane's deleted reservation.

**Impact:** storage exhaustion and associated cost/availability pressure despite the five-file/25 MB per-Request limit. This does not demonstrate cross-workspace reads or overwriting another person's file.

**Verification:** executed the current application actions with in-memory auth, database and documented Storage semantics. Eight prepare/cancel cycles held at most one reservation; eight later modeled uploads left 80 MiB of untracked objects and zero reservations. The same provider model rejected ordinary overwrite. This is a local control-flow proof, not hosted Storage verification.

**Recommended repair at audit time:** retain accounting for issued capabilities until they expire, verify removal after expiry, and bound capability issuance. Deleting a database row or changing browser upload headers cannot revoke an already issued capability. Choose the implementation within Lane's existing constraints before introducing any schema or scheduling changes.

### SEC-03 — Database server identity is not verified

**Audit-time evidence:** `src/db/index.ts:35` sets `ssl: isLocal ? false : "require"`. Installed `postgres@3.4.9`, `src/connection.js:283–284`, converts `require` to `rejectUnauthorized = false` before the TLS connection. Its `src/index.js:473–478` prioritizes this explicit option over URL query options.

**Impact and precondition:** an attacker with control over the application-to-database network or DNS path can impersonate PostgreSQL and inspect or modify database traffic. Encryption still exists, but it does not authenticate the server. This is not a direct unauthenticated web attack.

**Confidence:** high from application and installed driver source; no network interception or hosted connection was attempted.

**Recommended repair at audit time:** enable certificate verification, using system trust or the appropriate Supabase CA, and verify the deployed certificate chain. Merely adding a stricter `sslmode` to the connection URL will not override this explicit application option.

### SEC-04 — Paid-AI protection fails open

**Audit-time evidence:** `src/lib/rate-limit.ts:34–36` accepts every successful response without checking its reason; `42–44` explicitly allows on exceptions. `src/app/(app)/intake/actions.ts:188–205` then proceeds to Anthropic.

Upstash's installed limiter defaults to allowing after a five-second timeout and identifies that condition through the response reason. See [Upstash timeout behavior](https://upstash.com/docs/redis/sdks/ratelimit-ts/features#timeout).

**Impact and precondition:** during Redis errors or slow responses, an authenticated workspace user can exceed the intended ten AI reviews per minute, consuming shared AI capacity or budget. The user does not need to tamper with a client-side counter. This does not claim an attacker can directly cause a Redis outage.

**Verification:** the current Lane module allowed a simulated Redis exception. With the real installed Upstash limiter and only its Redis I/O stalled, all 12 simultaneous attempts were allowed after approximately five seconds. A healthy simulated limiter correctly denied. No paid AI calls were made.

The production environment guard requires KV configuration when `VERCEL_ENV=production`; missing production variables are therefore not reported as the exploit. The issue is runtime failure after configuration passes.

**Recommended repair at audit time:** temporarily reject AI review on timeout/error while preserving the draft, and treat `reason: "timeout"` as unavailable protection rather than successful authorization to spend.

### SEC-05 — Hidden Request existence disclosure

**Audit-time evidence:** `src/app/(app)/requests/[id]/actions.ts:97–103`, `219–228` and `315–321` query globally for diagnostic rows, then distinguish `Request not found` from `Not found`. Guest comment handling at `353–363` similarly distinguishes a missing Request from an existing same-workspace Request hidden from that guest.

**Impact and precondition:** a signed-in non-guest who separately obtains a foreign Request UUID can determine whether it exists. A guest can make a similar check for a hidden Request in their own workspace. Random UUIDs make brute-force discovery impractical. No Request title, body, status or unauthorized write was exposed by the demonstrated paths.

**Verification:** actual transpiled action functions with synthetic auth/database adapters returned different errors for absent and hidden rows across five lifecycle exports and guest commenting. No real database was called.

A related source-only case exists at `src/lib/data/requests.ts:108`: the Done pagination cursor is workspace-scoped but not guest-creator-scoped. Returned rows remain correctly guest-scoped; with a known hidden UUID and a suitable older own Request, result presence can reveal existence/coarse creation ordering. This is included in SEC-05 rather than counted again.

**Recommended repair at audit time:** scope every diagnostic/cursor lookup to the same visibility rules as its main operation and return one common error for missing and inaccessible resources.

### SEC-06 — Development server information disclosure

**Audit-time evidence:** `package.json:7` runs `next dev`; `package.json:43` pins the affected Next.js version. The [official GHSA-39w2-rjm5-chcv advisory](https://github.com/vercel/next.js/security/advisories/GHSA-39w2-rjm5-chcv) describes the development MCP endpoint accepting requests without checking the originating website.

**Impact and precondition:** a developer must be running `next dev` and visit an attacker-controlled website. The website can read development data such as logs, route inventory, project location and source snippets from error reports. Production deployments do not serve this endpoint. No malicious webpage or local exploit was executed.

**Recommended repair at audit time:** cover this advisory in the coordinated Next.js upgrade for SEC-01. The registry report identifies `16.3.8` as patched; recheck the full current advisory set when choosing the upgrade target.

## Dependency scan interpretation

`pnpm audit --json` completed and returned a nonzero exit because advisories were found. Its raw report contains **96 entries representing 89 unique GHSA advisories**: 6 Critical, 34 High, 43 Moderate and 6 Low by unique advisory ID. Those are package advisory ratings, not 89 proven Lane vulnerabilities. Some entries concern development tools, optional/transitive platforms or unused features.

Examples screened out of confirmed application findings:

- The Critical Windows-hosted Next.js issue requires Windows; this checkout is on macOS and Lane targets Vercel. No Windows deployment was verified.
- The Critical `next/og` issue requires the vulnerable image-generation path; Lane has no `next/og`/`ImageResponse` usage or metadata image routes.
- The Critical AVIF optimizer issue requires attacker-controlled AVIF data reaching optimization. Lane has no remote image allowlist or public upload-serving route; private attachments use signed external URLs. A reachable attack path was not demonstrated. [Official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
- The image optimizer SSRF advisory explicitly excludes applications without `images.remotePatterns`; Lane configures none. [Official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4).
- The Critical Vitest browser-mode issue requires access to its testing API/commands. Lane has no host/CORS override; installed code checks an API token and known session. The advisory excludes default localhost use with trusted tests. Upgrade the coordinated Vitest/browser packages in the dependency pass, but no Critical Lane production path was established.
- Critical `proxy-addr` is under the shadcn development MCP dependency chain. The installed shadcn MCP server uses stdio, not the affected Express HTTP/trust-proxy path. Critical `shell-quote` arrives through Clerk's optional React Native development tooling; the reviewed caller imports `parse()`, while the advisory requires `quote()` followed by shell execution. No reachable Lane application caller was found for either.

The raw dependency report remains available for the later upgrade pass; excluded paths are not a reason to retain outdated packages indefinitely.

## Reviewed controls and limits

- Inspected all 23 exported Server Actions, five authenticated GET handlers, the fixed auth callback, protected loaders and canonical migrations. No direct tenant write bypass, foreign Request content read, SQL-injection path or mass-assignment bypass was found in the reviewed paths.
- Clerk-derived identity/workspace checks, guest visibility, reviewer membership checks, triage HMAC binding/expiry and private download authorization are present. This is source evidence, not proof of deployed isolation.
- Effective migrations `0013` onward remove the legacy authorization RPCs and close the seven domain tables with RLS/revoked client grants. Retired migration matches were not reported as current vulnerabilities.
- The targeted secret scan checked 704 tracked files, 65 existing built client assets and six historical blobs with sensitive filenames. It compared configured secret values in memory and checked common key patterns without printing secrets. It found no matches. This was not an exhaustive all-history/high-entropy scan, and no fresh build was made for this audit.
- CSP is intentionally Report-Only (`src/lib/security-headers.ts:131`) and permits inline scripts. This is a tracked hardening gap, not a demonstrated XSS vulnerability; no unsafe app rendering sink was found in the inspected source.
- Live Clerk settings, deployed migrations/grants, bucket privacy/limits, provider keys, WAF controls and production revision were not verified. Payment/mobile checks were not applicable.

## Evidence and follow-up order

Local evidence is under `artifacts/security-audit-2026-10-11/` (ignored by Git): `dependency-audit.json`, `secrets-scan.json`, `scan-secrets.cjs`, `intake-abuse-proof.cjs`, `intake-abuse-proof.json`, `auth-findings.md`, `database-findings.md`, `next-dependency-triage.md` and `dependency-triage.md`. The latter two retain the detailed advisory links and applicability checks.

The original audit was read-only. Nikhil subsequently authorized repairs with “fix these”; implementation and release requirements are recorded below. Recheck the deployment-only controls before representing this audit as production verification.


## Repair implementation — 11 October 2026

| Finding | Local change | Release requirement |
| --- | --- | --- |
| SEC-01 / SEC-06 | Next.js and eslint-config-next pinned to 16.3.8; matching lockfile installed. Audit reports zero Next.js advisory entries, down from 17. | Deploy the patched build; restart any Lane development process using the old version. |
| SEC-02 | Migration 0020 adds capability expiry, cancellation and confirmed-blocking timestamps to existing attachment rows. Cancellation commits intent, replaces the old path with a private empty live object, confirms size zero, and keeps quota until provider expiry. Cancelled rows cannot finalize. | Back up and verify, apply 0020 on staging first, then verify Storage behavior before production rollout. |
| SEC-03 | Runtime and migration tooling use verified TLS outside loopback; optional DATABASE_SSL_CA supports a trusted PEM certificate. Invalid configured certificates fail closed. Drizzle uses structured credentials because its URL branch drops sibling SSL options. | Verify the hosted certificate chain; configure the trusted provider CA if system trust is insufficient. |
| SEC-04 | Missing/malformed limiter configuration, Redis failures and timeout-success responses stop AI review with a recoverable error before any AI call. Healthy quota rejection stays distinct. | Verify configured KV access in staging and production. |
| SEC-05 | Lifecycle diagnostics, guest comments and Done cursor queries use the authorized visibility scope; hidden and missing Requests return the same result. | Repeat deployed isolation checks during the release gate. |

### Upload repair details and limits

Deleting an object after a two-hour wait alone is insufficient: an upload accepted earlier can finish later. The repair therefore keeps a **live zero-byte placeholder at the same path**, and never removes its accounting row. Signed uploads use `upsert:false`; Storage serializes commits by object key and rejects a late non-upsert commit when that live object exists. The service upsert replaces a payload that arrived first. A delete marker would not have this property. Provider source: [object commit lock and overwrite check](https://github.com/supabase/storage/blob/v1.81.0/src/storage/uploader.ts#L223-L299), [TUS signed permission](https://github.com/supabase/storage/blob/v1.80.2/src/http/routes/tus/lifecycle.ts#L58-L78). Empty uploads use a Blob/multipart body matching the provider's [zero-byte file test](https://github.com/supabase/storage/blob/master/src/test/object.test.ts#L779-L794).

- Cancellation failure or uncertain verification keeps the reservation counted. No network call is held inside a database transaction.
- Cancelled files may hold a user's five-file/25 MB quota for up to two hours. Retries remain available while capacity remains; no AI call or new Request is needed.
- Empty cancellation records remain private and are never listed as saved attachments. Future cleanup must preserve the blockers. Bucket versioning must remain disabled; versioning could retain replaced payloads.
- This bounds newly issued upload paths per Request per expiry window. It does not promise zero temporary provider bytes: already accepted bodies can stage before provider cleanup, and declared sizes are validated at finalization. It also does not retroactively remove orphaned objects minted before this repair.
- The provider behavior is source-verified and modeled in tests. The actual hosted bucket/version and real empty-file/replayed-link behavior must be verified on staging before deployment. No hosted Storage request was made in this pass.

### Rollout requirements

Do not deploy this code against a database missing `0020_attachment_capability_accounting.sql`. Take a verified backup, apply the migration to staging, confirm ordinary upload/finalize/download, cancellation/retry, late old-link rejection, guest/workspace isolation, and verified database TLS. Only then promote the migration/build to production under the existing cutover gates. This adds migration 0020 to the existing 0013–0019 launch sequence; it does not authorize skipping those prerequisites.

The post-upgrade dependency report still contains 74 entries / 67 unique GHSA advisories outside Next.js (previously 96 / 89). These are package alerts requiring applicability review, not 67 confirmed Lane exploits. Fixing these six findings does not mean the whole dependency graph is advisory-free.


### Local verification evidence

Artifacts are under `artifacts/security-fixes-2026-10-11/` (ignored by Git):

- `full-tests.log`: **74 files / 686 tests passed**, using only guarded loopback `lane_test`; migration 0020 applied successfully by the canonical test setup.
- `browser-recovery.log`: **2 files / 46 Chromium stories passed**, exercising the production Intake component with mocked auth/provider boundaries. No hosted Clerk/Storage/AI operations.
- `typecheck-final.log`, `lint.log`, `design-check.log`: all passed; design source check covers 63 recorded files and 30 documented adaptations.
- `build-network.log`: Next.js 16.3.8 production build passed, including its TypeScript check and page generation. The initial sandboxed build was stopped while waiting; the successful build had network access for Google fonts.
- `bundle-check.log`: passed the existing +2 KB gzip per-route guard without changing the baseline. Current client bundles are 7.5–10.7 KB smaller than that baseline; this includes pending cleanup and framework changes and is **not a measured page-speed gain**.
- `dependency-audit-after.json`: zero Next.js advisory entries; installed `next` and `eslint-config-next` both confirmed as 16.3.8.
- `auth-red.log` and `uploads-red.log`: privacy/upload regressions reproduced before fixes; final full suite passes. Isolated TLS/AI failure reproduction and driver review are recorded in `artifacts/security-audit-2026-10-11/tls-rate-limit-fix.md`.
- `git diff --check`: passed. Pending cleanup and the independent marketing working tree were preserved.

No Lane application dev process was running when checked, so none required restart. The separate marketing process was out of scope and untouched. Production and hosted staging remain unmodified and unverified by this implementation pass.
