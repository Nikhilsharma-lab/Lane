import { describe, expect, it } from "vitest"
import { begin, beginAllRead, confirm, initialReadState, isAllReadPending, isPending, receiveCount, receiveList, rollback, shownItems, shownUnread, type ReadState } from "./notification-read-state"

// Plan item 2.7: the bell's read-state machine, the 1.5 rule for a surface whose reads start from the client.
type Row = { id: string; readAt: string | null; title: string }
const row = (id: string, readAt: string | null = null): Row => ({ id, readAt, title: `Row ${id}` })
const READ = "2026-10-18T09:00:00.000Z"
const rows = [row("a"), row("b"), row("c", READ)]
/** Rows and count read at t=100: a and b unread, c read. */
const loaded = (): ReadState<Row> => receiveCount(receiveList(initialReadState<Row>(), rows, 100), 2, 100)
const readAt = (state: ReadState<Row>, id: string) => shownItems(state).find(item => item.id === id)?.readAt

describe("notification read state", () => {
  it("starts from the seed count and shows nothing until a list arrives", () => {
    const state = initialReadState<Row>(3)
    expect(shownItems(state)).toEqual([])
    expect(shownUnread(state)).toBe(3)
    expect(shownUnread(initialReadState<Row>())).toBe(0)
  })

  it("shows a read patch on the row and in the count in the same state", () => {
    const state = begin(loaded(), "a", READ, 1)!
    expect(readAt(state, "a")).toBe(READ)
    expect(shownUnread(state)).toBe(1)
    expect(isPending(state, "a")).toBe(true)
    expect(isPending(state, "b")).toBe(false)
  })

  it("counts unread to read as minus one, read to unread as plus one, and a missing row as nothing", () => {
    expect(shownUnread(begin(loaded(), "a", READ, 1)!)).toBe(1)
    expect(shownUnread(begin(loaded(), "c", null, 1)!)).toBe(3)
    expect(shownUnread(begin(loaded(), "missing", READ, 1)!)).toBe(2)
    // A patch that matches the server row changes nothing.
    expect(shownUnread(begin(loaded(), "c", READ, 1)!)).toBe(2)
  })

  it("never goes below zero", () => {
    const state = receiveCount(loaded(), 0, 101)
    expect(shownUnread(begin(state, "a", READ, 1)!)).toBe(0)
  })

  it("refuses a second patch on a row whose patch is unconfirmed, and replaces a confirmed one", () => {
    const pending = begin(loaded(), "a", READ, 1)!
    expect(begin(pending, "a", null, 2)).toBeNull()
    expect(begin(pending, "b", READ, 2)).not.toBeNull()
    const confirmed = confirm(pending, 1, 200)
    expect(isPending(confirmed, "a")).toBe(false)
    const flipped = begin(confirmed, "a", null, 3)!
    expect(readAt(flipped, "a")).toBeNull()
    expect(shownUnread(flipped)).toBe(2)
  })

  it("rolls a patch back so the server row shows through", () => {
    const state = rollback(begin(loaded(), "a", READ, 1)!, 1)
    expect(readAt(state, "a")).toBeNull()
    expect(shownUnread(state)).toBe(2)
    expect(rollback(state, 99)).toBe(state)
  })

  it("keeps a confirmed patch until a read started after the success returns", () => {
    const confirmed = confirm(begin(loaded(), "a", READ, 1)!, 1, 300)
    // A list read that started before the click (t=150) returns the old row: the patch stays on top.
    const stale = receiveList(confirmed, rows, 150)
    expect(readAt(stale, "a")).toBe(READ)
    expect(shownUnread(stale)).toBe(1)
    // A count read that started after the success reflects it: no double count.
    const counted = receiveCount(stale, 1, 301)
    expect(shownUnread(counted)).toBe(1)
    // A list read that started after the success clears the patch; the server row carries the same value.
    const fresh = receiveList(counted, [row("a", READ), row("b"), row("c", READ)], 400)
    expect(fresh.patches).toEqual({})
    expect(readAt(fresh, "a")).toBe(READ)
    expect(shownUnread(fresh)).toBe(1)
  })

  it("keeps an unconfirmed patch through any read", () => {
    const pending = begin(loaded(), "a", READ, 1)!
    const afterList = receiveList(pending, rows, 500)
    expect(readAt(afterList, "a")).toBe(READ)
    const afterCount = receiveCount(afterList, 2, 500)
    expect(shownUnread(afterCount)).toBe(1)
  })

  it("ignores a response from a read started before the current one (latest wins)", () => {
    const state = receiveCount(loaded(), 5, 300)
    expect(shownUnread(receiveCount(state, 9, 200))).toBe(5)
    const older = receiveList(state, [row("z")], 50)
    expect(shownItems(older)).toBe(shownItems(state))
  })

  it("marks everything read at once and forces the count to zero until a read reflects it", () => {
    const all = beginAllRead(loaded(), READ, 1)!
    expect(isAllReadPending(all)).toBe(true)
    expect(shownItems(all).every(item => item.readAt !== null)).toBe(true)
    expect(shownUnread(all)).toBe(0)
    expect(beginAllRead(all, READ, 2)).toBeNull()
    const confirmed = confirm(all, 1, 200)
    expect(isAllReadPending(confirmed)).toBe(false)
    // A count read started before the success still says 2; the mark-all is not reflected, so 0 stands.
    expect(shownUnread(receiveCount(confirmed, 2, 150))).toBe(0)
    // One started after it reflects the write.
    const counted = receiveCount(confirmed, 0, 250)
    expect(shownUnread(counted)).toBe(0)
    // A list read started after the success drops the mark-all; the server rows carry the same values.
    const fresh = receiveList(counted, [row("a", READ), row("b", READ), row("c", READ)], 300)
    expect(fresh.allRead).toBeNull()
    expect(shownUnread(fresh)).toBe(0)
    // Without that count read the stale count would show through once the mark-all is dropped: the adapter always reads the count after a success.
    expect(shownUnread(receiveList(confirmed, [row("a", READ), row("b", READ), row("c", READ)], 300))).toBe(2)
  })

  it("lets a row be marked unread after a mark-all and counts it", () => {
    const all = beginAllRead(loaded(), READ, 1)!
    const unread = begin(all, "b", null, 2)!
    expect(readAt(unread, "b")).toBeNull()
    expect(readAt(unread, "a")).toBe(READ)
    expect(shownUnread(unread)).toBe(1)
    // The mark-all confirmed and a count read reflects it, but the list is still the old one: the server row is read under the mark-all.
    const counted = receiveCount(confirm(unread, 1, 200), 0, 250)
    expect(shownUnread(counted)).toBe(1)
  })

  it("lets a failed mark-all roll back to the server rows", () => {
    const all = beginAllRead(loaded(), READ, 1)!
    const back = rollback(all, 1)
    expect(back.allRead).toBeNull()
    expect(shownItems(back)).toBe(rows)
    expect(shownUnread(back)).toBe(2)
  })

  it("supersedes a patch that began before the mark-all", () => {
    const earlier = begin(loaded(), "c", null, 1)!
    const all = beginAllRead(earlier, READ, 2)!
    expect(readAt(all, "c")).toBe(READ)
    expect(shownUnread(all)).toBe(0)
  })

  it("returns the same rows object when nothing is patched", () => {
    const state = loaded()
    expect(shownItems(state)).toBe(rows)
    expect(confirm(state, 7, 1)).toBe(state)
  })
})
