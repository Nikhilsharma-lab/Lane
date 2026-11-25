/**
 * #391 (spec #383 "Onboarding"; stories 17, 32, 35–42): /onboarding on Better Auth. The page is opened, and its Server
 * Actions called, by real people signed up through the auth route, on a local lane_test database.
 */
import { readdirSync, readFileSync } from "node:fs"
import { revalidatePath } from "next/cache"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { rememberLastUsed } from "@/app/(app)/workspace-actions"
import { queryCounter } from "@/db"
import { RETURN_ADDRESS_HEADER } from "@/lib/auth-return-address"
import { readFreeRequests } from "@/lib/billing"
import { loadInvitationsFor } from "@/lib/data/invitations"
import { addressAfterArriving } from "@/lib/onboarding-address"
import { readSession } from "@/lib/session"
import { AuthBrowser, authRouteTestFile, doorCancel, doorData, doorInvite, doorLeave, doorOpen, doorRemove, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { markupWords, withoutHidden } from "@/test/exposed-markup"
import { createWorkspace, saveOnboardingRole } from "./actions"
import OnboardingPage, { generateMetadata } from "./page"

vi.mock("next/cache", async (original) => ({ ...(await original<typeof import("next/cache")>()), revalidatePath: vi.fn() }))

const { connection, domain, signedIn, createWorkspace: makeWorkspace, join } = authRouteTestFile("onboarding.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
  vi.mocked(revalidatePath).mockClear()
})
// A workspace made by the action has a slug the shared clean-up doesn't know.
afterAll(() => connection`delete from organizations where owner_id in (select id from profiles where email like ${"%@" + domain})`)

type Person = Awaited<ReturnType<typeof signedIn>>
type Query = Record<string, string | string[] | undefined>
const ROLE_STEP: Query = { step: "role" }
const props = (query: Query) => ({ searchParams: Promise.resolve(query) })

/** The words the browser's person sees at /onboarding, or where they're sent. */
async function open(browser: AuthBrowser, query: Query = {}) {
  const address = query.step ? "/onboarding?step=role" : "/onboarding"
  try {
    const page = await browser.action<ReactNode>(() => OnboardingPage(props(query)), { [RETURN_ADDRESS_HEADER]: address })
    const html = renderToStaticMarkup(createElement("div", null, page))
    return { text: markupWords(withoutHidden(html)).replace(/ ([.,])/g, "$1").replaceAll("&#x27;", "'") }
  } catch (error) {
    const digest = (error as { digest?: string }).digest
    if (!digest?.startsWith("NEXT_REDIRECT;")) throw error
    return { sentTo: digest.split(";")[2] }
  }
}
const titleOf = (browser: AuthBrowser, query: Query = {}) => browser.action(async () => (await generateMetadata(props(query))).title)

const profileOf = async (userId: string) => (await connection`select to_jsonb(p) as row from profiles p where id = ${userId}`)[0].row as Record<string, unknown>
const sessionOf = (browser: AuthBrowser) => browser.action(() => readSession())
const membershipsOf = async (userId: string) => (await connection`select organization_id from member where user_id = ${userId}`).length
const hasUnknownRole = (userId: string) => connection`update member set role = 'owner' where user_id = ${userId}`

/** Invites the address to a new Admin's workspace of that name. */
async function invite(to: string, name: string, role = "member") {
  const admin = await signedIn(outbound, "admin")
  const workspaceId = await makeWorkspace(admin.browser)
  await connection`update organizations set name = ${name} where id = ${workspaceId}`
  const { id } = doorData(await doorInvite(admin.browser, { email: to, role }))
  return { admin, id }
}

/** Someone whose only workspace, "Wren's studio", was their last-used one, and who is out of it. */
async function outOfTheirOnlyWorkspace(how: "leave" | "removed") {
  const admin = await signedIn(outbound, "keeper")
  const organizationId = await makeWorkspace(admin.browser)
  const person = await join(outbound, admin.browser, "member", how)
  await person.browser.action(() => rememberLastUsed())
  const answer =
    how === "leave"
      ? await doorLeave(person.browser, organizationId)
      : await doorRemove(admin.browser, { organizationId, memberIdOrEmail: person.memberId })
  expect(answer.ok).toBe(true)
  return person
}

