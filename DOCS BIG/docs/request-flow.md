# Request Flow — Full Lifecycle Flowchart

> Last updated: April 11, 2026
> Legend: [BUILT] = working end-to-end | [PARTIAL] = UI or API exists but incomplete | [MISSING] = not implemented

---

## Visual Flow

```
                              ANYONE IN ORG
                                   |
                    +--------------+--------------+
                    |                             |
              Submit Request                 Submit Idea
              (PM usually)                  (anyone)
                    |                             |
                    v                             v
    +===============================+   +====================+
    |     PHASE 1: PREDESIGN        |   |    IDEA BOARD       |
    |     (PM + Org decides WHAT)   |   |                     |
    |===============================|   | 1. Voting (1 week)  |
    |                               |   | 2. AI + Lead score  |
    |  +--------------------------+ |   | 3. Approve/Reject   |
    |  | STAGE 1: INTAKE GATE    | |   |                     |
    |  |                          | |   | If approved:        |
    |  | PM fills request form:   | |   | Auto-create Request |
    |  | - Title, Description     | |   | -----> [MISSING]    |
    |  | - Business Context       | |   +====================+
    |  | - Success Metrics        | |
    |  | - Figma URL (optional)   | |
    |  | - Impact Prediction      | |
    |  |                          | |
    |  | AI Preflight: [BUILT]    | |
    |  | - Quality score (0-100)  | |
    |  | - Duplicate detection    | |
    |  | - Priority (P0-P3)       | |
    |  | - Complexity (S/M/L/XL)  | |
    |  |                          | |
    |  | Solution-specific block: | |
    |  | -------> [MISSING]       | |
    |  | (AI classifies but does  | |
    |  |  NOT block bad requests) | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 2: CONTEXT         | |
    |  |                          | |
    |  | Gate: description +      | |
    |  | business context +       | |
    |  | success metrics required | |
    |  | [BUILT - gates work]     | |
    |  |                          | |
    |  | Auto-link research,      | |
    |  | past decisions:          | |
    |  | -------> [MISSING]       | |
    |  |                          | |
    |  | AI Context Brief:        | |
    |  | -------> [MISSING here]  | |
    |  | (exists only in Design)  | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 3: SHAPE           | |
    |  |                          | |
    |  | Gate: business context   | |
    |  | [BUILT]                  | |
    |  |                          | |
    |  | Solution direction,      | |
    |  | constraints, risks,      | |
    |  | appetite, open Qs:       | |
    |  | -------> [MISSING]       | |
    |  | (no Shape doc UI)        | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 4: BET             | |
    |  |                          | |
    |  | Gate: success metrics +  | |
    |  | designer must be         | |
    |  | assigned (lead/admin     | |
    |  | only) [BUILT]            | |
    |  |                          | |
    |  | Bet/Kill/Defer decision: | |
    |  | -------> [MISSING]       | |
    |  | (just an advance button, | |
    |  |  no ceremony or record)  | |
    |  |                          | |
    |  | Appetite (time budget):  | |
    |  | -------> [MISSING]       | |
    |  +-----------+--------------+ |
    +===============+===============+
                    |
          Designer assigned
          Email sent [BUILT]
          In-app notif [MISSING]
                    |
                    v
    +===============================+
    |     PHASE 2: DESIGN           |
    |     (Designer solves problem)  |
    |     Non-linear movement OK     |
    |===============================|
    |                               |
    |  +--------------------------+ |
    |  | STAGE 2a: SENSE          | |
    |  | "Understand before       | |
    |  |  proposing"              | |
    |  |                          | |
    |  | Stage marker only:       | |
    |  | -------> [PARTIAL]       | |
    |  | (no Sensing Summary UI,  | |
    |  |  no AI research sidebar) | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 2b: FRAME          | |
    |  | "Define the real problem" | |
    |  |                          | |
    |  | Design Frame form:       | |
    |  | -------> [MISSING]       | |
    |  | (no problem articulation | |
    |  |  or PM brief comparison) | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 2c: DIVERGE        | |
    |  | "Multiple directions"    | |
    |  |                          | |
    |  | Iteration cards:         | |
    |  | [BUILT] - title, desc,   | |
    |  | figma link, comments     | |
    |  |                          | |
    |  | AI iteration summary:    | |
    |  | -------> [MISSING]       | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 2d: CONVERGE       | |
    |  | "Narrow + refine"        | |
    |  |                          | |
    |  | Iteration cards: [BUILT] | |
    |  |                          | |
    |  | Decision log:            | |
    |  | -------> [MISSING]       | |
    |  |                          | |
    |  | AI edge case generator:  | |
    |  | -------> [MISSING]       | |
    |  |                          | |
    |  | Completeness scoring:    | |
    |  | -------> [MISSING]       | |
    |  +-----------+--------------+ |
    |              |                |
    |     Requires Figma URL        |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE 2e: PROVE          | |
    |  | "3-signoff quality gate" | |
    |  |                          | |
    |  | 3 sign-off cards: [BUILT]| |
    |  | - Designer: Approve/     | |
    |  |   Conditions/Reject      | |
    |  | - PM: same               | |
    |  | - Design Head: same      | |
    |  |                          | |
    |  | Email to signers: [BUILT]| |
    |  | In-app notif:   [MISSING]| |
    |  |                          | |
    |  | All 3 approve -->        | |
    |  | AUTO-ADVANCE to Dev      | |
    |  | [BUILT]                  | |
    |  |                          | |
    |  | Rejected --> loop back   | |
    |  | [BUILT] (comment logged) | |
    |  +-----------+--------------+ |
    +===============+===============+
                    |
          Figma LOCKED [BUILT]
          Handoff doc generated [PARTIAL]
          Email to devs [BUILT]
          In-app notif [MISSING]
                    |
                    v
    +===============================+
    |     PHASE 3: DEV              |
    |     (Build + ship)            |
    |===============================|
    |                               |
    |  Kanban board: [BUILT]        |
    |  Drag-and-drop 5 columns      |
    |                               |
    |  To Do                        |
    |    |                          |
    |    v                          |
    |  In Progress                  |
    |    |                          |
    |    v                          |
    |  In Review                    |
    |    |                          |
    |    v                          |
    |  Design QA  <-- REQUIRED      |
    |    |            [BUILT]       |
    |    v                          |
    |  Done                         |
    |                               |
    |  Dev questions: [BUILT]       |
    |  Figma drift alerts: [PARTIAL]|
    |  (tracked but not pushed)     |
    |                               |
    |  Post-handoff Figma change:   |
    |  - Sync on page load [BUILT]  |
    |  - Real-time webhook [MISSING]|
    |  - Push notification [MISSING]|
    |                               |
    |  "Ship" button when Done:     |
    |  [BUILT]                      |
    +===============+===============+
                    |
                    v
    +===============================+
    |     PHASE 4: TRACK            |
    |     (Measure impact)          |
    |===============================|
    |                               |
    |  +--------------------------+ |
    |  | STAGE: MEASURING         | |
    |  |                          | |
    |  | PM logs actual impact:   | |
    |  | [BUILT]                  | |
    |  |                          | |
    |  | Variance calculated:     | |
    |  | predicted vs actual      | |
    |  | [BUILT]                  | |
    |  |                          | |
    |  | PM calibration score:    | |
    |  | -------> [PARTIAL]       | |
    |  | (calculated, not         | |
    |  |  aggregated per PM)      | |
    |  +-----------+--------------+ |
    |              |                |
    |              v                |
    |  +--------------------------+ |
    |  | STAGE: COMPLETE          | |
    |  |                          | |
    |  | Impact retrospective:    | |
    |  | -------> [MISSING]       | |
    |  |                          | |
    |  | Learnings capture:       | |
    |  | -------> [MISSING]       | |
    |  +--------------------------+ |
    +===============================+
```

