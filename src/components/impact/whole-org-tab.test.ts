import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildImpactDashboard, type ImpactPeriod, type ImpactRow, type ImpactViewer, type OrgView } from "@/lib/impact-read-model"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { OutcomeClosure, OutcomeException } from "@/lib/request-outcome"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { WholeOrgTab } from "./whole-org-tab"

const NOW = new Date("2026-10-23T12:00:00.000Z")
const ORG = "org_impact"
const ADMIN: ImpactViewer = { userId: "user_admin", orgId: ORG, role: "admin" }
const MEMBER: ImpactViewer = { userId: "user_member", orgId: ORG, role: "member" }
const GUEST: ImpactViewer = { userId: "user_guest", orgId: ORG, role: "guest" }
const MEMBER_ID = "user_member"

const RELEASE_AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released to all users", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" }
const RELEASE_OCT: ReleaseFact = { exposureDate: "2026-10-01", audience: "all", evidence: "Released to all users", dueDate: "2026-10-31", startDate: "2026-10-01", windowKind: "relative" }

function plan(over: { key?: "conversion" | "adoption" | "check"; unit?: "percent" | "count"; current?: number; target?: number; audience?: "all" | "new" } = {}): ExpectedImpact {
  return {
    kind: "measurement",
    version: 4,
    primary: { key: over.key ?? "conversion", name: "", unit: over.unit ?? "percent", current: over.current ?? 40, target: over.target ?? 50, noBaseline: false, check: "" },
    measurement: { audience: over.audience ?? "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: [],
  } as ExpectedImpact
}

function releaseState(release: ReleaseFact | null): ReleaseState {
  return { version: 1, ownerId: MEMBER_ID, release, history: [] }
}

function closure(expected: ExpectedImpact, release: ReleaseFact, actual: number, evidence: string): OutcomeClosure {
  return {
    version: 1, kind: "measured", actorId: MEMBER_ID, ownerId: MEMBER_ID, closedAt: "2026-09-10T09:00:00.000Z",
    operationId: `op-${evidence}`, fingerprint: "fp", expected, release,
    primary: { kind: "numeric", actual, unit: "%" },
    guardrails: [], evidence, observedFrom: release.startDate, observedTo: release.dueDate, revision: 1,
  } as OutcomeClosure
}

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber">): ImpactRow {
  return {
    orgId: ORG, title: `Request ${over.requestNumber}`, createdBy: MEMBER_ID, assignedTo: null, projectId: null, projectName: null,
    status: "done", releaseState: null, outcomeClosure: null, exceptionClosure: null, closureCorrections: [],
    expectedImpact: plan(), noMeasurableImpactReason: null, followUpOf: null, ...over,
  }
}

function orgOf(rows: ImpactRow[], period: ImpactPeriod | null = null): OrgView | null {
  return buildImpactDashboard(ADMIN, rows, { now: NOW, period }).wholeOrg
}