describe("a person's pending invitations", () => {
  it("are listed with their workspace, inviter and role, for their email whatever its case", async () => {
    const { browser, person } = await signedIn(outbound, "invited")
    const first = await invite(person.email, "Acme Design")
    await invite(person.email, "Northwind", "viewer")
    await connection`update invitation set email = ${person.email.toUpperCase()} where id = ${first.id}`

    const { text } = await open(browser)
    expect(text).toContain(`Join your team You’ve been invited to these workspaces as ${person.email}.`)
    expect(text).toContain("Acme Design Wren admin invited you as a Member")
    expect(text).toContain("Northwind Wren admin invited you as a Viewer")
    expect(text).toContain("Or start a workspace of your own.")
    expect(text).not.toContain("Expecting an invitation?")
  })

  it("leave out another person's, an expired, a cancelled, a declined and an accepted one, and a role that isn't Lane's", async () => {
    const { browser, person } = await signedIn(outbound, "uninvited")
    await invite(`someone-else@${domain}`, "Another person’s")
    const expired = await invite(person.email, "Expired")
    await connection`update invitation set expires_at = now() - interval '1 minute' where id = ${expired.id}`
    const cancelled = await invite(person.email, "Cancelled")
    doorData(await doorCancel(cancelled.admin.browser, cancelled.id))
    const declined = await invite(person.email, "Declined")
    expect((await browser.post("/organization/reject-invitation", { invitationId: declined.id })).status).toBe(200)
    const accepted = await invite(person.email, "Accepted")
    await connection`update invitation set status = 'accepted' where id = ${accepted.id}`
    for (const role of ["owner", "admin,member", null]) {
      const unknown = await invite(person.email, "Unknown role")
      await connection`update invitation set role = ${role} where id = ${unknown.id}`
    }

    const { text } = await open(browser)
    expect(text).toContain("Create your workspace")
    expect(text).toContain(`Expecting an invitation? Ask an Admin to invite ${person.email}. It shows up here.`)
    for (const name of ["Another", "Expired", "Cancelled", "Declined", "Accepted", "Unknown"]) expect(text).not.toContain(name)
  })

  it("aren't listed for an email that isn't verified", async () => {
    const { browser, person, userId } = await signedIn(outbound, "unverified")
    await invite(person.email, "Acme Design")
    await connection`update profiles set email_verified = false where id = ${userId}`
    const { text } = await open(browser)
    expect(text).toContain(`Ask an Admin to invite ${person.email}.`)
    expect(text).not.toContain("Acme Design")
  })

  it("are read in one query", async () => {
    const { userId, person } = await signedIn(outbound, "counted")
    await invite(person.email, "Acme Design")
    await invite(person.email, "Northwind")
    const { result, statements } = await queryCounter.measure(() => loadInvitationsFor(userId))
    expect(result.invitations).toHaveLength(2)
    expect(statements).toBe(1)
  })
})

describe("a person with no workspace left", () => {
  it("is told which workspace they're no longer in after a removal, in the session that was in it", async () => {
    const admin = await signedIn(outbound, "remover")
    const organizationId = await makeWorkspace(admin.browser)
    const { browser, userId, memberId } = await join(outbound, admin.browser, "member", "removed")
    doorData(await doorRemove(admin.browser, { organizationId, memberIdOrEmail: memberId }))
    expect((await profileOf(userId)).last_workspace_id).toBeNull()
    expect((await open(browser)).text).toContain("You’re no longer in Wren's studio Your Requests and comments stay in that workspace.")
  })

  it("is told on a new session too, from their last-used workspace, above their invitations", async () => {
    const { person } = await outOfTheirOnlyWorkspace("removed")
    await invite(person.email, "Acme Design")
    const again = new AuthBrowser()
    expect((await again.post("/sign-in/email", { email: person.email, password: person.password })).status).toBe(200)

    const { text } = await open(again)
    expect(text).toContain("You’re no longer in Wren's studio")
    expect(text).toContain("Join your team")
  })

  // Leaving and being removed write nothing Lane can tell apart (#383), so the notice never says who did it.
  it("is never told an Admin removed them, because they may have left", async () => {
    const { browser } = await outOfTheirOnlyWorkspace("leave")
    const { text } = await open(browser)
    expect(text).toContain("You’re no longer in Wren's studio")
    expect(text).not.toMatch(/removed/i)
  })

  it("is told nothing when they never had one", async () => {
    const { browser } = await signedIn(outbound, "new")
    const { text } = await open(browser)
    expect(text).toContain("Create your workspace")
    expect(text).not.toContain("no longer in")
  })

  it("goes to / instead while another workspace is left", async () => {
    const admin = await signedIn(outbound, "remover")
    const organizationId = await makeWorkspace(admin.browser)
    const { browser, memberId } = await join(outbound, admin.browser, "member", "still-in-one")
    await makeWorkspace(browser)
    doorData(await doorOpen(browser, organizationId))
    doorData(await doorRemove(admin.browser, { organizationId, memberIdOrEmail: memberId }))
    expect(await open(browser)).toEqual({ sentTo: "/" })
  })
})

