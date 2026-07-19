import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { identityInitials, identityTone } from "@/lib/identity"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const IDENTITY = source("src/components/ui/identity-mark.tsx")
const IDENTITY_UTILS = source("src/lib/identity.ts")
const GLOBALS = source("src/app/globals.css")
const ROW = source("src/components/ui/row.tsx")
const DESIGN = source("DESIGN.md")
const CONSUMERS = [
  "src/app/(auth)/onboarding/onboarding-form.tsx",
  "src/app/(app)/requests-workspace.tsx",
  "src/app/(app)/settings/members/member-row.tsx",
  "src/app/(app)/settings/members/invite-row.tsx",
  "src/components/shell/notification-bell.tsx",
].map(source)

function tokenOklch(name: string) {
  const match = GLOBALS.match(
    new RegExp(`--${name}: oklch\\(([^)]+)\\)`)
  )

  if (!match) {
    throw new Error(`Missing OKLCH token: ${name}`)
  }

  return match[1].trim().split(/\s+/).map(Number) as [
    number,
    number,
    number,
  ]
}

function relativeLuminance([lightness, chroma, hue]: [
  number,
  number,
  number,
]) {
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

  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  )
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(tokenOklch(foreground))
  const backgroundLuminance = relativeLuminance(tokenOklch(background))

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe("Row and identity contract", () => {
  it("keeps initials Unicode-safe and tones deterministic", () => {
    expect(identityInitials("Nikhil Sharma")).toBe("NS")
    expect(identityInitials("李 美玲")).toBe("李美")
    expect(identityInitials("🧑🏽‍🎨 Studio")).toBe("🧑S")
    expect(identityInitials("")).toBe("")
    expect(identityTone("North Star")).toBe(identityTone("north star"))
    expect(identityTone("North Star")).toBe(identityTone(" North Star "))
  })

  it("owns deterministic identity treatment in one Base UI source", () => {
    expect(IDENTITY).toContain('from "@base-ui/react/avatar"')
    expect(IDENTITY).toContain('data-slot="identity-mark"')
    expect(IDENTITY).toContain('data-tone={unknown ? "neutral" : tone}')
    expect(IDENTITY).toContain(
      "bg-identity-raspberry text-identity-ink"
    )
    expect(IDENTITY).toContain(
      "bg-identity-persimmon text-identity-ink"
    )
    expect(IDENTITY).toContain(
      "bg-identity-chartreuse text-identity-ink"
    )
    expect(IDENTITY).not.toContain("text-warning")
    expect(IDENTITY).not.toContain("text-success")
    expect(IDENTITY).toContain("bg-muted text-muted-foreground")
    expect(IDENTITY).toContain("MailIcon")
    expect(IDENTITY_UTILS).toContain("character.codePointAt(0)")
    expect(IDENTITY_UTILS).toContain("Array.from(value)")
  })

  it("keeps every identity tab above the 8:1 contrast contract", () => {
    for (const tone of ["raspberry", "persimmon", "chartreuse"]) {
      expect(contrastRatio("identity-ink", `identity-${tone}`)).toBeGreaterThanOrEqual(
        8
      )
    }
  })

  it("locks fixed leading, flexible copy, and fixed trailing lanes", () => {
    expect(ROW).toContain('data-slot="row-leading"')
    expect(ROW).toContain('"flex w-8 shrink-0')
    expect(ROW).toContain('data-slot="row-content"')
    expect(ROW).toContain('"flex min-w-0 flex-1')
    expect(ROW).toContain('data-slot="row-actions"')
    expect(ROW).toContain('"flex shrink-0')
    expect(ROW).toContain("divide-y divide-border border-y border-border")
  })

  it("prevents existing product surfaces from rebuilding row geometry", () => {
    for (const consumer of CONSUMERS) {
      expect(consumer).toContain('from "@/components/ui/row"')
    }

    const joined = CONSUMERS.join("\n")
    expect(joined).not.toContain("const AVATAR_TONES")
    expect(joined).not.toContain("function getAvatarTone")
    expect(joined).not.toContain("rounded-full bg-muted text-xs font-medium")
  })

  it("records resilience and ownership rules in the canonical system", () => {
    expect(DESIGN).toContain("one shared row geometry")
    expect(DESIGN).toContain("fixed 32px leading lane")
    expect(DESIGN).toContain("Neutral identity treatment is reserved")
    expect(DESIGN).toContain("Long names, email addresses, CJK, RTL")
    expect(DESIGN).toContain("at least 8:1")
  })
})