function html(view: OrgView | null, period: ImpactPeriod | null = null) {
  return renderToStaticMarkup(createElement(WholeOrgTab, { view, period, year: 2026 }))
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

/** The markup of one labelled section, from its opening marker to the next section marker. */
function section(markup: string, name: string): string {
  const start = markup.indexOf(`data-section="${name}"`)
  if (start < 0) return ""
  const rest = markup.slice(start + 1)
  const next = rest.search(/data-section="/)
  return next < 0 ? markup.slice(start) : markup.slice(start, start + 1 + next)
}

const measuredRows = (): ImpactRow[] => [
  row({ id: "a", requestNumber: 1, releaseState: releaseState(RELEASE_AUG), outcomeClosure: closure(plan(), RELEASE_AUG, 46, "e1") }),
  row({ id: "b", requestNumber: 2, releaseState: releaseState(RELEASE_AUG), expectedImpact: plan({ key: "adoption", unit: "count", current: 100, target: 150 }), outcomeClosure: closure(plan({ key: "adoption", unit: "count", current: 100, target: 150 }), RELEASE_AUG, 130, "e2") }),
]

describe("Whole org tab: visibility (#157)", () => {
  it("renders no org data for a guest, who has no Whole org view", () => {
    const markup = html(buildImpactDashboard(GUEST, measuredRows(), { now: NOW }).wholeOrg)
    expect(markup).toBe("")
    expect(text(markup)).not.toContain("Measured results")
  })

  it("renders the org view for a member the same as for an admin", () => {
    const memberView = buildImpactDashboard(MEMBER, measuredRows(), { now: NOW }).wholeOrg
    const adminView = buildImpactDashboard(ADMIN, measuredRows(), { now: NOW }).wholeOrg
    expect(html(memberView)).toBe(html(adminView))
    expect(text(html(memberView))).toContain("Measured results")
  })
})

describe("Whole org tab: totals and labels (#157)", () => {
  it("keeps each metric on its own line and totals only a count", () => {
    const body = text(html(orgOf(measuredRows())))
    expect(body).toContain("Conversion rate")
    expect(body).toContain("Users who adopted")
    expect(body).toContain("+30 in total")
    expect(body).not.toMatch(/Total change[^.]*Conversion/)
  })

  it("labels percentage changes as percentage points and never totals them", () => {
    const body = text(html(orgOf(measuredRows())))
    expect(body).toContain("percentage points")
    const percentLine = section(html(orgOf(measuredRows())), "measured")
    expect(text(percentLine)).not.toMatch(/Total change \+6/)
  })

  it("shows verified results as good and bad counts, never a sum", () => {
    const check = plan({ key: "check", unit: "count", current: 0, target: 1 })
    const rows = [
      row({ id: "a", requestNumber: 1, releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: { ...closure(check, RELEASE_AUG, 0, "p1"), primary: { kind: "pass_fail", passed: true } } as OutcomeClosure }),
      row({ id: "b", requestNumber: 2, releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: { ...closure(check, RELEASE_AUG, 0, "p2"), primary: { kind: "pass_fail", passed: false } } as OutcomeClosure }),
    ]
    const body = text(html(orgOf(rows)))
    expect(body).toContain("1 good")
    expect(body).toContain("1 bad")
    expect(body).not.toContain("neutral")
    expect(body).not.toContain("Total change")
  })
})

describe("Whole org tab: operational work, exceptions and due dates (#157)", () => {
  it("shows the evidence text under each measured result", () => {
    const rows = [row({ id: "a", requestNumber: 1, releaseState: releaseState(RELEASE_AUG), outcomeClosure: closure(plan(), RELEASE_AUG, 46, "Warehouse export, 14 Sep") })]
    expect(text(html(orgOf(rows)))).toContain("Evidence: Warehouse export, 14 Sep")
  })

  it("never shows a neutral count for a Verified line, only good and bad", () => {
    const check = plan({ key: "check", unit: "count", current: 0, target: 1 })
    const rows = [row({ id: "a", requestNumber: 1, releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: { ...closure(check, RELEASE_AUG, 0, "p1"), primary: { kind: "pass_fail", passed: true } } as OutcomeClosure })]
    const body = text(html(orgOf(rows)))
    expect(body).toContain("Verified: 1 good, 0 bad")
    expect(body).not.toContain("neutral")
  })

  it("shows operational work and closed-without-result in their own sections, outside measured results", () => {
    const exception: OutcomeException = { version: 1, kind: "exception", reasonCode: "cannot_measure", reason: "No event data for this release", actorId: MEMBER_ID, ownerId: MEMBER_ID, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp", release: RELEASE_AUG, revision: 1 }
    const rows = [
      ...measuredRows(),
      row({ id: "c", requestNumber: 3, expectedImpact: null, noMeasurableImpactReason: "Design token rename" }),
      row({ id: "d", requestNumber: 4, releaseState: releaseState(RELEASE_AUG), exceptionClosure: exception }),
    ]
    const markup = html(orgOf(rows))
    const measured = text(section(markup, "measured"))
    expect(measured).not.toContain("Design token rename")
    expect(measured).not.toContain("No event data")
    expect(text(section(markup, "operational"))).toContain("Design token rename")
    expect(text(section(markup, "closed-without-result"))).toContain("No event data for this release")
  })

  it("places still-due results on a timeline by due date only, with no actual value", () => {
    const rows = [row({ id: "e", requestNumber: 5, releaseState: releaseState(RELEASE_OCT) })]
    const timeline = text(section(html(orgOf(rows)), "timeline"))
    expect(timeline).toContain("2026-10-31")
    expect(timeline).not.toMatch(/actual|change/i)
  })

  it("says nothing measured this period yet with no period selected, as with one selected", () => {
    const markup = html(orgOf([row({ id: "a", requestNumber: 1, releaseState: null })]), null)
    expect(text(section(markup, "measured"))).toContain("Nothing measured this period yet")
    expect(markup).not.toContain("Nothing measured yet")
  })

  it("lists a Request with no release date as excluded from every period, never a total", () => {
    const rows = [row({ id: "f", requestNumber: 6, releaseState: null })]
    const markup = html(orgOf(rows, { kind: "year", year: 2026 }), { kind: "year", year: 2026 })
    expect(text(section(markup, "unreleased"))).toContain("Request 6")
    expect(text(section(markup, "measured"))).toContain("Nothing measured this period yet")
  })
})

describe("Whole org tab: periods and breakdown (#157)", () => {
  it("shows an empty quarter as nothing measured yet, never a zero", () => {
    const period = { kind: "quarter" as const, year: 2026, quarter: 4 as const }
    const markup = html(orgOf(measuredRows(), period), period)
    const measured = text(section(markup, "measured"))
    expect(measured).toContain("Nothing measured this period yet")
    expect(measured).not.toMatch(/\b0 results?\b|Total change/)
  })

  it("shows the chosen quarter in the period selector", () => {
    const period = { kind: "quarter" as const, year: 2026, quarter: 4 as const }
    expect(text(html(orgOf(measuredRows(), period), period))).toContain("Q4 2026")
  })

  it("marks the Project breakdown as secondary, counts only", () => {
    const rows = [row({ id: "g", requestNumber: 7, projectId: "p1", projectName: "Search", status: "open", releaseState: null, expectedImpact: plan() })]
    const breakdown = text(section(html(orgOf(rows)), "projects"))
    expect(breakdown).toMatch(/secondary/i)
    expect(breakdown).toContain("Search")
    expect(breakdown).not.toMatch(/percentage|Total change/)
  })
})
