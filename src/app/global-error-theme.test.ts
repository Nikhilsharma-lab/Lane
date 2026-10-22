import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// next/font is a Next build transform; global-error only reads the class names.
vi.mock("@/lib/fonts", () => ({ fontVariables: "" }))

import GlobalError from "./global-error"

type Saved = "light" | "dark" | "system" | null

/**
 * Spec #87 story 16 (#94): the crash page follows the saved light/dark setting. When the root layout fails on
 * the server, the browser receives only this page's HTML, so its inline script must mark <html> before paint.
 * This runs that script against a minimal browser: saved choice in localStorage, the OS setting in matchMedia.
 */
function paintErrorPage(saved: Saved, osDark: boolean) {
  const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} }))
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  const classes = new Set<string>()
  const attributes = new Map<string, string>()
  const root = {
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: {} as { colorScheme?: string },
  }
  const browser = {
    document: { documentElement: root },
    localStorage: { getItem: (key: string) => (key === "theme" ? saved : null) },
    window: { matchMedia: (query: string) => ({ matches: osDark && query === "(prefers-color-scheme: dark)" }) },
  }
  for (const script of scripts) {
    new Function("document", "localStorage", "window", script)(browser.document, browser.localStorage, browser.window)
  }
  return { dark: classes.has("dark"), dataTheme: attributes.get("data-theme"), colorScheme: root.style.colorScheme }
}

describe("error page theme", () => {
  it("renders dark when dark is saved, even on a light device", () => {
    expect(paintErrorPage("dark", false)).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
  })

  it("renders light when light is saved, even on a dark device", () => {
    expect(paintErrorPage("light", true)).toEqual({ dark: false, dataTheme: "light", colorScheme: "light" })
  })

  it("follows the device when system is saved or nothing is saved", () => {
    expect(paintErrorPage("system", true)).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
    expect(paintErrorPage("system", false)).toEqual({ dark: false, dataTheme: "light", colorScheme: "light" })
    expect(paintErrorPage(null, true)).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
  })
})
