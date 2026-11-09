import { describe, expect, it } from "vitest"
import { availableMove, canEditRequest, moveRefusal, pickupBlockedMessage, pickupRequester } from "./request-lifecycle"
import { TAKE_ON_FIRST, WRITE_THE_PREDICTION } from "./guest-submission"

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
  // #280 (decisions.md item 6): a Guest submission's reasons never send a Member to the Guest.
  it("says a waiting Guest submission's reason as it is: any Member can take it on", () => {
    expect(pickupBlockedMessage(TAKE_ON_FIRST, "Sam Lee")).toBe(TAKE_ON_FIRST)
  })
  it("sends someone else to whoever took the submission on to set the goal", () => {
    expect(pickupBlockedMessage(WRITE_THE_PREDICTION, null)).toBe(WRITE_THE_PREDICTION)
    expect(pickupBlockedMessage(WRITE_THE_PREDICTION, "Mo Taker")).toBe("Ask Mo Taker to set the goal before pickup.")
  })
})

describe("pickupRequester", () => {
  const filed = { guestSubmission: null, creatorName: "Sam Lee" }
  it("names nobody for a viewer who can change the Request", () => {
    expect(pickupRequester(filed, true)).toBeNull()
  })
  it("names the Requester who filed it, or says the Requester when the name is gone", () => {
    expect(pickupRequester(filed, false)).toBe("Sam Lee")
    expect(pickupRequester({ ...filed, creatorName: null }, false)).toBe("the Requester")
  })
  it("never names the Guest: nobody while it waits, and whoever took it on after", () => {
    const guest = { creatorName: "Gita Guest" }
    expect(pickupRequester({ ...guest, guestSubmission: "waiting" }, false)).toBeNull()
    expect(pickupRequester({ ...guest, guestSubmission: "taken_on", takenOnByName: "Mo Taker" }, false)).toBe("Mo Taker")
    expect(pickupRequester({ ...guest, guestSubmission: "taken_on", takenOnByName: null }, false)).toBe("the Requester")
    // A list row doesn't carry the taker's name: its reason is said as it is.
    expect(pickupRequester({ ...guest, guestSubmission: "taken_on" }, false)).toBeNull()
  })
})
