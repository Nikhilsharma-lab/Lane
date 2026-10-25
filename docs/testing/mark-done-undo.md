# Single-Request Mark Done Undo

`showMarkedDone` creates one operation with one callback and a retained handle. The toast and palette consume it synchronously at most once. Invocation checks the operation's toast ID and current action callback against the actual Arc queue; a retained callback cannot submit after matching dismissal, action removal or replacement. The consumed/ended state belongs to the operation, so controller recreation cannot reset it.

`MarkDoneUndoWatcher` subscribes to Arc's existing store through the documented Lane readonly `useToastStackState` adaptation. Every queue commit reconciles availability, including equal-count updates. Copy, DOM text, queue length and exit animation duration have no role. Arc's action runner, timers, hover/focus/touch/hidden-document pauses, dismissal, swipe and motion remain unchanged.

The pointer retains only the latest-created single-Request operation. Its eligible value can disappear while the operation remains available for an explicit Not yet restoration. Restoring the same unconsumed Done keeps its toast ID and fresh ten-second lifetime without making it newer. Older visible toasts can still invoke their own operations; ending the newest operation never falls back to an older one. Bulk Undo remains separate.

Done failure, including a Done skipped before submission after an earlier failed change, ends the operation. A skipped Done replaces its premature success message with accurate failure feedback and no action. Undo starts the existing optimistic sequence, updates the same toast to loading before awaiting, and suppresses the later Is it live prompt. A failed Undo preserves feedback and saved-state reconciliation without reoffering the action. If an earlier pending Release fails, a skipped Undo submits nothing, replaces loading with terminal failure feedback and refreshes saved state once. If the original Done itself failed, its existing failure feedback remains. Only the Release form's saved callback ends Undo and shows Release recorded; opening the form is not success. That callback captures its initiating prompt operation, so completion after Escape still ends the original Undo and cannot close a newer prompt or end its Undo.

## Verification boundaries

The unit fixture renders the actual `ToastStackProvider` and captures its commands and readonly source. It does not implement a second queue. Store tests exercise ID/action replacement, unrelated removal, eviction, copy changes, provider lifetime, both retained entrypoints, terminal outcomes and older restoration. Prompt and palette tests use that same actual store, production Request move coordination and production optimistic/pending-mutation modules, controlling only external actions/session, announcements and incoming server rows.

These state tests do not prove mounted timers, Arc's action runner or native gestures. Actual-app browser checks cover those separately: dismissal/Escape/swipe, expiry and pauses, keyboard palette agreement, retained loading/result toast, Release failure/success and desktop/mobile themes. A fake visibility property is not hidden-tab evidence. See the session handoff and #174 evidence for completed commands, pinned non-production target and remaining gaps.

The isolated local application suite requires the non-resetting architecture bootstrap first. No hosted database reset, new schema, route, dependency, account, role or membership change is part of this increment. The initial #174 build passed the original #167 cumulative budget at maximum +2,018 bytes, withdrawing the #173 proposal. Required review fixes now measure Requests at +2,073 bytes, 25 above the unchanged 2,048-byte limit; all other routes remain within it. This is recorded as a separate measured baseline proposal, pending approval by merging. Keep comparing cumulatively against the original baseline through #176; earlier measurements remain historical evidence.


## Proposed bundle waiver after #174 review corrections

**PROPOSED, pending Nikhil's approval by merging the PR.** This separate proposal
supersedes the initial #174 within-budget receipt; it does not revive or approve
#173's withdrawn proposal. The existing launch-plan/leftover-build-plan policy
allows a measured baseline refresh with a written PR waiver. Tolerance remains
2,048 bytes, and no release or main-merge approval is claimed.

Final product source `e7f296118fcbd7ec68e7a0ce7a7d50d42a144018`, Node 24.22.0,
Next 16.3.8, compared with the original #167 baseline:

| Route | Original gzip bytes | Current gzip bytes | Cumulative growth | Above 2,048 |
| --- | ---: | ---: | ---: | ---: |
| `/` | 510975 | 513048 | 2073 | 25 |
| `/impact` | 466067 | 468109 | 2042 | 0 |
| `/intake` | 448011 | 450053 | 2042 | 0 |
| `/settings/members` | 478292 | 480332 | 2040 | 0 |
| `/settings/profile` | 478292 | 480332 | 2040 | 0 |
| `/requests/[id]` | 508554 | 510578 | 2024 | 0 |

The initial #174 implementation removed DOM/count/timer choreography and measured
maximum +2,018 bytes, naturally recovering the original budget. Required review
fixes now finish a skipped Undo with failure feedback and saved-state refresh, and
bind pending Release completion to its initiating operation across Escape and a
newer prompt. These correctness protections remain readable; no byte-oriented
rewrite was made to recover the final 25 bytes. Public routes shrink 37 bytes and
onboarding shrinks 160; no new route or dependency is involved.

The generated refresh uses this same final build without a rebuild or product
change. Its check passes; the original cumulative check still fails only `/`.
Exact measurements and failure evidence remain in
`/private/tmp/lane-spec-174-final-review-bundle-bytes.json` and
`/private/tmp/lane-spec-174-final-review-bundle.log`. Preserve
`/private/tmp/lane-spec-167-original-bundle-baseline.json` for the final cumulative
comparison through #176. Browser acceptance and independent review are separate.
