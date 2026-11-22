import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ROLE_NAMES, WORKSPACE_ROLES } from "@/lib/role-rules"
import { BETTER_AUTH_MESSAGE, fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { createInvitationFlow, type Invitation, type InvitationViewer } from "./invitation-flow"
import { InvitationView } from "./invitation-view"

vi.mock("./invitation-flow", async (importActual) => ({
  ...(await importActual<typeof import("./invitation-flow")>()),
  createInvitationFlow: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./invitation-flow")>("./invitation-flow")

const SAM = "sam@example.test"
const invitation: Invitation = {
  id: "inv_1",
  workspace: "Acme Design",
  inviter: "Priya Shah",
  email: SAM,
  role: "member",
  expiresAt: "2026-11-27T10:00:00.000Z",
  status: "pending",
}
const signedInAsSam: InvitationViewer = { signedIn: true, email: SAM }
const navigate = vi.fn()
const onJoined = vi.fn()
let auth: AuthFetchFake
let rendered: string[] = []

/** The flow the view will pick up, made with the view's own props, so the test can drive it before rendering. */
function mount(props: Partial<Invitation> = {}, viewer: InvitationViewer = signedInAsSam) {
  const options = { invitation: { ...invitation, ...props }, viewer, onJoined, workspaceAddress: "/w/acme-design" }
  const flow = actual.createInvitationFlow({ ...options, navigate })
  vi.mocked(createInvitationFlow).mockReturnValue(flow)
  const render = () => {
    const html = renderToStaticMarkup(createElement(InvitationView, options)).replace(/<!--.*?-->/g, "")
    rendered.push(html)
    return html
  }
  return { flow, render }
}
/** What assistive tech reads, with no space left before a full stop or comma that followed an inline element. */
const read = (html: string) => markupWords(withoutHidden(html)).replace(/ ([.,])/g, "$1")
const names = (html: string) => buttonsIn(html).map((button) => button.name)

describe("the invitation page's states (#379, #346)", () => {
  beforeEach(() => {
    auth = fakeAuthFetch()
    onJoined.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("asks a signed-out person with an account to sign in, and says they come back here", () => {
    const html = mount({}, { signedIn: false, hasAccount: true }).render()
    expect(read(html)).toContain("Join Acme Design Sign in as sam@example.test to accept.")
    expect(read(html)).toContain("Priya Shah invited sam@example.test to join as a Member.")
    expect(read(html)).toContain("After you sign in, you come back here to accept.")
    expect(names(html)).toEqual(["Sign in to accept"])
  })

  it("offers a signed-out person without an account Create an account, or I already have an account", () => {
    const html = mount({}, { signedIn: false, hasAccount: false }).render()
    expect(read(html)).toContain("Join Acme Design Create a Lane account with sam@example.test to accept.")
    expect(names(html)).toEqual(["Create an account", "I already have an account"])
  })

  it("offers the invited email Accept and join, or Decline", () => {
    const html = mount().render()
    expect(read(html)).toContain("Join Acme Design You’re signed in as sam@example.test.")
    expect(read(html)).toContain("Priya Shah invited sam@example.test to join as a Member.")
    expect(names(html)).toEqual(["Accept and join", "Decline"])
  })

  it("tells someone else who it was sent to and who they're signed in as", () => {
    const html = mount({}, { signedIn: true, email: "sam.lee@example.test" }).render()
    expect(read(html)).toContain("This invitation is for someone else It was sent to sam@example.test, and you’re signed in as sam.lee@example.test.")
    expect(names(html)).toEqual(["Sign out and sign in as sam@example.test", "Stay signed in as sam.lee@example.test"])
  })

  it("says an expired invitation has expired, asking an Admin to send it again", () => {
    const html = mount({ status: "expired" }).render()
    expect(read(html)).toContain("This invitation has expired Invitations last 7 days. Ask an Admin of Acme Design to send it again.")
    expect(names(html)).toEqual(["Go to Lane"])
  })

  it("says an accepted invitation's person is already in, with Open <workspace>", () => {
    const html = mount({ status: "accepted" }).render()
    expect(read(html)).toContain("You’re already in Acme Design This invitation has been accepted.")
    expect(names(html)).toEqual(["Open Acme Design"])
  })

  it.each(["cancelled", "declined"] as const)("says a %s invitation can't be used, asking for a new one", (status) => {
    const html = mount({ status }).render()
    expect(read(html)).toContain("This invitation can’t be used It was cancelled or declined. Ask an Admin of Acme Design for a new one.")
    expect(names(html)).toEqual(["Go to Lane"])
  })

  it("says a full workspace is full, that a workspace holds up to 100 people, with Try again", async () => {
    auth.refuse("/organization/accept-invitation", 403, "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")
    const { flow, render } = mount()
    await flow.accept()
    const html = render()
    expect(read(html)).toContain("Acme Design is full A workspace holds up to 100 people. Ask an Admin of Acme Design to make room, then try again.")
    expect(read(html)).toContain("Priya Shah invited sam@example.test to join as a Member.")
    expect(names(html)).toEqual(["Try again"])
  })

  it("says an invitation the server can't find has expired or is no longer open", async () => {
    auth.refuse("/organization/accept-invitation", 400, "INVITATION_NOT_FOUND")
    const { flow, render } = mount()
    await flow.accept()
    const html = render()
    expect(read(html)).toContain("This invitation can’t be used This invitation has expired or is no longer open. Ask the person who invited you to send a new one.")
    expect(names(html)).toEqual(["Go to Lane"])
  })

  it("says the person joined, once onJoined has been called", async () => {
    const { flow, render } = mount()
    await flow.accept()
    expect(onJoined).toHaveBeenCalledTimes(1)
    const html = render()
    expect(read(html)).toContain("You’re in Acme Design")
    expect(names(html)).toEqual([])
  })

  it("shows when a pending invitation stops working, as a date", () => {
    expect(read(mount().render())).toMatch(/Open until 27 Nov( 2026)?\./)
  })

  it("names every role with Lane's name, never Better Auth's key", () => {
    for (const role of WORKSPACE_ROLES) {
      const text = read(mount({ role }).render())
      expect(text).toContain(`to join as ${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}.`)
      expect(text).not.toMatch(new RegExp(`\\b${role}\\b`))
    }
  })
})

describe("a refused accept on the invitation page (#379)", () => {
  beforeEach(() => {
    auth = fakeAuthFetch()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("asks to confirm the email, with the code path, in a box focus can reach", async () => {
    auth.refuse("/organization/accept-invitation", 403, "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION")
    const { flow, render } = mount()
    await flow.accept()
    const html = render()
    expect(html).toMatch(/<div[^>]*id="invitation-alert"[^>]*tabindex="-1"|<div[^>]*tabindex="-1"[^>]*id="invitation-alert"/i)
    expect(read(html)).toContain("Confirm your email before you accept. Email yourself a code to confirm it.")
    expect(names(html)).toEqual(["Email me a sign-in code", "Accept and join", "Decline"])
  })

  it("shows any other code's line, and the generic line for a fetch that threw", async () => {
    auth.refuse("/organization/accept-invitation", 403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")
    const { flow, render } = mount()
    await flow.accept()
    expect(read(render())).toContain("This invitation was sent to a different email. Sign in with that email to accept it.")
    auth.throwOn("/organization/accept-invitation")
    await flow.accept()
    expect(read(render())).toContain("Something went wrong. Try again.")
  })
})

// Runs last: every screen the tests above rendered.
describe("what the invitation page never says (#379)", () => {
  it("shows no Better Auth message and never says owner", () => {
    expect(rendered.length).toBeGreaterThan(10)
    for (const html of rendered) {
      expect(html).not.toContain(BETTER_AUTH_MESSAGE)
      expect(markupWords(html)).not.toMatch(/owner/i)
    }
    rendered = []
  })
})
