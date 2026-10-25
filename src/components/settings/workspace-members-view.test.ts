import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules"
import { WorkspaceMembersView, type WorkspaceMembersViewProps } from "./workspace-members-view"

const people: WorkspaceMember[] = [
  { userId: "user_admin", name: "Avery Admin", email: "avery@example.test", role: "admin" },
  { userId: "user_member", name: "Morgan Member", email: "morgan@example.test", role: "member" },
  { userId: "user_viewer", name: "Vic Leader", email: "vic.leader.with.a.very.long.address@subsidiary.example.test", role: "viewer" },
]
const invitations: PendingInvitation[] = [{ id: "orginv_1", email: "new@example.test", role: "member" }]
const done = async () => ({ success: true as const })
const base: WorkspaceMembersViewProps = {
  people, invitations, selfId: "user_admin", canManage: true, roles: ["admin", "member"], state: "ready",
  onInvite: done, onChangeRole: done, onRevoke: done, onRetry: () => {},
}
const render = (props: Partial<WorkspaceMembersViewProps> = {}) => renderToStaticMarkup(createElement(WorkspaceMembersView, { ...base, ...props }))

describe("Settings → Members (#210)", () => {
  it("lets an Admin invite as Admin or Member while Guest and Viewer are switched off", () => {
    const html = render()
    expect(html).toContain("Invite someone")
    expect(html).toContain(">Email address<")
    expect(html).toContain(">Admin<")
    expect(html).toContain(">Member<")
    expect(html).not.toContain(">Guest<")
    expect(html).not.toContain("Free. Reads everything")
    expect(html).toContain(">Send invitation<")
  })

  it("offers all four roles, each explained, once the switch is on", () => {
    const html = render({ roles: ["admin", "member", "guest", "viewer"] })
    for (const text of ["Paid seat. Everything a Member does", "Paid seat. Files, reviews", "Free. Files Requests", "Free. Reads everything a Member reads"]) expect(html).toContain(text)
  })

  it("lists everyone with their role, and gives an Admin a role picker for everyone but themselves", () => {
    const html = render()
    expect(html).toContain('aria-label="People in this workspace"')
    for (const person of people) expect(html).toContain(person.name)
    expect(html).toContain("Role for Morgan Member")
    expect(html).toContain("Role for Vic Leader")
    expect(html).not.toContain("Role for Avery Admin")
    expect(html).toMatch(/Avery Admin[\s\S]*\(you\)/)
  })

  it("lists pending invitations with a way to revoke each", () => {
    const html = render()
    expect(html).toContain("new@example.test")
    expect(html).toContain('aria-label="Revoke the invitation for new@example.test"')
    expect(render({ invitations: [] })).toContain("No invitations are waiting.")
  })

  it("shows a Member the people and their roles, and nothing to change", () => {
    const html = render({ canManage: false, selfId: "user_member", invitations: [] })
    expect(html).toContain("Vic Leader")
    expect(html).toContain(">Viewer<")
    expect(html).not.toContain("Invite someone")
    expect(html).not.toContain("Role for")
    expect(html).not.toContain("Revoke")
    expect(html).not.toContain("Pending invitations")
  })

  it("says so while loading, and offers a retry when Clerk can't be reached", () => {
    expect(render({ state: "loading", people: [], invitations: [] })).toContain("Loading people…")
    const failed = render({ state: "error", people: [], invitations: [] })
    expect(failed).toContain("People couldn’t be loaded.")
    expect(failed).toContain(">Try again<")
  })

  it("shows a role Lane doesn't know without guessing", () => {
    expect(render({ people: [{ userId: "u", name: "Pat", email: "pat@example.test", role: null }] })).toContain("Another role")
  })
})
