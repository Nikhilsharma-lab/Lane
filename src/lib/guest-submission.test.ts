import { describe, expect, it } from "vitest"
import { guestPickupRefusal, guestSubmissionNotice, guestSubmissionOf, type GuestSubmissionView } from "./guest-submission"
import { requestRowLabel } from "@/components/requests/request-row-label"

const waiting: GuestSubmissionView = { state: "waiting", submitterName: "Gita Guest", takenOnBy: null, takenOnByName: null }
const takenOn: GuestSubmissionView = { state: "taken_on", submitterName: "Gita Guest", takenOnBy: "user_mo", takenOnByName: "Mo Member" }
const member = { userId: "user_mo", role: "member" as const }

describe("a Guest submission's state", () => {
  it("waits until someone takes it on; any other Request isn't one", () => {
    expect(guestSubmissionOf({ guestSubmission: true, takenOnBy: null })).toBe("waiting")
    expect(guestSubmissionOf({ guestSubmission: true, takenOnBy: "user_mo" })).toBe("taken_on")
    expect(guestSubmissionOf({ guestSubmission: false, takenOnBy: null })).toBeNull()
  })

  it("can't be picked up while it waits, nor before its prediction is written", () => {
    expect(guestPickupRefusal({ guestSubmission: "waiting", expectedImpact: null, noMeasurableImpactReason: null })).toBe("Take this Guest submission on before picking it up.")
    expect(guestPickupRefusal({ guestSubmission: "taken_on", expectedImpact: null, noMeasurableImpactReason: null })).toBe("Set the goal before picking up this Request.")
    expect(guestPickupRefusal({ guestSubmission: "taken_on", expectedImpact: null, noMeasurableImpactReason: "Housekeeping" })).toBeNull()
    expect(guestPickupRefusal({ guestSubmission: null, expectedImpact: null, noMeasurableImpactReason: null })).toBeNull()
  })
})

describe("the notice on Request detail", () => {
  it("offers Members and Admins Take this on while it waits; the Guest and a Viewer are told where it stands", () => {
    expect(guestSubmissionNotice(waiting, member, false)).toEqual({ action: "take_on", text: "Gita Guest filed this as a Guest, without a goal. Take it on to become its Requester and set the goal." })
    expect(guestSubmissionNotice(waiting, { userId: "user_ad", role: "admin" }, false).action).toBe("take_on")
    expect(guestSubmissionNotice(waiting, { userId: "user_gita", role: "guest" }, false)).toEqual({ action: null, text: "Waiting for a Member to take this on. They’ll set its goal, and you’ll get an email when they do." })
    expect(guestSubmissionNotice(waiting, { userId: "user_vi", role: "viewer" }, false)).toEqual({ action: null, text: "Gita Guest filed this as a Guest. It’s waiting for a Member to take it on." })
  })

  it("asks whoever took it on for the prediction until it's written, and names them to everyone else", () => {
    expect(guestSubmissionNotice(takenOn, member, false)).toEqual({ action: "write_prediction", text: "Gita Guest filed this as a Guest. You took it on, so set its goal before the work is picked up." })
    expect(guestSubmissionNotice(takenOn, member, true)).toEqual({ action: null, text: "Gita Guest filed this as a Guest. You took it on and are its Requester." })
    expect(guestSubmissionNotice(takenOn, { userId: "user_jo", role: "member" }, false)).toEqual({ action: null, text: "Gita Guest filed this as a Guest. Mo Member took it on and is its Requester." })
    expect(guestSubmissionNotice(takenOn, { userId: "user_gita", role: "guest" }, false)).toEqual({ action: null, text: "Mo Member took this on and is its Requester. You can still follow it and comment." })
  })

  it("reads names it can't find as a Guest and a Member", () => {
    expect(guestSubmissionNotice({ ...takenOn, submitterName: null, takenOnByName: " " }, { userId: "user_jo", role: "member" }, true).text).toBe("A Guest filed this as a Guest. A Member took it on and is its Requester.")
  })
})

describe("a waiting submission's row", () => {
  it("reads Waiting to be taken on after its status", () => {
    const row = { id: "r1", title: "Dark mode", reframedProblem: null, status: "open" as const, createdAt: "2026-10-25T00:00:00Z", creatorName: null, assigneeName: null, guestSubmission: "waiting" as const }
    expect(requestRowLabel(row, { code: "LAN-4", priority: "none" })).toBe("LAN-4, Dark mode. Open, Waiting to be taken on, No priority, No Project, No assignee")
    expect(requestRowLabel({ ...row, guestSubmission: "taken_on" }, { code: "LAN-4", priority: "none" })).not.toContain("Waiting")
  })
})
