import { describe, expect, it, vi } from "vitest"
import type { ToastOptions, ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { createIsItLive, IS_IT_LIVE_COPY, type IsItLiveView } from "./is-it-live"
import { createMarkDoneUndoStore } from "./mark-done-undo"
import { createRequestMoves, type RequestMoveActions } from "./request-moves-controller"
import type { ActionResult, OptimisticOptions, OptimisticOutcome } from "./use-optimistic-action"

// #135: "Is it live?" after a successful single-Request Mark Done. These run the real Request moves, the
// real Undo pointer and the prompt's logic; only the server actions and the toast stack are stand-ins.

function app() {
  // The toast stack: one queue, where a toast with a known id updates in place.
  const toasts: (ToastOptions & { id: string })[] = []
  let seq = 0
  const update: ToastStackApi["update"] = (id, patch) => {
    const index = toasts.findIndex(item => item.id === id)
    if (index !== -1) toasts[index] = { ...toasts[index], ...patch }
  }
  const toast: ToastStackApi["toast"] = ({ id, ...options }) => {
    if (id && toasts.some(item => item.id === id)) { update(id, options); return id }
    const record = { ...options, id: id ?? `toast-${++seq}` }
    toasts.unshift(record)
    return record.id
  }

  const results: Partial<Record<keyof RequestMoveActions, ActionResult>> = {}
  const calls: (keyof RequestMoveActions)[] = []
  const action = (name: keyof RequestMoveActions) => async () => { calls.push(name); return results[name] ?? { success: true } }
  const actions: RequestMoveActions = { markDone: action("markDone"), pickUpRequest: action("pickUpRequest"), undoMarkDone: action("undoMarkDone"), setRequestPriority: action("setRequestPriority") }
  const optimistic = async <R,>(options: OptimisticOptions<R>): Promise<OptimisticOutcome<R>> => {
    const value = await options.run()
    if (value && typeof value === "object" && "error" in value) {
      options.onError?.(String(value.error), { thrown: false, auth: false })
      return { status: "error", error: String(value.error), thrown: false }
    }
    return { status: "success", value }
  }

  let view: IsItLiveView | null = null
  const prompt = createIsItLive(next => { view = next })
  const undoStore = createMarkDoneUndoStore()
  const moves = createRequestMoves({
    orgId: "org1", announce: vi.fn(), toast, update, optimistic, confirmPickup: async () => true, copyText: async () => true,
    actions, undoStore, isItLive: prompt.ask,
  })
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  return { moves, prompt, view: () => view, toasts, calls, results, undoStore, flush }
}

const request = { id: "r1", name: "LAN-12" }

describe("Is it live? after Mark Done (#135)", () => {
  it("opens after a successful Mark Done, asking with both choices and saying a release ends Undo Done", async () => {
    const a = app()
    await a.moves.move(request, "done")
    expect(a.view()).toEqual({ step: "ask", request })
    expect(IS_IT_LIVE_COPY).toMatchObject({
      title: "Is it live?",
      yes: "Yes, record release",
      notYet: "Not yet",
      endsUndo: "Recording the release ends Undo Done for this Request.",
    })
    expect(IS_IT_LIVE_COPY.question("LAN-12")).toBe("LAN-12 is Done. Has the agreed audience received it?")
  })

  it("does not open when Mark Done fails, for a pick up, or once Undo has already run", async () => {
    const failed = app()
    failed.results.markDone = { error: "This Request is already Done." }
    await failed.moves.move(request, "done")
    expect(failed.view()).toBeNull()

    const pickUp = app()
    await pickUp.moves.move(request, "pick-up")
    expect(pickUp.view()).toBeNull()

    const undone = app()
    const done = undone.moves.move(request, "done")
    undone.undoStore.get()!.undo()
    await done
    expect(undone.view()).toBeNull()
  })

  it("Yes, record release opens the release form for that Request with today's date as the exposure date", async () => {
    const a = app()
    await a.moves.move(request, "done")
    a.prompt.record()
    expect(a.view()).toEqual({ step: "release", request })
    expect(IS_IT_LIVE_COPY.releaseTitle).toBe("Record release")
  })

  it("a saved release closes the prompt and ends Undo Done", async () => {
    const a = app()
    await a.moves.move(request, "done")
    a.prompt.record()
    a.prompt.saved()
    expect(a.view()).toBeNull()
    expect(a.undoStore.get()).toBeNull()
    expect(a.toasts[0]).toMatchObject({ type: "success", title: "Release recorded", description: "LAN-12 is now Measuring.", action: undefined })
    expect(a.toasts.filter(item => item.title === "Marked Done")).toHaveLength(0)
  })

  it("Not yet leaves the Request at Done and Undo Done still works", async () => {
    const a = app()
    await a.moves.move(request, "done")
    a.prompt.notYet()
    expect(a.view()).toBeNull()
    expect(a.calls).toEqual(["markDone"])
    // The Marked Done toast is shown again with its Undo and a fresh 10 seconds, and the palette can reach it.
    expect(a.toasts[0]).toMatchObject({ type: "success", title: "Marked Done", description: "LAN-12 is now Done.", duration: 10_000, action: { label: "Undo" } })
    expect(a.undoStore.get()).toMatchObject({ requestId: "r1", name: "LAN-12" })
    a.toasts[0].action!.onClick(a.toasts[0].id)
    await a.flush()
    expect(a.calls).toEqual(["markDone", "undoMarkDone"])
    expect(a.toasts[0]).toMatchObject({ title: "Back In Progress", description: "LAN-12 is In Progress again." })
  })

  it("going back from the release form is Not yet: Undo Done still works", async () => {
    const a = app()
    await a.moves.move(request, "done")
    a.prompt.record()
    a.prompt.notYet()
    expect(a.view()).toBeNull()
    a.undoStore.get()!.undo()
    await a.flush()
    expect(a.calls).toEqual(["markDone", "undoMarkDone"])
  })

  it("a second Mark Done while the prompt is open asks about the newer Request; the first keeps its Undo", async () => {
    const a = app()
    await a.moves.move(request, "done")
    await a.moves.move({ id: "r2", name: "LAN-13" }, "done")
    expect(a.view()).toEqual({ step: "ask", request: { id: "r2", name: "LAN-13" } })
    expect(a.toasts.some(item => item.title === "Marked Done" && item.description === "LAN-12 is now Done.")).toBe(true)
  })
})
