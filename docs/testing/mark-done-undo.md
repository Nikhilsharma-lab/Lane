# Single-Request Mark Done Undo

`showMarkedDone` creates one operation with one callback and a retained handle. The toast and palette consume it synchronously at most once. Invocation checks the operation's toast ID and current action callback against the actual Arc queue; a retained callback cannot submit after matching dismissal, action removal or replacement. The consumed/ended state belongs to the operation, so controller recreation cannot reset it.

`MarkDoneUndoWatcher` subscribes to Arc's existing store through the documented Lane readonly `useToastStackState` adaptation. Every queue commit reconciles availability, including equal-count updates. Copy, DOM text, queue length and exit animation duration have no role. Arc's action runner, timers, hover/focus/touch/hidden-document pauses, dismissal, swipe and motion remain unchanged.

The pointer retains only the latest-created single-Request operation. Its eligible value can disappear while the operation remains available for an explicit Not yet restoration. Restoring the same unconsumed Done keeps its toast ID and fresh ten-second lifetime without making it newer. Older visible toasts can still invoke their own operations; ending the newest operation never falls back to an older one. Bulk Undo remains separate.

Done failure, including a Done skipped before submission after an earlier failed change, ends the operation. A skipped Done replaces its premature success message with accurate failure feedback and no action. Undo starts the existing optimistic sequence, updates the same toast to loading before awaiting, and suppresses the later Is it live prompt. A failed Undo preserves feedback and saved-state reconciliation without reoffering the action. Only the Release form's saved callback ends Undo and shows Release recorded; opening the form is not success.

## Verification boundaries

The unit fixture renders the actual `ToastStackProvider` and captures its commands and readonly source. It does not implement a second queue. Store tests exercise ID/action replacement, unrelated removal, eviction, copy changes, provider lifetime, both retained entrypoints, terminal outcomes and older restoration. Prompt and palette tests use that same actual store, production Request move coordination and production optimistic/pending-mutation modules, controlling only external actions/session, announcements and incoming server rows.

These state tests do not prove mounted timers, Arc's action runner or native gestures. Actual-app browser checks cover those separately: dismissal/Escape/swipe, expiry and pauses, keyboard palette agreement, retained loading/result toast, Release failure/success and desktop/mobile themes. A fake visibility property is not hidden-tab evidence. See the session handoff and #174 evidence for completed commands, pinned non-production target and remaining gaps.

The isolated local application suite requires the non-resetting architecture bootstrap first. No hosted database reset, new schema, route, dependency, account, role or membership change is part of this increment. The final #174 build passes the original #167 cumulative budget (maximum +2,018 bytes against 2,048), so the #173 baseline proposal is withdrawn and the original baseline restored. Keep comparing cumulatively through #176; the historical #173 failure remains recorded.
