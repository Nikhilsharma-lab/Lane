import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { buttonsIn } from "@/test/exposed-markup"
import { BetterAuthSignOut, signOutThenGo } from "./sign-out"

describe("Onboarding's header Sign out through Lane's browser auth client (#379, #376 Q2)", () => {
  let auth: AuthFetchFake
  const navigate = vi.fn()
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("signs out, then goes to sign-in", async () => {
    await signOutThenGo("/login", navigate)
    expect(auth.requests.map((request) => request.path)).toEqual(["/sign-out"])
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login")
  })

  // SignOutLink turns the throw into "Couldn't sign out." with Try again.
  it("throws and stays when signing out is refused or the fetch throws", async () => {
    auth.refuse("/sign-out", 500, "INTERNAL_SERVER_ERROR")
    await expect(signOutThenGo("/login", navigate)).rejects.toThrow()
    auth.throwOn("/sign-out")
    await expect(signOutThenGo("/login", navigate)).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("renders as the header's Wrong account? Sign out", () => {
    const html = renderToStaticMarkup(createElement(BetterAuthSignOut))
    expect(html).toContain("Wrong account?")
    expect(buttonsIn(html).map((button) => button.name)).toEqual(["Sign out"])
  })
})
