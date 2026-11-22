/**
 * #373 (spec #369): workspaces, Lane's four roles and invitations through `/api/auth/[...all]`, on Better Auth's
 * organization plugin with no Owner. Requests go to the route as the browser sends them, on a local lane_test
 * database, and only outbound HTTP is faked.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthBrowser, codeOf as codeIn, fakeOutbound, signIn, signInWithGoogle, signUpVerified, switchOnAuthRoute, type AuthAnswer, type Outbound } from "@/test/auth-route-browser"
import { AUTH_ERROR_COPY, SOMETHING_WENT_WRONG, authErrorCopy } from "@/lib/auth-error-copy"
import { requireTestDatabase } from "@/test/test-database"

requireTestDatabase(process.env.DATABASE_URL)
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
const DOMAIN = "auth-workspaces.test"
const SLUG_PREFIX = "auth-workspaces-"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
afterAll(async () => {
  await connection`delete from organizations where slug like ${SLUG_PREFIX + "%"}`
  await connection`delete from profiles where email like ${"%@" + DOMAIN}`
  await connection`delete from verification where identifier like ${"%@" + DOMAIN}`
  await connection.end()
})

const person = (label: string) => ({ email: `${label}-${randomUUID().slice(0, 8)}@${DOMAIN}`, password: "lane-workspaces-test-password", name: `Wren ${label}` })
type Person = ReturnType<typeof person>

/** Every error code these tests met, so the last test can check each one has Lane's words. */
const codesMet = new Set<string>()
const codeOf = (answer: AuthAnswer) => {
  const code = codeIn(answer)
  if (code) codesMet.add(code)
  return code
}

let outbound: Outbound

/** A verified person, signed in, in their own browser. */
async function signedIn(label: string): Promise<{ person: Person; browser: AuthBrowser }> {
  const someone = person(label)
  const browser = await signUpVerified(outbound, someone)
  const answer = await signIn(browser, someone)
  if (answer.status !== 200) throw new Error(`Sign-in answered ${answer.status}`)
  return { person: someone, browser }
}

/** Creates a workspace from the browser, as onboarding will. It becomes the browser's active workspace. */
async function createWorkspace(browser: AuthBrowser, extra: Record<string, unknown> = {}) {
  const slug = `${SLUG_PREFIX}${randomUUID().slice(0, 8)}`
  const answer = await browser.post("/organization/create", { name: "Wren's studio", slug, ...extra })
  if (answer.status !== 200) throw new Error(`Creating a workspace answered ${answer.status}: ${JSON.stringify(answer.body)}`)
  return (answer.body as { id: string }).id
}

/** The Admin's browser invites `email` as `role` into the browser's active workspace. */
const invite = (admin: AuthBrowser, email: string, role: unknown, extra: Record<string, unknown> = {}) => admin.post("/organization/invite-member", { email, role, ...extra })
const invitationId = (answer: { body: unknown }) => (answer.body as { id: string }).id
const invitationRow = async (id: string) => (await connection`select email, role, status, expires_at, created_at from invitation where id = ${id}`)[0]

type Joined = { person: Person; browser: AuthBrowser; memberId: string }

/** A new person, invited by the Admin as `role` and accepted. The workspace becomes their active one. */
async function join(admin: AuthBrowser, role: string, label: string = role): Promise<Joined> {
  const { person: someone, browser } = await signedIn(label)
  const invited = await invite(admin, someone.email, role)
  if (invited.status !== 200) throw new Error(`Inviting answered ${invited.status}: ${JSON.stringify(invited.body)}`)
  const accepted = await browser.post("/organization/accept-invitation", { invitationId: invitationId(invited) })
  if (accepted.status !== 200) throw new Error(`Accepting answered ${accepted.status}: ${JSON.stringify(accepted.body)}`)
  return { person: someone, browser, memberId: (accepted.body as { member: { id: string } }).member.id }
}

/** A signed-in Admin with a new workspace, active in their browser. */
async function adminWithWorkspace(label: string) {
  const admin = await signedIn(label)
  const workspaceId = await createWorkspace(admin.browser)
  const memberId = (await connection`select id from member where organization_id = ${workspaceId}`)[0].id as string
  return { ...admin, workspaceId, memberId }
}

const changeRole = (browser: AuthBrowser, memberId: string, role: unknown) => browser.post("/organization/update-member-role", { memberId, role })
const remove = (browser: AuthBrowser, memberId: string) => browser.post("/organization/remove-member", { memberIdOrEmail: memberId })

const workspaceRow = async (id: string) => (await connection`select name, logo, metadata from organizations where id = ${id}`)[0]
const memberRows = async (workspaceId: string) =>
  (await connection`select p.email, m.role from member m join profiles p on p.id = m.user_id where m.organization_id = ${workspaceId} order by p.email`).map((row) => ({ ...row }))

