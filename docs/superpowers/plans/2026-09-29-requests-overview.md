# Populated Requests overview

Goal: replace the narrow list and unused detail placeholder on the root page with a full-width, library-based Requests table. Preserve the detail route and its compact list.

Use actual shadcn base-nova Table and Tabs registry source, existing shadcn Button/Input/Badge/Select, and imported ReUI Frame. ReUI Data Grid was inspected; its spreadsheet-editing, virtualization and drag dependencies are unnecessary for this bounded overview. No new packages, routes, tables, AI calls or server queries.

Plane list/empty patterns and layout HOC inspected: preserve loading, error and filtered-empty distinctions. Local components inspected. Paper unavailable; use the interactive local render for visual verification.

Steps: test filtering/sorting; import Table/Tabs source and retain licenses; compose request/status/pickup/submission columns with status tabs, search and sort; select overview on root only; adapt overview loading; verify guest scope, filter-empty recovery, deep links, keyboard and responsive behavior. Existing server query remains canonical and limits results to 200; disclose that limit when reached. No sample data in the real database.

Validation: 11 overview/welcome tests and 87 existing focused contract tests passed. Local interactive preview uses 18 illustrative Requests, actual overview React code and library primitives with navigation adapters. Verified search by person, combined status search, no-match recovery, oldest-first sort, keyboard tab activation, detail navigation, 390px layout without horizontal overflow, and 1440px dark layout. Existing server permissions are unchanged; authenticated E2E and screenshot baseline refresh were not run. E2E root expectations now use the overview table/tablist; detail expectations remain intact.
