import { describe, expect, it } from "vitest"
import { advanceSequence, captureSequence, sequencePosition } from "./request-sequence"

// Plan item 2.5: Request detail's "2 / 5" and its previous and next targets.
describe("sequencePosition", () => {
  const ids = ["a", "b", "c", "d", "e"]

  it("places a Request in the middle with both neighbours", () => {
    expect(sequencePosition(captureSequence(ids, "b"), "b")).toEqual({ index: 1, total: 5, previousId: "a", nextId: "c" })
  })

  it("has no previous at the first Request and no next at the last", () => {
    expect(sequencePosition(captureSequence(ids, "a"), "a")).toEqual({ index: 0, total: 5, previousId: null, nextId: "b" })
    expect(sequencePosition(captureSequence(ids, "e"), "e")).toEqual({ index: 4, total: 5, previousId: "d", nextId: null })
  })

  it("is null without a sequence, for an id outside it, and for a Request the sequence was not opened at", () => {
    expect(sequencePosition(null, "a")).toBeNull()
    expect(sequencePosition(undefined, "a")).toBeNull()
    expect(sequencePosition(captureSequence(ids, "z"), "z")).toBeNull()
    // Reached from search or a notification after opening b from the list.
    expect(sequencePosition(captureSequence(ids, "b"), "c")).toBeNull()
  })

  it("follows the chain once J or K advances it", () => {
    const next = advanceSequence(captureSequence(ids, "b"), "c")
    expect(sequencePosition(next, "c")).toMatchObject({ index: 2, previousId: "b", nextId: "d" })
  })
})

describe("captureSequence", () => {
  it("copies the list's order, so a later change to the list does not renumber it", () => {
    const source = ["a", "b", "c"]
    const sequence = captureSequence(source, "b")
    source.splice(0, 1)
    source.push("d")
    expect(sequence.ids).toEqual(["a", "b", "c"])
    expect(sequencePosition(sequence, "b")).toMatchObject({ index: 1, total: 3 })
  })
})
