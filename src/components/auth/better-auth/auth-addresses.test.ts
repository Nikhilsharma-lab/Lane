import { describe, expect, it } from "vitest"

import { signInPage, signUpPage } from "./auth-addresses"

describe("the sign-in and sign-up addresses", () => {
  it("are the bare page, carrying a return address other than /", () => {
    expect(signInPage(undefined, "/")).toBe("/login")
    expect(signInPage(undefined, "/invite/inv_123?from=email")).toBe("/login?redirect_url=%2Finvite%2Finv_123%3Ffrom%3Demail")
    expect(signUpPage(undefined, "/invite/inv_123")).toBe("/signup?redirect_url=%2Finvite%2Finv_123")
  })

  it("drop an unsafe return address", () => {
    expect(signInPage(undefined, "https://x")).toBe("/login")
  })

  it("carry the typed email, trimmed, and leave out an empty one", () => {
    expect(signUpPage(" ada@acme.test ", "/invite/inv_1")).toBe("/signup?email=ada%40acme.test&redirect_url=%2Finvite%2Finv_1")
    expect(signInPage("  ")).toBe("/login")
  })

  it("can open sign-in at the code request", () => {
    expect(signInPage("sam@example.test", "/invite/inv_1", "code-request"))
      .toBe("/login?email=sam%40example.test&redirect_url=%2Finvite%2Finv_1&start=code-request")
    expect(signInPage("sam@example.test", undefined, "password")).toBe("/login?email=sam%40example.test")
  })
})
