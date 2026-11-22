import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ROLE_NAMES, WORKSPACE_ROLES } from "@/lib/role-rules"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { createOnboardingFlow, type PendingWorkspaceInvitation } from "./onboarding-flow"
import { OnboardingWorkspaceStep, type OnboardingWorkspaceStepProps } from "./onboarding-view"

vi.mock("./onboarding-flow", async (importActual) => ({
  ...(await importActual<typeof import("./onboarding-flow")>()),
  createOnboardingFlow: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./onboarding-flow")>("./onboarding-flow")

const SAM = "sam@example.test"
const invitations: PendingWorkspaceInvitation[] = [
  { id: "inv_1", workspace: "Acme Design", inviter: "Priya Shah", role: "member" },
  { id: "inv_2", workspace: "Northwind Product", inviter: "Ola Berg", role: "admin" },
]
const done = async () => ({})
const base: OnboardingWorkspaceStepProps = {
  email: SAM,
  invitations,
  signOut: createElement("button", { type: "button" }, "Sign out"),
  onJoin: done,
  onCreate: done,
}

/** The flow the view will pick up, made from the same props, so a test can drive it before rendering. */
function mount(props: Partial<OnboardingWorkspaceStepProps> = {}) {
  const all = { ...base, ...props }
  const flow = actual.createOnboardingFlow(all)
  vi.mocked(createOnboardingFlow).mockReturnValue(flow)
  return { flow, render: () => renderToStaticMarkup(createElement(OnboardingWorkspaceStep, all)) }
}
const read = (html: string) => markupWords(withoutHidden(html)).replace(/ ([.,])/g, "$1")
const names = (html: string) => buttonsIn(html).map((button) => button.name)
const nameInput = (html: string) => /<input[^>]*id="onboarding-workspace-name"[^>]*>/.exec(html)?.[0] ?? ""

describe("Onboarding's workspace step (#379, #346)", () => {
  it("lists pending invitations first, each with its inviter, Lane role and Join, then Or start a workspace of your own", () => {
    const html = mount().render()
    const text = read(html)
    expect(text).toContain("Join your team You’ve been invited to these workspaces as sam@example.test.")
    const order = ["Acme Design", "Priya Shah invited you as a Member", "Northwind Product", "Ola Berg invited you as an Admin", "Or start a workspace of your own.", "Workspace name", "Create workspace"]
    let from = text.indexOf("Join your team")
    for (const phrase of order) {
      const at = text.indexOf(phrase, from)
      expect(at, phrase).toBeGreaterThan(from)
      from = at
    }
    expect(names(html)).toEqual(["Sign out", "Join Acme Design", "Join Northwind Product", "Create workspace"])
    expect(text).not.toContain("Expecting an invitation?")
  })

  it("offers Create your workspace with none, and says which email an Admin should invite", () => {
    const html = mount({ invitations: [] }).render()
    const text = read(html)
    expect(text).toContain("Create your workspace A workspace is where your team’s Requests live. You can invite people next.")
    expect(text).toContain("Expecting an invitation? Ask an Admin to invite sam@example.test. It shows up here.")
    expect(names(html)).toEqual(["Sign out", "Create workspace"])
  })

  it("says the person is no longer in the workspace they were removed from, and that their work stays", () => {
    const text = read(mount({ invitations: [], removedFrom: "Acme Design" }).render())
    expect(text).toContain("You’re no longer in Acme Design An Admin removed you. Your Requests and comments stay in that workspace.")
    expect(read(mount({ invitations: [] }).render())).not.toContain("no longer in")
  })

  it("keeps Sign out in the header", () => {
    const html = mount().render()
    expect(html).toMatch(/<header[^>]*>[\s\S]*<button type="button">Sign out<\/button>[\s\S]*<\/header>/)
  })

  it("names every role with Lane's name, never Better Auth's key", () => {
    for (const role of WORKSPACE_ROLES) {
      const text = read(mount({ invitations: [{ ...invitations[0], role }] }).render())
      expect(text).toContain(`Priya Shah invited you as ${role === "admin" ? "an" : "a"} ${ROLE_NAMES[role]}`)
      expect(text).not.toMatch(new RegExp(`\\b${role}\\b`))
    }
  })

  it("names the workspace field for password managers, and reports problems in Lane's words, not the browser's", () => {
    const html = mount().render()
    expect(nameInput(html)).toMatch(/autoComplete="organization"/)
    expect(html).toMatch(/<form[^>]*noValidate=""/)
  })

  it("says an empty name on the field", async () => {
    const onCreate = vi.fn(done)
    const { flow, render } = mount({ onCreate })
    await flow.create("  ")
    const html = render()
    expect(nameInput(html)).toContain('aria-invalid="true"')
    expect(nameInput(html)).toContain('aria-describedby="onboarding-workspace-name-error"')
    expect(html).toMatch(/id="onboarding-workspace-name-error"[^>]*role="alert"/)
    expect(read(html)).toContain("Name your workspace.")
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("shows a refused Create's line under the form, in a box focus can reach", async () => {
    const { flow, render } = mount({ onCreate: async () => ({ error: "UNAUTHORIZED" }) })
    await flow.create("Acme Design")
    const html = render()
    expect(html).toMatch(/id="onboarding-create-alert"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="onboarding-create-alert"/i)
    expect(read(html)).toContain("You’re signed out. Sign in, then try again.")
  })

  it("shows a Join refused for a full workspace in the invitation page's words, in a box focus can reach", async () => {
    const { flow, render } = mount({ onJoin: async () => ({ error: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" }) })
    await flow.join("inv_1")
    const html = render()
    expect(html).toMatch(/id="onboarding-join-alert"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="onboarding-join-alert"/i)
    expect(read(html)).toContain("Acme Design is full A workspace holds up to 100 people. Ask an Admin of Acme Design to make room, then try again.")
  })

  it("shows a Join refused for a gone invitation in the invitation page's words", async () => {
    const { flow, render } = mount({ onJoin: async () => ({ error: "INVITATION_NOT_FOUND" }) })
    await flow.join("inv_2")
    expect(read(render())).toContain("This invitation can’t be used This invitation has expired or is no longer open. Ask the person who invited you to send a new one.")
  })

  it("never says owner", () => {
    expect(markupWords(mount({ removedFrom: "Acme Design" }).render())).not.toMatch(/owner/i)
  })
})

describe("what the workspace step leaves alone (#379)", () => {
  it("doesn't import the browser auth client", () => {
    const source = readFileSync("src/components/auth/better-auth/onboarding-view.tsx", "utf8") + readFileSync("src/components/auth/better-auth/onboarding-flow.ts", "utf8")
    expect(source).not.toMatch(/auth-client|\.\/sign-out"/)
  })
})
