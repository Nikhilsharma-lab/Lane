import { describe, expect, it } from "vitest"
import { addsPaidSeat, paidSeatSummary } from "./member-role-rules"

/** #215: which role changes add a paid seat, and what the Admin is asked to confirm. */
describe("Paid seats", () => {
  it("are added by inviting a Member or Admin, or by making a Guest or Viewer one", () => {
    expect(addsPaidSeat(null, "member")).toBe(true)
    expect(addsPaidSeat(null, "admin")).toBe(true)
    expect(addsPaidSeat("viewer", "member")).toBe(true)
    expect(addsPaidSeat("guest", "admin")).toBe(true)
  })

  it("are not added by free roles or by moving between Admin and Member", () => {
    expect(addsPaidSeat(null, "viewer")).toBe(false)
    expect(addsPaidSeat(null, "guest")).toBe(false)
    expect(addsPaidSeat("member", "admin")).toBe(false)
    expect(addsPaidSeat("admin", "member")).toBe(false)
    expect(addsPaidSeat("member", "viewer")).toBe(false)
    expect(addsPaidSeat("viewer", "guest")).toBe(false)
  })

  it("name the change the Admin confirms", () => {
    expect(paidSeatSummary({ kind: "invite", email: "new@example.test", role: "member" })).toBe("new@example.test is invited as a Member. Their seat starts when they join.")
    expect(paidSeatSummary({ kind: "invite", email: "boss@example.test", role: "admin" })).toBe("boss@example.test is invited as an Admin. Their seat starts when they join.")
    expect(paidSeatSummary({ kind: "role", name: "Vic Leader", role: "member" })).toBe("Vic Leader becomes a Member. Their seat starts today.")
  })
})
