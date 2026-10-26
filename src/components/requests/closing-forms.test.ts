import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup as render } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { AppProviders } from "@/test/app-providers"
import { CloseWithoutResultForm, MeasuredCloseForm } from "./request-timeline-forms"

// #209: the closing forms offer an optional one-line What we learned box; afterwards only a Correction changes it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/requests/r1" }))

const renderToStaticMarkup = (element: ReturnType<typeof createElement>) => render(createElement(ToastStackProvider, null, createElement(AppProviders as FunctionComponent, null, element)))
const form = { requestId: "r1", orgId: "org_1", revision: 2, onSaved: () => {}, onCancel: () => {} }
const agreed = { form: "numeric" as const, label: "Conversion rate", unit: "%", baseline: 40, target: 50, guardrails: [] }
const field = (markup: string, label: string) => {
  const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`).exec(markup)?.[1]
  return id ? new RegExp(`<(input|textarea)[^>]*id="${id}"[^>]*>`).exec(markup)?.[0] ?? null : null
}

describe("What we learned on the closing forms", () => {
  it("is an optional one-line box when closing with a measured result", () => {
    const box = field(renderToStaticMarkup(createElement(MeasuredCloseForm, { ...form, agreed, release: null })), "What we learned \\(optional\\)")
    expect(box).toMatch(/^<input/)
    expect(box).toContain('maxLength="280"')
    expect(box).not.toContain("required")
  })

  it("is offered when closing without a result too", () => {
    const box = field(renderToStaticMarkup(createElement(CloseWithoutResultForm, form)), "What we learned \\(optional\\)")
    expect(box).toMatch(/^<input/)
    expect(box).not.toContain("required")
  })
  // The Correction form's choices only open in the browser; outcome-actions.test.ts covers correcting What we learned.
})
