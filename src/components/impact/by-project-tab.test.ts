import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildImpactDashboard, type ImpactRow, type ImpactViewer } from "@/lib/impact-read-model"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { OutcomeClosure } from "@/lib/request-outcome"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { ByProjectTab } from "./by-project-tab"

// The By project tab renders the read model's Project views, and each measured line carries its chart (#159).

const NOW = new Date("2026-10-23T12:00:00.000Z")
const ORG = "org_impact"
const ADMIN: ImpactViewer = { userId: "user_admin", orgId: ORG, role: "admin" }
const MEMBER = "user_member"
const RELEASE_AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released to all users", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" }

function plan(): ExpectedImpact {
  return { kind: "measurement", version: 4, primary: { key: "conversion", name: "", unit: "percent", current: 40, target: 50, noBaseline: false, check: "" }, measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" }, guardrails: [] } as ExpectedImpact
}

function released(): ReleaseState {
  return { version: 1, ownerId: MEMBER, release: RELEASE_AUG, history: [] }
}

function closure(actual: number): OutcomeClosure {
  return { version: 1, kind: "measured", actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-1", fingerprint: "fp", expected: plan(), release: RELEASE_AUG, primary: { kind: "numeric", actual, unit: "%" }, guardrails: [], evidence: "Export", observedFrom: RELEASE_AUG.startDate, observedTo: RELEASE_AUG.dueDate, revision: 1 } as OutcomeClosure
}

const row: ImpactRow = { id: "a", orgId: ORG, requestNumber: 1, title: "Export", createdBy: MEMBER, assignedTo: null, projectId: "p1", projectName: "Search", status: "done", releaseState: released(), outcomeClosure: closure(46), exceptionClosure: null, closureCorrections: [], expectedImpact: plan(), noMeasurableImpactReason: null, followUpOf: null }

function markup(rows: ImpactRow[]) {
  return renderToStaticMarkup(createElement(ByProjectTab, { projects: buildImpactDashboard(ADMIN, rows, { now: NOW }).byProject }))
}

describe("By project tab: charts", () => {
  it("draws a chart for each measured line, labelled with its metric and values", () => {
    const html = markup([row])
    expect(html).toContain('role="img"')
    expect(html).toContain("Conversion rate, unit %")
    expect(html).toContain("actual 46 %")
  })

  it("draws no chart for a Project with nothing measured", () => {
    const html = markup([{ ...row, status: "open", releaseState: null, outcomeClosure: null }])
    expect(html).not.toContain('role="img"')
    expect(html).toContain("Nothing measured this period yet")
  })
})
