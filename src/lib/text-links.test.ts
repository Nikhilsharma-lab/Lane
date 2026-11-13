import { describe, expect, it } from "vitest"
import { linkSegments } from "./text-links"

// #281 (B21): web addresses in a Request's description, its comments and its release evidence become links, the way
// Quarter notes already show them (#209).
describe("Web addresses in plain text", () => {
  it("turns an http or https address into a link and keeps the words around it", () => {
    expect(linkSegments("Logs at https://logs.example.test/run/42 and http://old.example.test too")).toEqual([
      { kind: "text", text: "Logs at " },
      { kind: "link", href: "https://logs.example.test/run/42" },
      { kind: "text", text: " and " },
      { kind: "link", href: "http://old.example.test" },
      { kind: "text", text: " too" },
    ])
  })

  it("leaves a sentence's closing punctuation out of the link", () => {
    expect(linkSegments("See https://example.test/a.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", href: "https://example.test/a" },
      { kind: "text", text: "." },
    ])
    expect(linkSegments("(https://example.test/b), then")).toEqual([
      { kind: "text", text: "(" },
      { kind: "link", href: "https://example.test/b" },
      { kind: "text", text: "), then" },
    ])
  })

  it("keeps line breaks in the text between links", () => {
    expect(linkSegments("First https://a.example.test\nSecond")).toEqual([
      { kind: "text", text: "First " },
      { kind: "link", href: "https://a.example.test" },
      { kind: "text", text: "\nSecond" },
    ])
  })

  it("links nothing that isn't an http or https address", () => {
    expect(linkSegments("javascript:alert(1) mailto:a@b.test www.example.test ftp://example.test")).toEqual([
      { kind: "text", text: "javascript:alert(1) mailto:a@b.test www.example.test ftp://example.test" },
    ])
    expect(linkSegments("")).toEqual([])
  })
})
