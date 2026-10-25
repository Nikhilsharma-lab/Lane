import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildImpactDashboard, buildTeammateWork, type ImpactRow, type MyWorkEntry } from "@/lib/impact-read-model"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { ClosureCorrection, OutcomeClosure, OutcomeException } from "@/lib/request-outcome"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { ImpactEntryList, MyWorkTab, MyWorkLoading, TeammateWorkList } from "./my-work-list"

const ORG = "org_impact"
const ME = "user_me"
const JO = "user_jo"
const NOW = new Date("2026-10-23T12:00:00.000Z")

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

function plan(): Extract<ExpectedImpact, { kind: "measurement" }> {
  return {
    kind: "measurement", version: 4,
    primary: { key: "conversion", name: "", unit: "percent", current: 40, target: 50, noBaseline: false, check: "" },
    measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: [],
  }
}
const RELEASE_AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released to all users", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" }
const RELEASE_OCT: ReleaseFact = { exposureDate: "2026-10-01", audience: "all", evidence: "Released", dueDate: "2026-10-31", startDate: "2026-10-01", windowKind: "relative" }
const releaseState = (ownerId: string, release: ReleaseFact | null): ReleaseState => ({ version: 1, ownerId, release, history: [] })
/** A release recorded with the value before release, as the release action stores it: in its history entry. */
function recordedState(ownerId: string, release: ReleaseFact, value: number): ReleaseState {
  const input = { kind: "release" as const, exposureDate: release.exposureDate, evidence: release.evidence, audienceConfirmed: true as const, valueBeforeRelease: { value, unit: "%" } };
  return { version: 1, ownerId, release, history: [{ operationId: "op-release", fingerprint: "fp", actorId: ownerId, at: "2026-08-10T09:00:00.000Z", input, previousRelease: null, release, previousOwnerId: ownerId, ownerId, revision: 1 }] };
}
function measured(actual: number): OutcomeClosure {
  return {
    version: 1, kind: "measured", actorId: ME, ownerId: ME, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${actual}`, fingerprint: "fp",
    expected: plan(), release: RELEASE_AUG, primary: { kind: "numeric", actual, unit: "%" }, guardrails: [],
    evidence: "Dashboard export", observedFrom: RELEASE_AUG.startDate, observedTo: RELEASE_AUG.dueDate, revision: 1,
  }
}

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber" | "createdBy">): ImpactRow {
  return {
    orgId: ORG, title: `Request ${over.requestNumber}`, problem: `Problem ${over.requestNumber}`, assignedTo: null, projectId: null, projectName: null, status: "open",
    releaseState: null, outcomeClosure: null, exceptionClosure: null, closureCorrections: [], expectedImpact: plan(),
    noMeasurableImpactReason: null, followUpOf: null, definitions: [], takenOnBy: null, ...over,
  }
}

const viewer = (userId: string) => ({ userId, orgId: ORG, role: "member" as const })

/** Entries as the read model returns them, for the viewer's own list. */
function myEntries(rows: ImpactRow[]): MyWorkEntry[] {
  return buildImpactDashboard(viewer(ME), rows, { now: NOW }).myWork.requests
}

describe("My work rows (#155)", () => {
  it("links each row to its Request detail, with its saved code and title", () => {
    const html = renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries([row({ id: "r7", requestNumber: 7, createdBy: ME })]) }))
    expect(html).toContain('href="/requests/r7"')
    expect(text(html)).toContain("LAN-7")
    expect(text(html)).toContain("Request 7")
  })

  it("marks each row by the role the viewer had", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: ME }),
      row({ id: "b", requestNumber: 2, createdBy: JO, assignedTo: ME }),
      row({ id: "c", requestNumber: 3, createdBy: ME, assignedTo: ME }),
    ]
    const text_ = text(renderToStaticMarkup(createElement(MyWorkTab, { entries: myEntries(rows) })))
    expect(text_).toContain("Requested by you")
    expect(text_).toContain("Picked up by you")
    expect(text_).toContain("Requested and picked up by you")
  })

  it("names the teammate in the role marks of a teammate's list", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: JO, assignedTo: ME })]
    const entries = buildTeammateWork(viewer(ME), rows, JO, { now: NOW })!
    const out = text(renderToStaticMarkup(createElement(TeammateWorkList, { name: "Jo Lee", entries })))
    expect(out).toContain("Requested by Jo Lee")
    expect(out).not.toContain("by you")
  })

  it("shows the predicted and actual result with baseline, change, predicted change and window", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), outcomeClosure: measured(46) })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Conversion rate")
    expect(out).toContain("Planning baseline 40%")
    expect(out).toContain("Actual 46%")
    expect(out).toContain("Change +6 percentage points")
    expect(out).toContain("Predicted change +10 percentage points")
    expect(out).toContain("Window 30 days after release")
  })

  it("shows the evidence text beside a measured result, as text only", () => {
    const rows = [row({ id: "r1", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), outcomeClosure: measured(46) })]
    const html = renderToStaticMarkup(createElement(MyWorkTab, { entries: myEntries(rows) }))
    expect(text(html)).toContain("Evidence Dashboard export")
    expect(html).not.toContain("attachment")
  })

  it("lists the follow-up Requests linked to a Request, beside it", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME }), row({ id: "b", requestNumber: 2, createdBy: ME, followUpOf: "a" })]
    const html = renderToStaticMarkup(createElement(MyWorkTab, { entries: myEntries(rows) }))
    expect(text(html)).toContain("Follow-up Requests: LAN-2 Request 2")
  })

  it("shows a still-due Request with its due date and no actual", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_OCT) })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Still due")
    expect(out).toContain("Due 2026-10-31")
    expect(out).not.toContain("Actual")
  })

  it("shows a Request closed without a result with its reason", () => {
    const exception: OutcomeException = {
      version: 1, kind: "exception", reasonCode: "cannot_measure", reason: "No event data for this release", actorId: ME, ownerId: ME,
      closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp", release: RELEASE_AUG, revision: 1,
    }
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), exceptionClosure: exception })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Closed without a result: No event data for this release")
  })

  it("shows operational work with its reason", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, expectedImpact: null, noMeasurableImpactReason: "Token rename" })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Operational work: Token rename")
  })

  it("shows a Correction beside its original result", () => {
    const correction: ClosureCorrection = { operationId: "op-c", fingerprint: "fc", actorId: ME, at: "2026-09-12T09:00:00.000Z", field: "evidence", correction: "Re-checked", reason: "Wrong source", revision: 2 }
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), outcomeClosure: measured(46), closureCorrections: [correction] })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Actual 46%")
    expect(out).toContain("Correction to evidence: Re-checked. Reason: Wrong source")
  })

  it("never shows a baseline of zero when the baseline is unknown", () => {
    const unknown: ExpectedImpact = { ...plan(), primary: { ...plan().primary, current: null } }
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), expectedImpact: unknown, outcomeClosure: { ...measured(46), expected: unknown } })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Baseline unknown")
    expect(out).not.toContain("Baseline 0")
  })

  it("never renders a total, average, score or ranking", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), outcomeClosure: measured(46) }),
      row({ id: "b", requestNumber: 2, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_OCT) }),
    ]
    const out = text(renderToStaticMarkup(createElement(MyWorkTab, { entries: myEntries(rows) })))
    expect(out).not.toMatch(/total|average|score|rank|mean|hit rate/i)
  })
})

describe("My work states (#155)", () => {
  it("says so when the viewer has no Requests yet", () => {
    const out = text(renderToStaticMarkup(createElement(MyWorkTab, { entries: [] })))
    expect(out).toContain("Nothing requested or picked up yet")
  })

  it("says so when a teammate has no Requests yet, by name", () => {
    const out = text(renderToStaticMarkup(createElement(TeammateWorkList, { name: "Jo Lee", entries: [] })))
    expect(out).toContain("Jo Lee has not requested or picked up any Requests yet")
  })

  it("renders a loading state that announces itself", () => {
    const out = renderToStaticMarkup(createElement(MyWorkLoading))
    expect(out).toContain("Loading")
  })
})

describe("My work: value before release (#151 decision 3)", () => {
  it("shows the value recorded before release as the baseline, and the planned baseline beside the predicted change", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: recordedState(ME, RELEASE_AUG, 42), outcomeClosure: measured(46) })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Before release 42%")
    expect(out).toContain("Change +4 percentage points")
    expect(out).toContain("Predicted change +10 percentage points")
    expect(out).toContain("Planned baseline 40%")
    expect(out).not.toContain("Planning baseline")
  })

  it("labels a release recorded before this change as the planning baseline, never as before release", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: ME, status: "done", releaseState: releaseState(ME, RELEASE_AUG), outcomeClosure: measured(46) })]
    const out = text(renderToStaticMarkup(createElement(ImpactEntryList, { entries: myEntries(rows) })))
    expect(out).toContain("Planning baseline 40%")
    expect(out).not.toContain("Before release")
  })
})