describe("creating a workspace", () => {
  it("makes the workspace, its Admin, its creator, its Free Requests and last used, and opens it", async () => {
    const { browser, userId } = await signedIn(outbound, "founder")
    expect(await browser.action(() => createWorkspace("  Acme Design "))).toEqual({ ok: true, data: { first: true } })

    const session = await sessionOf(browser)
    expect(session).toMatchObject({ userId, role: "admin" })
    const orgId = session!.orgId!
    const [workspace] = await connection`select name, owner_id, logo, metadata, plan from organizations where id = ${orgId}`
    expect(workspace).toEqual({ name: "Acme Design", owner_id: userId, logo: null, metadata: null, plan: "free" })
    expect([...(await connection`select user_id, role from member where organization_id = ${orgId}`)]).toEqual([{ user_id: userId, role: "admin" }])
    expect((await profileOf(userId)).last_workspace_id).toBe(orgId)
    expect((await readFreeRequests({ orgId })).free).toEqual({ total: 4, used: 0, left: 4, usedElsewhere: null })

    // #213: a second one from the same company domain gets whatever is left.
    await connection`insert into requests(org_id, title, description, created_by) values (${orgId}, 'Work', 'A Request.', ${userId})`
    const colleague = await signedIn(outbound, "colleague")
    await colleague.browser.action(() => createWorkspace("Acme Labs"))
    const second = (await sessionOf(colleague.browser))!.orgId!
    expect((await readFreeRequests({ orgId: second })).free).toEqual({ total: 4, used: 0, left: 3, usedElsewhere: { kind: "company_domain", domain, used: 1 } })
  })

  // Each write Lane makes after Better Auth's, refused by the database while the test runs.
  it.each([
    ["its creator", "update of owner_id on organizations"],
    ["its Free Requests", "insert on free_request_allowances"],
    ["last used", "update of last_workspace_id on profiles"],
  ])("takes the workspace away again when %s couldn't be saved, and only that one", async (_what, write) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { browser, userId } = await signedIn(outbound, "interrupted")
    const first = await makeWorkspace(browser)
    await browser.action(() => rememberLastUsed())
    await connection.unsafe(`create or replace function lane_test_refuse() returns trigger language plpgsql as $$ begin raise exception 'refused by the test'; end $$`)
    await connection.unsafe(`create trigger lane_test_refuse before ${write} for each row execute function lane_test_refuse()`)
    try {
      expect(await browser.action(() => createWorkspace("Half made"))).toEqual({ ok: false })
    } finally {
      await connection.unsafe(`drop trigger lane_test_refuse on ${write.split(" on ")[1]}`)
      await connection.unsafe(`drop function lane_test_refuse()`)
    }
    expect(await connection`select 1 from organizations where name = 'Half made'`).toHaveLength(0)
    expect([...(await connection`select organization_id from member where user_id = ${userId}`)]).toEqual([{ organization_id: first }])
    expect(await sessionOf(browser)).toEqual({ userId, orgId: first, role: "admin" })

    // A second try makes a whole one.
    expect(await browser.action(() => createWorkspace("Half made"))).toEqual({ ok: true, data: { first: false } })
    const [made] = await connection`select o.owner_id, b.allowance_key from organizations o join workspace_billing b on b.org_id = o.id where o.name = 'Half made' and o.owner_id = ${userId}`
    expect(made).toEqual({ owner_id: userId, allowance_key: domain })
    await connection`delete from organizations where name = 'Half made' and owner_id = ${userId}`
  })

  it("lets two workspaces have the same name", async () => {
    const [first, second] = [await signedIn(outbound, "same"), await signedIn(outbound, "same")]
    for (const { browser } of [first, second, first]) expect(await browser.action(() => createWorkspace("Same name"))).toMatchObject({ ok: true })
    const slugs = await connection`select slug from organizations where name = 'Same name' and owner_id in (${first.userId}, ${second.userId})`
    expect(new Set(slugs.map(({ slug }) => slug)).size).toBe(3)
  })

  it("takes the creator from the session, whatever the caller sends", async () => {
    const other = await signedIn(outbound, "other")
    const { browser, userId } = await signedIn(outbound, "forger")
    const forged = createWorkspace as (...sent: unknown[]) => ReturnType<typeof createWorkspace>
    expect(await browser.action(() => forged("Forged", { userId: other.userId, ownerUserId: other.userId, orgId: "org_test_a" }))).toMatchObject({ ok: true })
    const orgId = (await sessionOf(browser))!.orgId!
    expect((await connection`select owner_id from organizations where id = ${orgId}`)[0].owner_id).toBe(userId)
    expect([...(await connection`select user_id from member where organization_id = ${orgId}`)]).toEqual([{ user_id: userId }])
    expect(await membershipsOf(other.userId)).toBe(0)
  })

  it.each([
    ["an empty name", ""],
    ["a blank name", "   "],
    ["no name", undefined],
    ["an object", { name: "Acme", userId: "someone" }],
  ])("refuses %s and makes nothing", async (_what, name) => {
    const { browser, userId } = await signedIn(outbound, "nameless")
    expect(await browser.action(() => createWorkspace(name as string))).toEqual({ ok: false })
    expect(await membershipsOf(userId)).toBe(0)
  })

  it("refuses a name of several lines or over 100 characters, and makes nothing", async () => {
    const { browser, userId } = await signedIn(outbound, "misnamer")
    expect(await browser.action(() => createWorkspace("Acme\nYour account is locked"))).toEqual({ ok: false, code: "NAME_NOT_PLAIN" })
    expect(await browser.action(() => createWorkspace("n".repeat(101)))).toEqual({ ok: false, code: "NAME_TOO_LONG" })
    expect(await membershipsOf(userId)).toBe(0)
  })

  it("refuses someone signed out", async () => {
    expect(await new AuthBrowser().action(() => createWorkspace("Nobody’s"))).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(await connection`select 1 from organizations where name = 'Nobody’s'`).toHaveLength(0)
  })
})