describe("workspaces through the auth route", () => {
  beforeEach(() => {
    switchOnAuthRoute()
    outbound = fakeOutbound()
  })

  describe("creating a workspace", () => {
    it("makes the creator's member row admin, and keeps no logo or metadata on create or update", async () => {
      const { person: wren, browser } = await signedIn("creator")
      const id = await createWorkspace(browser, { logo: "https://pictures.example/logo.png", metadata: { colour: "teal" } })
      expect(await memberRows(id)).toEqual([{ email: wren.email, role: "admin" }])
      expect(await workspaceRow(id)).toEqual({ name: "Wren's studio", logo: null, metadata: null })

      const updated = await browser.post("/organization/update", { organizationId: id, data: { name: "Wren's other studio", logo: "https://pictures.example/new.png", metadata: { colour: "red" } } })
      expect(updated.status).toBe(200)
      expect(await workspaceRow(id)).toEqual({ name: "Wren's other studio", logo: null, metadata: null })
    })

    it("refuses deleting a workspace", async () => {
      const { browser } = await signedIn("deleter")
      const id = await createWorkspace(browser)
      const answer = await browser.post("/organization/delete", { organizationId: id })
      expect([answer.status, codeOf(answer)]).toEqual([404, "ORGANIZATION_DELETION_DISABLED"])
      expect(await workspaceRow(id)).toBeDefined()
    })
  })

  describe("invitations", () => {
    it("emails one invitation through Resend, linking to /invite/<id>, that expires 7 days after it was sent", async () => {
      const { browser: admin } = await signedIn("inviter")
      await createWorkspace(admin)
      const invitee = person("invitee")
      const answer = await invite(admin, invitee.email, "member")
      expect(answer.status).toBe(200)
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
      const { browser: admin } = await signedIn("resender")
      await createWorkspace(admin)
      const invitee = person("resent")
      const first = await invite(admin, invitee.email, "guest")
      await connection`update invitation set expires_at = now() + interval '1 day' where id = ${invitationId(first)}`
      const again = await invite(admin, invitee.email, "guest", { resend: true })
      expect([again.status, invitationId(again)]).toEqual([200, invitationId(first)])
      const emails = outbound.emailsTo(invitee.email)
      expect(emails).toHaveLength(2)
      expect(emails[1].text).toContain(`http://localhost:3000/invite/${invitationId(first)}`)
      const row = await invitationRow(invitationId(first))
      expect(row.expires_at.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    })

    it("answers INVITATION_NOT_SENT when the email couldn't be sent, and keeps the invitation", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { browser: admin } = await signedIn("unsent")
      const workspaceId = await createWorkspace(admin)
      const invitee = person("not-reached")
      outbound.resend = () => new Response("{}", { status: 503 })
      const answer = await invite(admin, invitee.email, "viewer")
      expect([answer.status, codeOf(answer)]).toEqual([502, "INVITATION_NOT_SENT"])
      const rows = await connection`select role, status from invitation where organization_id = ${workspaceId} and email = ${invitee.email}`
      expect(rows.map((row) => ({ ...row }))).toEqual([{ role: "viewer", status: "pending" }])
    })

    it("is accepted only by a signed-in account whose verified email matches it", async () => {
      const { browser: admin } = await signedIn("accept-admin")
      const workspaceId = await createWorkspace(admin)
      const { person: invitee, browser: inviteeBrowser } = await signedIn("accepter")
      const id = invitationId(await invite(admin, invitee.email, "member"))

      const { browser: someoneElse } = await signedIn("not-invited")
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
      const { browser: admin } = await signedIn("unverified-admin")
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
      const { person: invitee, browser } = await signedIn("expired-invitee")
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
      expect([answer.status, codeOf(answer)]).toEqual([403, "INVITATION_LIMIT_REACHED"])
    })

    it("refuses accepting into a workspace that already has 100 people", async () => {
      const admin = await adminWithWorkspace("member-limit")
      const { person: invitee, browser } = await signedIn("hundred-and-first")
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
      const member = await join(admin.browser, "member")

      const left = await admin.browser.post("/organization/leave", { organizationId: admin.workspaceId })
      expect([left.status, codeOf(left)]).toEqual([400, "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"])
      const demoted = await changeRole(admin.browser, admin.memberId, "member")
      expect([demoted.status, codeOf(demoted)]).toEqual([400, "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER"])
      const removedSelf = await remove(admin.browser, admin.memberId)
      expect([removedSelf.status, codeOf(removedSelf)]).toEqual([400, "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"])
      const removedByMember = await remove(member.browser, admin.memberId)
      expect([removedByMember.status, codeOf(removedByMember)]).toEqual([400, "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"])

      expect(await memberRows(admin.workspaceId)).toContainEqual({ email: admin.person.email, role: "admin" })
      for (const answer of [left, demoted, removedSelf, removedByMember]) expect(authErrorCopy(codeOf(answer))).toBe("You’re the only Admin. Make someone else an Admin before you leave.")
    })

    it("treats every Admin the same: a second Admin can demote the first", async () => {
      const first = await adminWithWorkspace("first-admin")
      const second = await join(first.browser, "admin", "second-admin")
      const demoted = await changeRole(second.browser, first.memberId, "member")
      expect(demoted.status).toBe(200)
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
        expect([label, answer.status, codeOf(answer)]).toEqual([label, 400, "ROLE_NOT_IN_LANE"])
      }
      expect((await connection`select count(*)::int as n from invitation where organization_id = ${admin.workspaceId}`)[0].n).toBe(0)
      expect(outbound.emails().filter((email) => email.subject.includes("invited"))).toEqual([])
    })

    it("accepts an invitation as each of admin, member, guest and viewer", async () => {
      const admin = await adminWithWorkspace("invite-lane-roles")
      for (const role of ["admin", "member", "guest", "viewer"]) {
        const answer = await invite(admin.browser, person(`as-${role}`).email, role)
        expect([role, answer.status, (answer.body as { role: string }).role]).toEqual([role, 200, role])
      }
    })

    it("refuses a role change to anything but a Lane role with ROLE_NOT_IN_LANE, and accepts each Lane role", async () => {
      const admin = await adminWithWorkspace("change-roles")
      const target = await join(admin.browser, "member", "role-target")
      for (const [label, role] of NOT_LANE_ROLES) {
        const answer = await changeRole(admin.browser, target.memberId, role)
        expect([label, answer.status, codeOf(answer)]).toEqual([label, 400, "ROLE_NOT_IN_LANE"])
      }
      expect(await memberRows(admin.workspaceId)).toContainEqual({ email: target.person.email, role: "member" })
      for (const role of ["guest", "viewer", "member", "admin"]) {
        const answer = await changeRole(admin.browser, target.memberId, role)
        expect([role, answer.status]).toEqual([role, 200])
        expect(await memberRows(admin.workspaceId)).toContainEqual({ email: target.person.email, role })
      }
    })
  })

  describe("workspace management is the Admin's", () => {
    it("refuses a Member, a Guest and a Viewer inviting, changing a role, removing someone and renaming the workspace", async () => {
      const admin = await adminWithWorkspace("rights-admin")
      const people = { member: await join(admin.browser, "member"), guest: await join(admin.browser, "guest"), viewer: await join(admin.browser, "viewer") }
      // Each one tries on the next, so the target is never an Admin.
      const targets = { member: people.guest, guest: people.viewer, viewer: people.member }
      for (const role of ["member", "guest", "viewer"] as const) {
        const { browser } = people[role]
        const target = targets[role]
        const answers = {
          invite: await invite(browser, person("by-" + role).email, "member"),
          changeRole: await changeRole(browser, target.memberId, "viewer"),
          remove: await remove(browser, target.memberId),
          rename: await browser.post("/organization/update", { organizationId: admin.workspaceId, data: { name: `Renamed by a ${role}` } }),
        }
        expect(Object.fromEntries(Object.entries(answers).map(([action, answer]) => [action, [answer.status, codeOf(answer)]]))).toEqual({
          invite: [403, "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION"],
          changeRole: [403, "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER"],
          remove: [401, "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER"],
          rename: [403, "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION"],
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
      const removed = await join(admin.browser, "member", "removed")
      expect((await removed.browser.get("/organization/get-active-member-role")).body).toMatchObject({ role: "member" })

      expect((await remove(admin.browser, removed.memberId)).status).toBe(200)
      const full = await removed.browser.get(`/organization/get-full-organization?organizationId=${admin.workspaceId}`)
      expect([full.status, codeOf(full)]).toEqual([403, "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"])
      const listed = await removed.browser.get("/organization/list")
      expect(listed.body).toEqual([])
    })

    it("shows a changed role on the person's next request", async () => {
      const admin = await adminWithWorkspace("role-changer")
      const changed = await join(admin.browser, "member", "changed")
      expect((await changed.browser.get("/organization/get-active-member-role")).body).toMatchObject({ role: "member" })
      expect((await changeRole(admin.browser, changed.memberId, "viewer")).status).toBe(200)
      expect((await changed.browser.get("/organization/get-active-member-role")).body).toMatchObject({ role: "viewer" })
    })
  })

  // Runs last: vitest runs a file's tests in order.
  it("has Lane's own words for every error code these tests met, none of them the generic line", () => {
    expect(codesMet.size).toBeGreaterThanOrEqual(15)
    for (const code of codesMet) expect([code, Object.hasOwn(AUTH_ERROR_COPY, code) && AUTH_ERROR_COPY[code as keyof typeof AUTH_ERROR_COPY] !== SOMETHING_WENT_WRONG]).toEqual([code, true])
  })
})