---

## Cross-Cutting Systems

```
+-------------------------------------------------------------------+
|                     NOTIFICATIONS                                  |
+-------------------------------------------------------------------+
| Email on events:              [BUILT] (assignment, signoff,        |
|                                handoff, approval)                  |
| In-app notifications table:   [BUILT] (schema + inbox UI)         |
| Auto-insert on events:        [MISSING] <-- CRITICAL GAP          |
|   Inbox is always empty unless manually seeded.                    |
|   No code inserts into notifications table on any event.           |
| Real-time push:               [MISSING]                           |
| Notification preferences:     [MISSING]                           |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|                     FIGMA INTEGRATION                              |
+-------------------------------------------------------------------+
| OAuth connect/disconnect:     [BUILT]                              |
| Token encryption (AES-256):   [BUILT]                              |
| On-demand version sync:       [BUILT] (fetches on page load)      |
| Version history display:      [BUILT]                              |
| Lock on handoff:              [BUILT]                              |
| Webhook handler:              [PARTIAL] (handler exists, no sub)  |
| Post-handoff drift alerts:    [PARTIAL] (tracked, not notified)   |
| Real-time push updates:       [MISSING]                           |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|                     AI CAPABILITIES                                |
+-------------------------------------------------------------------+
| Intake classification:        [BUILT] (classifies, doesn't block) |
| Auto-triage (P/C/Type):      [BUILT]                              |
| Duplicate detection:          [BUILT] (semantic search)            |
| Request quality scoring:      [BUILT]                              |
| Context brief generation:     [BUILT] (design phase only)         |
| Handoff brief generation:     [BUILT]                              |
| Idea validation scoring:      [BUILT]                              |
| Impact retrospective:         [BUILT] (API exists)                 |
| Smart assignment:             [MISSING]                            |
| Private designer nudges:      [MISSING] (nudge API exists but     |
|                                not triggered automatically)        |
| Weekly digest:                [MISSING] (no cron)                  |
| Morning briefing:             [MISSING]                            |
| Edge case generator:          [MISSING]                            |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|                     ASSIGNMENT                                     |
+-------------------------------------------------------------------+
| Manual assign (lead/admin):   [BUILT]                              |
| Role types (lead/reviewer/    [BUILT]                              |
|   contributor):                                                    |
| Email on assignment:          [BUILT]                              |
| Workload visibility:          [BUILT] (count per person)           |
| AI smart assignment:          [MISSING]                            |
| Skill/expertise matching:     [MISSING]                            |
| Capacity calendar:            [MISSING]                            |
| Accept/decline assignment:    [MISSING]                            |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|                     CYCLES                                         |
+-------------------------------------------------------------------+
| Create/edit cycles:           [BUILT]                              |
| Link requests to cycles:      [BUILT]                              |
| Appetite (weeks):             [BUILT]                              |
| Capacity enforcement:         [MISSING]                            |
| Throughput/velocity charts:   [PARTIAL] (chart component exists)  |
| Rollover incomplete work:     [MISSING]                            |
+-------------------------------------------------------------------+
```

