import { describe, expect, it } from "vitest"
import { availableMove, canEditRequest, moveRefusal, pickupBlockedMessage } from "./request-lifecycle"

describe("canEditRequest", () => {
  const viewer = { id: "u1" }
  it("lets the creator and an admin edit an Open Request", () => {
    expect(canEditRequest({ status: "open", createdBy: "u1", takenOnBy: null }, viewer)).toBe(true)
    expect(canEditRequest({ status: "open", createdBy: "u2", takenOnBy: null }, { id: "u1", isAdmin: true })).toBe(true)
    expect(canEditRequest({ status: "open", createdBy: "u2", takenOnBy: null }, viewer)).toBe(false)
  })
  it("lets no one edit once it is picked up or Done", () => {
    expect(canEditRequest({ status: "in_progress", createdBy: "u1", takenOnBy: null }, { id: "u1", isAdmin: true })).toBe(false)
    expect(canEditRequest({ status: "done", createdBy: "u1", takenOnBy: null }, viewer)).toBe(false)
  })
})

const member = { isGuest: false }
const NOT_READY = "Add the current value before picking up this Request."
const unlocked = { exceptionClosure: null, outcomeClosure: null, pickupBlockedReason: null }

describe("availableMove", () => {
  it("gives a guest no move", () => {
    for (const status of ["open", "in_progress", "done"] as const) expect(availableMove({ status }, { isGuest: true })).toBeNull()
  })
  it("picks up an Open Request", () => {
    expect(availableMove({ status: "open" }, member)).toEqual({ move: "pick-up", to: "in_progress", label: "Pick up", blockedReason: null })
  })
  it("offers a pickup that isn't ready with its reason, so every surface can show why", () => {
    expect(availableMove({ status: "open", pickupBlockedReason: NOT_READY }, member)).toMatchObject({ move: "pick-up", blockedReason: NOT_READY })
  })
  it("marks an In progress Request Done, whatever its plan says", () => {
    expect(availableMove({ status: "in_progress", pickupBlockedReason: NOT_READY }, member)).toEqual({ move: "done", to: "done", label: "Mark Done", blockedReason: null })
  })
  it("gives a Done or closed Request no move", () => {
    expect(availableMove({ status: "done" }, member)).toBeNull()
    expect(availableMove({ status: "open", agreementBlocked: true }, member)).toBeNull()
  })
})

describe("moveRefusal", () => {
  it("lets a ready Request through", () => {
    expect(moveRefusal({ status: "open", ...unlocked }, "pick-up")).toBeNull()
    expect(moveRefusal({ status: "in_progress", ...unlocked }, "done")).toBeNull()
  })
  it("refuses a closed Request before anything else", () => {
    expect(moveRefusal({ status: "in_progress", ...unlocked, exceptionClosure: {} }, "done")).toBe("This Request is closed without a result and cannot advance.")
    expect(moveRefusal({ status: "in_progress", ...unlocked, outcomeClosure: {} }, "done")).toBe("This Request is Closed and cannot advance.")
  })
  it("says which status the Request has left", () => {
    expect(moveRefusal({ status: "in_progress", ...unlocked }, "pick-up")).toBe("This Request is no longer Open. Refresh to see its current state.")
    expect(moveRefusal({ status: "done", ...unlocked }, "done")).toBe("This Request is no longer In progress. Refresh to see its current state.")
  })
  it("refuses a pickup that isn't ready with the reason the surfaces show", () => {
    expect(moveRefusal({ status: "open", ...unlocked, pickupBlockedReason: NOT_READY }, "pick-up")).toBe(NOT_READY)
  })
})

describe("pickupBlockedMessage", () => {
  it("tells someone who can edit the plan what to fix, and anyone else who can", () => {
    expect(pickupBlockedMessage(NOT_READY, null)).toBe(NOT_READY)
    expect(pickupBlockedMessage(NOT_READY, "Sam Lee")).toBe("Ask Sam Lee to add current values before pickup.")
  })
})
