import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PendingInvitation, WorkspaceMember } from "@/lib/member-role-rules"
import { Dialog } from "@/components/popup/adaptive-dialog"
import { InvitePeopleForm, WorkspaceMembersView, type WorkspaceMembersViewProps } from "./workspace-members-view"

// Radix renders a Select's list only once it opens in a browser, so the test reads each role picker's options instead.
const pickers = vi.hoisted(() => new Map<string, { label: string; disabled?: boolean }[]>())
vi.mock("@/components/arc/select/select", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/arc/select/select")>()
  return { ...actual, Select: (props: Parameters<typeof actual.Select>[0]) => { pickers.set(props.label, props.options); return createElement(actual.Select, props) } }
})
beforeEach(() => pickers.clear())

const people: WorkspaceMember[] = [
  { userId: "user_admin", name: "Avery Admin", email: "avery@example.test", role: "admin" },
  { userId: "user_member", name: "Morgan Member", email: "morgan@example.test", role: "member" },
  { userId: "user_viewer", name: "Vic Leader", email: "vic.leader.with.a.very.long.address@subsidiary.example.test", role: "viewer" },
]
const invitations: PendingInvitation[] = [{ id: "orginv_1", email: "new@example.test", role: "member" }]
const done = async () => ({ success: true as const })
const base: WorkspaceMembersViewProps = {
  people, invitations, selfId: "user_admin", canManage: true, state: "ready",
  onInvite: done, onChangeRole: done, onRevoke: done, onRetry: () => {},
  remove: { workspaceName: "Acme Design", onRemove: async () => ({ ok: true }) },
}
const render = (props: Partial<WorkspaceMembersViewProps> = {}) => renderToStaticMarkup(createElement(WorkspaceMembersView, { ...base, ...props }))

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

describe("Settings → Members (#210, #288)", () => {
  it("gives an Admin one Invite people action beside the people search", () => {
    const html = render()
    expect(html).toMatch(/<label[^>]*>Search people<\/label>/)
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>(?:<span[^>]*>)+Invite people</)
    // The invite form opens in its own dialog, not on the page.
    expect(html).not.toContain(">Send invitation<")
  })

  it("lists everyone with their role, and gives an Admin a role picker for everyone but themselves", () => {
    const html = render()
    expect(html).toContain('aria-label="People in this workspace"')
    for (const person of people) expect(html).toContain(person.name)
    expect(html).toContain("Role for Morgan Member")
    expect(html).toContain("Role for Vic Leader")
    expect(html).toMatch(/Avery Admin[\s\S]*\(you\)/)
    // The group is named "People"; the count beside it is for the eye only.
    expect(html).toMatch(/<section[^>]*aria-labelledby="people-heading"[^>]*><header[^>]*><h3><span id="people-heading">People<\/span> <span[^>]*aria-hidden="true">3<\/span>/)
  })

  it("greys an Admin's own role and says why on that row only, tied to the role (#325)", () => {
    const html = render()
    const own = /<button[^>]*aria-label="Role for Avery Admin: Admin"[^>]*>/.exec(html)?.[0] ?? ""
    expect(own).toMatch(/\bdisabled=""/)
    const noteId = /aria-describedby="([^"]+)"/.exec(own)?.[1]
    expect(noteId).toBeTruthy()
    expect(html).toMatch(new RegExp(`<p id="${noteId}"[^>]*>Your own role can’t be changed here\\. Ask another Admin to change it\\.</p>`))
    expect(html.match(/Your own role can’t be changed here/g)).toHaveLength(1)
    expect(html).not.toMatch(/<button[^>]*aria-label="Role for Morgan Member[^"]*"[^>]*disabled/)
    // The note sits in the Admin's own row, before the next person's.
    expect(html.indexOf(noteId!)).toBeLessThan(html.indexOf("Role for Morgan Member"))
  })

  it("stacks Pending invitations under People, each with Revoke", () => {
    const html = render()
    expect(html.indexOf('aria-label="People in this workspace"')).toBeLessThan(html.indexOf('aria-label="Pending invitations"'))
    expect(html).toContain("new@example.test")
    expect(html).toContain('aria-label="Revoke the invitation for new@example.test"')
    expect(render({ invitations: [] })).toContain("No invitations are waiting.")
  })

  it("shows a Member the people and their roles, and nothing to change", () => {
    const html = render({ canManage: false, selfId: "user_member", invitations: [] })
    expect(html).toContain("Vic Leader")
    expect(html).toContain(">Viewer<")
    expect(html).toContain(">Search people<")
    expect(html).not.toContain(">Invite people<")
    expect(html).not.toContain("Role for")
    expect(html).not.toContain("Revoke")
    expect(html).not.toContain("Pending invitations")
    expect(text(html)).toContain("Only Admins invite people or change roles.")
  })

  it("puts the role guide, folded, under the lists", () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('aria-label="Pending invitations"')).toBeLessThan(at("What each role can do"))
    expect(html).toMatch(/<details(?![^>]*\bopen\b)[^>]*><summary>/)
  })

  it("offers all four roles in every role picker, whatever the person's role is now (#393)", () => {
    render({ people: [...people, { userId: "user_guest", name: "Gale Guest", email: "gale@example.test", role: "guest" }] })
    for (const name of ["Morgan Member", "Vic Leader", "Gale Guest"]) {
      const options = pickers.get(`Role for ${name}`)
      expect([name, options?.map(option => option.label)]).toEqual([name, ["Admin", "Member", "Guest", "Viewer"]])
      expect([name, options?.some(option => option.disabled)]).toEqual([name, false])
    }
  })

  it("explains all four roles from the shared rules, with none called unavailable (#393)", () => {
    const html = render()
    expect(html).toMatch(/<table[\s\S]*<th scope="col">Admin<\/th><th scope="col">Member<\/th><th scope="col">Guest<\/th><th scope="col">Viewer<\/th>/)
    expect(html).toMatch(/<th scope="row">Invite people and change roles<\/th><td>Yes<\/td><td>No<\/td><td>No<\/td><td>No<\/td>/)
    expect(html).toMatch(/role="region" aria-label="What each role can do" tabindex="0"/)
    expect(text(html)).not.toContain("available")
  })

  // #381: the Leave row's "Make someone an Admin" moves focus to #people, whatever the list shows.
  it("keeps the People list focusable by its id", () => {
    for (const html of [render(), render({ canManage: false }), render({ people: [], invitations: [] }), render({ state: "error", people: [], invitations: [] })]) {
      const [people] = /<section[^>]*id="people"[^>]*>/.exec(html) ?? [""]
      expect(people).toContain('tabindex="-1"')
      expect(people).toContain('aria-labelledby="people-heading"')
    }
  })

  it("offers a retry when the people couldn't be read", () => {
    const failed = render({ state: "error", people: [], invitations: [] })
    expect(failed).toContain("People couldn’t be loaded")
    expect(failed).toContain(">Try again<")
  })

  it("shows a role Lane doesn't know without guessing", () => {
    expect(render({ people: [{ userId: "u", name: "Pat", email: "pat@example.test", role: null }] })).toContain("Another role")
  })
})