describe("after a create or a join", () => {
  const created = async ({ browser }: Person) => addressAfterArriving(await browser.action(() => createWorkspace("Acme Labs")))
  const joined = async ({ browser, person }: Person) => {
    const { id } = await invite(person.email, "Acme Design")
    expect((await browser.post("/organization/accept-invitation", { invitationId: id })).status).toBe(200)
    return addressAfterArriving(await browser.action(() => rememberLastUsed()))
  }
  const WAYS: [string, (person: Person) => Promise<string>][] = [["create", created], ["join", joined]]

  it.each(WAYS)("a first %s leads to the role step, and a second goes to /", async (_how, arrive) => {
    const person = await signedIn(outbound, "arriving")
    expect(await arrive(person)).toBe("/onboarding?step=role")
    expect((await open(person.browser, ROLE_STEP)).text).toContain("Choose your role")
    expect(await arrive(person)).toBe("/")
  })

  it.each(WAYS)("a %s by someone who had left their only workspace goes to /", async (_how, arrive) => {
    expect(await arrive(await outOfTheirOnlyWorkspace("leave"))).toBe("/")
  })

  it("goes to / when the workspace couldn't be remembered", () => {
    expect(addressAfterArriving({ ok: false, code: "UNAUTHORIZED" })).toBe("/")
  })
})

