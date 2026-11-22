/**
 * #377 (spec #376 story 99): Lane's browser auth client and its new auth screens stay dormant until increment 5.
 * Lint refuses the client outside the screens and their tests, and refuses the screens from anything under the app
 * directory. Each case lints a one-line file at a path, with the repo's own ESLint config.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

const eslint = new ESLint({ cwd: process.cwd() })

/** The import rules' messages for `source` written at `filePath`. */
async function refusals(filePath: string, source: string) {
  const [result] = await eslint.lintText(`${source}\nexport const used = imported\n`, { filePath })
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports" || message.ruleId === "no-restricted-syntax").map((message) => message.message)
}
const importing = (path: string) => `import * as imported from "${path}"`
const loading = (path: string) => `const imported = await import("${path}")`

const CLIENT = "@/lib/auth-client"
const SCREEN = "@/components/auth/better-auth/auth-form"

describe("the browser auth client's fence", () => {
  it.each([
    "src/app/(auth)/login/page.tsx",
    "src/app/(app)/layout.tsx",
    "src/app/api/auth/[...all]/route.ts",
    "src/components/settings/profile-account.tsx",
    "src/components/settings/profile-account.test.ts",
    "src/lib/session.ts",
    "src/components/popup/adaptive-dialog.tsx",
  ])("refuses it in %s", async (filePath) => {
    expect((await refusals(filePath, importing(CLIENT))).join("\n")).toContain("browser auth client is dormant")
  })

  it("refuses loading it with import()", async () => {
    expect((await refusals("src/components/settings/profile-account.tsx", loading(CLIENT))).join("\n")).toContain("browser auth client is dormant")
  })

  it.each([
    "src/components/auth/better-auth/auth-form.tsx",
    "src/components/auth/better-auth/sign-in-flow.ts",
    "src/components/auth/better-auth/sign-in-flow.test.ts",
    // #379: the invitation page's controller and Onboarding's header Sign out.
    "src/components/auth/better-auth/invitation-flow.ts",
    "src/components/auth/better-auth/sign-out.tsx",
  ])("lets the new auth screens and their tests use it: %s", async (filePath) => {
    expect(await refusals(filePath, importing(CLIENT))).toEqual([])
  })

  it("keeps the other fences on the screens: Better Auth's server, Next's Link, Arc's dialog", async () => {
    const screen = "src/components/auth/better-auth/auth-form.tsx"
    expect(await refusals(screen, importing("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(screen, importing("next/link"))).not.toEqual([])
    expect(await refusals(screen, importing("@/components/arc/dialog/dialog"))).not.toEqual([])
    expect(await refusals("src/components/auth/better-auth/auth-form.test.ts", importing("better-auth/plugins"))).not.toEqual([])
  })
})

describe("the new auth screens' fence", () => {
  it.each([
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/layout.tsx",
    "src/app/invite/[id]/page.tsx",
    "src/app/(auth)/login/login.test.ts",
    "src/app/api/auth/[...all]/route.ts",
  ])("refuses a screen in %s", async (filePath) => {
    expect((await refusals(filePath, importing(SCREEN))).join("\n")).toContain("new auth screens are dormant")
  })

  // #379: the invitation page view and Onboarding's workspace step, which increment 5 mounts at /invite/[id] and
  // /onboarding.
  it.each([
    ["@/components/auth/better-auth/invitation-view", "src/app/invite/[id]/page.tsx"],
    ["@/components/auth/better-auth/onboarding-view", "src/app/(auth)/onboarding/page.tsx"],
    ["@/components/auth/better-auth/sign-out", "src/app/(auth)/onboarding/page.tsx"],
  ])("refuses %s in %s", async (view, filePath) => {
    expect((await refusals(filePath, importing(view))).join("\n")).toContain("new auth screens are dormant")
    expect((await refusals(filePath, loading(view))).join("\n")).toContain("new auth screens are dormant")
  })

  it("refuses loading a screen with import() from the app", async () => {
    expect((await refusals("src/app/(auth)/login/page.tsx", loading(SCREEN))).join("\n")).toContain("new auth screens are dormant")
  })

  it("keeps the app's other fences: Next's Link, Arc's dialog, Clerk's session, Better Auth's server", async () => {
    const page = "src/app/(auth)/login/page.tsx"
    expect(await refusals(page, importing("next/link"))).not.toEqual([])
    expect(await refusals(page, importing("@/components/arc/dialog/dialog"))).not.toEqual([])
    expect(await refusals(page, `import { auth as imported } from "@clerk/nextjs/server"`)).not.toEqual([])
    expect(await refusals(page, importing("@/lib/auth-server"))).not.toEqual([])
  })

  it("still lets the auth route use Better Auth's server", async () => {
    expect(await refusals("src/app/api/auth/[...all]/route.ts", importing("@/lib/auth-server"))).toEqual([])
  })
})

describe("what ships", () => {
  /** Every source file under src, as a path from the repo root. */
  function sources(dir = "src"): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    })
  }

  it("imports neither the client nor the new screens outside the screens' folder and the tests", () => {
    const shipped = sources().filter((path) => !path.startsWith("src/components/auth/better-auth/") && !/\.test\.tsx?$/.test(path) && !path.startsWith("src/test/"))
    const offenders = shipped.filter((path) => /from ["'][^"']*(auth-client|components\/auth\/better-auth\/)[^"']*["']|import\(["'][^"']*(auth-client|components\/auth\/better-auth\/)/.test(readFileSync(path, "utf8")))
    expect(offenders).toEqual([])
  })

  it("names Turnstile's script only in the widget", () => {
    const naming = sources().filter((path) => !/\.test\.tsx?$/.test(path) && readFileSync(path, "utf8").includes("challenges.cloudflare.com/turnstile/v0/api.js"))
    expect(naming).toEqual(["src/components/auth/better-auth/turnstile-widget.tsx"])
  })
})
