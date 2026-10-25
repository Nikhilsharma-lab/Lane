import { expect, it, vi } from "vitest"
import { toastStack } from "@/test/toast-stack"
import { requestNavigation } from "@/test/request-navigation"
import type { ActionSession } from "@/lib/action-call"
import type { PickupConfirmation } from "@/lib/request-reviewer-rules"
import { createRequestMoves, type RequestMoveActions } from "./request-moves-controller"
import { createPendingMutationsStore } from "./pending-mutations-provider"
import { createPickupConfirmation } from "./pickup-confirmation"
import { createMarkDoneUndoStore } from "./mark-done-undo"
import { runOptimistic, runOptimisticBatch, type ActionResult, type BatchResult } from "./use-optimistic-action"

function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function app(session: ActionSession = { current: async () => {}, renew: async () => {} }) {
  const navigation = requestNavigation()
  const stack = toastStack()
  const undoStore = createMarkDoneUndoStore()
  undoStore.bind(stack.state)
  const store = createPendingMutationsStore({ schedule: () => {}, now: () => 1 })
  const refresh = vi.fn(), announce = vi.fn(), afterMove = vi.fn(), isItLive = vi.fn(), notifyError = vi.fn()
  const execution = { overlay: store.view(store.getSnapshot()), refresh,
    session, notifyError,
  }
  const calls: { name: keyof RequestMoveActions; args: unknown[]; response: ReturnType<typeof pending<ActionResult & BatchResult>> }[] = []
  const action = (name: keyof RequestMoveActions) => (...args: unknown[]) => {
    const response = pending<ActionResult & BatchResult>()
    calls.push({ name, args, response })
    return response.promise
  }
  const actions: RequestMoveActions = { markDone: action("markDone"), pickUpRequest: action("pickUpRequest"), undoMarkDone: action("undoMarkDone"), setRequestPriority: action("setRequestPriority"), pickUpRequests: action("pickUpRequests"), markDoneMany: action("markDoneMany") }
  let asked: PickupConfirmation | null = null
  const confirmation = createPickupConfirmation(next => { asked = next })
  const busy = new Set<string>()
  const bind = () => createRequestMoves({ orgId: "org1", ...stack, undoStore, actions, busy, announce, afterMove,
    isItLive, refresh, copyText: async () => true, confirmPickup: confirmation.confirm,
    optimistic: options => runOptimistic(execution, options), continuation: navigation.continuation,
    optimisticBatch: options => runOptimisticBatch(execution, options),
  })
  return { moves: bind(), bind, navigation, stack, undoStore, confirmation, asked: () => asked,
    calls, refresh, announce, afterMove, isItLive, notifyError,
    release: (id: string, run: () => Promise<ActionResult>) => runOptimistic(execution, { id, run, onError: () => {}, refreshOnError: false }),
    shown: (id = "r1", status = "open") => store.view(store.getSnapshot()).applyOne({ id, status }),
    sent: async (index = 0) => { await vi.waitFor(() => expect(calls.length).toBeGreaterThan(index)); return calls[index] },
  }
}

const request = { id: "r1", name: "LAN-1", reviewState: { concerns: [], unanswered: 1 } }

it("navigation while pickup confirmation waits cancels before any patch or submission", async () => {
  const a = app()
  const move = a.moves.move(request, "pick-up")
  expect(a.asked()?.title).toBe("Pick up anyway?")
  a.navigation.selectList({ project: "other" })
  a.confirmation.settle(true)
  // Give an incorrectly submitted action an answer so the failure is an assertion, not a timeout.
  await new Promise(resolve => setTimeout(resolve, 0))
  a.calls[0]?.response.resolve({ success: true })
  expect(await move).toEqual({ status: "cancelled" })
  expect(a.calls).toEqual([])
  expect(a.shown().status).toBe("open")
  expect(a.announce).not.toHaveBeenCalled()
})

it("a submitted Done settles after navigation without opening an old prompt", async () => {
  const a = app()
  const move = a.moves.move(request, "done")
  const call = await a.sent()
  a.navigation.selectList({ project: "other" })
  call.response.resolve({ success: true })
  expect(await move).toMatchObject({ status: "success" })
  expect(a.shown("r1", "in_progress").status).toBe("done")
  expect(a.isItLive).not.toHaveBeenCalled()
})