describe("the role step's address", () => {
  it("opens the role step in a workspace, and goes to / without the marker", async () => {
    const { browser } = await signedIn(outbound, "in-one")
    await makeWorkspace(browser)
    expect((await open(browser, ROLE_STEP)).text).toContain("Choose your role")
    expect(await titleOf(browser, ROLE_STEP)).toBe("Choose your role")
    for (const query of [{}, { step: "other" }, { step: ["other", "role"] }]) expect(await open(browser, query)).toEqual({ sentTo: "/" })
  })

  it("opens the workspace step in none, with its own tab title", async () => {
    const { browser } = await signedIn(outbound, "in-none")
    for (const query of [ROLE_STEP, {}]) {
      expect((await open(browser, query)).text).toContain("Create your workspace")
      expect(await titleOf(browser, query)).toBe("Create or join a workspace")
    }
  })

  it("opens the workspace step for someone whose role Lane doesn't know, so nothing loops", async () => {
    const { browser, userId } = await signedIn(outbound, "unknown-role")
    await makeWorkspace(browser)
    await hasUnknownRole(userId)
    for (const query of [ROLE_STEP, {}]) {
      const { text } = await open(browser, query)
      expect(text).toContain("Create your workspace")
      expect(text).not.toContain("no longer in")
    }
  })

  it("sends someone signed out to sign in, and back to it", async () => {
    expect(await open(new AuthBrowser(), ROLE_STEP)).toEqual({ sentTo: `/login?redirect_url=${encodeURIComponent("/onboarding?step=role")}` })
    expect(await open(new AuthBrowser())).toEqual({ sentTo: "/login?redirect_url=%2Fonboarding" })
  })
})

describe("saving the role", () => {
  it("changes the profile's role and its updated time, nothing else, and answers with /", async () => {
    const { browser, userId } = await signedIn(outbound, "chooser")
    await browser.action(() => createWorkspace("Acme Design"))
    await connection`update profiles set updated_at = now() - interval '1 day' where id = ${userId}`
    const before = await profileOf(userId)
    expect(before.role).toBe("designer")

    // Plan item 2.2: the saved role answers with / itself. The revalidation clears the client's cached redirect from
    // / back to /onboarding (staleTimes.dynamic is 30 s), and the redirect carries a fresh render of /.
    await expect(browser.action(() => saveOnboardingRole({ role: "pm" }))).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/;/) })
    expect(revalidatePath).toHaveBeenCalledWith("/")

    const after = await profileOf(userId)
    expect(after).toEqual({ ...before, role: "pm", updated_at: after.updated_at })
    expect(Date.parse(String(after.updated_at))).toBeGreaterThan(Date.parse(String(before.updated_at)))
    // ADR 0006: the label grants nothing.
    expect(await sessionOf(browser)).toMatchObject({ userId, role: "admin" })
  })

  const NEEDS_WORKSPACE = { error: "Create or join a workspace before choosing your role.", needsWorkspace: true }

  it("refuses someone with no workspace, or a role Lane doesn't know, and changes nothing", async () => {
    const { browser, userId } = await signedIn(outbound, "refused")
    const before = await profileOf(userId)
    expect(await browser.action(() => saveOnboardingRole({ role: "pm" }))).toEqual(NEEDS_WORKSPACE)
    await makeWorkspace(browser)
    await hasUnknownRole(userId)
    expect(await browser.action(() => saveOnboardingRole({ role: "pm" }))).toEqual(NEEDS_WORKSPACE)
    expect(await profileOf(userId)).toEqual(before)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("refuses someone signed out", async () => {
    expect(await new AuthBrowser().action(() => saveOnboardingRole({ role: "pm" }))).toEqual({ error: "Sign in to continue.", sessionExpired: true })
  })
})

it("has onboarding files and workspace reads that import nothing of Clerk's", () => {
  const onboarding = readdirSync("src/app/(auth)/onboarding").filter((name) => !name.endsWith(".test.ts")).map((name) => `src/app/(auth)/onboarding/${name}`)
  const reads = ["src/lib/ensure-workspace.ts", "src/lib/data/shell.ts", "src/lib/data/workspaces.ts", "src/lib/data/workspace-frame.ts", "src/lib/data/invitations.ts"]
  for (const file of [...onboarding, ...reads, "src/components/auth/better-auth/onboarding-view.tsx"])
    expect(readFileSync(file, "utf8"), file).not.toMatch(/["']@clerk\/|onboarding-sign-out/)
})
