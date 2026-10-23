import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildImpactDashboard, buildTeammateWork, type ImpactRow, type ImpactViewer, type Teammate } from "@/lib/impact-read-model"
import { impactHref } from "./impact-href"
import { ImpactScreen, nextTab, type ImpactScreenProps } from "./impact-screen"

// The Dashboard screen (#159): tabs, the guest rule and the teammate lists. Rendered as markup and checked there.

const NOW = new Date("2026-10-23T12:00:00.000Z")
const ORG = "org_impact"
const ADMIN: ImpactViewer = { userId: "user_admin", orgId: ORG, role: "admin" }
const MEMBER: ImpactViewer = { userId: "user_member", orgId: ORG, role: "member" }
const GUEST: ImpactViewer = { userId: "user_guest", orgId: ORG, role: "guest" }

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber" | "title" | "createdBy">): ImpactRow {
  return {
    orgId: ORG, assignedTo: null, projectId: null, projectName: null, status: "open", releaseState: null, outcomeClosure: null,
    exceptionClosure: null, closureCorrections: [], expectedImpact: null, noMeasurableImpactReason: null, followUpOf: null, ...over,
  }
}

const ROWS: ImpactRow[] = [
  row({ id: "g", requestNumber: 1, title: "Guest's own request", createdBy: GUEST.userId }),
  row({ id: "m", requestNumber: 2, title: "Member's request", createdBy: MEMBER.userId, assignedTo: ADMIN.userId }),
]

function screen(viewer: ImpactViewer, over: Partial<ImpactScreenProps> = {}) {
  const dashboard = buildImpactDashboard(viewer, ROWS, { now: NOW, period: over.period ?? null })
  return renderToStaticMarkup(createElement(ImpactScreen, { dashboard, period: null, teammates: [], person: null, ...over }))
}

describe("Dashboard screen: the guest rule", () => {
  it("shows a guest only My work, with their own Requests, and no tabs, org view or other people's Requests", () => {
    const markup = screen(GUEST)
    expect(markup).toContain("Guest&#x27;s own request")
    expect(markup).not.toContain("Member&#x27;s request")
    expect(markup).not.toContain('role="tablist"')
    expect(markup).not.toContain("Whole org")
    expect(markup).not.toContain("By project")
    expect(markup).not.toContain("Measured results")
  })

  it("offers a guest no teammate links, even if a list is passed in", () => {
    const markup = screen(GUEST, { teammates: [{ id: "user_member", name: "Maya" }] })
    expect(markup).not.toContain("Teammates")
    expect(markup).not.toContain("person=user_member")
  })
})

describe("Dashboard screen: the three tabs", () => {
  it("gives a non-guest three tabs, with My work selected and announced", () => {
    const markup = screen(MEMBER)
    expect(markup).toContain('role="tablist"')
    expect([...markup.matchAll(/role="tab"/g)]).toHaveLength(3);
    const selected = [...markup.matchAll(/<button[^>]*aria-selected="true"[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
    expect(selected).toEqual(["My work"])
    expect(markup).toContain('aria-selected="false"')
  })

  it("links each tab to the panel it controls, and labels each panel by its tab", () => {
    const markup = screen(ADMIN)
    for (const id of ["my-work", "by-project", "whole-org"]) {
      expect(markup).toContain(`aria-controls="impact-panel-${id}"`)
      expect(markup).toContain(`id="impact-panel-${id}" role="tabpanel" aria-labelledby="impact-tab-${id}"`)
    }
  })

  it("gives a non-guest the same results under each tab as an admin, with the org view", () => {
    const markup = screen(MEMBER)
    expect(markup).toContain("Whole org")
    expect(markup).toContain("By project")
    expect(markup).toContain("Guest&#x27;s own request")
  })
})

describe("nextTab: the keyboard rule for the tabs", () => {
  it("moves with the arrow keys, wrapping at the ends", () => {
    expect(nextTab("my-work", "ArrowRight")).toBe("by-project")
    expect(nextTab("whole-org", "ArrowRight")).toBe("my-work")
    expect(nextTab("my-work", "ArrowLeft")).toBe("whole-org")
    expect(nextTab("by-project", "ArrowDown")).toBe("whole-org")
  })

  it("jumps to the first and last tab with Home and End, and ignores other keys", () => {
    expect(nextTab("by-project", "Home")).toBe("my-work")
    expect(nextTab("by-project", "End")).toBe("whole-org")
    expect(nextTab("by-project", "Enter")).toBeNull()
  })
})

describe("Dashboard screen: teammate lists", () => {
  const teammates: Teammate[] = [{ id: "user_admin", name: "Maya" }]

  it("links each teammate to their own list, keeping the chosen period", () => {
    const markup = screen(MEMBER, { teammates, period: { kind: "quarter", year: 2026, quarter: 4 } })
    expect(markup).toContain('href="/impact?period=2026-q4&amp;person=user_admin"')
    expect(markup).toContain("Maya")
  })

  it("shows the teammate's Requests with no totals, averages, scores or rankings", () => {
    const person = { id: "user_admin", name: "Maya", entries: buildTeammateWork(MEMBER, ROWS, ADMIN.userId, { now: NOW })! }
    const markup = screen(MEMBER, { teammates, person })
    expect(markup).toContain("Requests by Maya")
    expect(markup).toContain("Member&#x27;s request")
    // The copy elsewhere on the screen says "no totals"; only the teammate's own list is checked here.
    const start = markup.indexOf("Requests by Maya")
    expect(markup.slice(start, markup.indexOf("</section>", start))).not.toMatch(/total|average|score|rank/i)
  })
})

describe("impactHref: the screen's own address", () => {
  it("is the bare route when no period or person is chosen", () => {
    expect(impactHref({ period: null })).toBe("/impact")
  })

  it("carries a chosen quarter, year or person in the query", () => {
    expect(impactHref({ period: { kind: "quarter", year: 2026, quarter: 3 } })).toBe("/impact?period=2026-q3")
    expect(impactHref({ period: { kind: "year", year: 2026 }, person: "user_x" })).toBe("/impact?period=2026&person=user_x")
  })
})
