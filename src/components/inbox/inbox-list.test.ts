import { describe, expect, it } from "vitest"
import { refreshedItems } from "./inbox-list"

// #204: a re-read brings only unread items, so the ones read on this visit would vanish under the
// person. They stay where they were, read, until the next visit; new items arrive in date order.
const item = (id: string, minute: number, readAt: string | null = null) => ({ id, createdAt: `2026-10-25T09:${String(minute).padStart(2, "0")}:00.000Z`, readAt })

describe("refreshedItems", () => {
  it("adds new unread items in date order, newest first", () => {
    const shown = [item("b", 20), item("a", 10)]
    const incoming = [item("c", 30), item("b", 20), item("a", 10)]
    expect(refreshedItems(shown, incoming).map(row => row.id)).toEqual(["c", "b", "a"])
  })

  it("keeps an item read on this visit in its place, read", () => {
    const shown = [item("b", 20, "2026-10-25T10:00:00.000Z"), item("a", 10)]
    const incoming = [item("a", 10)]
    expect(refreshedItems(shown, incoming)).toEqual([item("b", 20, "2026-10-25T10:00:00.000Z"), item("a", 10)])
  })

  it("drops an unread item the re-read no longer has (read in another tab, or its Request deleted)", () => {
    const shown = [item("b", 20), item("a", 10)]
    expect(refreshedItems(shown, [item("a", 10)]).map(row => row.id)).toEqual(["a"])
  })

  it("takes the re-read's copy of an item it still has", () => {
    const shown = [{ ...item("a", 10), actorName: "Old name" }]
    const incoming = [{ ...item("a", 10), actorName: "Priya" }]
    expect(refreshedItems(shown, incoming)).toEqual(incoming)
  })
})
