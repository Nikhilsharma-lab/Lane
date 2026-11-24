/**
 * #392 (spec #383 "/invite/[id]"; stories 18, 24–34): the invitation page, opened and pressed by real people signed up
 * through the auth route, on a local lane_test database. Its browser calls reach the real route and Server Actions.
 */
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { rememberLastUsed } from "@/app/(app)/workspace-actions"
import type { InvitationFlow } from "@/components/auth/better-auth/invitation-flow"
import { queryCounter } from "@/db"
import { loadInvitation } from "@/lib/data/invitations"
import { ROLE_NAMES, WORKSPACE_ROLES } from "@/lib/role-rules"
import { readSession } from "@/lib/session"
import { AUTH_ORIGIN, AuthBrowser, authRouteTestFile, codeOf, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import InvitationNotFound, { metadata as notFoundMetadata } from "./not-found"
import InvitationPage, { generateMetadata } from "./page"

// The page's own controller, kept so a test can press what it drew and draw it again.
const held = vi.hoisted(() => ({ flow: null as InvitationFlow | null }))
vi.mock("@/components/auth/better-auth/invitation-flow", async (importActual) => {
  const actual = await importActual<typeof import("@/components/auth/better-auth/invitation-flow")>()
  return { ...actual, createInvitationFlow: (options: Parameters<typeof actual.createInvitationFlow>[0]) => (held.flow ??= actual.createInvitationFlow(options)) }
})

const { connection, domain, person, signedIn, createWorkspace, join } = authRouteTestFile("invitation-page.test")

let outbound: Outbound
let pressing: AuthBrowser | null = null
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
  const outside = globalThis.fetch
  // The page's calls to /api/auth reach the real route, as the person pressing.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const { origin, pathname } = new URL(input instanceof Request ? input.url : input, AUTH_ORIGIN)
    if (origin !== AUTH_ORIGIN || !pathname.startsWith("/api/auth/") || !pressing) return outside(input, init)
    const answer = await pressing.call("POST", pathname.slice("/api/auth".length), JSON.parse(String(init?.body ?? "{}")))
    return Response.json(answer.body, { status: answer.status })
  })
})

const SIGNED_OUT = () => new AuthBrowser()
const props = (id: string) => ({ params: Promise.resolve({ id }) })
const draw = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node)).replace(/<!--.*?-->/g, "")
const words = (html: string) => markupWords(withoutHidden(html)).replace(/ ([.,])/g, "$1").replaceAll("&#x27;", "'")

/** The page as this browser's person sees it; `text` and `buttons` read what it shows now. */
async function open(browser: AuthBrowser, id: string) {
  held.flow = null
  const page = await browser.action<ReactNode>(() => InvitationPage(props(id)))
  const text = () => words(draw(page))
  const buttons = () => buttonsIn(draw(page)).map(({ name }) => name)
  text()
  /** Presses a button, in the page's own controller, and answers where the browser went, if anywhere. */
  async function press(button: (flow: InvitationFlow) => unknown) {
    const assign = vi.fn<(address: string) => void>()
    vi.stubGlobal("window", { location: { assign } })
    pressing = browser
    try {
      await browser.action(async () => {
        await button(held.flow!)
        if (held.flow!.snapshot().screen === "joined") await vi.waitFor(() => expect(assign).toHaveBeenCalled(), 5000)
      })
    } finally {
      pressing = null
      Reflect.deleteProperty(globalThis, "window")
    }
    return assign.mock.calls.flat()
  }
  return { text, buttons, press }
}
const titleOf = (browser: AuthBrowser, id: string) => browser.action(async () => (await generateMetadata(props(id))).title)

const sessionOf = (browser: AuthBrowser) => browser.action(() => readSession())
const lastUsedOf = async (userId: string) => (await connection`select last_workspace_id from profiles where id = ${userId}`)[0].last_workspace_id as string | null
const activeOf = async (userId: string) => [...(await connection`select active_organization_id from session where user_id = ${userId}`)]
const roleIn = async (organizationId: string, userId: string) => (await connection`select role from member where organization_id = ${organizationId} and user_id = ${userId}`)[0]?.role as string | undefined

/** Invites the address to a new Admin's workspace, "Acme Design". */
async function invite(to: string, role = "member") {
  const admin = await signedIn(outbound, "admin")
  const workspaceId = await createWorkspace(admin.browser)
  await connection`update organizations set name = 'Acme Design' where id = ${workspaceId}`
  const answer = await admin.browser.post("/organization/invite-member", { email: to, role })
  expect(answer.status).toBe(200)
  return { admin, workspaceId, id: (answer.body as { id: string }).id }
}
const accept = (browser: AuthBrowser, invitationId: string) => browser.post("/organization/accept-invitation", { invitationId })
const cancel = async ({ admin, id }: Awaited<ReturnType<typeof invite>>) => expect((await admin.browser.post("/organization/cancel-invitation", { invitationId: id })).status).toBe(200)

