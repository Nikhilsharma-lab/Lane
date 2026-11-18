import { describe, expect, it } from "vitest"
import { emailAddressProblem } from "./email-address-rules"

/** #288 (D27) and #290 (D11): one rule for a typed address, so the invite field and password recovery agree. */
describe("a typed email address", () => {
  it.each(["", "   "])("asks for an address when there is none (%j)", (value) => {
    expect(emailAddressProblem(value)).toBe("Enter an email address.")
  })

  it.each(["not-an-email", "name@", "two words@example.com", "person@localhost", `${"a".repeat(320)}@example.test`])("says %j isn't a valid address", (value) => {
    expect(emailAddressProblem(value)).toBe("Enter a valid email address.")
  })

  it("accepts an address, with spaces around it and in any case", () => {
    expect(emailAddressProblem("  New.Person@Example.test ")).toBeNull()
  })
})
