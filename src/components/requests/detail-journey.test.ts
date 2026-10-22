import { describe, expect, it } from "vitest"
import type { ReleaseState } from "@/lib/request-release"
import { detailJourney, stateLineText } from "./detail-properties"

// #127 story 13: the countdown lives in one place on the Request page (the timeline's Measuring step),
// so the page's status shows no due tag; the peek and the list, which have no timeline, keep it.
const now = new Date("2026-10-28T12:00:00Z")
const releaseState: ReleaseState = { version: 1, ownerId: "ana", history: [], release: { exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate: "2026-10-25", startDate: "2026-10-01", windowKind: "relative" } }
const measuring = { status: "done" as const, releaseState }

describe("The Request detail's status and due tag", () => {
  it("shows the due tag in the peek", () => {
    const { journey, due } = detailJourney(measuring, now, { peek: true })
    expect(journey.label).toBe("Measuring")
    expect(due).toMatchObject({ kind: "overdue", label: "Overdue 3 days" })
    expect(stateLineText(journey, null, due)).toBe("Measuring, Overdue 3 days")
  })

  it("leaves the due tag off the full Request page, where the timeline counts down", () => {
    const { journey, due } = detailJourney(measuring, now, { peek: false })
    expect(journey.label).toBe("Measuring")
    expect(due).toEqual({ kind: "none" })
    expect(stateLineText(journey, null, due)).toBe("Measuring")
  })
})
