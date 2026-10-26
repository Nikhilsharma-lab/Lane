import { describe, expect, it, vi } from "vitest"
import type { ToastOptions, ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import type { CurrentRequest } from "@/components/requests/current-request"
import { createMarkDoneUndoStore } from "@/components/requests/mark-done-undo"
import { createPendingMutationsStore } from "@/components/requests/pending-mutations-provider"
import { createPickupConfirmation } from "@/components/requests/pickup-confirmation"
import { createRequestMoves, type RequestMoveActions } from "@/components/requests/request-moves-controller"
import { copyAndSay } from "@/components/requests/use-copy"
import { runOptimistic, type ActionResult } from "@/components/requests/use-optimistic-action"
import { REQUEST_PRIORITIES, type RequestPriority } from "@/lib/request-constants"
import type { PickupConfirmation } from "@/lib/request-reviewer-rules"
import type { OverviewRequest } from "@/lib/request-overview"
import { paletteEntries } from "./command-palette-entries"
import { runPaletteAction, type PaletteActionDeps } from "./command-palette-actions"

// Spec #101: each mutation from the palette is acknowledged as from its button. These run the palette's entries
// through the real Request moves, pickup confirmation, copy and pending overlay; only the server actions, the
// toast stack, the polite region and the clipboard are stand-ins.

type Call = { name: keyof RequestMoveActions; args: unknown[]; resolve: (result: ActionResult) => void; reject: (error: unknown) => void }

function app(saved: Partial<OverviewRequest> = {}, request: Partial<CurrentRequest> = {}) {
  const row = { id: "r1", title: "Fix login", reframedProblem: null, status: "open", createdAt: "2026-10-01T00:00:00.000Z", creatorName: null, assigneeName: null, priority: "none", ...saved } satisfies OverviewRequest
  const current: CurrentRequest = {
    id: "r1", code: "LAN-12", name: "LAN-12", status: row.status, priority: row.priority ?? "none", source: "list", canEdit: row.status === "open",
    agreementBlocked: false, reviewState: null, pickupBlockedReason: null, ...request,
  }

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

  const said: string[] = []
  const announce = vi.fn((text: string) => { said.push(text) })
  const calls: Call[] = []
  const action = (name: keyof RequestMoveActions) => (...args: unknown[]) => new Promise<ActionResult>((resolve, reject) => { calls.push({ name, args, resolve, reject }) })
  const actions: RequestMoveActions = { markDone: action("markDone"), pickUpRequest: action("pickUpRequest"), undoMarkDone: action("undoMarkDone"), setRequestPriority: action("setRequestPriority") }

  const pending = createPendingMutationsStore({ schedule: () => {}, now: () => 1 })
  const overlay = {
    begin: (...args: Parameters<ReturnType<typeof pending.view>["begin"]>) => pending.view(pending.getSnapshot()).begin(...args),
    confirm: (...args: Parameters<ReturnType<typeof pending.view>["confirm"]>) => pending.view(pending.getSnapshot()).confirm(...args),
    rollback: (...args: Parameters<ReturnType<typeof pending.view>["rollback"]>) => pending.view(pending.getSnapshot()).rollback(...args),
    track: (...args: Parameters<ReturnType<typeof pending.view>["track"]>) => pending.view(pending.getSnapshot()).track(...args),
    settled: (...args: Parameters<ReturnType<typeof pending.view>["settled"]>) => pending.view(pending.getSnapshot()).settled(...args),
  }
  const failures: string[] = []
  const optimisticDeps = { overlay, refresh: () => {}, session: { current: async () => {}, renew: async () => {} }, notifyError: (message: string) => { failures.push(message) } }

  let asked: PickupConfirmation | null = null
  const confirmation = createPickupConfirmation(shown => { asked = shown })
  const clipboard: string[] = []
  let clipboardFails = false
  const copyText = (value: string, copied: string) => copyAndSay({
    writeText: async text => { if (clipboardFails) throw new Error("denied"); clipboard.push(text) }, announce, toast,
  }, value, copied)

  const undoStore = createMarkDoneUndoStore()
  const moves = createRequestMoves({
    orgId: "org1", announce, toast, update, optimistic: options => runOptimistic(optimisticDeps, options),
    confirmPickup: confirmation.confirm, copyText, actions, undoStore,
  })

  const deps = (): PaletteActionDeps => ({
    request: current, viewer: { id: "u1", name: "Test Member" }, undo: undoStore.get(), moves,
    open: () => {}, view: () => {}, project: () => {}, settings: () => {}, go: () => {},
    link: id => `https://app.example.test/requests/${id}`,
  })
  /** Runs the entry the palette lists under this id, as Enter on it does. */
  const run = (id: string) => {
    const entries = paletteEntries({ role: "member", request: current, undo: undoStore.get() && { requestId: undoStore.get()!.requestId }, projects: [] })
    const entry = entries.find(item => item.id === id)
    if (!entry) throw new Error(`No "${id}" entry among ${entries.map(item => item.id).join(", ")}`)
    if (entry.action.kind === "priority") throw new Error("Change priority… is a step")
    runPaletteAction(entry.action, deps())
  }
  const setPriority = (priority: RequestPriority) => runPaletteAction({ kind: "set-priority", requestId: "r1", priority }, deps())
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  /** The nth server call, once the overlay has sent it (after any earlier action on the Request settles). */
  const sent = async (index: number) => { await vi.waitFor(() => expect(calls.length).toBeGreaterThan(index)); return calls[index] }

  return {
    run, setPriority, flush, sent, calls, toasts, said, failures, clipboard, undoStore, confirmation,
    asked: () => asked, failClipboard: () => { clipboardFails = true },
    shown: () => pending.view(pending.getSnapshot()).applyOne(row),
  }
}

describe("each palette mutation is acknowledged as from its button (#106)", () => {
  it("Pick up with no open reviews starts at once and says so, and reverts if it fails", async () => {
    const a = app()
    a.run("pick-up")
    await Promise.resolve()
    expect(a.asked()).toBeNull()
    expect(a.shown()).toMatchObject({ status: "in_progress" })
    expect(a.said).toEqual(["Picked up. The Request is now In progress."])
    const call = await a.sent(0)
    expect(call.name).toBe("pickUpRequest")
    call.reject(new Error("offline"))
    await vi.waitFor(() => expect(a.shown()).toMatchObject({ status: "open" }))
    expect(a.said.at(-1)).toBe("")
  })

  it("names the viewer as Assignee when picking up the Request open on its page", async () => {
    const a = app({}, { source: "page" })
    a.run("pick-up")
    await Promise.resolve()
    expect(a.shown()).toMatchObject({ status: "in_progress", assignedTo: "u1", assigneeName: "Test Member" })
  })

  it("Pick up with an open concern asks 'Pick up anyway?' first, and moves only once confirmed", async () => {
    const reviewState = { concerns: [{ name: "Ana", reason: "Copy is unclear" }], unanswered: 0 }
    const a = app({}, { reviewState })
    a.run("pick-up")
    await a.flush()
    expect(a.asked()).toMatchObject({ title: "Pick up anyway?" })
    expect(a.shown()).toMatchObject({ status: "open" })
    expect(a.calls).toHaveLength(0)
    a.confirmation.settle(true)
    await a.flush()
    expect(a.asked()).toBeNull()
    expect(a.shown()).toMatchObject({ status: "in_progress" })
    expect(a.calls.map(call => call.name)).toEqual(["pickUpRequest"])
  })

  it("Pick up with an unanswered review does nothing when the confirmation is cancelled", async () => {
    const a = app({}, { reviewState: { concerns: [], unanswered: 1 } })
    a.run("pick-up")
    await a.flush()
    expect(a.asked()).toMatchObject({ title: "Pick up anyway?" })
    a.confirmation.settle(false)
    await a.flush()
    expect(a.shown()).toMatchObject({ status: "open" })
    expect(a.calls).toHaveLength(0)
    expect(a.said).toEqual([])
  })

  it("Mark Done shows Done and its Marked Done toast in the same tick, and reverts to In progress if it fails", async () => {
    const a = app({ status: "in_progress" })
    a.run("mark-done")
    expect(a.shown()).toMatchObject({ status: "done" })
    expect(a.toasts[0]).toMatchObject({ title: "Marked Done", description: "LAN-12 is now Done.", action: { label: "Undo" } })
    ;(await a.sent(0)).reject(new Error("offline"))
    await vi.waitFor(() => expect(a.shown()).toMatchObject({ status: "in_progress" }))
    expect(a.toasts).toHaveLength(1)
    expect(a.toasts[0]).toMatchObject({ type: "error", title: "Could not update this Request", action: undefined })
    expect(a.undoStore.get()).toBeNull()
  })

  it("Undo Mark Done runs the toast's own Undo: Undoing in place, then Back to In progress", async () => {
    const a = app({ status: "in_progress" })
    a.run("mark-done")
    ;(await a.sent(0)).resolve({ success: true })
    await a.flush()
    a.run("undo-mark-done")
    expect(a.toasts[0]).toMatchObject({ type: "loading", title: "Undoing", action: undefined })
    expect(a.shown()).toMatchObject({ status: "in_progress" })
    expect(a.undoStore.get()).toBeNull()
    const undo = await a.sent(1)
    expect(undo.name).toBe("undoMarkDone")
    undo.resolve({ success: true })
    await vi.waitFor(() => expect(a.toasts[0]).toMatchObject({ type: "success", title: "Back to In progress" }))
    expect(a.toasts).toHaveLength(1)
  })

  it.each(REQUEST_PRIORITIES.filter(priority => priority !== "none"))("setting priority %s shows and says it at once, and reverts if it fails", async priority => {
    const a = app()
    a.setPriority(priority)
    expect(a.shown()).toMatchObject({ priority })
    expect(a.said).toEqual([expect.stringMatching(/^Priority set to .+\.$/)])
    const call = await a.sent(0)
    expect(call).toMatchObject({ name: "setRequestPriority", args: ["r1", priority, { orgId: "org1" }] })
    call.resolve({ error: "This Request changed." })
    await vi.waitFor(() => expect(a.shown()).toMatchObject({ priority: "none" }))
    expect(a.said.at(-1)).toBe("")
    expect(a.failures).toEqual(["This Request changed."])
  })

  it("setting the priority it already has sends nothing", () => {
    const a = app({ priority: "high" }, { priority: "high" })
    a.setPriority("high")
    expect(a.calls).toHaveLength(0)
    expect(a.said).toEqual([])
  })

  it.each([["copy-link", "https://app.example.test/requests/r1", "Link copied."], ["copy-code", "LAN-12", "Code copied."]])(
    "%s says it once the clipboard has it", async (id, value, message) => {
      const a = app()
      a.run(id)
      // The clipboard answers asynchronously; the message follows it, never before.
      expect(a.said).toEqual([])
      await a.flush()
      expect(a.clipboard).toEqual([value])
      expect(a.said).toEqual([message])
      expect(a.toasts).toEqual([])
    })

  it.each(["copy-link", "copy-code"])("%s raises the copy failure instead when the clipboard refuses", async id => {
    const a = app()
    a.failClipboard()
    a.run(id)
    await a.flush()
    expect(a.said).toEqual([])
    expect(a.toasts).toMatchObject([{ type: "error", title: "Could not copy" }])
  })
})