---

## Top 5 Critical Gaps (in priority order)

| # | Gap | Impact | Fix Effort |
|---|-----|--------|------------|
| 1 | **Notifications never auto-created** | Inbox is always empty. All the triage inbox work is useless without this. | Medium — add `insertNotification()` calls at each event trigger point (assign, comment, signoff, stage change, etc.) |
| 2 | **Intake gate doesn't block** | Solution-specific requests pass through freely, defeating the core product thesis. | Small — wire AI classification result to a blocking UI step |
| 3 | **Idea approval doesn't create request** | Approved ideas sit in limbo — no auto-conversion to request. | Small — add request creation in idea approval handler |
| 4 | **No Shape/Frame/Sense artifacts** | Design stages are just markers with advance buttons — no actual design work is captured per stage. | Medium — add structured forms for each stage |
| 5 | **No Bet ceremony** | Bet stage has no appetite capture, no kill/defer decision recording, no cycle assignment. | Small-Medium |

---

## Healthy Paths (fully working end-to-end)

1. PM creates request with form → AI triage scores it → request exists with priority/complexity
2. Lead assigns designer → email sent → designer sees request in their list
3. Designer advances through design stages → creates iterations in Diverge/Converge
4. Request enters Prove → 3 signers approve → Figma locked → auto-advances to Dev
5. Dev moves card through kanban → Design QA → Done → Ship
6. PM logs impact → variance calculated → request complete
