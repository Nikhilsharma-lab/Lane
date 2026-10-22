import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { dueSignal } from "@/lib/request-journey"
import type { ReleaseState } from "@/lib/request-release"
import { DueTag } from "./due-tag"

const now = new Date("2026-10-28T12:00:00Z")
const measuring = (dueDate: string) => ({
  status: "done" as const, outcomeClosure: null, exceptionClosure: null,
  releaseState: { version: 1, ownerId: "alex", history: [], release: { exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" } } satisfies ReleaseState,
})
const tag = (dueDate: string) => renderToStaticMarkup(createElement(DueTag, { signal: dueSignal(measuring(dueDate), now) }))
const text = (html: string) => html.replace(/<[^>]+>/g, "")

describe("DueTag (#133)", () => {
  it("says when the result is due in words: due in N days, due today, overdue N days", () => {
    expect(text(tag("2026-10-31"))).toBe("Due in 3 days")
    expect(text(tag("2026-10-29"))).toBe("Due in 1 day")
    expect(text(tag("2026-10-28"))).toBe("Due today")
    expect(text(tag("2026-10-27"))).toBe("Overdue 1 day")
    expect(text(tag("2026-10-18"))).toBe("Overdue 10 days")
  })

  it("uses the warning tone for every wording, overdue included, never an error tone", () => {
    for (const due of ["2026-10-31", "2026-10-28", "2026-10-18"]) {
      expect(tag(due)).toContain("warning")
      expect(tag(due)).not.toMatch(/danger|error/)
    }
  })

  it("shows nothing when no result is due soon", () => {
    expect(tag("2026-11-10")).toBe("")
    expect(renderToStaticMarkup(createElement(DueTag, { signal: dueSignal({ ...measuring("2026-10-28"), status: "in_progress", releaseState: null }, now) }))).toBe("")
  })
})
