import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Spec #101 story 12: no animation under reduced motion. Arc's Dialog keeps its layers mounted for its short exit
// fade and Radix marks them data-state="closed" meanwhile, so the palette's stylesheet is where "gone at once" lives.
const css = readFileSync(join(process.cwd(), "src/components/shell/command-palette.module.css"), "utf8")
const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ""
const rule = (selector: RegExp) => reduced.split("}").find(block => selector.test(block.split("{")[0])) ?? ""

describe("the palette under reduced motion (#106)", () => {
  it("shows both layers at full opacity from their first frame", () => {
    expect(rule(/\.dialog\[role="dialog"\](?!\[)/)).toMatch(/opacity: 1/)
    expect(rule(/\.overlay(?!\[)/)).toMatch(/opacity: 1/)
  })

  it("hides both layers the moment it closes, while Arc's exit keeps them mounted", () => {
    const closed = rule(/\[data-state="closed"\]/)
    expect(closed.split("{")[0]).toMatch(/\.dialog\[role="dialog"\]\[data-state="closed"\]/)
    expect(closed.split("{")[0]).toMatch(/\.overlay\[data-state="closed"\]/)
    expect(closed).toMatch(/visibility: hidden/)
  })
})
