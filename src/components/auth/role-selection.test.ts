import { describe, expect, it } from "vitest"
import { ROLE_OPTIONS, roleForKey } from "./role-selection"

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
