import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PaletteOption } from "./command-palette-option"
import type { PaletteEntry } from "./command-palette-entries"
import { ShortcutKeys } from "./shortcut-keys"

const caps = (html: string) => [...html.matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map(match => match[1])

describe("key caps shared by the ? overlay and the palette (#101)", () => {
  it("draws every alternative, a chord as one cap per key, with 'or' between them", () => {
    const html = renderToStaticMarkup(createElement(ShortcutKeys, { keys: ["⌘ K", "Ctrl K"] }))
    expect(caps(html)).toEqual(["⌘", "K", "Ctrl", "K"])
    expect(html.match(/>or</g)).toHaveLength(1)
  })

  it("shows a palette entry's full key hint, not only its first alternative", () => {
    const entry: PaletteEntry = { id: "search", label: "Search workspace", group: "Actions", keys: ["/", "⌘ F"], action: { kind: "search" } }
    const html = renderToStaticMarkup(createElement(PaletteOption, { entry, id: "o1", index: 0, selected: false, onActive: () => {}, onChoose: () => {} }))
    expect(caps(html)).toEqual(["/", "⌘", "F"])
    expect(html).toContain('aria-keyshortcuts="/ ⌘ F"')
  })
})
