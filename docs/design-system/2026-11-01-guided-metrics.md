# Guided metric creation

Approved by Nikhil on November 1 after comparing simple names/units with guided definitions.

The Metrics library and Request picker share a two-step form: choose a measurement, then answer specific questions with examples. Completion, percentage of a group, count and duration generate a shared definition. Unit follows the measurement; the definition is shown before saving. This does not collect analytics or verify the underlying measurements.

Dashboard-link inputs and missing-source prompts are removed. Existing source references, definitions, history and Request results remain intact. Existing definitions are read-only in Edit; name changes remain available. No new table, migration, route, integration or AI call.

Arc controls, the adaptive dialog/sheet and theme tokens remain the visual and interaction foundations. The guide loads on demand. Back retains answers; changing measurement type clears incompatible answers. Pending saves lock editing and dismissal. Duplicate names offer the existing metric, with its definition, without replacing it. Request form submit events stay inside the metric form.

Validation evidence is recorded in the release receipt outside the repository. Local browser checks use actual app components with mocked writes; these are distinct from signed-in hosted verification. The 390px light sheet retained answers after a simulated failed save. Desktop dark selects were operated by keyboard. Metric database integration tests use the checkout-owned loopback database only.

Existing generic starter metrics are not relabeled or regrouped by this change. Their historical meaning and totals remain unchanged.
