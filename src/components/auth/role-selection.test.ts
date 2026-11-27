import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ROLE_OPTIONS, roleForKey } from "./role-selection"

vi.mock("@/app/(auth)/onboarding/actions", () => ({ saveOnboardingRole: vi.fn() }))

// Plan item 2.2: number keys pick a role on the onboarding step.
describe("role keys", () => {
  it.each([["1", "pm"], ["2", "designer"], ["3", "developer"]] as const)("%s picks %s", (key, role) => {
    expect(roleForKey(key)).toBe(role)
  })

  it.each(["4", "0", "a", "!", "Digit1", " ", ""])("ignores %j", key => {
    expect(roleForKey(key)).toBeNull()
  })

  it("numbers the roles in the order the rows are shown", () => {
    expect(ROLE_OPTIONS.map(option => [option.shortcut, option.label])).toEqual([["1", "PM"], ["2", "Designer"], ["3", "Developer"]])
  })
})

// #290 (D9, D10): the step names only its own keys, and the save errors that name a step link to it.
describe("the role step", async () => {
  const { RoleForm, roleSaveError } = await import("@/app/(auth)/onboarding/role-form")
  const html = renderToStaticMarkup(createElement(RoleForm))
  const text = html.replace(/<[^>]+>/g, "")

  it("names the 1, 2 and 3 keys, and no keys that do nothing here", () => {
    expect(text).toContain("Press 1, 2 or 3 to choose")
    expect(text).not.toMatch(/to create|to search/)
    expect([...html.matchAll(/aria-keyshortcuts="(\d)"/g)].map(match => match[1])).toEqual(["1", "2", "3"])
  })

  it("links Sign in to continue to sign-in and the workspace message to the workspace step", () => {
    expect(roleSaveError({ error: "Sign in to continue.", sessionExpired: true })).toEqual({ message: "Sign in to continue.", link: { href: "/login", label: "Sign in" } })
    expect(roleSaveError({ error: "Create or join a workspace before choosing your role.", needsWorkspace: true }))
      .toEqual({ message: "Create or join a workspace before choosing your role.", link: { href: "/onboarding", label: "Create or join a workspace" } })
    expect(roleSaveError({ error: "Choose a valid role." })).toEqual({ message: "Choose a valid role." })
  })
})
