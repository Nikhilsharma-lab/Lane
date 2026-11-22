import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules"
import { managesWorkspace, WORKSPACE_ROLES } from "@/lib/role-rules"
import { withoutHidden } from "@/test/exposed-markup"
import { forgetConfirmations, renderedConfirmations } from "@/test/inline-confirmation"
import type { Confirmation } from "./workspace-rows-state"
import { WorkspaceMembersView, type WorkspaceMembersViewProps } from "./workspace-members-view"

vi.mock("@/components/popup/permanent-action-confirmation", () => import("@/test/inline-confirmation"))
// No DOM here: the test drives the confirmation the view made, the way pressing a person's Remove would.
const view = vi.hoisted(() => ({ removal: undefined as Confirmation<WorkspaceMember> | undefined }))
vi.mock("./workspace-rows-state", async importOriginal => {
  const actual = await importOriginal<typeof import("./workspace-rows-state")>()
  return { ...actual, createConfirmation: () => view.removal ??= actual.createConfirmation<WorkspaceMember>() }
})
const removal = () => { if (!view.removal) throw new Error("The view made no confirmation."); return view.removal }
const confirmation = () => { const last = renderedConfirmations().at(-1); if (!last) throw new Error("No confirmation rendered."); return last }

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

const removed = async () => ({ ok: true as const })
const removable = (props: Partial<WorkspaceMembersViewProps> = {}) => render({ workspaceName: "Acme Design", onRemove: removed, ...props })
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const removeButtons = (html: string) => [...html.matchAll(/<button[^>]*aria-label="(Remove [^"]*)"[^>]*>/g)].map(match => match[1])
const settle = () => new Promise(resolve => setTimeout(resolve))
const marguerite: WorkspaceMember = { userId: "user_marguerite", name: "Marguerite Okonkwo-Fairweather", email: "marguerite@example.test", role: "member" }

describe("Settings → Members, Remove (#381)", () => {
  beforeEach(() => {
    view.removal = undefined
    forgetConfirmations()
  })

  it("gives an Admin Remove on everyone but themselves", () => {
    const html = removable()
    expect(removeButtons(html)).toEqual(["Remove Morgan Member", "Remove Vic Leader"])
    // Each Remove sits in its person's row, after their role.
    expect(html.indexOf("Role for Morgan Member")).toBeLessThan(html.indexOf('aria-label="Remove Morgan Member"'))
    expect(html.indexOf('aria-label="Remove Morgan Member"')).toBeLessThan(html.indexOf("Vic Leader"))
    expect(html).not.toContain('role="dialog"')
  })

  it("gives no one but an Admin a Remove, even with onRemove passed", () => {
    for (const role of WORKSPACE_ROLES.filter(role => !managesWorkspace(role))) {
      const html = removable({ canManage: managesWorkspace(role), selfId: "user_member", invitations: [] })
      expect([role, removeButtons(html)]).toEqual([role, []])
      expect([role, text(html)]).toEqual([role, expect.not.stringContaining("Remove")])
    }
  })

  it("asks first in #346's words, naming the person and the workspace, with a red Remove <first name>", () => {
    removable({ people: [...people, marguerite] })
    removal().ask(marguerite)
    const html = removable({ people: [...people, marguerite] })
    expect(html).toContain('role="dialog" aria-label="Remove Marguerite Okonkwo-Fairweather?"')
    expect(text(html)).toContain("Marguerite Okonkwo-Fairweather loses access to Acme Design straight away. Their Requests, comments and history stay.")
    expect(confirmation().title).toBe("Remove Marguerite Okonkwo-Fairweather?")
    expect(confirmation().confirmLabel).toBe("Remove Marguerite")
  })

  it("calls onRemove with that person's id once confirmed, then closes", async () => {
    const onRemove = vi.fn(removed)
    removable({ onRemove })
    removal().ask(people[1])
    removable({ onRemove })
    expect(onRemove).not.toHaveBeenCalled()
    confirmation().onConfirm()
    await settle()
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("user_member")
    expect(removable({ onRemove })).not.toContain('role="dialog"')
  })

  it("closes on Cancel without removing anyone", () => {
    const onRemove = vi.fn(removed)
    removable({ onRemove })
    removal().ask(people[1])
    removable({ onRemove })
    confirmation().onOpenChange(false)
    expect(removable({ onRemove })).not.toContain('role="dialog"')
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("shows a refusal's line in the dialog, which stays open to try again", async () => {
    const lines = {
      YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "Only an Admin can remove someone. Ask an Admin of this workspace to remove them.",
      // Proposed for Nikhil (#381): someone another Admin removed first.
      MEMBER_NOT_FOUND: "This person is no longer in this workspace. Reload the page to see who’s in it now.",
    }
    for (const [code, line] of Object.entries(lines)) {
      view.removal = undefined
      expect([code, Object.hasOwn(AUTH_ERROR_COPY, code)]).toEqual([code, true])
      const onRemove = async () => ({ ok: false as const, code })
      removable({ onRemove })
      removal().ask(people[1])
      removable({ onRemove })
      confirmation().onConfirm()
      await settle()
      const html = removable({ onRemove })
      expect(html).toContain('role="dialog"')
      expect(html).toMatch(/role="alert"/)
      expect([code, text(withoutHidden(html))]).toEqual([code, expect.stringContaining(line)])
      expect(html).not.toMatch(/owner/i)
    }
  })
})