const CANCELLED = "This invitation can’t be used It was cancelled or declined. Ask an Admin of Acme Design for a new one."

describe("the invitation's states", () => {
  it("signed out with an account: sign in, filled in, then back here", async () => {
    const { person: sam } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email)
    // An email reads the same whatever its case.
    await connection`update invitation set email = ${sam.email.toUpperCase()} where id = ${id}`
    const { text, buttons, press } = await open(SIGNED_OUT(), id)
    expect(text()).toContain(`Join Acme Design Sign in as ${sam.email.toUpperCase()} to accept.`)
    expect(text()).toContain("After you sign in, you come back here to accept.")
    expect(buttons()).toEqual(["Sign in to accept"])
    expect(await press((flow) => flow.signIn())).toEqual([`/login?${new URLSearchParams({ email: sam.email.toUpperCase(), redirect_url: `/invite/${id}` })}`])
  })

  it("signed out without an account: create one, filled in, then back here", async () => {
    const { email } = person("new")
    const { id } = await invite(email, "viewer")
    const { text, buttons, press } = await open(SIGNED_OUT(), id)
    expect(text()).toContain(`Join Acme Design Create a Lane account with ${email} to accept.`)
    expect(text()).toContain(`Wren admin invited ${email} to join as a Viewer.`)
    expect(buttons()).toEqual(["Create an account", "I already have an account"])
    const query = new URLSearchParams({ email, redirect_url: `/invite/${id}` })
    expect(await press((flow) => flow.createAccount())).toEqual([`/signup?${query}`])
    expect(await press((flow) => flow.signIn())).toEqual([`/login?${query}`])
  })

  it.each(WORKSPACE_ROLES)("signed in with the invited email, as %s: Accept and join, or Decline", async (role) => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email, role)
    await connection`update invitation set email = ${sam.email.toUpperCase()} where id = ${id}`
    const { text, buttons } = await open(browser, id)
    expect(text()).toContain(`to join as ${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}.`)
    expect(text()).toMatch(/Open until \d{1,2} \w+/)
    expect(buttons()).toEqual(["Accept and join", "Decline"])
  })

  it("signed in with a different email: both emails, and the way to switch", async () => {
    const { browser, person: lee } = await signedIn(outbound, "lee")
    const { email } = person("sam")
    const { id } = await invite(email)
    const { text, buttons, press } = await open(browser, id)
    expect(text()).toContain(`This invitation is for someone else It was sent to ${email}, and you’re signed in as ${lee.email}.`)
    expect(buttons()).toEqual([`Sign out and sign in as ${email}`, `Stay signed in as ${lee.email}`])
    expect(await press((flow) => flow.goToLane())).toEqual(["/"])
    expect(await press((flow) => flow.signInAsInvited())).toEqual([`/login?${new URLSearchParams({ email, redirect_url: `/invite/${id}` })}`])
    expect(await sessionOf(browser)).toBeNull()
  })

  it("expired: pending past its expiry, for anyone", async () => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email)
    await connection`update invitation set expires_at = now() - interval '1 second' where id = ${id}`
    for (const viewer of [browser, SIGNED_OUT()]) {
      const { text, buttons } = await open(viewer, id)
      expect(text()).toContain("This invitation has expired Invitations last 7 days. Ask an Admin of Acme Design to send it again.")
      expect(buttons()).toEqual(["Go to Lane"])
    }
  })

  it("already accepted, past its expiry too", async () => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email)
    expect((await accept(browser, id)).status).toBe(200)
    await connection`update invitation set expires_at = now() - interval '1 day' where id = ${id}`
    const { text, buttons } = await open(browser, id)
    expect(text()).toContain("You’re already in Acme Design This invitation has been accepted.")
    expect(buttons()).toEqual(["Open Acme Design"])
  })

  it("cancelled by an Admin, or declined", async () => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    const cancelled = await invite(sam.email)
    await cancel(cancelled)
    expect((await open(browser, cancelled.id)).text()).toContain(CANCELLED)

    const { id } = await invite(sam.email)
    const declining = await open(browser, id)
    expect(await declining.press((flow) => flow.decline())).toEqual([])
    for (const { text, buttons } of [declining, await open(browser, id), await open(SIGNED_OUT(), id)]) {
      expect(text()).toContain(CANCELLED)
      expect(buttons()).toEqual(["Go to Lane"])
    }
  })

  it("closed: cancelled after the page opened, then accepted", async () => {
    const { browser, person: sam, userId } = await signedIn(outbound, "sam")
    const invited = await invite(sam.email)
    const { text, buttons, press } = await open(browser, invited.id)
    await cancel(invited)
    expect(await press((flow) => flow.accept())).toEqual([])
    expect(text()).toContain("This invitation can’t be used This invitation has expired or is no longer open.")
    expect(buttons()).toEqual(["Go to Lane"])
    expect(await roleIn(invited.workspaceId, userId)).toBeUndefined()
  })

  it("full: an accept refused because the workspace holds 100 people", async () => {
    const { browser, person: sam, userId } = await signedIn(outbound, "sam")
    const { id, workspaceId } = await invite(sam.email)
    await connection`insert into profiles(id, email, full_name) select ${workspaceId} || '-' || n, ${workspaceId} || '-' || n || '@' || ${domain}, 'Seat ' || n from generate_series(1, 99) n`
    await connection`insert into member(id, organization_id, user_id, role, created_at) select ${workspaceId} || '-' || n, ${workspaceId}, ${workspaceId} || '-' || n, 'member', now() from generate_series(1, 99) n`
    const { text, buttons, press } = await open(browser, id)
    expect(await press((flow) => flow.accept())).toEqual([])
    expect(text()).toContain("Acme Design is full A workspace holds up to 100 people. Ask an Admin of Acme Design to make room, then try again.")
    expect(buttons()).toEqual(["Try again"])
    expect(await roleIn(workspaceId, userId)).toBeUndefined()
  })

  it("names its tab after the workspace, whatever the state", async () => {
    const invited = await invite(person("new").email)
    expect(await titleOf(SIGNED_OUT(), invited.id)).toBe("Join Acme Design")
    await cancel(invited)
    expect(await titleOf(SIGNED_OUT(), invited.id)).toBe("Join Acme Design")
  })
})

