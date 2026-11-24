import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { queryCounter } from "@/db"
import { addMembers, removeMember } from "@/test/member-fixtures"
import { requireTestDatabase } from "@/test/test-database"
import { journeyViewer } from "./request-journey-access"
import { workspaceMember, workspaceRoster } from "./workspace-roster"

/**
 * #390 (spec #383): who is in a workspace comes from Lane's member rows, with no session. Real rows on the test
 * database; nothing is stubbed.
 */
const ORG = `org_roster_${randomUUID()}`
const OTHER = `org_roster_other_${randomUUID()}`
const id = (label: string) => `roster_${label}`
let connection: ReturnType<typeof postgres>

beforeAll(async () => {
  connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, { max: 1, prepare: false })
  await connection`insert into organizations (id, name, slug) values (${ORG}, 'Roster', ${ORG}), (${OTHER}, 'Other roster', ${OTHER})`
})
beforeEach(async () => {
  await connection`delete from member where organization_id in (${ORG}, ${OTHER})`
  await addMembers(ORG, { [id("admin")]: "admin", [id("member")]: "member", [id("guest")]: "guest", [id("viewer")]: "viewer" })
  await addMembers(OTHER, { [id("elsewhere")]: "admin", [id("guest")]: "admin" })
})
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`
  await connection`delete from profiles where starts_with(id, 'roster_')`
  await connection.end()
})

const rolesById = async (orgId: string) => Object.fromEntries((await workspaceRoster(orgId)).map((person) => [person.nominee.userId, person.role]))

describe("the workspace's roster", () => {
  it("is the asked workspace's Admins and Members, with Lane's roles", async () => {
    expect(await rolesById(ORG)).toEqual({ [id("admin")]: "admin", [id("member")]: "member" })
    expect(await rolesById(OTHER)).toEqual({ [id("elsewhere")]: "admin", [id("guest")]: "admin" })
    expect(await rolesById("org_roster_unknown")).toEqual({})
  })

  it("names each person from their profile, and gives their email in lower case", async () => {
    await addMembers(ORG, { [id("named")]: "admin", [id("unnamed")]: "member" })
    await connection`update profiles set full_name = 'Ada Byron', email = 'Ada.Byron@Roster.example' where id = ${id("named")}`
    await connection`update profiles set full_name = '', email = 'mo@roster.example' where id = ${id("unnamed")}`
    expect(await workspaceRoster(ORG)).toEqual(expect.arrayContaining([
      { nominee: { kind: "member", userId: id("named") }, role: "admin", name: "Ada Byron", email: "ada.byron@roster.example" },
      { nominee: { kind: "member", userId: id("unnamed") }, role: "member", name: "mo@roster.example", email: "mo@roster.example" },
    ]))
  })

  it("lists the newest members first", async () => {
    const userIds = async () => (await workspaceRoster(ORG)).map((person) => person.nominee.userId)
    await connection`update member set created_at = now() - interval '2 days' where organization_id = ${ORG} and user_id = ${id("admin")}`
    expect(await userIds()).toEqual([id("member"), id("admin")])
    await connection`update member set created_at = now() - interval '3 days' where organization_id = ${ORG} and user_id = ${id("member")}`
    expect(await userIds()).toEqual([id("admin"), id("member")])
  })

  it("is one query, however many people it holds", async () => {
    await addMembers(ORG, Object.fromEntries(Array.from({ length: 120 }, (_, i) => [id(`many_${i}`), "member"])))
    const { result, statements } = await queryCounter.measure(() => workspaceRoster(ORG))
    expect(result).toHaveLength(122)
    expect(statements).toBe(1)
  })

  it("follows a removal and a role change on the next read", async () => {
    await removeMember(ORG, id("admin"))
    await addMembers(ORG, { [id("member")]: "viewer" })
    expect(await rolesById(ORG)).toEqual({})
  })

  it.each(["owner", "org:admin", "admin,member", "Admin", ""])("gives a member row with the role %j no access", async (role) => {
    await addMembers(ORG, { [id("admin")]: role })
    const roster = await workspaceRoster(ORG)
    expect(roster.map((person) => person.nominee.userId)).toEqual([id("member")])
    expect(journeyViewer({ orgId: ORG, userId: id("admin"), role: "admin" }, roster)).toMatchObject({ role: "member", active: false })
    expect(await workspaceMember(ORG, id("admin"))).toBeNull()
  })

  it("makes a journey Admin only when the session and the member row agree", async () => {
    const roster = await workspaceRoster(ORG)
    expect(journeyViewer({ orgId: ORG, userId: id("admin"), role: "admin" }, roster)).toMatchObject({ role: "admin", active: true })
    expect(journeyViewer({ orgId: ORG, userId: id("member"), role: "admin" }, roster)).toMatchObject({ role: "member", active: true })
  })
})

describe("one person's membership", () => {
  it.each(["admin", "member", "guest", "viewer"])("is their Lane role here and their email, in one query (%s)", async (role) => {
    const { result, statements } = await queryCounter.measure(() => workspaceMember(ORG, id(role)))
    expect(result).toEqual({ role, email: `${id(role)}@example.test` })
    expect(statements).toBe(1)
  })

  it("is the role in the asked workspace, for someone in two", async () => {
    expect(await workspaceMember(ORG, id("guest"))).toMatchObject({ role: "guest" })
    expect(await workspaceMember(OTHER, id("guest"))).toMatchObject({ role: "admin" })
  })

  it("is null for someone who isn't a member of the asked workspace", async () => {
    expect(await workspaceMember(ORG, id("elsewhere"))).toBeNull()
    await removeMember(ORG, id("guest"))
    expect(await workspaceMember(ORG, id("guest"))).toBeNull()
  })
})
