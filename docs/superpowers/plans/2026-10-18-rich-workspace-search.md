# Rich workspace search implementation plan

**Goal:** Bring the licensed Arc Search Results experience into Lane's existing workspace search with real Requests and Projects.

**Architecture:** Retain the authenticated, abortable search controller and existing GET route. Adapt the licensed block's facet rail, result cursor, count motion, recent-query suggestions and responsive preview to Lane's result shapes. Supabase values remain the visual source; no sample people, files, timings or search data ship.

**Constraints:** No new routes, tables, AI calls or permissions. Full-dataset server filtering and sorting before pagination; counts share workspace/guest restrictions. Preserve literal query matching, safe errors, independent pagination and focus recovery. Keep existing SearchField and common controls. Recent queries live only in the workspace pane's memory.

## Implementation

- [x] Add failing route tests for validated status/type/date/sort inputs, full-set filtered counts, and guest-restricted facet queries. Add browser coverage for keyboard selection/preview, mobile dismissal, recent-query reuse and filter resets.
- [x] Extend `src/lib/workspace-search.ts`, `src/lib/data/search.ts` and `src/app/api/search/route.ts` with optional filters/sort and facet counts. Return description and creation date for truthful previews. Apply inclusive date filters as UTC day boundaries.
- [x] Adapt `workspace-search-pane.tsx` into the existing async controller plus a licensed-source presentation in `workspace-search-results.tsx`. Use mixed Request/Project rows, a gliding selection, saved metadata preview, real open/copy actions, recent suggestions, filter chips, and a responsive facet rail/BottomSheet.
- [x] Install official Arc BottomSheet source without overwriting existing components. Map its CSS literals to shared roles, retain gesture/keyboard/reduced-motion behavior, and record provenance.
- [x] Update stories to the intentional preview-first interaction. Run route tests, affected browser stories, tokens/provenance, TypeScript, scoped lint and production build. Check 390/768/1024/1440, both themes, reduced motion and actual-app search/preview/navigation.

## Source and scope

Reference inspected through Arc MCP and the live page: https://uiarc.dev/components/blocks/search-results. Pro source supplied by the licensed MCP connection. Use its result/preview/facet/keyboard and motion patterns; keep Lane's server data controller. Category maps to Requests/Projects, status and Request type replace demo teams, and creation date replaces the demo edited slider because both Lane entities expose a real creation timestamp. Sort within each category remains independently paginated. No simulated spelling correction or fabricated latency.


## Verification evidence

- API query/authorization tests: 29 passed, including invalid filters, UTC date bounds, filtering before pagination and guest-restricted facets.
- Browser search suite: 18 passed at 1440 light and 18 at 390 dark. Five focused cases passed at 768 light and five at 1024 dark with reduced motion.
- Six existing shell integration cases passed: navigation entry, saved-code search, sidebar collapse focus, Requests shell, Linear interaction preview and complete detail sidebar.
- Token contract: 16 tests passed; application CSS/icon/shared-control audit passed. Arc provenance: 70 files, 65 documented adaptations.
- TypeScript and scoped ESLint passed. A pre-existing test fixture's empty check discriminator was narrowed with `as const` so the repository type check could finish; no Request-edit behavior changed.
- Actual localhost app: searched saved Requests for `delivery`; verified counts, highlights, created-date range filtering, wide inline preview, narrower preview sheet, Escape focus return, open Request navigation and reopening search. Screenshot: `artifacts/request-detail/rich-search-desktop.png`.
- Production build passed: compiled successfully, TypeScript passed, 18 static pages generated. The sandboxed attempt was stopped after stalling; the standard build completed with local worker permissions. No deployment or GitHub push performed for this increment.
