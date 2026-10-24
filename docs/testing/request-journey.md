# Request journey reads and refreshes

The timeline calls `readRequestJourney` through `callAction`. Its Release and
Outcome projections share one guarded session, visible primary Request row,
logical roster lookup, union of historical names, and captured server time.
A roster lookup may paginate. Guest reads skip it and retain creator/workspace
visibility for the Request, parent and follow-ups. Follow-up event reasons are
loaded only for the visible children.

Roster failure retains saved facts and saved profile names, disables actions with
the existing membership explanations, and exposes Retry. A failed profile query
fails the load; it cannot turn a database outage into “Former member” history.
The standalone Release entry keeps its existing result shape and does not query
Outcome follow-ups, events or parents. Mutation guards, revision checks and
idempotency remain authoritative. This read is a consistent primary Request
projection, not a transactionally frozen snapshot of the whole workspace.

The mounted timeline owns one refresh coordinator for its Request/workspace key.
Initial/revision reads, Retry, saves, window return and the UTC date timer all use
its generation. A new response can replace only the latest relevant view; unmount
invalidates pending success and error responses. Opening a form invalidates an
in-flight read and defers subsequent refreshes until cancel or save. Save focus
waits for the latest accepted response, even when revision revalidation supersedes
the original post-save read; another form or unmount cancels that focus intent.

The timer runs once for the observed server day and remains subscribed while a
form is open, so an overdue refresh resumes when the form closes. Same-day
responses do not create polling. Countdown rendering uses the returned server
UTC day, matching action availability even when the browser clock differs.

`request-journey.test.ts` invokes the actual combined action with controlled
Clerk/database/clock boundaries and exercises it through the production refresh
coordinator. It counts shared work with distinguishable successive revisions and
covers names, outages, access scopes, standalone Release cost, and midnight.
`request-access.test.ts` also exercises the combined action against the guarded
local database. `journey-refresh.test.ts` drives ordering, form protection, focus,
lifetime and actual timer/focus subscriptions. Existing Release/Outcome permission,
concurrency, handover, replay and timeline tests remain in place.

Browser clock tests establish timer scheduling and consumption of real server
responses. They do not advance server UTC or Clerk token issuance; server-day
countdown and Close availability transitions are covered by controlled server
clock tests. Browser fixtures use the existing pinned staging safety/ownership
checks. No production deployment or data mutation is implied by these checks.
