import { describe, expect, it } from "vitest"
import { plainName, readName } from "./name-rules"

describe("a workspace's or person's typed name", () => {
  it.each([
    ["  Acme Design ", "Acme Design"],
    ["Zoë O’Neil-Šimková", "Zoë O’Neil-Šimková"],
    ["李小龍", "李小龍"],
    // A joiner inside an emoji or a Persian word is part of the writing.
    ["Team \u{1F469}‍\u{1F4BB}", "Team \u{1F469}‍\u{1F4BB}"],
    ["می‌خواهم", "می‌خواهم"],
    ["n".repeat(100), "n".repeat(100)],
    ["\u{1F469}".repeat(100), "\u{1F469}".repeat(100)],
  ])("takes %j trimmed", (typed, name) => {
    expect(readName(typed)).toEqual({ ok: true, name })
  })

  it.each([["nothing", ""], ["spaces", "   "], ["only invisible characters", "​⁠"], ["no string", undefined], ["an object", { name: "Acme" }]])("refuses %s", (_what, typed) => {
    expect(readName(typed)).toEqual({ ok: false })
  })

  it.each([
    ["a line break", "Acme\nDesign"],
    ["a return", "Acme\rDesign"],
    ["a tab", "Acme\tDesign"],
    ["a null", "Acme\0Design"],
    ["a Unicode line break", "Acme Design"],
    ["text that reads backwards", "Acme ‮ngiseD"],
  ])("refuses %s inside it", (_what, typed) => {
    expect(readName(typed)).toEqual({ ok: false, code: "NAME_NOT_PLAIN" })
  })

  it("refuses more than 100 characters", () => {
    expect(readName("n".repeat(101))).toEqual({ ok: false, code: "NAME_TOO_LONG" })
  })
})

describe("a stored name on one line of an email", () => {
  it.each([
    ["Priya Raman", "Priya Raman"],
    [" Priya\r\n\r\nYour account is locked:  call us ", "Priya Your account is locked: call us"],
    ["Priya‮\0 Raman", "Priya Raman"],
    ["n".repeat(500), `${"n".repeat(99)}…`],
    ["\n​\t", ""],
  ])("%j reads %j", (stored, shown) => {
    expect(plainName(stored)).toBe(shown)
  })
})