it("a late pickup failure rolls back and refreshes without announcing into a new view", async () => {
  const a = app()
  const move = a.moves.move({ id: "r1", name: "LAN-1" }, "pick-up")
  const call = await a.sent()
  a.navigation.selectList({ project: "other" })
  call.response.reject(new Error("offline"))
  expect(await move).toMatchObject({ status: "error", thrown: true })
  expect(a.shown().status).toBe("open")
  expect(a.refresh).toHaveBeenCalledTimes(1)
  expect(a.notifyError).not.toHaveBeenCalled()
  expect(a.stack.toasts).toEqual([])
  expect(a.announce.mock.calls.map(call => call[0])).toEqual(["Picked up. The Request is now In progress."])
})

it.each([false, true])("a late Done failure ends Undo and settles only its existing toast (dismissed: %s)", async dismissed => {
  const a = app()
  const move = a.moves.move(request, "done")
  const call = await a.sent()
  if (dismissed) a.stack.dismiss()
  a.navigation.selectList({ project: "other" })
  call.response.resolve({ error: "This Request changed." })
  await move
  expect(a.undoStore.get()).toBeNull()
  expect(a.shown("r1", "in_progress").status).toBe("in_progress")
  if (dismissed) expect(a.stack.toasts).toEqual([])
  else expect(a.stack.toasts[0]).toMatchObject({ title: "Could not update this Request", action: undefined })
})

it("a retained explicit Undo still works after navigation but never restores the old row's focus", async () => {
  const a = app()
  const move = a.moves.move(request, "done")
  ;(await a.sent()).response.resolve({ success: true })
  await move
  const undo = a.undoStore.get()!.undo
  a.navigation.selectList({ project: "other" })
  undo()
  const reverse = await a.sent(1)
  expect(reverse.name).toBe("undoMarkDone")
  a.navigation.selectList({ project: "all" })
  reverse.response.resolve({ success: true })
  await vi.waitFor(() => expect(a.stack.toasts[0].title).toBe("Back to In progress"))
  expect(a.afterMove).toHaveBeenCalledTimes(1)
  expect(a.shown("r1", "done").status).toBe("in_progress")
})

it("mixed readiness asks once for ready Requests and keeps partial saved moves with all failure reasons", async () => {
  const a = app()
  const targets = [
    { ...request, status: "open" as const, requester: null },
    { ...request, id: "r2", name: "LAN-2", status: "open" as const, pickupBlockedReason: "Add a current value.", requester: "Ana" },
    { ...request, id: "r3", name: "LAN-3", status: "open" as const, requester: null },
  ]
  const onStart = vi.fn()
  const move = a.moves.moveMany(targets, "pick-up", { isGuest: false, current: () => true, onStart })
  expect(a.asked()?.requests.map(item => item.name)).toEqual(["LAN-1", "LAN-3"])
  expect(a.calls).toHaveLength(0)
  a.confirmation.settle(true)
  const call = await a.sent()
  expect(call.name).toBe("pickUpRequests")
  expect(call.args).toEqual([["r1", "r3"], { orgId: "org1" }])
  expect(onStart).toHaveBeenCalledExactlyOnceWith(2)
  expect(a.shown("r1").status).toBe("in_progress")
  expect(a.shown("r2").status).toBe("open")
  call.response.resolve({ moved: ["r1"], failed: [{ id: "r3", error: "This Request is no longer Open." }] })
  expect(await move).toEqual({ status: "success", moved: ["r1"], failed: [
    { id: "r3", error: "This Request is no longer Open." },
    { id: "r2", error: "LAN-2: Ask Ana to add current values before pickup." },
  ], notReadyOnly: false, detached: false })
  expect(a.shown("r1").status).toBe("in_progress")
  expect(a.shown("r3").status).toBe("open")
  expect(a.calls).toHaveLength(1)
  expect(a.refresh).toHaveBeenCalledTimes(1)
})

it("a second invocation across a harmless rebind cannot replace the first pickup confirmation", async () => {
  const a = app()
  const first = a.moves.move(request, "pick-up")
  const second = a.bind().move(request, "pick-up")
  a.confirmation.settle(true)
  ;(await a.sent()).response.resolve({ success: true })
  expect(await first).toMatchObject({ status: "success" })
  expect(await second).toEqual({ status: "busy" })
  expect(a.calls).toHaveLength(1)
})

