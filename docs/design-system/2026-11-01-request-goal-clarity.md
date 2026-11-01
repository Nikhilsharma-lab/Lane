# Request Goal clarity

Nikhil approved the grouped Goal panel and simplified create-metric guide, then explicitly chose a custom pass/fail result alongside the three existing examples.

The metric picker and its current/target values share one panel. The Goal type stays beside its label. The Metrics library link remains in the picker footer. Native numeric steppers are hidden; Arc Input, numeric constraints and keyboard entry remain. The comparison arrow is Lucide ArrowRight, not an Arc numeric stepper.

Pass/fail uses plain-language examples and “Describe another result…”. A custom result asks what should work, how to check it and what counts as passing. All three answers are required before review/save; incomplete drafts remain recoverable. The answers appear in review and the saved Goal, survive edits and signed review, and are searchable within existing workspace/guest permissions. The result's name follows outcome reporting. Older pre-measurement records keep their original editor format.

Migration 0054 extends only the existing v5 JSON validator. It adds no table and rewrites no saved snapshot. Deploy the migration before the app; a rollback to an app that cannot read custom results is unsafe once one has been saved. Staging and production each require a restored and verified backup first. Existing result semantics and permissions remain.

The create-metric guide now explains the four questions with one online-shop example and concrete numbers. Lane still does not collect analytics. These changes reuse Arc controls and theme tokens, including keyboard focus, validation, dropdown placement and reduced-motion behavior.

Local verification: 52 database-safety tests, 2,927 application tests (one skipped), 1,022 UI tests, typecheck, targeted ESLint, design contracts, production build and bundle budget. Browser checks used the actual components with mocked services, including dark/light phone layout, keyboard selection/Escape and retained custom answers. Hosted evidence belongs in the release receipt; this document alone does not claim deployment.