describe("accepting", () => {
  it("a first workspace leads to the role step, a second to /, and each becomes last used", async () => {
    const { browser, person: sam, userId } = await signedIn(outbound, "sam")
    for (const [role, address] of [["guest", "/onboarding?step=role"], ["member", "/"]]) {
      const { id, workspaceId } = await invite(sam.email, role)
      const { text, buttons, press } = await open(browser, id)
      expect(await press((flow) => flow.accept())).toEqual([address])
      expect(text()).toContain("You’re in Acme Design")
      expect(buttons()).toEqual([])
      expect(await roleIn(workspaceId, userId)).toBe(role)
      expect(await lastUsedOf(userId)).toBe(workspaceId)
      expect(await sessionOf(browser)).toEqual({ userId, orgId: workspaceId, role })
    }
  })

  it("is refused by Better Auth for someone signed in with a different email", async () => {
    const { email } = person("sam")
    const { id, workspaceId } = await invite(email)
    const { browser, userId } = await signedIn(outbound, "lee")
    const answer = await accept(browser, id)
    expect([answer.status, codeOf(answer)]).toEqual([403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"])
    expect(await roleIn(workspaceId, userId)).toBeUndefined()
    expect(await connection`select status from invitation where id = ${id}`).toMatchObject([{ status: "pending" }])
  })
})

describe("Open <workspace>", () => {
  /** Someone who accepted an invitation, then made their own workspace, which is the one they last used. */
  async function acceptedThenElsewhere() {
    const admin = await signedIn(outbound, "admin")
    const workspaceId = await createWorkspace(admin.browser)
    await connection`update organizations set name = 'Acme Design' where id = ${workspaceId}`
    const joined = await join(outbound, admin.browser, "member", "sam")
    const ownId = await createWorkspace(joined.browser)
    await joined.browser.action(() => rememberLastUsed())
    const [{ id }] = await connection`select id from invitation where organization_id = ${workspaceId}`
    return { ...joined, admin, workspaceId, ownId, id: id as string }
  }

  it("changes nothing when the page opens, then switches to the workspace and goes to /", async () => {
    const { browser, userId, id, workspaceId, ownId } = await acceptedThenElsewhere()
    const { press } = await open(browser, id)
    expect(await titleOf(browser, id)).toBe("Join Acme Design")
    expect(await activeOf(userId)).toEqual([{ active_organization_id: ownId }])
    expect(await lastUsedOf(userId)).toBe(ownId)

    expect(await press((flow) => flow.openWorkspace())).toEqual(["/"])
    expect(await activeOf(userId)).toEqual([{ active_organization_id: workspaceId }])
    expect(await lastUsedOf(userId)).toBe(workspaceId)
  })

  it.each(["someone removed since", "someone else holding the link"])("is refused for %s, with no member row there, and changes nothing", async (who) => {
    const sam = await acceptedThenElsewhere()
    let viewer: { browser: AuthBrowser; userId: string; ownId: string } = sam
    if (who === "someone removed since") {
      const removed = await sam.admin.browser.post("/organization/remove-member", { organizationId: sam.workspaceId, memberIdOrEmail: sam.memberId })
      expect(removed.status).toBe(200)
    } else {
      const lee = await signedIn(outbound, "lee")
      viewer = { ...lee, ownId: await createWorkspace(lee.browser) }
      await lee.browser.action(() => rememberLastUsed())
    }
    const { text, buttons, press } = await open(viewer.browser, sam.id)
    expect(await press((flow) => flow.openWorkspace())).toEqual([])
    expect(text()).toContain("You’re no longer in this workspace. Ask one of its Admins to invite you again.")
    expect(buttons()).toEqual(["Open Acme Design"])
    expect(await activeOf(viewer.userId)).toEqual([{ active_organization_id: viewer.ownId }])
    expect(await lastUsedOf(viewer.userId)).toBe(viewer.ownId)
    expect(await roleIn(sam.workspaceId, viewer.userId)).toBeUndefined()
  })

  it("asks someone signed out to sign in as the invited email, and back here", async () => {
    const { id, person: sam } = await acceptedThenElsewhere()
    const { press } = await open(SIGNED_OUT(), id)
    expect(await press((flow) => flow.openWorkspace())).toEqual([`/login?${new URLSearchParams({ email: sam.email, redirect_url: `/invite/${id}` })}`])
  })
})

describe("a link Lane doesn't know", () => {
  /** What the page and its title answer with instead of rendering. */
  async function refusals(browser: AuthBrowser, id: string) {
    const digestOf = (error: unknown) => (error as { digest?: string }).digest
    return Promise.all([browser.action(() => InvitationPage(props(id))).then(draw, digestOf), titleOf(browser, id).then(String, digestOf)])
  }
  const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404"

  it("is not found for an id no invitation has, signed in or out", async () => {
    const { browser } = await signedIn(outbound, "lee")
    for (const viewer of [browser, SIGNED_OUT()]) expect(await refusals(viewer, "no-such-invitation")).toEqual([NOT_FOUND, NOT_FOUND])
  })

  it.each(["owner", "admin,member", "", null])("is not found for a role that isn't Lane's: %j", async (role) => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email)
    await connection`update invitation set role = ${role} where id = ${id}`
    for (const viewer of [browser, SIGNED_OUT()]) expect(await refusals(viewer, id)).toEqual([NOT_FOUND, NOT_FOUND])
  })

  it("is not found for a status that isn't Better Auth's", async () => {
    const { id } = await invite(person("new").email)
    await connection`update invitation set status = 'paused' where id = ${id}`
    expect(await refusals(SIGNED_OUT(), id)).toEqual([NOT_FOUND, NOT_FOUND])
  })

  it("shows Lane's not-found page, with nothing of any invitation's", async () => {
    const { browser, person: sam } = await signedIn(outbound, "sam")
    await invite(sam.email)
    for (const [viewer, way] of [[SIGNED_OUT(), "Check the address, or sign in to Lane. Sign in"], [browser, "Check the address, or go to Lane. Go to Lane"]] as const) {
      const html = draw(await viewer.action<ReactNode>(() => InvitationNotFound()))
      expect(words(html)).toBe(`Lane This page doesn’t exist ${way}`)
      for (const secret of ["Acme Design", "Wren admin", sam.email]) expect(html).not.toContain(secret)
    }
    expect(notFoundMetadata.title).toBe("Page not found")
  })
})

describe("the invitation read", () => {
  it("is one query, whoever is looking", async () => {
    const { person: sam, userId, browser } = await signedIn(outbound, "sam")
    const { id } = await invite(sam.email)
    for (const viewer of [null, userId]) {
      const { result, statements } = await queryCounter.measure(() => loadInvitation(id, viewer))
      expect(result?.invitation.workspace).toBe("Acme Design")
      expect(statements).toBe(1)
    }
    // The page's own: the session read, then the invitation's.
    expect((await queryCounter.measure(() => browser.action(() => InvitationPage(props(id))))).statements).toBe(2)
    expect((await queryCounter.measure(() => SIGNED_OUT().action(() => InvitationPage(props(id))))).statements).toBe(1)
  })
})