it("bulk Done owns one independent Undo for moved IDs and preserves partial reversals without replay", async () => {
  const a = app()
  const single = a.moves.move({ id: "single", name: "LAN-9" }, "done")
  ;(await a.sent()).response.resolve({ success: true })
  await single
  const pointer = a.undoStore.get()
  const targets = [1, 2, 3].map(n => ({ id: `r${n}`, name: `LAN-${n}`, status: "in_progress" as const, requester: null }))
  const bulk = a.moves.moveMany(targets, "done", { isGuest: false, current: () => true })
  const forward = await a.sent(1)
  expect(forward.name).toBe("markDoneMany")
  forward.response.resolve({ moved: ["r1", "r2"], failed: [{ id: "r3", error: "Already Done." }] })
  await bulk
  expect(a.undoStore.get()).toBe(pointer)
  expect(a.isItLive).toHaveBeenCalledTimes(1)
  const toast = a.stack.toasts.find(item => item.title === "2 Requests marked Done")!
  expect(toast).toBeDefined()
  const undo = toast.action!.onClick
  undo(toast.id)
  undo(toast.id)
  expect(a.stack.toasts.find(item => item.id === toast.id)?.title).toBe("Undoing")
  ;(await a.sent(2)).response.resolve({ success: true })
  ;(await a.sent(3)).response.resolve({ error: "A Release has already been recorded." })
  await vi.waitFor(() => expect(a.stack.toasts.find(item => item.id === toast.id)?.title).toBe("1 of 2 could not be undone"))
  expect(a.stack.toasts.find(item => item.id === toast.id)?.description).toContain("LAN-2: A Release has already been recorded.")
  expect(a.shown("r1", "done").status).toBe("in_progress")
  expect(a.shown("r2", "done").status).toBe("done")
  expect(a.refresh).toHaveBeenCalledTimes(2) // one partial forward refresh, one partial Undo refresh
  undo(toast.id)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(a.calls.slice(2).map(call => call.args)).toEqual([["r1", { orgId: "org1" }], ["r2", { orgId: "org1" }]])
  expect(a.undoStore.get()).toBe(pointer)
})

it("all-unready bulk pickup explains what to complete without confirmation or optimistic changes", async () => {
  const a = app()
  const result = await a.moves.moveMany([{ ...request, status: "open", requester: null, pickupBlockedReason: "Add a current value." }],
    "pick-up", { isGuest: false, current: () => true })
  expect(result).toEqual({ status: "success", moved: [], failed: [{ id: "r1", error: "LAN-1: Add a current value." }], notReadyOnly: true, detached: false })
  expect(a.asked()).toBeNull()
  expect(a.calls).toEqual([])
  expect(a.shown().status).toBe("open")
})

it.each(["navigation", "selection", "cancel"] as const)("bulk confirmation abandoned by %s sends no batch, even after returning to the same scope", async reason => {
  const a = app()
  let selection = Symbol()
  const original = selection
  const move = a.moves.moveMany([{ ...request, status: "open", requester: null }], "pick-up", {
    isGuest: false, current: () => selection === original,
  })
  if (reason === "navigation") { a.navigation.selectList({ project: "other" }); a.navigation.selectList({ project: "all" }) }
  if (reason === "selection") { selection = Symbol(); selection = Symbol() }
  a.confirmation.settle(reason !== "cancel")
  expect(await move).toEqual({ status: "cancelled" })
  expect(a.calls).toEqual([])
  expect(a.shown().status).toBe("open")
  // Releasing the abandoned operation does not leave the same Request permanently busy.
  const retry = a.bind().moveMany([{ ...request, status: "open", requester: null }], "pick-up", { isGuest: false, current: () => true })
  a.confirmation.settle(true)
  ;(await a.sent()).response.resolve({ moved: ["r1"] })
  expect(await retry).toMatchObject({ status: "success", moved: ["r1"] })
})

it("a second bulk invocation cannot supersede the confirmation already owned by those Requests", async () => {
  const a = app()
  const targets = [{ ...request, status: "open" as const, requester: null }]
  const first = a.moves.moveMany(targets, "pick-up", { isGuest: false, current: () => true })
  expect(await a.bind().moveMany(targets, "pick-up", { isGuest: false, current: () => true })).toEqual({ status: "busy" })
  a.confirmation.settle(true)
  ;(await a.sent()).response.resolve({ moved: ["r1"] })
  expect(await first).toMatchObject({ status: "success", moved: ["r1"] })
})

it.each([false, true])("a submitted batch settles after navigation with no old summary (failed: %s)", async failed => {
  const a = app()
  const move = a.moves.moveMany([{ ...request, status: "in_progress", requester: null }], "done", { isGuest: false, current: () => true })
  const call = await a.sent()
  a.navigation.selectList({ project: "other" })
  a.navigation.selectList({ project: "all" })
  call.response.resolve(failed ? { error: "Not allowed." } : { moved: ["r1"] })
  expect(await move).toMatchObject({ status: failed ? "error" : "success", detached: true })
  expect(a.shown("r1", "in_progress").status).toBe(failed ? "in_progress" : "done")
  expect(a.refresh).toHaveBeenCalledTimes(failed ? 1 : 0)
  expect(a.stack.toasts).toEqual([])
  expect(a.isItLive).not.toHaveBeenCalled()
})

