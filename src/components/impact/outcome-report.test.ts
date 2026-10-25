import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ImpactPeriod } from "@/lib/impact-period"
import { buildOutcomeReport, type ImpactRow, type ImpactViewer } from "@/lib/impact-read-model"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { ClosureCorrection, OutcomeClosure, OutcomeException } from "@/lib/request-outcome"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { OutcomeReportView } from "./outcome-report"

// The Outcome report tab (#208), rendered as markup: what a reader and a screen reader receive. Every number comes
// from the read model; these tests check the words around them.

const NOW = new Date("2026-10-23T12:00:00.000Z")
const ORG = "org_report"
const MEMBER_ID = "user_member"
const MEMBER: ImpactViewer = { userId: MEMBER_ID, orgId: ORG, role: "member" }
const Q3: ImpactPeriod = { kind: "quarter", year: 2026, quarter: 3 }
const AUGUST: ImpactPeriod = { kind: "month", year: 2026, month: 8 }

const AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released to all users", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" }
const AUG_DUE_LATER: ReleaseFact = { ...AUG, exposureDate: "2026-08-20", startDate: "2026-08-20", dueDate: "2026-11-18" }

function plan(over: { key?: "conversion" | "adoption" | "check"; unit?: "percent" | "count"; current?: number; target?: number } = {}): ExpectedImpact {
  return {
    kind: "measurement", version: 4,
    primary: { key: over.key ?? "conversion", name: "", unit: over.unit ?? "percent", current: over.current ?? 40, target: over.target ?? 50, noBaseline: false, check: "" },
    measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: [],
  } as ExpectedImpact
}
const ADOPTION = plan({ key: "adoption", unit: "count", current: 100, target: 150 })

const released = (release: ReleaseFact): ReleaseState => ({ version: 1, ownerId: MEMBER_ID, release, history: [] })

function closure(expected: ExpectedImpact, actual: number, evidence: string, over: Partial<OutcomeClosure> = {}): OutcomeClosure {
  return {
    version: 1, kind: "measured", actorId: MEMBER_ID, ownerId: MEMBER_ID, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${evidence}`, fingerprint: "fp",
    expected, release: AUG, primary: { kind: "numeric", actual, unit: "%" }, guardrails: [], evidence, observedFrom: AUG.startDate, observedTo: AUG.dueDate, revision: 1, ...over,
  } as OutcomeClosure
}

function exception(reasonCode: OutcomeException["reasonCode"], reason: string): OutcomeException {
  return { version: 1, kind: "exception", reasonCode, reason, actorId: MEMBER_ID, ownerId: MEMBER_ID, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${reason}`, fingerprint: "fp", release: AUG, revision: 1 }
}

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber">): ImpactRow {
  return {
    orgId: ORG, title: `Request ${over.requestNumber}`, problem: `Problem ${over.requestNumber}`, createdBy: MEMBER_ID, assignedTo: null, projectId: null, projectName: null,
    status: "done", releaseState: released(AUG), outcomeClosure: null, exceptionClosure: null, closureCorrections: [],
    expectedImpact: plan(), noMeasurableImpactReason: null, followUpOf: null, definitions: [], ...over,
  }
}

const correction: ClosureCorrection = { operationId: "op-c", fingerprint: "fc", actorId: MEMBER_ID, at: "2026-09-12T09:00:00.000Z", field: "actual", correction: "48%", reason: "Wrong export", revision: 2 }

const ROWS: ImpactRow[] = [
  row({ id: "a", requestNumber: 1, title: "Shorter checkout", problem: "Shoppers abandon checkout at the address step", projectId: "p1", projectName: "Checkout", outcomeClosure: closure(plan(), 46, "e1"), closureCorrections: [correction] }),
  row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Checkout", expectedImpact: ADOPTION, outcomeClosure: closure(ADOPTION, 130, "e2") }),
  row({ id: "c", requestNumber: 3, releaseState: released(AUG_DUE_LATER), expectedImpact: { ...plan(), guardrails: [{ key: "support", definitionId: null, name: "", unit: "percent", current: 2, noBaseline: false, operator: "at_most", limit: 5 }] } as ExpectedImpact }),
  row({ id: "d", requestNumber: 4, exceptionClosure: exception("rolled_back", "Broke checkout on Safari") }),
  row({ id: "e", requestNumber: 5, exceptionClosure: exception("cannot_measure", "No event data") }),
  row({ id: "f", requestNumber: 6, status: "open", releaseState: null, followUpOf: "a" }),
]

function html(period: ImpactPeriod, rows: ImpactRow[] = ROWS) {
  return renderToStaticMarkup(createElement(OutcomeReportView, { report: buildOutcomeReport(MEMBER, rows, { now: NOW, period })! }))
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

/** The text of one section, from its heading to the next heading of the same level. */
function section(markup: string, heading: string, level = 2): string {
  const body = text(markup)
  const start = body.indexOf(` ${heading} `)
  if (start < 0) return ""
  const headings = [...markup.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, "g"))].map(match => text(match[1]).trim())
  const next = headings[headings.indexOf(heading) + 1]
  const end = next ? body.indexOf(` ${next} `, start + 1) : -1
  return end < 0 ? body.slice(start) : body.slice(start, end)
}