describe("Invite people (#288)", () => {
  const form = (props: Partial<Parameters<typeof InvitePeopleForm>[0]> = {}) => renderToStaticMarkup(createElement(Dialog, null, createElement(InvitePeopleForm, {
    email: "", role: "member", confirmPaidSeats: false, busy: false, fieldError: null, error: null,
    onEmail: () => {}, onRole: () => {}, onSubmit: () => {}, ...props,
  })))

  it("offers all four roles, each explained, with Guests and Viewers called free (D28, #393)", () => {
    const html = form()
    expect(html).toContain(">Email address<")
    expect([...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(([radio]) => /value="([^"]*)"/.exec(radio)?.[1])).toEqual(["admin", "member", "guest", "viewer"])
    for (const words of ["Paid seat. Everything a Member does", "Paid seat. Files, reviews", "Free. Files Requests", "Free. Reads everything a Member reads"]) expect(html).toContain(words)
    expect(text(html)).toContain("Admins and Members are paid seats. Guests and Viewers are free.")
    expect(text(html)).not.toContain("available")
    expect(html).toMatch(/<button[^>]*_secondary[^>]*type="button"[^>]*>(?:<span[^>]*>)+Cancel</)
    expect(html).toContain(">Send invitation<")
  })

  it("shows the address's problem on the field (D26, D27)", () => {
    const html = form({ email: "not-an-email", fieldError: "Enter a valid email address." })
    expect(html).toMatch(/<input[^>]*aria-invalid="true"[^>]*type="email"|<input[^>]*type="email"[^>]*aria-invalid="true"/)
    expect(html).toContain("Enter a valid email address.")
  })

  it("tells an Admin that adding a paid seat is confirmed first, only while billing is enforced (#215)", () => {
    expect(form({ confirmPaidSeats: true })).toContain("You’ll confirm each paid seat before it’s added.")
    expect(form()).not.toContain("You’ll confirm each paid seat")
  })
})
