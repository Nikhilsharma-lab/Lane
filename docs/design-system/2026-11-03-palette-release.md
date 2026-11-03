# Lane palette and Request pane release

This release ships the November 2 approved dashboard palette through the central Lane theme, its namespace/semantic bridge, generated brand assets and design-system documentation. It also includes the approved in-flow Request pane, Arc timeline/comment composition, row toggle/replacement behavior, compact checkbox spacing and guarded Project deletion with confirmation. Settings/Profile/Members review prototypes remain separate from the product.

The release is based on current main's Build 3 performance work. Conflict resolution retained its granular pending-comment subscription and lazy-motion components. New Arc Timeline and CommentThread now use the same strict lazy-motion boundary; a rendered regression test first reproduced the incompatibility and now passes. Comment posting retains the existing Arc busy-button behavior and accessible 5,000-character field contract.

## Bundle budget waiver

The repository allows an intentional feature addition to update its measured baseline with a written waiver. Three routes require one for this release:

- Request detail: 436,710 to 457,926 gzip bytes (+21,216 bytes, about 20.7 KiB). The approved Arc thread/timeline and Request pane header/tabs add to the route graph. This is not attributed solely to CommentThread.
- Metric detail: 436,343 to 438,647 gzip bytes (+2,304 bytes, about 2.3 KiB), from the combined shared client graph.

Only these three baseline entries change. The global 2 KiB tolerance and every other route baseline remain unchanged. The release does not hide the increase behind a cosmetic dynamic import; the new components retain their real interactions and strict lazy-motion compatibility. Future optimization should measure separating peek-only tabs and unused editable thread controls.

- Metrics library: 435,392 to 437,241 gzip bytes (+1,849 bytes locally). CI measures about 2.1 KiB growth, just over the 2 KiB budget; its build environment adds about 0.2 KiB compared with the local measurement. The baseline uses the actual local measurement, not an invented allowance.

## Verification boundary

Design/token/Arc-source/brand checks, scoped ESLint, the production build and the bundle check run on the isolated integration checkout. The full regression suite uses that checkout's own disposable local database. Provider and production checks are read-only: no real Requests, comments, Projects or memberships are created/deleted to test this release. Frozen source-capture CSS files retain their original trailing whitespace because hashes are evidence.

Existing approved palette contrast warnings remain: destructive button text in both themes and muted text on the dark muted surface. This release does not claim those pairs meet WCAG AA.

Local final verification: 2,974 regression tests passed (one skipped), 1,040 UI tests passed, and 52 architecture safety tests passed. Production build, scoped lint, design/token/Arc-source/brand and bundle checks passed.
