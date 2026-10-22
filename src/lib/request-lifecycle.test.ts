import { describe, expect, it } from "vitest"
import { allowedMove, canEditRequest } from "./request-lifecycle"

describe("canEditRequest", () => {
  const viewer = { id: "u1" }
  it("lets the creator and an admin edit an Open Request", () => {
    expect(canEditRequest({ status: "open", createdBy: "u1" }, viewer)).toBe(true)
    expect(canEditRequest({ status: "open", createdBy: "u2" }, { id: "u1", isAdmin: true })).toBe(true)
    expect(canEditRequest({ status: "open", createdBy: "u2" }, viewer)).toBe(false)
  })
  it("lets no one edit once it is picked up or Done", () => {
    expect(canEditRequest({ status: "in_progress", createdBy: "u1" }, { id: "u1", isAdmin: true })).toBe(false)
    expect(canEditRequest({ status: "done", createdBy: "u1" }, viewer)).toBe(false)
  })
})

describe("allowedMove", () => {
  it("gives a guest no move", () => {
    for (const status of ["open", "in_progress", "done"] as const) expect(allowedMove({ status }, { isGuest: true })).toBeNull()
  })
  it("picks up an Open Request", () => {
    expect(allowedMove({ status: "open" }, { isGuest: false })).toEqual({ move: "pick-up", to: "in_progress", label: "Pick up" })
  })
  it("marks an In Progress Request Done", () => {
    expect(allowedMove({ status: "in_progress" }, { isGuest: false })).toEqual({ move: "done", to: "done", label: "Mark Done" })
  })
  it("gives a Done Request no move", () => {
    expect(allowedMove({ status: "done" }, { isGuest: false })).toBeNull()
  })
})
