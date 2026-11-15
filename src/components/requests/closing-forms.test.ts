import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup as render } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { AppProviders } from "@/test/app-providers"
import { ClosureCorrectionForm, CloseWithoutResultForm, MeasuredCloseForm } from "./request-timeline-forms"

// #209: the closing forms offer an optional What we learned box; afterwards only a Correction changes it. #279: it
// wraps over several lines (still saved as one line), and both forms end in a red named button that says it's permanent.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/requests/r1" }))

const renderToStaticMarkup = (element: ReturnType<typeof createElement>) => render(createElement(ToastStackProvider, null, createElement(AppProviders as FunctionComponent, null, element)))
const form = { requestId: "r1", orgId: "org_1", revision: 2, onSaved: () => {}, onCancel: () => {} }
const agreed = { form: "numeric" as const, label: "Conversion rate", unit: "%", baseline: 40, target: 50, guardrails: [] }
const field = (markup: string, label: string) => {
  const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`).exec(markup)?.[1]
  return id ? new RegExp(`<(input|textarea)[^>]*id="${id}"[^>]*>`).exec(markup)?.[0] ?? null : null
}

const release = { exposureDate: "2026-09-01", audience: "All users", evidence: "Rollout log", dueDate: "2026-10-01", startDate: "2026-09-01", windowKind: "relative" as const }
const check = { form: "pass_fail" as const, label: "Keyboard users can finish checkout", unit: "", baseline: null, target: null, guardrails: [] }
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
/** The form's last button, the one that closes. */
const finalButton = (markup: string) => [...markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].at(-1)?.[0] ?? ""

describe("What we learned on the closing forms", () => {
  it("is an optional box that wraps over several lines when closing with a measured result", () => {
    const box = field(renderToStaticMarkup(createElement(MeasuredCloseForm, { ...form, agreed, release })), "What we learned \\(optional\\)")
    expect(box).toMatch(/^<textarea/)
    expect(box).toContain('maxLength="280"')
    expect(box).not.toContain("required")
  })

  it("is offered when closing without a result too", () => {
    const box = field(renderToStaticMarkup(createElement(CloseWithoutResultForm, form)), "What we learned \\(optional\\)")
    expect(box).toMatch(/^<textarea/)
    expect(box).not.toContain("required")
  })
  // The Correction form's choices only open in the browser; outcome-actions.test.ts covers correcting What we learned.
})

describe("closing is permanent, and says so before you press", () => {
  it("closing with a result ends in a red Close Request, with the permanence line under it", () => {
    const markup = renderToStaticMarkup(createElement(MeasuredCloseForm, { ...form, agreed, release }))
    expect(text(finalButton(markup))).toContain("Close Request")
    expect(finalButton(markup)).toMatch(/class="[^"]*danger/)
    expect(text(markup)).toMatch(/Close Request\s+Closed Requests can’t be reopened\.\s*$/)
    expect(markup).not.toContain("Close with measured result")
  })

  it("closing without a result ends in a red Close without a result, with the same line", () => {
    const markup = renderToStaticMarkup(createElement(CloseWithoutResultForm, form))
    expect(text(finalButton(markup))).toContain("Close without a result")
    expect(finalButton(markup)).toMatch(/class="[^"]*danger/)
    expect(text(markup)).toMatch(/Close without a result\s+Closed Requests can’t be reopened\.\s*$/)
  })

  it("names the goal in its own words: a check's words, or a metric's end value and start", () => {
    expect(text(renderToStaticMarkup(createElement(MeasuredCloseForm, { ...form, agreed: check, release })))).toContain("Goal: Keyboard users can finish checkout")
    expect(text(renderToStaticMarkup(createElement(MeasuredCloseForm, { ...form, agreed, release })))).toContain("Goal: Conversion rate, 50% (from 40%)")
  })

  // #309: a Request with no measurable impact has no release to record, so this is how it closes.
  it("closing a Request with no measurable impact starts at Can’t be measured and shows the Goal's reason", () => {
    const markup = renderToStaticMarkup(createElement(CloseWithoutResultForm, { ...form, noMeasurableImpactReason: "Renames a settings label." }))
    expect(text(markup)).toContain("Goal: No measurable impact Renames a settings label.")
    expect(text(markup)).toContain("Can’t be measured")
    expect(finalButton(markup)).not.toContain("disabled")
    const plain = renderToStaticMarkup(createElement(CloseWithoutResultForm, form))
    expect(text(plain)).not.toContain("No measurable impact")
    expect(finalButton(plain)).toContain("disabled")
  })

  it("a correction is never red and never says it's permanent", () => {
    const markup = renderToStaticMarkup(createElement(ClosureCorrectionForm, { ...form, closureKind: "measured", hasGuardrails: false }))
    expect(finalButton(markup)).not.toMatch(/class="[^"]*danger/)
    expect(text(markup)).not.toContain("can’t be reopened")
  })
})
