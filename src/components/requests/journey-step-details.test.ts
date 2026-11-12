import { createElement, Fragment, type FunctionComponent, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AppProviders } from "@/test/app-providers"
import { journeyStepDetails } from "./journey-step-details"
import type { TimelineStep } from "./request-timeline-model"
import type { Views } from "./request-timeline"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/requests/r1" }))

// #279 (C2-5, story 42/43): the Closed step words its result with the shared result phrasing, following the goal's
// direction, and a pass/fail result reads Passed / Didn’t pass.
const closed: TimelineStep = { status: "closed", label: "Closed", state: "current", happened: [], next: null, countdown: null, countdownTone: null, actions: [], more: [] }
const release = { exposureDate: "2026-09-01", audience: "All users", evidence: "Rollout log", dueDate: "2026-10-01", startDate: "2026-09-01", windowKind: "relative" as const }
const base = { version: 1, kind: "measured", actorId: "ana", ownerId: "ana", closedAt: "2026-10-02T10:00:00Z", operationId: "op", fingerprint: "f", release, guardrails: [], evidence: "Dashboard", observedFrom: "2026-09-01", observedTo: "2026-10-01", revision: 4 }

function render(outcome: Pick<Views["outcome"], "agreed" | "closure" | "corrections">) {
  const views = { release: { release: null, recordedValueBefore: null }, outcome } as unknown as Views
  const details = journeyStepDetails(closed, { views, reviews: null, name: id => id }) as ReactNode
  return renderToStaticMarkup(createElement(AppProviders as FunctionComponent<{ children: ReactNode }>, null, createElement(Fragment, null, details)))
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("the Closed step's result", () => {
  it("reads against a falling goal: past it, in its unit", () => {
    const markup = text(render({
      agreed: { form: "numeric", label: "Time to checkout", unit: "minutes", baseline: 240, target: 90, guardrails: [] },
      closure: { ...base, primary: { kind: "numeric", actual: 75, unit: "minutes" } } as never,
      corrections: [],
    }))
    expect(markup).toContain("Goal Time to checkout: 90 minutes (from 240 minutes)")
    expect(markup).toContain("Result Reached 75 minutes, 15 past the goal")
    expect(markup).not.toMatch(/Met|Missed|Expected metric/)
  })

  it("reads against a rising goal: short of it, in points", () => {
    const markup = text(render({
      agreed: { form: "numeric", label: "Conversion rate", unit: "%", baseline: 40, target: 55, guardrails: [] },
      closure: { ...base, primary: { kind: "numeric", actual: 47, unit: "%" } } as never,
      corrections: [],
    }))
    expect(markup).toContain("Result Reached 47%, 8 points short of the goal")
  })

  it("says Didn’t pass for a check that failed, beside the check’s own words, and in a corrected result", () => {
    const markup = text(render({
      agreed: { form: "pass_fail", label: "Keyboard users can finish checkout", unit: "", baseline: null, target: null, guardrails: [] },
      closure: { ...base, primary: { kind: "pass_fail", passed: false } } as never,
      corrections: [{ operationId: "c1", fingerprint: "f", actorId: "ana", at: "2026-10-03T10:00:00Z", field: "actual", correction: "Retested", reason: "Wrong build", value: { kind: "pass_fail", passed: true }, revision: 5 }],
    }))
    expect(markup).toContain("Goal Keyboard users can finish checkout")
    expect(markup).toContain("Result Didn’t pass")
    expect(markup).toContain("Actual result: Passed. Retested")
    expect(markup).not.toContain("Did not pass")
  })
})
