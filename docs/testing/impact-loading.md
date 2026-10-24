# Impact page loading

`loadImpactPage` in `src/lib/data/impact.ts` owns one page load. It receives the
server-derived member and parsed period from the existing Impact page. One
visible Request query, including its workspace-scoped Project join, supplies the
dashboard, permitted teammate choices and optional selected person's Request list.
The loader captures one clock before awaiting data and passes it to both builders.
There is no persistent cache.

The existing SQL and read-model visibility restrictions both remain active.
Teammates come from the current Requester and assigned person on visible Requests,
excluding the viewer; this is not a membership directory. The URL-selected person
must be on that list. Invalid selections are ignored, and guests receive no
teammate list. Names are queried once only when permitted IDs exist. A successful
query without a saved name uses Former member. Request or name-query failures
reject the page load and reach the existing page error/retry boundary; they never
become empty or partial results.

The pure Impact builders and rendered views are unchanged. Request lists retain
all periods, while measured Project and Whole org results use the selected release
period. Existing exact-match numeric totals, percentage rules, shared-observation
deduplication and exclusions remain authoritative. The #171 count/time shorthand
does not change the established seconds-total regression or the quarter/year
contract in `REQUIREMENTS.md`.

`src/lib/data/impact.test.ts` invokes the real loader and page with external SQL,
Clerk and clock boundaries controlled. It verifies query counts and literal
outputs for selections, guests, handover, missing names, empty results, failures
and clock boundaries. Existing pure and rendered Impact fixtures remain in the
main test suite. Follow `docs/operations/local-test-databases.md` before running
that suite: even a filtered run resets the checkout's assigned local database.

The browser checks in `e2e/impact.spec.ts` cover existing-page normal, empty and
selected-person states, filters and keyboard navigation on desktop/mobile in both
themes. External local-process database failure injection may separately exercise
the existing error/retry UI; record its exact target and recovery evidence when
used. Query-count reduction is not a latency measurement, and this bounded loader
increment does not close separate Impact product acceptance #160.
