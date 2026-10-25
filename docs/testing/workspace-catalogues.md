# Workspace Project and Label catalogues

Both providers use `createWorkspaceCatalogue` through their actual domain adapters, `createWorkspaceProjects` and `createWorkspaceLabels`. The app layout still supplies the initial data and no client read runs on mount. Public context interfaces and server-side authorization stay unchanged.

Each owner retains one monotonically ordered reload sequence. Only the latest response in its active subscription lifetime can publish entries, permission metadata, loading or errors. Completion publishes one snapshot. A failed read keeps usable data and confirmed additions; a successful retry clears the error. Both adapters retain the explicit `callAction` session recovery from #169.

`add` is for a confirmed server creation; picker failure paths do not call it. Additions remain protected while a current read omits their saved IDs. A current read containing an ID retires that protection and uses the server record. A stale read cannot acknowledge it. Later server omission therefore removes an already acknowledged entry. Entries are reconciled by saved ID, including default Label IDs.

Projects retain name/ID ordering and clear the prior error when starting a reload or adding a confirmed Project. Labels preserve server/default order and append local creations; their existing error remains until a successful read. Label scope and `canCreate` remain server supplied. Guest Project creation and Label creation have different existing server rules; this module does not infer permissions.

Each provider keys its state-owning child by workspace. A switch exposes the new server seed immediately. On the final subscription cleanup, the old lifetime becomes invalid, retained additions and reload state are cleared, and fresh callbacks are bound to the new lifetime. React's cleanup/setup replay can reconnect the owner; prior add/reload closures and pending success/failure/completion callbacks remain invalid. The app layout's workspace/user boundary is also retained. This state stays in memory; there is no cache, new persistence or provider-owned membership authority.

## Verification boundary

`workspace-catalogue.test.ts` runs the same controlled-response scenarios through both actual adapters, mocking only their server actions and leaving `callAction` real. It covers stale success/failure/rejection, pending loading, acknowledgement, retained data and retry, cleanup/reconnect, A→B→A owner isolation, and explicit session recovery versus permission refusal. Domain tests preserve Project ordering/reconciliation and Label ordering, scope and default IDs. The guarded database suite retains Label persistence/uniqueness and action permission tests.

Actual-app browser checks cover Project and Label pre-dispatch create failures, explicit UI retry, confirmed creation, shared catalogue visibility, scope, keyboard operation and desktop/mobile in both themes. The current admin/member picker does not expose catalogue reload failure: visible duplicate Projects resolve successfully, inaccessible conflicts require another permission context, and Labels are layout seeded. Reload/error/Retry ordering is therefore established through the actual adapter tests, not a fabricated browser response, private-state injection or new UI. See the session handoff for run results and target boundaries.

## Proposed bundle waiver for #167 at #173

**PROPOSED, pending Nikhil's approval by merging the PR.** This is a reviewable
baseline refresh, not an approved release waiver. The launch plan §2.2 permits a
PR baseline update with a written waiver; the leftover build plan L2 records
approval by merging. The generated baseline retains the 2,048-byte tolerance.

Node 24.22.0 and Next 16.3.8, production source `fbe0185`, compared with the original
#167 baseline:

| Route | Original gzip bytes | Current gzip bytes | Cumulative growth | Above 2,048 |
| --- | ---: | ---: | ---: | ---: |
| `/` | 510975 | 513026 | 2051 | 3 |
| `/impact` | 466067 | 468187 | 2120 | 72 |
| `/intake` | 448011 | 450131 | 2120 | 72 |
| `/settings/members` | 478292 | 480412 | 2120 | 72 |
| `/settings/profile` | 478292 | 480412 | 2120 | 72 |
| `/requests/[id]` | 508554 | 510531 | 1977 | 0 |

The proposal retains readable shared reconciliation and the required lifetime,
acknowledgement and stale-callback protections. Atomic completion reduced the
largest delta to 2,155 bytes; catalogue-owned listeners reduced it to 2,134;
shared provider subscription wiring and error publication reduced it to 2,120.
Further byte-oriented rewrites were stopped. Other routes shrink by 48 bytes,
except onboarding, which shrinks by 170; no new route is included.

`bundle-baseline.mjs --update` generated the proposed baseline from that existing
production build; the subsequent bundle check passes against this refreshed
baseline. This does **not** establish compliance with the original #167 budget.
The original failure logs and exact measurements remain in
`/private/tmp/lane-spec-173-evidence.md` and
`/private/tmp/lane-spec-173-final-bundle-bytes.json`. The original baseline is
retained at `/private/tmp/lane-spec-167-original-bundle-baseline.json` for the
cumulative final comparison through #176. Browser acceptance and independent
review remain separate gates.
