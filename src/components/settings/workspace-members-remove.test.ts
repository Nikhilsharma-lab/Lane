import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules"
import { WorkspaceMembersView, type WorkspaceMembersViewProps } from "./workspace-members-view"

// The fixtures of workspace-members-view.test.ts, so the Clerk build's render is compared on the same people.
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

describe("Settings → Members without onRemove, as the Clerk adapter mounts it (#381)", () => {
  // Captured from the view before #381 changed it. A difference here is a change to what Clerk's Members shows.
  it("renders an Admin's list byte for byte as before", async () => {
    await expect(render()).toMatchFileSnapshot("./__snapshots__/members-view-admin.html")
  })

  it("renders a Member's list byte for byte as before", async () => {
    await expect(render({ canManage: false, selfId: "user_member", invitations: [] })).toMatchFileSnapshot("./__snapshots__/members-view-member.html")
  })
})
