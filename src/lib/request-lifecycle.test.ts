import { describe, expect, it } from "vitest"
import { allowedMove } from "./request-lifecycle"

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
