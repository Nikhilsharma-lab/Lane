/**
 * #373 (spec #369): workspaces, Lane's four roles and invitations on Better Auth's organization plugin, with no Owner.
 * A browser's own calls go to `/api/auth/[...all]` as it sends them; the ones it can't make there (auth-routes.test.ts)
 * go through Lane's server door, as Lane's Server Actions make them. On a local lane_test database, with only outbound
 * HTTP faked.
 */
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthBrowser, authRouteTestFile, codesMet, doorChangeRole, doorData, doorInvite, doorLeave, doorRemove, doorUpdate, fakeOutbound, signInWithGoogle, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { authErrorCopy } from "@/lib/auth-error-copy"

const { connection, domain: DOMAIN, person, signedIn, createWorkspace, join } = authRouteTestFile("auth-workspaces.test")

/** Every error code these tests met, so the last test can check each one has Lane's words. */
const codes = codesMet()
const codeOf = codes.codeOf
const doorCodeOf = codes.doorCodeOf

let outbound: Outbound

/** The Admin's browser invites `email` as `role` into the browser's active workspace. */
const invite = (admin: AuthBrowser, email: string, role: unknown, extra: { resend?: boolean } = {}) => doorInvite(admin, { email, role, ...extra })
const invitationId = (answer: Awaited<ReturnType<typeof invite>>) => doorData(answer).id
const invitationRow = async (id: string) => (await connection`select email, role, status, expires_at, created_at from invitation where id = ${id}`)[0]

/** A signed-in Admin with a new workspace, active in their browser. */
async function adminWithWorkspace(label: string) {
  const admin = await signedIn(outbound, label)
  const workspaceId = await createWorkspace(admin.browser)
  const memberId = (await connection`select id from member where organization_id = ${workspaceId}`)[0].id as string
  return { ...admin, workspaceId, memberId }
}

const changeRole = (browser: AuthBrowser, memberId: string, role: unknown) => doorChangeRole(browser, { memberId, role })
const remove = (browser: AuthBrowser, memberId: string) => doorRemove(browser, { memberIdOrEmail: memberId })
const create = (browser: AuthBrowser, body: { name: string; slug: string }) => browser.door((api, asCaller) => api.createOrganization({ ...asCaller, body }))
const ownRole = (browser: AuthBrowser) => browser.door((api, asCaller) => api.getActiveMemberRole({ ...asCaller, query: {} }))

const workspaceRow = async (id: string) => (await connection`select name, logo, metadata from organizations where id = ${id}`)[0]
const memberRows = async (workspaceId: string) =>
  (await connection`select p.email, m.role from member m join profiles p on p.id = m.user_id where m.organization_id = ${workspaceId} order by p.email`).map((row) => ({ ...row }))