it("an uncertain batch failure retains attempted IDs without inventing per-Request refusal reasons", async () => {
  const a = app()
  const move = a.moves.moveMany([{ ...request, status: "in_progress", requester: null }], "done", { isGuest: false, current: () => true })
  ;(await a.sent()).response.reject(new Error("lost response"))
  expect(await move).toEqual({ status: "error", thrown: true, error: "Check your connection and try again.",
    failed: [{ id: "r1", error: "" }], notReadyOnly: false, detached: false })
  expect(a.refresh).toHaveBeenCalledTimes(1)
  expect(a.shown("r1", "in_progress").status).toBe("in_progress")
})

it("latest reviewer state wins and a native modified link does not cancel pickup", async () => {
  const a = app()
  a.confirmation.report("r1", { concerns: [{ name: "Ana", reason: "Please check the copy." }], unanswered: 0 })
  const move = a.moves.move({ id: "r1", name: "LAN-1", reviewState: null }, "pick-up")
  expect(a.asked()?.requests[0].concerns).toEqual([{ name: "Ana", reason: "Please check the copy." }])
  expect(a.navigation.followLink({ defaultPrevented: false, button: 0, metaKey: true, ctrlKey: false, shiftKey: false,
    altKey: false, currentTarget: {}, preventDefault: vi.fn() }, "/requests/other")).toBe(false)
  a.confirmation.settle(true)
  ;(await a.sent()).response.resolve({ success: true })
  expect(await move).toMatchObject({ status: "success" })
})

it("detail's pending acknowledgement begins only after the shared confirmation accepts a current invocation", async () => {
  const a = app()
  const onStart = vi.fn()
  const first = a.moves.move(request, "pick-up", { onStart })
  expect(onStart).not.toHaveBeenCalled()
  a.navigation.selectList({ project: "other" })
  a.confirmation.settle(true)
  expect(await first).toEqual({ status: "cancelled" })
  expect(onStart).not.toHaveBeenCalled()
  const second = a.moves.move(request, "pick-up", { onStart })
  a.confirmation.settle(true)
  ;(await a.sent()).response.resolve({ success: true })
  await second
  expect(onStart).toHaveBeenCalledTimes(1)
})

it("bulk Undo skipped behind a failed Release ends once and refreshes without sending a reversal", async () => {
  const a = app()
  const forward = a.moves.moveMany([{ ...request, status: "in_progress", requester: null }], "done", { isGuest: false, current: () => true })
  ;(await a.sent()).response.resolve({ moved: ["r1"] })
  await forward
  const release = pending<ActionResult>()
  const saving = a.release("r1", () => release.promise)
  const toast = a.stack.toasts[0]
  const undo = toast.action!.onClick
  undo(toast.id)
  release.resolve({ error: "Release failed." })
  await saving
  await vi.waitFor(() => expect(a.stack.toasts[0].title).toBe("1 of 1 could not be undone"))
  expect(a.stack.toasts[0].description).toContain("An earlier change failed.")
  expect(a.stack.toasts[0].action).toBeUndefined()
  expect(a.refresh).toHaveBeenCalledTimes(1)
  undo(toast.id)
  expect(a.calls).toHaveLength(1)
})

it("navigation during explicit session recovery detaches presentation but preserves submitted batch replay and settlement", async () => {
  const renewal = pending<string>()
  const renew = vi.fn(() => renewal.promise)
  const a = app({ current: async () => "cached", renew })
  const move = a.moves.moveMany([{ ...request, status: "in_progress", requester: null }], "done", { isGuest: false, current: () => true })
  const expired = { error: "Sign in again.", sessionExpired: true }
  ;(await a.sent()).response.resolve(expired)
  await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1))
  a.navigation.selectList({ project: "other" })
  renewal.resolve("fresh")
  const retry = await a.sent(1)
  expect(retry.args).toEqual([["r1"], { orgId: "org1" }])
  retry.response.resolve({ moved: ["r1"] })
  expect(await move).toMatchObject({ status: "success", moved: ["r1"], detached: true })
  expect(a.shown("r1", "in_progress").status).toBe("done")
  expect(a.stack.toasts).toEqual([])
})
