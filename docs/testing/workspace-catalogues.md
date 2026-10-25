# Workspace Project and Label catalogues

Both providers use `createWorkspaceCatalogue` through their actual domain adapters, `createWorkspaceProjects` and `createWorkspaceLabels`. The app layout still supplies the initial data and no client read runs on mount. Public context interfaces and server-side authorization stay unchanged.

Each owner retains one monotonically ordered reload sequence. Only the latest response in its active subscription lifetime can publish entries, permission metadata, loading or errors. Completion publishes one snapshot. A failed read keeps usable data and confirmed additions; a successful retry clears the error. Both adapters retain the explicit `callAction` session recovery from #169.

`add` is for a confirmed server creation; picker failure paths do not call it. Additions remain protected while a current read omits their saved IDs. A current read containing an ID retires that protection and uses the server record. A stale read cannot acknowledge it. Later server omission therefore removes an already acknowledged entry. Entries are reconciled by saved ID, including default Label IDs.

Projects retain name/ID ordering and clear the prior error when starting a reload or adding a confirmed Project. Labels preserve server/default order and append local creations; their existing error remains until a successful read. Label scope and `canCreate` remain server supplied. Guest Project creation and Label creation have different existing server rules; this module does not infer permissions.

Each provider keys its state-owning child by workspace. A switch exposes the new server seed immediately. On the final subscription cleanup, the old lifetime becomes invalid, retained additions and reload state are cleared, and fresh callbacks are bound to the new lifetime. React's cleanup/setup replay can reconnect the owner; prior add/reload closures and pending success/failure/completion callbacks remain invalid. The app layout's workspace/user boundary is also retained. This state stays in memory; there is no cache, new persistence or provider-owned membership authority.

## Verification boundary

`workspace-catalogue.test.ts` runs the same controlled-response scenarios through both actual adapters, mocking only their server actions and leaving `callAction` real. It covers stale success/failure/rejection, pending loading, acknowledgement, retained data and retry, cleanup/reconnect, A→B→A owner isolation, and explicit session recovery versus permission refusal. Domain tests preserve Project ordering/reconciliation and Label ordering, scope and default IDs. The guarded database suite retains Label persistence/uniqueness and action permission tests.

Actual-app browser checks cover Project and Label pre-dispatch create failures, explicit UI retry, confirmed creation, shared catalogue visibility, scope, keyboard operation and desktop/mobile in both themes. The current admin/member picker does not expose catalogue reload failure: visible duplicate Projects resolve successfully, inaccessible conflicts require another permission context, and Labels are layout seeded. Reload/error/Retry ordering is therefore established through the actual adapter tests, not a fabricated browser response, private-state injection or new UI. See the session handoff for run results and target boundaries.