describe("Outcome report: period and freshness", () => {
  it("says which period it shows and the date it is up to date as of", () => {
    const body = text(html(Q3))
    expect(body).toContain("Q3 2026 · Up to date as of 23 Oct 2026")
    expect(body).toContain("Released (UTC)")
  })

  it("lets the reader pick a month, quarter or year, with the chosen one pressed and named", () => {
    const markup = html(AUGUST)
    expect(markup).toMatch(/role="group" aria-label="Report by"/)
    expect([...markup.matchAll(/aria-pressed="true"[^>]*>(?:<[^>]+>)*([^<]+)</g)].map(match => match[1])).toEqual(["Month"])
    expect(markup).toContain(">Period</label>")
    expect(text(markup)).toContain("August 2026")
  })
})

describe("Outcome report: at a glance and totals", () => {
  it("shows the four At a glance counts", () => {
    expect(section(html(Q3), "At a glance")).toContain("Shipped 5 Measured 2 Still due 1 Closed without a result 2")
  })

  it("shows totals for a quarter: a count adds up, a percentage never does", () => {
    const totals = section(html(Q3), "Totals")
    expect(totals).toContain("Users who adopted")
    expect(totals).toContain("+30 in total")
    expect(totals).toContain("Changes are in percentage points. They are never added together or averaged.")
    expect(totals).not.toMatch(/\+6 in total/)
  })

  it("shows no totals for a month, and says why", () => {
    const totals = section(html(AUGUST), "Totals")
    expect(totals).toContain("Totals are shown for quarters and years, not months")
    expect(totals).not.toContain("in total")
    expect(totals).not.toContain("Users who adopted")
  })

  it("draws one chart per metric line", () => {
    expect(html(Q3).match(/<svg viewBox="0 0 100 100"/g)).toHaveLength(2)
  })
})

describe("Outcome report: Projects and Requests", () => {
  it("puts each Project in its own section, then No Project", () => {
    const projects = [...html(Q3).matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(match => text(match[1]).trim())
    expect(projects.slice(projects.indexOf("Checkout"), projects.indexOf("Checkout") + 2)).toEqual(["Checkout", "No Project"])
  })

  it("shows each Request's problem, prediction and result, opening the Request from its title", () => {
    const markup = html(Q3)
    const checkout = section(markup, "Checkout", 3)
    expect(checkout).toContain("LAN-1 Shorter checkout")
    expect(checkout).toContain("Shoppers abandon checkout at the address step")
    expect(checkout).toContain("Predicted +10 percentage points (planned baseline 40%)")
    expect(checkout).toContain("Actual 46%")
    expect(markup).toContain('href="/requests/a"')
  })

  it("shows a still-due Request's due date and its guardrail limit, with no actual", () => {
    const due = section(html(Q3), "No Project", 3)
    expect(due).toContain("Result due 18 Nov 2026 (Due in 26 days)")
    expect(due).toContain("Support contact rate at or below 5%: not measured yet")
    expect(due).not.toContain("Actual")
  })

  it("marks a corrected value as corrected, beside the original result", () => {
    const checkout = section(html(Q3), "Checkout", 3)
    expect(checkout).toContain("Actual result: 48% Corrected")
    expect(checkout).toContain("Actual 46%")
  })

  it("lists each Request's Follow-up Requests as links", () => {
    const markup = html(Q3)
    expect(section(markup, "Checkout", 3)).toContain("Follow-up Requests LAN-6 Request 6")
    expect(markup).toContain('href="/requests/f"')
  })
})

describe("Outcome report: closed without a result", () => {
  it("groups Released work closed without a result by reason, with each reason given", () => {
    const closed = section(html(Q3), "Closed without a result")
    expect(closed).toMatch(/Rolled back 1 LAN-4 Request 4 .*Broke checkout on Safari.* Can’t be measured 1 LAN-5 Request 5 .*No event data/)
    expect(closed).toContain("Not in any total")
  })
})

describe("Outcome report: empty and long content", () => {
  it("shows a clear empty state when nothing was Released in the period", () => {
    const body = text(html({ kind: "quarter", year: 2026, quarter: 1 }))
    expect(body).toContain("Nothing was Released in Q1 2026.")
    expect(body).not.toContain("At a glance")
    expect(body).toContain("Up to date as of 23 Oct 2026")
  })

  it("keeps a long title and problem as text that wraps, never cut short", () => {
    const long = "A".repeat(400)
    const markup = html(Q3, [row({ id: "x", requestNumber: 9, title: long, problem: `${long}B`, outcomeClosure: closure(plan(), 46, "x") })])
    expect(text(section(markup, "No Project", 3))).toContain(`LAN-9 ${long}`)
    expect(text(markup)).toContain(`${long}B`)
  })
})
