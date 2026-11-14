import { describe, expect, it } from "vitest"
import { refreshedItems, withOpenedRead } from "./inbox-list"

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

// #284 (C5): going Back to the Inbox can show the copy of the page from before the open item was opened on its own
// page. Opening it read it, so it shows read and the count leaves it out before the re-read lands.
describe("withOpenedRead", () => {
  const AT = "2026-10-25T10:00:00.000Z"
  it("shows the opened item read and counts it out of the unread", () => {
    expect(withOpenedRead([item("b", 20), item("a", 10)], 2, "b", AT)).toEqual({ items: [item("b", 20, AT), item("a", 10)], unread: 1 })
  })

  it("leaves the copy as it is when the opened item is already read, or not in it", () => {
    const items = [item("b", 20, "2026-10-25T09:30:00.000Z"), item("a", 10)]
    expect(withOpenedRead(items, 1, "b", AT)).toEqual({ items, unread: 1 })
    expect(withOpenedRead(items, 1, "z", AT)).toEqual({ items, unread: 1 })
  })
})
