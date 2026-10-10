import { describe, expect, it, vi } from "vitest"
import { createPendingMutationsStore } from "./pending-mutations-provider"
import { runOptimistic, runOptimisticBatch, type OptimisticDeps } from "./use-optimistic-action"
import type { OverviewRequest } from "@/lib/request-overview"

// Plan item 1.5: one overlay keyed by Request id. These tests drive the store
// and the mutation runner without a DOM: the provider and hooks only wire them
// to React, the router and the toast stack.

const row = (id: string, overrides: Partial<OverviewRequest> = {}): OverviewRequest => ({
  id, title: `Request ${id}`, reframedProblem: null, status: "in_progress", createdAt: "2026-10-01T00:00:00.000Z",
  creatorName: null, assigneeName: null, priority: "none", ...overrides,
})

function setup() {
  const queue: (() => void)[] = []
  const store = createPendingMutationsStore({ schedule: task => { queue.push(task) }, now: () => 1 })
  const flush = () => { while (queue.length) queue.shift()!() }
  const view = () => store.view(store.getSnapshot())
  return { store, view, flush, queue }
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function depsFor(view: () => ReturnType<ReturnType<typeof setup>["view"]>) {
  return {
    overlay: view(),
    refresh: vi.fn<() => void>(),
    notifyError: vi.fn<(message: string) => void>(),
    refreshToken: vi.fn(async () => {}),
  } satisfies OptimisticDeps
}

describe("pending-mutation overlay: apply()", () => {
  it("returns the same array and row objects when nothing is pending", () => {
    const { view } = setup()
    const rows = [row("a"), row("b")]
    expect(view().apply(rows)).toBe(rows)
  })

  it("returns a new object only for the patched row and keeps it stable across renders", () => {
    const { view, store } = setup()
    const rows = [row("a"), row("b")]
    store.view(store.getSnapshot()).begin("a", { kind: "done", status: "done" })
    const first = view().apply(rows)
    expect(first).not.toBe(rows)
    expect(first[0]).not.toBe(rows[0])
    expect(first[0].status).toBe("done")
    expect(first[1]).toBe(rows[1])
    // A second render with the same server rows hands memoised rows the same object.
    const second = view().apply(rows)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(rows[1])
  })

  it("exposes the merged patch by Request id", () => {
    const { view } = setup()
    view().begin("a", { kind: "priority", priority: "high" })
    view().begin("a", { kind: "done", status: "done" })
    expect(view().patches.a).toMatchObject({ kind: "done", status: "done", priority: "high", since: 1 })
  })
})

describe("pending-mutation overlay: clearing", () => {
  it("keeps a pending patch even when the server rows already show its value", () => {
    const { view, flush } = setup()
    // Undo begins while Done is pending: the stale server row still says In Progress.
    view().begin("a", { kind: "undo", status: "in_progress" })
    view().apply([row("a", { status: "in_progress" })])
    flush()
    expect(view().patches.a).toBeDefined()
  })

  it("clears a confirmed patch only once the server rows show it, never on stale rows", () => {
    const { view, flush } = setup()
    const token = view().begin("a", { kind: "done", status: "done" })
    view().confirm("a", token)
    // The action's payload was dropped by a navigation: the rows are stale.
    const stale = view().apply([row("a", { status: "in_progress" })])
    flush()
    expect(stale[0].status).toBe("done")
    expect(view().patches.a).toBeDefined()
    // The next server render shows Done: the row reads the server's object, and the patch clears after render.
    const fresh = row("a", { status: "done" })
    expect(view().apply([fresh])[0]).toBe(fresh)
    expect(view().patches.a).toBeDefined()
    flush()
    expect(view().patches.a).toBeUndefined()
  })

  it("matches priority against the saved value, treating a missing priority as none", () => {
    const { view, flush } = setup()
    const token = view().begin("a", { kind: "priority", priority: "none" })
    view().confirm("a", token)
    view().apply([row("a", { priority: undefined })])
    flush()
    expect(view().patches.a).toBeUndefined()
  })

  it("lets the newest move own a field, so an Undo never falls back to Done", () => {
    const { view, flush } = setup()
    const done = view().begin("a", { kind: "done", status: "done" })
    view().confirm("a", done)
    const undo = view().begin("a", { kind: "undo", status: "in_progress" })
    view().confirm("a", undo)
    const rows = view().apply([row("a", { status: "in_progress" })])
    flush()
    expect(rows[0].status).toBe("in_progress")
    expect(view().apply([row("a", { status: "in_progress" })])[0].status).toBe("in_progress")
    expect(view().patches.a).toBeUndefined()
  })

  it("shows a composer insert until the server rows include it", () => {
    const { view, flush } = setup()
    const created = row("new", { status: "open" })
    view().insert(created)
    const server = [row("a")]
    expect(view().apply(server).map(item => item.id)).toEqual(["new", "a"])
    expect(view().applyOne(server[0])).toBe(server[0])
    expect(view().apply([row("new", { status: "open" }), ...server]).map(item => item.id)).toEqual(["new", "a"])
    flush()
    expect(view().apply(server)).toBe(server)
  })
})

describe("useOptimisticAction core", () => {
  it("applies the patch before the action resolves and keeps it after success", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const action = deferred<{ success: true }>()
    const outcome = runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run: () => action.promise })
    // Same tick: the row already reads Done.
    expect(view().apply([row("a")])[0].status).toBe("done")
    action.resolve({ success: true })
    await expect(outcome).resolves.toEqual({ status: "success", value: { success: true } })
    expect(view().patches.a).toBeDefined()
    expect(deps.refresh).not.toHaveBeenCalled()
    expect(deps.notifyError).not.toHaveBeenCalled()
  })

  it("rolls back with the server message when the action returns an error", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const outcome = await runOptimistic(deps, {
      id: "a", patch: { kind: "done", status: "done" },
      run: async () => ({ error: "This Request is no longer In Progress. Refresh to see its current state." }),
    })
    expect(outcome).toEqual({ status: "error", error: "This Request is no longer In Progress. Refresh to see its current state.", thrown: false })
    expect(view().patches.a).toBeUndefined()
    expect(view().apply([row("a")])[0].status).toBe("in_progress")
    expect(deps.notifyError).toHaveBeenCalledWith("This Request is no longer In Progress. Refresh to see its current state.")
    expect(deps.refresh).toHaveBeenCalledTimes(1)
  })

  it("rolls back when the action throws and hands the failure to onError", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const onError = vi.fn()
    const outcome = await runOptimistic(deps, { id: "a", patch: { kind: "pick-up", status: "in_progress" }, run: async () => { throw new TypeError("Failed to fetch") }, onError })
    expect(outcome).toMatchObject({ status: "error", thrown: true })
    expect(view().patches.a).toBeUndefined()
    expect(onError).toHaveBeenCalledWith("Check your connection and try again.", { thrown: true })
    expect(deps.notifyError).not.toHaveBeenCalled()
    expect(deps.refreshToken).not.toHaveBeenCalled()
  })

  it("refreshes the Clerk token and retries once on an auth-shaped refusal", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const run = vi.fn()
      .mockResolvedValueOnce({ error: "You can't change Requests in this workspace." })
      .mockResolvedValueOnce({ success: true })
    const outcome = await runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run })
    expect(outcome.status).toBe("success")
    expect(deps.refreshToken).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
    expect(view().patches.a).toBeDefined()
  })

  it("rolls back after the one retry also fails", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const run = vi.fn().mockResolvedValue({ error: "You can't change Requests in this workspace." })
    const outcome = await runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run })
    expect(outcome.status).toBe("error")
    expect(run).toHaveBeenCalledTimes(2)
    expect(view().patches.a).toBeUndefined()
  })

  it("sends Undo only after the pending Done succeeds", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const done = deferred<{ success: true }>()
    const undoRun = vi.fn(async () => ({ success: true as const, status: "in_progress" as const }))
    const doneOutcome = runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run: () => done.promise, waitForPending: true })
    const undoOutcome = runOptimistic(deps, { id: "a", patch: { kind: "undo", status: "in_progress" }, run: undoRun, waitForPending: true })
    await Promise.resolve()
    expect(undoRun).not.toHaveBeenCalled()
    expect(view().apply([row("a")])[0].status).toBe("in_progress")
    done.resolve({ success: true })
    await doneOutcome
    await expect(undoOutcome).resolves.toMatchObject({ status: "success" })
    expect(undoRun).toHaveBeenCalledTimes(1)
  })

  it("skips Undo when the Done it reverses failed", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const undoRun = vi.fn()
    const doneOutcome = runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run: async () => ({ error: "Not found" }), waitForPending: true })
    const undoOutcome = runOptimistic(deps, { id: "a", patch: { kind: "undo", status: "in_progress" }, run: undoRun, waitForPending: true })
    await doneOutcome
    await expect(undoOutcome).resolves.toEqual({ status: "skipped" })
    expect(undoRun).not.toHaveBeenCalled()
    expect(view().patches.a).toBeUndefined()
    expect(deps.notifyError).toHaveBeenCalledTimes(1)
  })

  it("runs without an overlay outside the provider", async () => {
    const deps: OptimisticDeps = { overlay: null, refresh: vi.fn(), notifyError: vi.fn(), refreshToken: vi.fn(async () => {}) }
    await expect(runOptimistic(deps, { id: "a", patch: { kind: "done", status: "done" }, run: async () => ({ success: true }) })).resolves.toMatchObject({ status: "success" })
  })
})

describe("useOptimisticBatch core", () => {
  it("moves every row at once and rolls back only the rows the server did not move", async () => {
    const { view } = setup()
    const deps = depsFor(view)
    const action = deferred<{ moved: string[]; failed: { id: string; error: string }[] }>()
    const outcome = runOptimisticBatch(deps, { ids: ["a", "b"], patch: { kind: "pick-up", status: "in_progress" }, run: () => action.promise })
    expect(view().apply([row("a", { status: "open" }), row("b", { status: "open" })]).map(item => item.status)).toEqual(["in_progress", "in_progress"])
    action.resolve({ moved: ["a"], failed: [{ id: "b", error: "This Request is no longer Open. Refresh to see its current state." }] })
    await expect(outcome).resolves.toEqual({ status: "success", moved: ["a"], failed: [{ id: "b", error: "This Request is no longer Open. Refresh to see its current state." }] })
    expect(view().patches.a).toBeDefined()
    expect(view().patches.b).toBeUndefined()
    expect(deps.refresh).toHaveBeenCalledTimes(1)
  })
})
