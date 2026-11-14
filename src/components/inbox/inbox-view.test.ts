import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))

import { InboxView, type InboxViewProps } from "./inbox-view"
import { StableRouterProvider } from "@/components/shell/stable-router"
import type { InboxItem, NeedsYouInboxItem } from "./inbox-item"

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
  id: "n1", type: "comment_added", requestId: "req-1", readAt: null, createdAt: "2026-10-25T09:00:00.000Z", actorName: "Priya Shah",
  requestTitle: "Checkout copy", requestNumber: 12, reframedProblem: "Customers cannot find the delivery date", detail: null, ...over,
})
const noop = () => {}
const render = (over: Partial<InboxViewProps> = {}) => renderToStaticMarkup(createElement(StableRouterProvider, null, createElement(InboxView, {
  items: [item()], unread: 1, selectedId: null, preview: null,
  onSelect: noop, onToggleRead: noop, onMarkAllRead: noop, onRetry: noop, ...over,
})))

describe("Inbox page", () => {
  it("names the page Inbox and lists For-your-information items under their own heading", () => {
    const html = render()
    expect(html).toMatch(/<h1[^>]*>Inbox<\/h1>/)
    expect(html).toMatch(/<h2[^>]*id="inbox-for-your-information"[^>]*>For your information<\/h2>/)
    expect(html).toContain('aria-labelledby="inbox-for-your-information"')
    expect(html).not.toMatch(/Notifications/)
  })

  it("gives each item a name that says what happened, and a read toggle naming its Request", () => {
    const html = render()
    expect(html).toContain('aria-label="LAN-12 · Checkout copy, Priya Shah commented, unread"')
    expect(html).toContain('aria-label="Mark LAN-12 read"')
  })

  it("offers Mark all read only while something is unread", () => {
    expect(render()).toContain(">Mark all read<")
    expect(render({ items: [item({ readAt: "2026-10-25T10:00:00.000Z" })], unread: 0 })).not.toContain(">Mark all read<")
  })

  it("marks the item whose Request is open beside the list", () => {
    const html = render({ items: [item(), item({ id: "n2", requestNumber: 13 })], selectedId: "n2" })
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/data-inbox-item="n2"[^>]*aria-current="true"|aria-current="true"[^>]*data-inbox-item="n2"/)
  })

  it("keeps the preview's place with a short note until an item is opened", () => {
    expect(render()).toContain("Select an item to see its Request here.")
    const html = render({ preview: createElement("section", { "data-test-preview": "" }), previewOpen: true })
    expect(html).toContain("data-test-preview")
    expect(html).not.toContain("Select an item to see its Request here.")
  })

  it("says the Inbox is clear when there is nothing to read", () => {
    const html = render({ items: [], unread: 0, showNeedsYou: false })
    expect(html).toContain("You’re all caught up")
    expect(html).not.toContain('role="list"')
  })

  // #284 (C15): the server and the hydrating render can't know the person's time zone, so no day is drawn until
  // the browser can draw it in that zone; a UTC day never changes in front of them.
  it("draws no date before the page is in the browser", () => {
    const html = render({ items: [item({ createdAt: "2026-10-25T23:30:00.000Z" })], needsYou: [ask({ since: "2026-10-25T23:30:00.000Z" })] })
    expect(html).not.toContain("<time")
    expect(html).not.toMatch(/2[56] Oct/)
  })

  // #284 (C28): Admins and Members, who have the Inbox delivery section, are led to it from the strip.
  it("links the strip to Choose what reaches you, for people who have the Inbox delivery section", () => {
    const link = /<a[^>]*href="\/settings\/profile\?section=inbox-delivery"[^>]*>[^<]*(<svg[\s\S]*?<\/svg>)?Choose what reaches you<\/a>/
    expect(render()).toMatch(link)
    expect(render({ showNeedsYou: false })).not.toContain("Choose what reaches you")
  })

  it("says when a refresh failed, with a retry, and asks for a reload when the session changed", () => {
    const failed = render({ error: "Your Inbox couldn’t be loaded. Try again." })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain(">Try again<")
    const expired = render({ error: "Your workspace session changed.", sessionExpired: true })
    expect(expired).toContain(">Refresh<")
    expect(expired).not.toContain(">Try again<")
  })

  it("shows an invite as a sentence, with no Request code", () => {
    const html = render({ items: [item({ type: "invite_accepted", requestId: null, requestNumber: null, requestTitle: null, reframedProblem: null })] })
    expect(html).toContain("Priya Shah accepted your invite")
  })
})

