# Requests navigation correction

Goal: ship the approved Requests contextual sidebar in the actual Next.js routes, using official shadcn primitives and Plane's navigation patterns.

Scope: Requests, Intake entry, Open/In Progress/Done filters, existing detail routes, Settings Members/Profile, notifications/account. No future app rail, new routes, database changes or permission changes.

Reference audit: Plane preview sidebar-wrapper provides contextual heading, quick action, scrolling navigation and bottom utility area; projects-list distinguishes loading and loaded navigation, omits absent entries, uses named keyboard controls and reports mutation failures. Quick-actions keeps creation near context. Lane keeps its existing server-error/retry boundary and guest permissions; no Plane implementation is copied. Official shadcn MCP sidebar-07 inspected; retain local base-nova Sidebar primitives and Tasks example.

Paper MCP is unavailable. Verify directly in running Next.js app; no new static HTML deliverable.

- [x] Regression coverage for Intake, status destinations/current state, bottom Settings and guest visibility.
- [x] Correct shared sidebar on desktop/mobile, using existing routes and official Sidebar groups/submenus.
- [x] Synchronize status toolbar and navigation through existing URL parameter; retain search/sort while status changes.
- [x] Replace the earlier ReUI welcome panels with existing official Card primitives; align loading skeleton with Tasks page.
- [x] Run focused tests, lint, TypeScript and production build against the exact staged snapshot: 35 tests passed, TypeScript/lint/build passed.
- [ ] Signed-in browser verification: local Next.js app is at localhost:3000/login; waiting for user sign-in. Authenticated E2E and updated screenshot baselines are not claimed.
- [x] Stage only Requests/shell code and its required dependencies; verify staged snapshot independently.
- [ ] Commit and push dedicated branch codex/requests-plane-sidebar.
