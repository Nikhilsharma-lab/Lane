import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { passedHumanCheck } from "@/test/auth-fetch-fake"

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** A document that records every element made, so a test can see whether Cloudflare's script was added. */
function recordingDocument() {
  const made: Array<{ tag: string; src?: string; onload?: () => void }> = []
  const document = {
    createElement: vi.fn((tag: string) => {
      const element = { tag } as (typeof made)[number]
      made.push(element)
      return element
    }),
    head: { append: vi.fn() },
  }
  return { document, made }
}

describe("the Turnstile widget (#377)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("loads nothing when its module loads or renders: Cloudflare's script waits for the widget's mount", async () => {
    const { document } = recordingDocument()
    vi.stubGlobal("document", document)
    const { TurnstileWidget } = await import("./turnstile-widget")
    const html = renderToStaticMarkup(createElement(TurnstileWidget, { check: passedHumanCheck().check }))
    expect(document.createElement).not.toHaveBeenCalled()
    expect(html).not.toContain("<script")
    expect(html).toContain('data-turnstile=""')
  })

  it("adds Cloudflare's script once, in explicit-render mode, and hands back its API", async () => {
    const { document, made } = recordingDocument()
    const turnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }
    vi.stubGlobal("document", document)
    vi.stubGlobal("window", {})
    const { loadTurnstile } = await import("./turnstile-widget")
    const first = loadTurnstile()
    const second = loadTurnstile()
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({ tag: "script", src: SCRIPT })
    Object.assign(globalThis.window, { turnstile })
    made[0].onload?.()
    expect(await first).toBe(turnstile)
    expect(await second).toBe(turnstile)
  })

  it("calls the loader only from the effect that runs on mount", () => {
    const source = readFileSync("src/components/auth/better-auth/turnstile-widget.tsx", "utf8")
    expect(source.match(/(?<!function )loadTurnstile\(\)/g)).toHaveLength(1)
    expect(source).toMatch(/useEffect\(\(\) => \{[^]*loadTurnstile\(\)/)
  })

  it("says the check isn't set up when there is no site key", async () => {
    const { TurnstileWidget } = await import("./turnstile-widget")
    const html = renderToStaticMarkup(createElement(TurnstileWidget, { check: passedHumanCheck(null).check }))
    expect(html).toContain("We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.")
    expect(html).not.toContain("data-turnstile")
  })
})