const ask = (over: Partial<NeedsYouInboxItem> = {}): NeedsYouInboxItem => ({
  key: "review:req-2:rev-1:2026-10-25T08:00:00.000Z", kind: "review", requestId: "req-2", requestNumber: 14, requestTitle: "Returns flow",
  reframedProblem: "Shoppers can't tell if a return was received", since: "2026-10-25T08:00:00.000Z", reviewerName: null, detail: "Does this cover exchanges?", dueDate: null, ...over,
})

describe("Inbox page: Needs you", () => {
  it("lists Needs-you items under their own heading, above For your information, with their count", () => {
    const html = render({ needsYou: [ask(), ask({ key: "result_due:req-3:2026-10-28", kind: "result_due", requestId: "req-3", requestNumber: 15, detail: null, dueDate: "2026-10-28" })] })
    expect(html).toMatch(/<h2[^>]*id="inbox-needs-you"[^>]*>Needs you<\/h2>/)
    expect(html).toContain('aria-labelledby="inbox-needs-you"')
    expect(html.indexOf(">Needs you</h2>")).toBeLessThan(html.indexOf(">For your information</h2>"))
    expect(html).toContain('aria-label="2 need you"')
  })

  it("names each item by its Request and what is waiting, with no read toggle", () => {
    const html = render({ items: [], unread: 0, needsYou: [ask()] })
    expect(html).toContain('aria-label="LAN-14 · Returns flow, Waiting for your review, Does this cover exchanges?"')
    expect(html).not.toContain("Mark LAN-14")
  })

  it("marks a Needs-you item whose Request is open beside the list", () => {
    const html = render({ needsYou: [ask()], selectedId: ask().key })
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(new RegExp(`data-inbox-item="${ask().key}"[^>]*aria-current="true"`))
  })

  // #284 (C26): one empty section says so in a short line, in the same style for both sections.
  it("says in one short line when one section is empty", () => {
    const quiet = render({ needsYou: [] })
    expect(quiet).toMatch(/<p class="[^"]*">Nothing needs you right now.<\/p>/)
    const reading = render({ needsYou: [ask()], items: [], unread: 0 })
    expect(reading).toMatch(/<p class="[^"]*">Nothing new to read.<\/p>/)
    expect(quiet.match(/<p class="([^"]*)">Nothing needs you/)![1]).toBe(reading.match(/<p class="([^"]*)">Nothing new to read/)![1])
    expect(reading).toContain("Select an item to see its Request here.")
  })

  // #284 (C26): with both sections empty, one message and the delivery link, and no empty preview pane beside it.
  it("shows one message when nothing needs the person and nothing is new, with no preview pane", () => {
    const clear = render({ needsYou: [], items: [], unread: 0 })
    expect(clear.match(/<h2[^>]*>/g)).toHaveLength(1)
    expect(clear).toContain("Nothing needs you, and nothing new")
    expect(clear).not.toContain("Nothing needs you right now.")
    expect(clear).not.toContain("Select an item to see its Request here.")
    expect(clear).not.toContain("data-inbox-preview")
    expect(clear.match(/Choose what reaches you/g)).toHaveLength(2)
  })

  it("leaves Needs you out for someone who is never asked to act", () => {
    const html = render({ needsYou: [], showNeedsYou: false })
    expect(html).not.toContain(">Needs you</h2>")
    expect(html).not.toContain("Nothing needs you right now.")
  })
})
