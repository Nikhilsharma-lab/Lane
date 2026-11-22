import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { answeredCodes, fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { createInvitationFlow, type Invitation, type InvitationViewer } from "./invitation-flow"

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
/** A code Lane has no words for, which must read as the generic line. */
const UNKNOWN_CODE = "SOMETHING_LANE_HAS_NO_WORDS_FOR"

// #376: every code these tests met, but the one made up to be unknown, has Lane's words in AUTH_ERROR_COPY.
afterAll(() => {
  expect(answeredCodes().length).toBeGreaterThan(3)
  expect(answeredCodes().filter((code) => code !== UNKNOWN_CODE && !Object.hasOwn(AUTH_ERROR_COPY, code))).toEqual([])
})

describe("which invitation state a person meets (#379, #346's state list)", () => {
  const navigate = vi.fn()
  const onJoined = vi.fn()
  const screen = (props: Partial<Invitation> = {}, viewer: InvitationViewer = signedInAsSam) =>
    createInvitationFlow({ invitation: { ...invitation, ...props }, viewer, navigate, onJoined }).snapshot().screen

  it("asks a signed-out person with an account to sign in, and one without to create an account", () => {
    expect(screen({}, { signedIn: false, hasAccount: true })).toBe("sign-in")
    expect(screen({}, { signedIn: false, hasAccount: false })).toBe("create-account")
  })

  it("offers Accept to the invited email, and the switch to anyone else", () => {
    expect(screen()).toBe("accept")
    // An email reads the same whatever its case.
    expect(screen({}, { signedIn: true, email: "Sam@Example.test" })).toBe("accept")
    expect(screen({}, { signedIn: true, email: "sam.lee@example.test" })).toBe("someone-else")
  })

  // #376 Q3: the status the server read decides; the expiry date is only shown.
  it("follows the invitation's status over who is looking", () => {
    for (const viewer of [signedInAsSam, { signedIn: false, hasAccount: true } as const]) {
      expect(screen({ status: "expired" }, viewer)).toBe("expired")
      expect(screen({ status: "accepted" }, viewer)).toBe("already-accepted")
      expect(screen({ status: "cancelled" }, viewer)).toBe("cancelled")
      expect(screen({ status: "declined" }, viewer)).toBe("cancelled")
    }
    expect(screen({ status: "pending", expiresAt: "2020-01-01T00:00:00.000Z" })).toBe("accept")
  })
})

describe("accepting and declining (#379)", () => {
  let auth: AuthFetchFake
  const navigate = vi.fn()
  const onJoined = vi.fn()
  const flowFor = (viewer: InvitationViewer = signedInAsSam) => createInvitationFlow({ invitation, viewer, navigate, onJoined })
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
    onJoined.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("sends one accept with the invitation's id, then calls onJoined once", async () => {
    const flow = flowFor()
    await Promise.all([flow.accept(), flow.accept()])
    expect(auth.requests).toEqual([{ path: "/organization/accept-invitation", method: "POST", body: { invitationId: "inv_1" }, captcha: null }])
    expect(onJoined).toHaveBeenCalledTimes(1)
    expect(flow.snapshot().screen).toBe("joined")
  })

  it("moves to the full state when the workspace has 100 people, and Try again accepts again", async () => {
    auth.refuse("/organization/accept-invitation", 403, "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")
    const flow = flowFor()
    await flow.accept()
    expect(flow.snapshot()).toMatchObject({ screen: "full", alert: null })
    expect(onJoined).not.toHaveBeenCalled()
    await flow.accept()
    expect(auth.to("/organization/accept-invitation")).toHaveLength(2)
    expect(flow.snapshot().screen).toBe("joined")
  })

  it("moves to the no-longer-open state when the server can't find the invitation", async () => {
    auth.refuse("/organization/accept-invitation", 400, "INVITATION_NOT_FOUND")
    const flow = flowFor()
    await flow.accept()
    expect(flow.snapshot()).toMatchObject({ screen: "closed", alert: null })
  })

  it("says to confirm the email first, offering the code path", async () => {
    auth.refuse("/organization/accept-invitation", 403, "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION")
    const flow = flowFor()
    await flow.accept()
    expect(flow.snapshot()).toMatchObject({
      screen: "accept",
      alert: { message: "Confirm your email before you accept. Email yourself a code to confirm it.", offer: "code" },
    })
  })

  // #379 "with the code link": the link leads to a code, not to the password.
  it("signs out, then opens sign-in at the code request with the invited email and a return here", async () => {
    auth.refuse("/organization/accept-invitation", 403, "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION")
    const flow = flowFor()
    await flow.accept()
    await flow.confirmWithCode()
    expect(auth.requests.map((request) => request.path)).toEqual(["/organization/accept-invitation", "/sign-out"])
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1&start=code-request")
  })

  it("shows any other refusal's line, and the generic line for an unknown code or a fetch that threw", async () => {
    auth.refuse("/organization/accept-invitation", 403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")
    auth.refuse("/organization/accept-invitation", 500, UNKNOWN_CODE)
    auth.throwOn("/organization/accept-invitation")
    const flow = flowFor()
    await flow.accept()
    expect(flow.snapshot().alert).toEqual({ message: "This invitation was sent to a different email. Sign in with that email to accept it.", offer: null })
    await flow.accept()
    expect(flow.snapshot().alert).toEqual({ message: "Something went wrong. Try again.", offer: null })
    await flow.accept()
    expect(flow.snapshot().alert).toEqual({ message: "Something went wrong. Try again.", offer: null })
    expect(flow.snapshot().screen).toBe("accept")
    expect(onJoined).not.toHaveBeenCalled()
  })

  it("sends one decline with the invitation's id, then shows the cancelled-or-declined state", async () => {
    const flow = flowFor()
    await Promise.all([flow.decline(), flow.decline()])
    expect(auth.requests).toEqual([{ path: "/organization/reject-invitation", method: "POST", body: { invitationId: "inv_1" }, captcha: null }])
    expect(flow.snapshot().screen).toBe("cancelled")
    expect(onJoined).not.toHaveBeenCalled()
  })

  it("moves to the no-longer-open state when a decline finds the invitation gone", async () => {
    auth.refuse("/organization/reject-invitation", 400, "INVITATION_NOT_FOUND")
    const flow = flowFor()
    await flow.decline()
    expect(flow.snapshot().screen).toBe("closed")
  })
})

describe("signed in as someone else (#379)", () => {
  let auth: AuthFetchFake
  const navigate = vi.fn()
  const flowFor = () => createInvitationFlow({ invitation, viewer: { signedIn: true, email: "sam.lee@example.test" }, navigate, onJoined: vi.fn() })
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("signs out, then goes to sign-in with the invited email and a return to the invitation", async () => {
    const flow = flowFor()
    await flow.signInAsInvited()
    expect(auth.requests.map((request) => request.path)).toEqual(["/sign-out"])
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1")
  })

  it("stays put with the line when signing out fails", async () => {
    auth.throwOn("/sign-out")
    const flow = flowFor()
    await flow.signInAsInvited()
    expect(navigate).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ screen: "someone-else", alert: { message: "Something went wrong. Try again.", offer: null } })
  })

  it("stays signed in, going to Lane", () => {
    flowFor().goToLane()
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/")
    expect(auth.requests).toEqual([])
  })
})

describe("the ways on from a signed-out invitation (#379)", () => {
  const navigate = vi.fn()
  beforeEach(() => navigate.mockReset())
  const flowFor = (hasAccount: boolean) => createInvitationFlow({ invitation, viewer: { signedIn: false, hasAccount }, navigate, onJoined: vi.fn() })

  it("goes to sign-in or sign-up with the invited email and a return to the invitation", () => {
    flowFor(true).signIn()
    flowFor(false).createAccount()
    flowFor(false).signIn()
    expect(navigate.mock.calls).toEqual([
      ["/login?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1"],
      ["/signup?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1"],
      ["/login?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1"],
    ])
  })

  it("keeps an invitation id that needs escaping inside its own path", () => {
    createInvitationFlow({ invitation: { ...invitation, id: "a/b?c" }, viewer: { signedIn: false, hasAccount: true }, navigate, onJoined: vi.fn() }).signIn()
    expect(navigate).toHaveBeenCalledWith("/login?email=sam%40example.test&redirect_url=%2Finvite%2Fa%252Fb%253Fc")
  })
})
