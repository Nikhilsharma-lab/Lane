import { describe, expect, it } from "vitest"

import { safeReturnAddress, signInAddress } from "./auth-return-address"

describe("the return address after sign-in (#377)", () => {
  it("keeps a path within Lane, with its query and fragment", () => {
    expect(safeReturnAddress("/requests")).toBe("/requests")
    expect(safeReturnAddress("/invite/inv_123?from=email#accept")).toBe("/invite/inv_123?from=email#accept")
    expect(safeReturnAddress("/")).toBe("/")
  })

  it("uses / for another site", () => {
    expect(safeReturnAddress("https://x")).toBe("/")
    expect(safeReturnAddress("http://lane.example/requests")).toBe("/")
  })

  it("uses / for a protocol-relative address", () => {
    expect(safeReturnAddress("//x")).toBe("/")
  })

  it("uses / for a backslash the browser reads as a second slash", () => {
    expect(safeReturnAddress("/\\x")).toBe("/")
  })

  it("uses / for a script address", () => {
    expect(safeReturnAddress("javascript:alert(1)")).toBe("/")
  })

  it("uses / for a tab or line break the browser would drop to make //", () => {
    expect(safeReturnAddress("/\t/x")).toBe("/")
    expect(safeReturnAddress("/\n/x")).toBe("/")
  })

  it("uses / for nothing, or a path that doesn't start with /", () => {
    expect(safeReturnAddress(undefined)).toBe("/")
    expect(safeReturnAddress(null)).toBe("/")
    expect(safeReturnAddress("")).toBe("/")
    expect(safeReturnAddress("requests")).toBe("/")
    expect(safeReturnAddress(" /requests")).toBe("/")
  })
})

describe("the sign-in screen's own address", () => {
  it("is /login, carrying a return address other than /", () => {
    expect(signInAddress("/")).toBe("/login")
    expect(signInAddress("/invite/inv_123?from=email")).toBe("/login?redirect_url=%2Finvite%2Finv_123%3Ffrom%3Demail")
  })

  it("drops an unsafe return address", () => {
    expect(signInAddress("https://x")).toBe("/login")
  })
})
