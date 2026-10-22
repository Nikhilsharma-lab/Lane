import { describe, expect, it } from "vitest"
import type { OverviewRequest } from "@/lib/request-overview"
import { createCurrentRequestStore, resolveCurrentRequest, type CurrentRequest } from "./current-request"

const row = (patch: Partial<OverviewRequest> = {}): OverviewRequest => ({
  id: "r1", requestNumber: 12, title: "Checkout copy", reframedProblem: null, status: "open", createdAt: "2026-10-01",
  creatorName: "Ana", assigneeName: null, priority: "high", canEdit: true, reviewState: null, ...patch,
})
const open: CurrentRequest = {
  id: "d1", code: "LAN-3", name: "LAN-3", status: "in_progress", priority: "low", source: "page",
  canEdit: false, agreementBlocked: false, reviewState: null, pickupBlockedReason: null,
}

describe("the current Request (#103)", () => {
  it("is the open Request first, else the highlighted row, else none", () => {
    const store = createCurrentRequestStore()
    const loaded = [row(), row({ id: "r2", requestNumber: 13 })]
    expect(resolveCurrentRequest(store.get(), loaded)).toBeNull()

    store.setHighlighted("r2")
    expect(resolveCurrentRequest(store.get(), loaded)).toEqual({
      id: "r2", code: "LAN-13", name: "LAN-13", status: "open", priority: "high", source: "list",
      canEdit: true, agreementBlocked: false, reviewState: null, pickupBlockedReason: null,
    })

    const release = store.setOpen(open)
    expect(resolveCurrentRequest(store.get(), loaded)).toBe(open)
    release()
    expect(resolveCurrentRequest(store.get(), loaded)?.id).toBe("r2")
    store.setHighlighted(null)
    expect(resolveCurrentRequest(store.get(), loaded)).toBeNull()
  })

  it("reads the highlighted row through the pending overlay, and drops a row the list no longer has", () => {
    const store = createCurrentRequestStore()
    store.setHighlighted("r1")
    const apply = <T extends { id: string }>(request: T): T => ({ ...request, status: "done" })
    expect(resolveCurrentRequest(store.get(), [row()], apply)?.status).toBe("done")
    expect(resolveCurrentRequest(store.get(), [row({ id: "other" })])).toBeNull()
  })

  it("names an unnumbered row by its title and treats a missing edit flag as no edit", () => {
    const store = createCurrentRequestStore()
    store.setHighlighted("r1")
    expect(resolveCurrentRequest(store.get(), [row({ requestNumber: undefined, canEdit: undefined, priority: undefined, reframedProblem: "Clearer checkout" })]))
      .toMatchObject({ code: null, name: "Clearer checkout", canEdit: false, priority: "none" })
  })

  it("keeps a newer open Request when an older one unmounts after it (page to preview, preview to preview)", () => {
    const store = createCurrentRequestStore()
    const first = store.setOpen(open)
    const next = { ...open, id: "d2", source: "peek" as const }
    store.setOpen(next)
    first()
    expect(resolveCurrentRequest(store.get(), [])).toBe(next)
  })

  it("tells subscribers about each change and keeps one snapshot between them", () => {
    const store = createCurrentRequestStore()
    let calls = 0
    const unsubscribe = store.subscribe(() => { calls += 1 })
    const before = store.get()
    expect(store.get()).toBe(before)
    store.setHighlighted("r1")
    store.setHighlighted("r1")
    store.setOpen(open)()
    expect(calls).toBe(3)
    unsubscribe()
    store.setHighlighted(null)
    expect(calls).toBe(3)
  })
})