describe("workspaces on Better Auth", () => {
  beforeEach(() => {
    switchOnAuthRoute()
    outbound = fakeOutbound()
  })

  describe("creating a workspace", () => {
    it("makes the creator's member row admin, and keeps no logo or metadata on create or update", async () => {
      const { person: wren, browser } = await signedIn(outbound, "creator")
      const id = await createWorkspace(browser, { logo: "https://pictures.example/logo.png", metadata: { colour: "teal" } })
      expect(await memberRows(id)).toEqual([{ email: wren.email, role: "admin" }])
      expect(await workspaceRow(id)).toEqual({ name: "Wren's studio", logo: null, metadata: null })

      doorData(await doorUpdate(browser, id, { name: "Wren's other studio", logo: "https://pictures.example/new.png", metadata: { colour: "red" } }))
      expect(await workspaceRow(id)).toEqual({ name: "Wren's other studio", logo: null, metadata: null })
    })

    it("refuses a workspace URL another workspace already uses, with Lane's words saying to choose another", async () => {
      const { browser } = await signedIn(outbound, "slug-taken")
      const id = await createWorkspace(browser)
      const slug = (await connection`select slug from organizations where id = ${id}`)[0].slug as string
      const other = await createWorkspace(browser)
      // Better Auth gives creating one code, and checking or changing a URL another.
      const answers = {
        create: await create(browser, { name: "Wren's second studio", slug }),
        check: await browser.door((api, asCaller) => api.checkOrganizationSlug({ ...asCaller, body: { slug } })),
        update: await doorUpdate(browser, other, { slug }),
      }
      expect(Object.fromEntries(Object.entries(answers).map(([action, answer]) => [action, doorCodeOf(answer)]))).toEqual({
        create: "ORGANIZATION_ALREADY_EXISTS",
        check: "ORGANIZATION_SLUG_ALREADY_TAKEN",
        update: "ORGANIZATION_SLUG_ALREADY_TAKEN",
      })
      for (const answer of Object.values(answers)) expect(authErrorCopy(doorCodeOf(answer))).toBe("Another workspace already uses this URL. Choose a different one, then try again.")
      expect((await connection`select id from organizations where slug = ${slug}`).map((row) => row.id)).toEqual([id])
    })

    it("refuses deleting a workspace", async () => {
      const { browser } = await signedIn(outbound, "deleter")
      const id = await createWorkspace(browser)
      const answer = await browser.door((api, asCaller) => api.deleteOrganization({ ...asCaller, body: { organizationId: id } }))
      expect(doorCodeOf(answer)).toBe("ORGANIZATION_DELETION_DISABLED")
      expect(await workspaceRow(id)).toBeDefined()
    })
  })

  describe("invitations", () => {
    it("emails one invitation through Resend, linking to /invite/<id>, that expires 7 days after it was sent", async () => {
      const { browser: admin } = await signedIn(outbound, "inviter")
      await createWorkspace(admin)
      const invitee = person("invitee")
      const answer = await invite(admin, invitee.email, "member")
      const id = invitationId(answer)
      const emails = outbound.emailsTo(invitee.email)
      expect(emails).toHaveLength(1)
      expect(emails[0].subject).toBe("You’re invited to a Lane workspace")
      expect(emails[0].text).toContain(`Wren inviter invited you to join Wren's studio on Lane as a Member.`)
      expect(emails[0].text.match(/https?:\/\/\S+/g)).toEqual([`http://localhost:3000/invite/${id}`])
      const row = await invitationRow(id)
      expect(row).toMatchObject({ email: invitee.email, role: "member", status: "pending" })
      expect(row.expires_at.getTime() - row.created_at.getTime()).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -4)
    })

    it("sends again on a resend, with the invitation's new expiry", async () => {
      const { browser: admin } = await signedIn(outbound, "resender")
      await createWorkspace(admin)
      const invitee = person("resent")
      const first = await invite(admin, invitee.email, "guest")
      await connection`update invitation set expires_at = now() + interval '1 day' where id = ${invitationId(first)}`
      const again = await invite(admin, invitee.email, "guest", { resend: true })
      expect(invitationId(again)).toBe(invitationId(first))
      const emails = outbound.emailsTo(invitee.email)
      expect(emails).toHaveLength(2)
      expect(emails[1].text).toContain(`http://localhost:3000/invite/${invitationId(first)}`)
      const row = await invitationRow(invitationId(first))
      expect(row.expires_at.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    })

    it("answers INVITATION_NOT_SENT when the email couldn't be sent, keeps the invitation, and logs neither the address nor the link", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})
      const { browser: admin } = await signedIn(outbound, "unsent")
      const workspaceId = await createWorkspace(admin)
      const invitee = person("not-reached")
      outbound.resend = () => new Response("{}", { status: 503 })
      const answer = await invite(admin, invitee.email, "viewer")
      expect(doorCodeOf(answer)).toBe("INVITATION_NOT_SENT")
      const rows = await connection`select id, role, status from invitation where organization_id = ${workspaceId} and email = ${invitee.email}`
      expect(rows.map(({ role, status }) => ({ role, status }))).toEqual([{ role: "viewer", status: "pending" }])

      const lines = errors.mock.calls.map((args) => args.map(String).join(" "))
      expect(lines.some((line) => line.includes("[auth-email]"))).toBe(true)
      for (const line of lines) {
        expect(line).not.toContain(invitee.email.split("@")[0])
        expect(line).not.toContain("/invite/")
        expect(line).not.toContain(rows[0].id)
      }
    })

    it("is accepted only by a signed-in account whose verified email matches it", async () => {
      const { browser: admin } = await signedIn(outbound, "accept-admin")
      const workspaceId = await createWorkspace(admin)
      const { person: invitee, browser: inviteeBrowser } = await signedIn(outbound, "accepter")
      const id = invitationId(await invite(admin, invitee.email, "member"))

      const { browser: someoneElse } = await signedIn(outbound, "not-invited")
      const wrongAccount = await someoneElse.post("/organization/accept-invitation", { invitationId: id })
      expect([wrongAccount.status, codeOf(wrongAccount)]).toEqual([403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"])

      const signedOut = await new AuthBrowser().post("/organization/accept-invitation", { invitationId: id })
      expect([signedOut.status, codeOf(signedOut)]).toEqual([401, "UNAUTHORIZED"])

      const accepted = await inviteeBrowser.post("/organization/accept-invitation", { invitationId: id })
      expect(accepted.status).toBe(200)
      expect(await memberRows(workspaceId)).toContainEqual({ email: invitee.email, role: "member" })
      expect((await invitationRow(id)).status).toBe("accepted")
    })

    it("refuses an account whose email isn't verified, even when it matches", async () => {
      const { browser: admin } = await signedIn(outbound, "unverified-admin")
      const workspaceId = await createWorkspace(admin)
      const unverified = person("unverified")
      const id = invitationId(await invite(admin, unverified.email, "member"))
      // Google can sign someone in whose email it hasn't verified; Lane's own sign-up can't.
      const browser = new AuthBrowser()
      const google = await signInWithGoogle(browser, outbound, { sub: randomUUID(), email: unverified.email, email_verified: false, name: "Una Verified" })
      expect(google.status).toBe(302)
      expect((await browser.get("/get-session")).body).toMatchObject({ user: { email: unverified.email, emailVerified: false } })

      const answer = await browser.post("/organization/accept-invitation", { invitationId: id })
      expect([answer.status, codeOf(answer)]).toEqual([403, "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION"])
      expect((await memberRows(workspaceId)).map((row) => row.email)).not.toContain(unverified.email)
    })
  })

  describe("an invitation that can't be used", () => {
    it("refuses accepting an expired invitation", async () => {
      const admin = await adminWithWorkspace("expired-admin")
      const { person: invitee, browser } = await signedIn(outbound, "expired-invitee")
      const id = invitationId(await invite(admin.browser, invitee.email, "member"))
      await connection`update invitation set expires_at = now() - interval '1 second' where id = ${id}`
      const answer = await browser.post("/organization/accept-invitation", { invitationId: id })
      expect([answer.status, codeOf(answer)]).toEqual([400, "INVITATION_NOT_FOUND"])
      expect((await memberRows(admin.workspaceId)).map((row) => row.email)).not.toContain(invitee.email)
    })

    it("refuses a 101st pending invitation", async () => {
      const admin = await adminWithWorkspace("invitation-limit")
      const inviterId = (await connection`select id from profiles where email = ${admin.person.email}`)[0].id as string
      await connection`
        insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
        select gen_random_uuid()::text, ${admin.workspaceId}, 'pending-' || n || '-' || ${admin.workspaceId} || '@' || ${DOMAIN}, 'member', 'pending', now() + interval '7 days', ${inviterId}
        from generate_series(1, 100) n`
      const answer = await invite(admin.browser, person("one-too-many").email, "member")
      expect(doorCodeOf(answer)).toBe("INVITATION_LIMIT_REACHED")
    })

    it("refuses accepting into a workspace that already has 100 people", async () => {
      const admin = await adminWithWorkspace("member-limit")
      const { person: invitee, browser } = await signedIn(outbound, "hundred-and-first")
      const id = invitationId(await invite(admin.browser, invitee.email, "member"))
      const others = await connection`
        insert into profiles (id, full_name, email)
        select gen_random_uuid()::text, 'Filler ' || n, 'filler-' || n || '-' || ${admin.workspaceId} || '@' || ${DOMAIN}
        from generate_series(1, 99) n returning id`
      await connection`insert into member ${connection(others.map((other) => ({ id: randomUUID(), organization_id: admin.workspaceId, user_id: other.id, role: "member", created_at: new Date() })))}`
      const answer = await browser.post("/organization/accept-invitation", { invitationId: id })
      expect([answer.status, codeOf(answer)]).toEqual([403, "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"])
      expect((await invitationRow(id)).status).toBe("pending")
    })
  })

  describe("one Admin always", () => {
    it("refuses the only Admin leaving, demoting themselves and being removed", async () => {
      const admin = await adminWithWorkspace("only-admin")
      const member = await join(outbound, admin.browser, "member")

      const left = await doorLeave(admin.browser, admin.workspaceId)
      expect(doorCodeOf(left)).toBe("YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER")
      const demoted = await changeRole(admin.browser, admin.memberId, "member")
      expect(doorCodeOf(demoted)).toBe("YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER")
      const removedSelf = await remove(admin.browser, admin.memberId)
      expect(doorCodeOf(removedSelf)).toBe("YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER")
      // A Member can't remove anyone, so that's what they're told, not that the Admin is the only one.
      const removedByMember = await remove(member.browser, admin.memberId)
      expect(doorCodeOf(removedByMember)).toBe("YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER")

      expect(await memberRows(admin.workspaceId)).toContainEqual({ email: admin.person.email, role: "admin" })
      for (const answer of [left, demoted, removedSelf]) expect(authErrorCopy(doorCodeOf(answer))).toBe("You’re the only Admin. Make someone else an Admin before you leave.")
    })

    it("tells a Member, a Guest and a Viewer they can't remove an Admin, though the workspace has two", async () => {
      const admin = await adminWithWorkspace("removable-admin")
      await join(outbound, admin.browser, "admin", "other-admin")
      for (const role of ["member", "guest", "viewer"]) {
        const { browser } = await join(outbound, admin.browser, role)
        const answer = await remove(browser, admin.memberId)
        expect([role, doorCodeOf(answer)]).toEqual([role, "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER"])
        expect(authErrorCopy(doorCodeOf(answer))).toBe("Only an Admin can remove someone. Ask an Admin of this workspace to remove them.")
      }
      expect(await memberRows(admin.workspaceId)).toContainEqual({ email: admin.person.email, role: "admin" })
    })

    it("treats every Admin the same: a second Admin can demote the first", async () => {
      const first = await adminWithWorkspace("first-admin")
      const second = await join(outbound, first.browser, "admin", "second-admin")
      doorData(await changeRole(second.browser, first.memberId, "member"))
      expect(await memberRows(first.workspaceId)).toEqual(
        [
          { email: first.person.email, role: "member" },
          { email: second.person.email, role: "admin" },
        ].sort((a, b) => a.email.localeCompare(b.email)),
      )
    })
  })

  describe("Lane's four roles, and nothing else", () => {
    const NOT_LANE_ROLES: [string, unknown][] = [
      ["owner", "owner"],
      ["a comma list", "admin,member"],
      ["an empty role", ""],
      ["an unknown name", "superuser"],
      ["more than one role", ["admin", "member"]],
    ]

    it("refuses an invitation as anything but a Lane role with ROLE_NOT_IN_LANE, and writes no invitation", async () => {
      const admin = await adminWithWorkspace("invite-roles")
      for (const [label, role] of NOT_LANE_ROLES) {
        const answer = await invite(admin.browser, person("not-lane").email, role)
        expect([label, doorCodeOf(answer)]).toEqual([label, "ROLE_NOT_IN_LANE"])
      }
      expect((await connection`select count(*)::int as n from invitation where organization_id = ${admin.workspaceId}`)[0].n).toBe(0)
      expect(outbound.emails().filter((email) => email.subject.includes("invited"))).toEqual([])
    })

    it("accepts an invitation as each of admin, member, guest and viewer", async () => {
      const admin = await adminWithWorkspace("invite-lane-roles")
      for (const role of ["admin", "member", "guest", "viewer"]) {
        const answer = await invite(admin.browser, person(`as-${role}`).email, role)
        expect(doorData(answer).role).toBe(role)
      }
    })

    it("refuses a role change to anything but a Lane role with ROLE_NOT_IN_LANE, and accepts each Lane role", async () => {
      const admin = await adminWithWorkspace("change-roles")
      const target = await join(outbound, admin.browser, "member", "role-target")
      for (const [label, role] of NOT_LANE_ROLES) {
        const answer = await changeRole(admin.browser, target.memberId, role)
        expect([label, doorCodeOf(answer)]).toEqual([label, "ROLE_NOT_IN_LANE"])
      }
      expect(await memberRows(admin.workspaceId)).toContainEqual({ email: target.person.email, role: "member" })
      for (const role of ["guest", "viewer", "member", "admin"]) {
        const answer = await changeRole(admin.browser, target.memberId, role)
        expect([role, answer.ok]).toEqual([role, true])
        expect(await memberRows(admin.workspaceId)).toContainEqual({ email: target.person.email, role })
      }
    })
  })

  describe("workspace management is the Admin's", () => {
    it("refuses a Member, a Guest and a Viewer inviting, changing a role, removing someone and renaming the workspace", async () => {
      const admin = await adminWithWorkspace("rights-admin")
      const people = { member: await join(outbound, admin.browser, "member"), guest: await join(outbound, admin.browser, "guest"), viewer: await join(outbound, admin.browser, "viewer") }
      // Each one tries on the next, so the target is never an Admin.
      const targets = { member: people.guest, guest: people.viewer, viewer: people.member }
      for (const role of ["member", "guest", "viewer"] as const) {
        const { browser } = people[role]
        const target = targets[role]
        const answers = {
          invite: await invite(browser, person("by-" + role).email, "member"),
          changeRole: await changeRole(browser, target.memberId, "viewer"),
          remove: await remove(browser, target.memberId),
          rename: await doorUpdate(browser, admin.workspaceId, { name: `Renamed by a ${role}` }),
        }
        expect(Object.fromEntries(Object.entries(answers).map(([action, answer]) => [action, doorCodeOf(answer)]))).toEqual({
          invite: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
          changeRole: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
          remove: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
          rename: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
        })
      }
      expect(await memberRows(admin.workspaceId)).toEqual(
        [
          { email: admin.person.email, role: "admin" },
          { email: people.member.person.email, role: "member" },
          { email: people.guest.person.email, role: "guest" },
          { email: people.viewer.person.email, role: "viewer" },
        ].sort((a, b) => a.email.localeCompare(b.email)),
      )
      expect((await workspaceRow(admin.workspaceId)).name).toBe("Wren's studio")
      expect((await connection`select count(*)::int as n from invitation where organization_id = ${admin.workspaceId} and status = 'pending'`)[0].n).toBe(0)
    })
  })

  describe("removal and role changes apply on the next request", () => {
    it("stops a removed person seeing the workspace on their next request", async () => {
      const admin = await adminWithWorkspace("remover")
      const removed = await join(outbound, admin.browser, "member", "removed")
      expect(await ownRole(removed.browser)).toMatchObject({ ok: true, data: { role: "member" } })

      doorData(await remove(admin.browser, removed.memberId))
      const full = await removed.browser.door((api, asCaller) => api.getFullOrganization({ ...asCaller, query: { organizationId: admin.workspaceId } }))
      expect(doorCodeOf(full)).toBe("USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION")
      expect(await removed.browser.door((api, asCaller) => api.listOrganizations(asCaller))).toEqual({ ok: true, data: [] })
    })

    it("shows a changed role on the person's next request", async () => {
      const admin = await adminWithWorkspace("role-changer")
      const changed = await join(outbound, admin.browser, "member", "changed")
      expect(await ownRole(changed.browser)).toMatchObject({ ok: true, data: { role: "member" } })
      doorData(await changeRole(admin.browser, changed.memberId, "viewer"))
      expect(await ownRole(changed.browser)).toMatchObject({ ok: true, data: { role: "viewer" } })
    })
  })

  // Runs last: vitest runs a file's tests in order.
  it("has Lane's own words for every error code these tests met, none of them the generic line", () => {
    expect(codes.met.size).toBeGreaterThanOrEqual(15)
    expect(codes.withoutLaneWords()).toEqual([])
  })
})
