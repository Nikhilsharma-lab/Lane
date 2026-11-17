import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { buildImpactDashboard, buildTeammateWork, type ImpactRow, type ImpactViewer, type Teammate } from "@/lib/impact-read-model"
import { ImpactScreen, type ImpactScreenProps } from "./impact-screen"
import { preloadOutcomeReport } from "./outcome-report-lazy"

// New Request reads the list's Project from the address.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

// The Impact screen (#159, #283): tabs, the guest rule, Showing and the empty My work. Rendered as markup and checked there.

const NOW = new Date("2026-10-23T12:00:00.000Z")
const ORG = "org_impact"
const ADMIN: ImpactViewer = { userId: "user_admin", orgId: ORG, role: "admin" }
const MEMBER: ImpactViewer = { userId: "user_member", orgId: ORG, role: "member" }
const GUEST: ImpactViewer = { userId: "user_guest", orgId: ORG, role: "guest" }

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber" | "title" | "createdBy">): ImpactRow {
  return {
    orgId: ORG, problem: `Problem ${over.requestNumber}`, assignedTo: null, projectId: null, projectName: null, status: "open", releaseState: null, outcomeClosure: null,
    exceptionClosure: null, closureCorrections: [], expectedImpact: null, noMeasurableImpactReason: null, followUpOf: null, definitions: [], takenOnBy: null, createdAt: new Date(Date.UTC(2026, 0, over.requestNumber)), sameProblemGroup: null, ...over,
  }
}

const ROWS: ImpactRow[] = [
  row({ id: "g", requestNumber: 1, title: "Guest's own request", createdBy: GUEST.userId }),
  row({ id: "m", requestNumber: 2, title: "Member's request", createdBy: MEMBER.userId, assignedTo: ADMIN.userId }),
]

function screen(viewer: ImpactViewer, over: Partial<ImpactScreenProps> = {}) {
  const dashboard = buildImpactDashboard(viewer, ROWS, { now: NOW, period: over.period ?? null })
  return renderToStaticMarkup(createElement(ImpactScreen, { dashboard, period: null, teammates: [], person: null, tab: "my-work", ...over }))
}

/** The screen once the Outcome report's code, which follows the page, has arrived. */
async function settled(viewer: ImpactViewer, over: Partial<ImpactScreenProps> = {}) {
  await preloadOutcomeReport()
  return screen(viewer, over)
}

const tabs = (markup: string) => [...markup.matchAll(/role="tab"[^>]*>(?:<span[^>]*><\/span>)?<span[^>]*>([^<]*)</g)].map(match => match[1])
const selectedTab = (markup: string) => [...markup.matchAll(/role="tab" aria-selected="true"[^>]*>(?:<span[^>]*><\/span>)?<span[^>]*>([^<]*)</g)].map(match => match[1])

describe("Impact screen: the guest rule", () => {
  it("shows a guest only My work, with their own Requests, and no tabs, org view or other people's Requests", () => {
    const markup = screen(GUEST)
    expect(markup).toContain("Guest&#x27;s own request")
    expect(markup).not.toContain("Member&#x27;s request")
    expect(markup).not.toContain('role="tablist"')
    expect(markup).not.toContain("Outcome report")
    expect(markup).not.toContain("At a glance")
    expect(markup).not.toContain("Up to date as of")
  })

  it("shows Showing only when the read model returns teammates", () => {
    expect(screen(GUEST)).not.toContain("Showing")
    expect(screen(MEMBER)).not.toContain("Showing")
  })
})

describe("Impact screen: My work and Outcome report tabs (#208, #283)", () => {
  it("gives a non-guest two Arc tabs, My work and Outcome report, with the address's tab selected", () => {
    const markup = screen(MEMBER)
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-label="Impact views"')
    expect(tabs(markup)).toEqual(["My work", "Outcome report"])
    expect(selectedTab(markup)).toEqual(["My work"])
    expect(selectedTab(screen(MEMBER, { tab: "outcome-report" }))).toEqual(["Outcome report"])
  })

  it("renders the open tab's panel alone", async () => {
    const mine = await settled(MEMBER)
    expect(mine).toContain("Member&#x27;s request")
    expect(mine).not.toContain("Up to date as of")
    const report = await settled(MEMBER, { tab: "outcome-report" })
    expect(report).toContain("Up to date as of")
    expect(report).not.toContain("Member&#x27;s request")
  })

  it("gives a member the same Outcome report as an admin", async () => {
    const report = (markup: string) => markup.slice(markup.indexOf('role="tabpanel"'))
    const member = report(await settled(MEMBER, { tab: "outcome-report" }))
    expect(member).toContain("Up to date as of")
    expect(member).toBe(report(await settled(ADMIN, { tab: "outcome-report" })))
  })
})

describe("Impact screen: Showing (#283, C4)", () => {
  const teammates: Teammate[] = [{ id: "user_admin", name: "Maya" }]

  it("puts Showing at the top of My work, reading You until someone is chosen", () => {
    const markup = screen(MEMBER, { teammates })
    expect(markup).toContain(">Showing</label>")
    expect(markup).toMatch(/role="combobox"[^>]*>.*>You</)
    expect(markup.indexOf("Showing")).toBeLessThan(markup.indexOf("Member&#x27;s request"))
    expect(markup).toContain("Lists show results only, never totals or rankings.")
  })

  it("shows the chosen teammate's Requests in place of the viewer's, under a heading naming them, with no totals", () => {
    const person = { id: "user_admin", name: "Maya", entries: buildTeammateWork(MEMBER, ROWS, ADMIN.userId, { now: NOW })! }
    const markup = screen(MEMBER, { teammates, person })
    expect(markup).toMatch(/role="combobox"[^>]*>.*>Maya</)
    expect(markup).toContain("Requests by Maya")
    expect(markup).toContain("Picked up by Maya")
    expect(markup).not.toContain("Requested by you")
    const start = markup.indexOf("Requests by Maya")
    expect(markup.slice(start, markup.indexOf("</section>", start))).not.toMatch(/total|average|score|rank/i)
  })
})

describe("Impact screen: an empty My work (#283)", () => {
  const nobody: ImpactViewer = { userId: "user_new", orgId: ORG, role: "member" }

  it("says Requests you file or pick up show here, with New Request for someone who can file", () => {
    const markup = screen(nobody, { canFile: true })
    expect(markup).toContain("Requests you file or pick up show here.")
    expect(markup).toMatch(/<a [^>]*href="\/intake"[^>]*>New Request<\/a>/)
  })

  it("gives someone who can't file the wording without the button", () => {
    const markup = screen(nobody, { canFile: false })
    expect(markup).toContain("Requests you file or pick up show here.")
    expect(markup).not.toContain("New Request")
  })

  it("points someone who can't file to Showing when there are teammates to choose", () => {
    const markup = screen(nobody, { canFile: false, teammates: [{ id: "user_admin", name: "Maya" }] })
    expect(markup).toContain("Choose someone in Showing to see their Requests.")
    expect(markup).not.toContain("Requests you file or pick up show here.")
    expect(markup).not.toContain("New Request")
  })
})
