import { describe, expect, it } from "vitest"
import { addsPaidSeat, freeRolesNote, inviteInputSchema, inviteSeatNote, paidSeatSummary, ROLE_GUIDE, unavailableRolesNote } from "./member-role-rules"

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

/** #288 (D27, D28): the invite's messages and notes, shared by the browser and the server. */
describe("Inviting", () => {
  it("refuses an address on the server as the field does, and sends it trimmed and lower-case", () => {
    const issue = (email: string) => {
      const parsed = inviteInputSchema.safeParse({ email, role: "member" })
      return parsed.success ? null : { path: parsed.error.issues[0]?.path, message: parsed.error.issues[0]?.message }
    }
    expect(issue("   ")).toEqual({ path: ["email"], message: "Enter an email address." })
    expect(issue("not-an-email")).toEqual({ path: ["email"], message: "Enter a valid email address." })
    expect(inviteInputSchema.parse({ email: "  New.Person@Example.test ", role: "member" }).email).toBe("new.person@example.test")
  })

  it("names the free roles that can be given, for Billing's seats too", () => {
    expect(freeRolesNote(["admin", "member"])).toBe("")
    expect(freeRolesNote(["admin", "member", "guest", "viewer"])).toBe("Guests and Viewers are free.")
  })

  it("calls Guests and Viewers free only while they can be given", () => {
    expect(inviteSeatNote(["admin", "member"])).toBe("Admins and Members are paid seats.")
    expect(inviteSeatNote(["admin", "member", "guest", "viewer"])).toBe("Admins and Members are paid seats. Guests and Viewers are free.")
    expect(unavailableRolesNote(["admin", "member"])).toBe("Guest and Viewer aren’t available in this workspace yet.")
    expect(unavailableRolesNote(["admin", "member", "guest", "viewer"])).toBeNull()
    expect(unavailableRolesNote(["admin", "member", "viewer"])).toBe("Guests aren’t available in this workspace yet.")
  })
})

describe("What each role can do", () => {
  const answers = (role: "admin" | "member" | "guest" | "viewer") => Object.fromEntries(ROLE_GUIDE.map(row => [row.label, row.answer(role)]))
  it("follows the shared role rules", () => {
    expect(answers("admin")).toMatchObject({ "Read Requests": "All", "Pick up work": "Yes", "See Members": "Yes", "Invite people and change roles": "Yes" })
    expect(answers("member")).toMatchObject({ "Read Requests": "All", "File Requests": "Yes", "Pick up work": "Yes", "Invite people and change roles": "No" })
    expect(answers("guest")).toMatchObject({ "Read Requests": "Their own", "File Requests": "Yes", "Comment on Requests": "Their own", "Pick up work": "No", "See Members": "No" })
    expect(answers("viewer")).toMatchObject({ "Read Requests": "All", "File Requests": "No", "Comment on Requests": "No", "Pick up work": "No", "See Members": "No" })
  })
})
