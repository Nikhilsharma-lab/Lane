import { describe, expect, it, vi } from "vitest"

import { createOnboardingFlow, type PendingWorkspaceInvitation } from "./onboarding-flow"

const invitations: PendingWorkspaceInvitation[] = [
  { id: "inv_1", workspace: "Acme Design", inviter: "Priya Shah", role: "member" },
  { id: "inv_2", workspace: "Northwind Product", inviter: "Ola Berg", role: "admin" },
]
const done = async () => ({ ok: true as const })

describe("creating a workspace in Onboarding (#379)", () => {
  // #290 D11: Lane's words on the field, not the browser's tooltip.
  it.each(["", "   "])("refuses the name %j on the field without calling onCreate", async (name) => {
    const onCreate = vi.fn(done)
    const flow = createOnboardingFlow({ invitations, onJoin: done, onCreate })
    await flow.create(name)
    expect(flow.snapshot()).toMatchObject({ nameError: "Name your workspace.", alert: null })
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("calls onCreate once with the name trimmed", async () => {
    const onCreate = vi.fn(done)
    const flow = createOnboardingFlow({ invitations: [], onJoin: done, onCreate })
    await Promise.all([flow.create("  Acme Design "), flow.create("Acme Design")])
    expect(onCreate.mock.calls).toEqual([["Acme Design"]])
    expect(flow.snapshot()).toMatchObject({ nameError: null, alert: null, pending: null })
  })

  it("puts a taken workspace URL on the name field", async () => {
    const flow = createOnboardingFlow({ invitations: [], onJoin: done, onCreate: async () => ({ ok: false as const, code: "ORGANIZATION_ALREADY_EXISTS" }) })
    await flow.create("Acme Design")
    expect(flow.snapshot()).toMatchObject({ nameError: "Another workspace already uses this URL. Choose a different one, then try again.", alert: null })
  })

  it("shows any other code's line under the form, and the generic line for an unknown code or a throw", async () => {
    const onCreate = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, code: "UNAUTHORIZED" })
      .mockResolvedValueOnce({ ok: false as const, code: "SOMETHING_LANE_HAS_NO_WORDS_FOR" })
      .mockRejectedValueOnce(new Error("offline"))
    const flow = createOnboardingFlow({ invitations: [], onJoin: done, onCreate })
    await flow.create("Acme Design")
    expect(flow.snapshot().alert).toEqual({ at: "create", title: "You’re signed out. Sign in, then try again.", detail: null })
    await flow.create("Acme Design")
    expect(flow.snapshot().alert).toEqual({ at: "create", title: "Something went wrong. Try again.", detail: null })
    await flow.create("Acme Design")
    expect(flow.snapshot().alert).toEqual({ at: "create", title: "Something went wrong. Try again.", detail: null })
    expect(flow.snapshot().pending).toBeNull()
  })

  it("forgets what it said about the name once the person types", async () => {
    const flow = createOnboardingFlow({ invitations, onJoin: done, onCreate: done })
    await flow.create("")
    flow.editName()
    expect(flow.snapshot().nameError).toBeNull()
  })
})

describe("joining a workspace from Onboarding (#379)", () => {
  it("calls onJoin once with the invitation's id", async () => {
    const onJoin = vi.fn(done)
    const flow = createOnboardingFlow({ invitations, onJoin, onCreate: done })
    await Promise.all([flow.join("inv_2"), flow.join("inv_1")])
    expect(onJoin.mock.calls).toEqual([["inv_2"]])
    expect(flow.snapshot()).toMatchObject({ alert: null, pending: null })
  })

  it("says a full workspace is full, in the invitation page's words", async () => {
    const flow = createOnboardingFlow({ invitations, onJoin: async () => ({ ok: false as const, code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" }), onCreate: done })
    await flow.join("inv_1")
    expect(flow.snapshot().alert).toEqual({
      at: "join",
      title: "Acme Design is full",
      detail: "A workspace holds up to 100 people. Ask an Admin of Acme Design to make room, then try again.",
    })
  })

  it("says a gone invitation can't be used, in the invitation page's words", async () => {
    const flow = createOnboardingFlow({ invitations, onJoin: async () => ({ ok: false as const, code: "INVITATION_NOT_FOUND" }), onCreate: done })
    await flow.join("inv_2")
    expect(flow.snapshot().alert).toEqual({
      at: "join",
      title: "This invitation can’t be used",
      detail: "This invitation has expired or is no longer open. Ask the person who invited you to send a new one.",
    })
  })

  it("shows any other code's line, and the generic line for a throw", async () => {
    const onJoin = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, code: "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION" })
      .mockRejectedValueOnce(new Error("offline"))
    const flow = createOnboardingFlow({ invitations, onJoin, onCreate: done })
    await flow.join("inv_1")
    expect(flow.snapshot().alert).toEqual({ at: "join", title: "Confirm your email before you accept. Email yourself a code to confirm it.", detail: null })
    await flow.join("inv_1")
    expect(flow.snapshot().alert).toEqual({ at: "join", title: "Something went wrong. Try again.", detail: null })
  })
})
