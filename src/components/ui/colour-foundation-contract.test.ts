import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const GLOBALS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8"
)

type Oklch = [lightness: number, chroma: number, hue: number]

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

function declarations(block: string) {
  return new Map(
    Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/g), (match) => [
      match[1],
      match[2].trim(),
    ])
  )
}

const rootBlock = GLOBALS.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]
const darkBlock = GLOBALS.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1]

if (!rootBlock || !darkBlock) {
  throw new Error("Missing Lane colour theme blocks")
}

const lightTheme = declarations(rootBlock)
const darkTheme = new Map([...lightTheme, ...declarations(darkBlock)])

function resolveOklch(
  theme: Map<string, string>,
  token: string,
  seen = new Set<string>()
): Oklch {
  if (seen.has(token)) throw new Error(`Circular colour token: ${token}`)
  seen.add(token)

  const value = theme.get(token)
  if (!value) throw new Error(`Missing colour token: ${token}`)

  const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1]
  if (alias) return resolveOklch(theme, alias, seen)

  const components = value.match(/^oklch\(([^)]+)\)$/)?.[1]
  if (!components) throw new Error(`Invalid OKLCH token: ${token}`)

  const parsed = components.trim().split(/\s+/).map(Number)
  if (parsed.length !== 3 || parsed.some(Number.isNaN)) {
    throw new Error(`Invalid OKLCH components: ${token}`)
  }
  return parsed as Oklch
}

function relativeLuminance([lightness, chroma, hue]: Oklch) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)))

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(
  theme: Map<string, string>,
  foreground: string,
  background: string
) {
  const values = [
    relativeLuminance(resolveOklch(theme, foreground)),
    relativeLuminance(resolveOklch(theme, background)),
  ].sort((a, b) => b - a)

  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe("Global colour foundation contract", () => {
  it("keeps decorative, control, focus, and readable action roles separate", () => {
    expect(lightTheme.get("border")).not.toBe(lightTheme.get("control"))
    expect(lightTheme.get("input")).toBe("var(--control)")
    expect(lightTheme.get("ring")).toBe("var(--focus)")
    expect(lightTheme.get("brand")).not.toBe(lightTheme.get("focus"))
    expect(darkTheme.get("input")).toBe("var(--control)")
    expect(darkTheme.get("ring")).toBe("var(--focus)")
  })

  it.each([
    ["Gallery Light", lightTheme],
    ["Night Studio", darkTheme],
  ])("meets the %s material and interaction contrast floors", (_, theme) => {
    expect(contrast(theme, "foreground", "background")).toBeGreaterThanOrEqual(7)
    expect(contrast(theme, "muted-foreground", "background")).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme, "control", "background")).toBeGreaterThanOrEqual(3)
    expect(contrast(theme, "focus", "background")).toBeGreaterThanOrEqual(3)
    expect(contrast(theme, "brand", "brand-soft")).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme, "disabled-foreground", "disabled")).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ["Gallery Light", lightTheme],
    ["Night Studio", darkTheme],
  ])("meets the %s semantic feedback contrast floors", (_, theme) => {
    for (const kind of ["destructive", "success", "warning", "info"]) {
      expect(contrast(theme, kind, `${kind}-soft`)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme, kind, `${kind}-icon`)).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps identity tabs theme-independent and above 8:1", () => {
    for (const tone of ["raspberry", "persimmon", "chartreuse"]) {
      expect(
        contrast(lightTheme, "identity-ink", `identity-${tone}`)
      ).toBeGreaterThanOrEqual(8)
      expect(darkTheme.get(`identity-${tone}`)).toBe(
        lightTheme.get(`identity-${tone}`)
      )
    }
  })

  it("keeps shared controls on semantic surfaces and boundaries", () => {
    const input = source("src/components/ui/input.tsx")
    const textarea = source("src/components/ui/textarea.tsx")
    const select = source("src/components/ui/select.tsx")
    const button = source("src/components/ui/button.tsx")
    const authAction = source("src/components/auth/auth-action.tsx")
    const identity = source("src/components/ui/identity-mark.tsx")

    for (const control of [input, textarea, select]) {
      expect(control).toContain("border-input")
      expect(control).toContain("bg-card")
    }

    expect(input).not.toContain("dark:bg-input/")
    expect(textarea).not.toMatch(/disabled:opacity-/)
    expect(button).not.toMatch(/disabled:opacity-/)
    expect(button).toContain("border-input bg-card")
    expect(button).toContain("bg-destructive-soft text-destructive")
    expect(button).toContain("disabled:bg-disabled disabled:text-disabled-foreground")
    expect(authAction).toContain("border-input")
    expect(identity).toContain("bg-focus")
  })
})
