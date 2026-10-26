import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { Iterations, Prediction, ResultView } from "@/lib/impact-read-model"
import type { SameProblemHistoryLine } from "@/lib/same-problem-rules"
import { SameProblemView, type SameProblemViewProps } from "./same-problem-view"

// "Iterations of this problem" on the Request page (#218), as markup: what a reader and a screen reader receive.

const predicted: Prediction = {
  definitionId: "def", metric: "Checkout conversion", form: "numeric", unit: "%", changeUnit: "percentage points", audience: "All users", platform: "All platforms",
  window: "30 days after release", baselineState: "known", baseline: 40, target: 50, predictedChange: 10,
}
const result = { actual: 46, change: 6, unit: "%", changeUnit: "percentage points", form: "numeric", verdict: null } as ResultView
const iterations: Iterations = {
  current: { number: 2, label: "2nd iteration" },
  iterations: [
    { requestId: "r1", requestNumber: 4, title: "One-page checkout", number: 1, label: "1st iteration", current: false, journey: "Closed without a result", predicted, outcome: { kind: "closed_without_result", reasonCode: "rolled_back", label: "Rolled back", reason: "Broke Safari checkout" } },
    { requestId: "r2", requestNumber: 9, title: "Shorter address form", number: 2, label: "2nd iteration", current: true, journey: "Closed", predicted, outcome: { kind: "measured", result } },
    { requestId: "r3", requestNumber: 12, title: "Saved addresses", number: 3, label: "3rd iteration", current: false, journey: "Measuring", predicted, outcome: { kind: "still_due", due: { dueDate: "2026-10-31", dueLabel: "Due in 8 days" } } },
    { requestId: "r4", requestNumber: 15, title: "Address autocomplete", number: 4, label: "4th iteration", current: false, journey: "Open", predicted: null, outcome: { kind: "still_due", due: null } },
  ],
}
const history: SameProblemHistoryLine[] = [
  { id: "h1", kind: "linked", actorName: "Mo Member", at: "2026-10-20T10:00:00.000Z", other: { requestId: "r1", requestNumber: 4 } },
  { id: "h2", kind: "removed", actorName: "Ada Admin", at: "2026-10-21T10:00:00.000Z", other: null },
]

const base: SameProblemViewProps = { requestNumber: 9, state: { kind: "ready", iterations, history, canChange: true }, onOpenLink: () => {}, onRemove: () => {}, onRetry: () => {} }
const render = (props: Partial<SameProblemViewProps> = {}) => renderToStaticMarkup(createElement(SameProblemView, { ...base, ...props }))
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("Iterations of this problem", () => {
  it("lists the group oldest first under its heading, with the Request being read highlighted by number", () => {
    const markup = render()
    expect(markup).toContain('id="iterations"')
    expect(markup).toMatch(/<h2[^>]*>Iterations of this problem<\/h2>/)
    expect(text(markup)).toContain("This Request is the 2nd iteration of 4.")
    expect(text(markup)).toMatch(/1st iteration .*LAN-4 One-page checkout.*2nd iteration .*LAN-9 Shorter address form.*3rd iteration .*LAN-12.*4th iteration .*LAN-15/)
    expect(markup).toMatch(/<li[^>]*aria-current="true"[^>]*>.*?LAN-9/)
    // The others open their Request; the one being read isn't a link to itself.
    expect(markup).toContain('href="/requests/r1"')
    expect(markup).not.toContain('href="/requests/r2"')
  })

  it("shows each iteration's status, prediction and result, or its reason when Closed without a result", () => {
    const body = text(render())
    expect(body).toContain("Closed without a result")
    expect(body).toContain("Rolled back: Broke Safari checkout")
    expect(body).toContain("Predicted Checkout conversion: +10 percentage points (planned baseline 40%)")
    expect(body).toMatch(/Result 46%.*\+6 percentage points/)
    expect(body).toContain("Result due 31 Oct 2026 (Due in 8 days)")
    expect(body).toContain("Not Released yet")
  })

  it("offers Admins and Members a way to link another Request and to remove each one, named for screen readers", () => {
    const markup = render()
    expect(markup).toContain(">Link a Request<")
    expect(markup).toContain('aria-label="Remove LAN-4 from this group"')
    expect(markup).toContain('aria-label="Remove LAN-9 from this group"')
  })

  it("offers a Viewer nothing to change", () => {
    const markup = render({ state: { kind: "ready", iterations, history, canChange: false } })
    expect(markup).not.toContain("Link a Request")
    expect(markup).not.toContain("Remove")
    expect(text(markup)).toContain("2nd iteration")
  })

  it("keeps who added and removed links in the Request's history", () => {
    const body = text(render())
    expect(body).toContain("Link history (2)")
    expect(body).toContain("Linked as Same problem with LAN-4 by Mo Member on 20 Oct 2026.")
    expect(body).toContain("Taken out of its Same problem group by Ada Admin on 21 Oct 2026.")
  })

  it("says what a link is for when the Request is in no group, to someone who can link", () => {
    const body = text(render({ state: { kind: "ready", iterations: null, history: [], canChange: true } }))
    expect(body).toContain("No other Request is linked as Same problem yet.")
    expect(body).toContain("Link a Request")
  })

  it("shows nothing to a reader when there are no links and no history", () => {
    expect(render({ state: { kind: "ready", iterations: null, history: [], canChange: false } })).toBe("")
  })

  it("keeps the history of a Request no longer in a group", () => {
    const body = text(render({ state: { kind: "ready", iterations: null, history, canChange: false } }))
    expect(body).toContain("Not linked as Same problem now.")
    expect(body).toContain("Link history (2)")
  })

  it("says it is loading, and offers Retry when it can't load", () => {
    expect(render({ state: { kind: "loading" } })).toContain('role="status"')
    const failed = render({ state: { kind: "error", message: "Could not load the Iterations. Try again." } })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain(">Retry<")
  })

  it("keeps a long title as text that wraps, never cut short", () => {
    const long = "A very long Request title that goes on and on about the address step of checkout ".repeat(4).trim()
    const markup = render({ state: { kind: "ready", iterations: { ...iterations, iterations: iterations.iterations.map(entry => ({ ...entry, title: long })) }, history, canChange: true } })
    expect(text(markup)).toContain(long)
    expect(markup).not.toContain("…")
  })
})
