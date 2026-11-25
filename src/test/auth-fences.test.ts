/**
 * What lint keeps apart around sign-in: Lane's browser auth client (#377, #388), the session read (#387), Better
 * Auth's server and its door (#371, #389), Clerk (#398) and testUtils (#399). Each case lints a one-line file at a path, with the repo's own ESLint config.
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
    "src/app/(app)/layout.tsx",
    "src/app/(auth)/signed-out-screens.test.ts",
    "src/app/api/auth/[...all]/route.ts",
    "src/components/settings/profile-account.tsx",
    "src/components/settings/profile-account.test.ts",
    "src/lib/session.ts",
    "src/components/shell/sidebar.tsx",
    "src/components/shell/workspace-frame.tsx",
    "src/components/popup/adaptive-dialog.tsx",
  ])("refuses it in %s", async (filePath) => {
    expect((await refusals(filePath, importing(CLIENT))).join("\n")).toContain("browser auth client")
  })

  it("refuses loading it with import()", async () => {
    expect((await refusals("src/components/settings/profile-account.tsx", loading(CLIENT))).join("\n")).toContain("browser auth client")
  })

  it.each([
    "src/components/auth/better-auth/auth-form.tsx",
    "src/components/auth/better-auth/sign-in-flow.ts",
    "src/components/auth/better-auth/sign-in-flow.test.ts",
    "src/components/auth/better-auth/sign-up-flow.ts",
    "src/components/auth/better-auth/sign-up-form.tsx",
    "src/components/auth/better-auth/password-reset-flow.ts",
    "src/components/auth/better-auth/password-reset-form.test.ts",
    // #379: the invitation page's controller and Onboarding's header Sign out.
    "src/components/auth/better-auth/invitation-flow.ts",
    "src/components/auth/better-auth/sign-out.tsx",
    // #389: the app frame's session request.
    "src/components/shell/session-keeper.ts",
    // #394: Settings → Profile's account calls.
    "src/components/settings/account-calls.ts",
    // #388: the files that mount them.
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/reset-password/page.tsx",
  ])("lets the auth screens, their tests and the files that mount them use it: %s", async (filePath) => {
    expect(await refusals(filePath, importing(CLIENT))).toEqual([])
  })

  it.each([
    "src/components/auth/better-auth/auth-form.tsx",
    "src/app/(auth)/login/page.tsx",
  ])("keeps the other fences on %s: Better Auth's server, Next's Link, Arc's dialog", async (screen) => {
    expect(await refusals(screen, importing("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(screen, importing("next/link"))).not.toEqual([])
    expect(await refusals(screen, importing("@/components/arc/dialog/dialog"))).not.toEqual([])
    expect(await refusals("src/components/auth/better-auth/auth-form.test.ts", importing("better-auth/plugins"))).not.toEqual([])
  })
})

describe("the session read's fence (#387)", () => {
  const READ = "@/lib/better-auth-session"

  it("lets the session seam import it, by name", async () => {
    expect(await refusals("src/lib/session.ts", importing("./better-auth-session"))).toEqual([])
    expect(await refusals("src/lib/session.ts", importing(READ))).toEqual([])
  })

  it.each([
    "src/lib/auth-guard.ts",
    "src/lib/ensure-workspace.ts",
    "src/lib/session.test.ts",
    "src/proxy.ts",
    "src/app/(app)/layout.tsx",
    "src/app/(auth)/onboarding/actions.ts",
    "src/components/auth/better-auth/auth-form.tsx",
    "src/components/shell/command-palette.tsx",
  ])("refuses it in %s", async (filePath) => {
    expect((await refusals(filePath, importing(READ))).join("\n")).toContain("Only the session seam")
    expect((await refusals(filePath, loading(READ))).join("\n")).toContain("Only the session seam")
  })

  it("lets the seam import nothing else that was refused", async () => {
    const seam = "src/lib/session.ts"
    expect(await refusals(seam, importing("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(seam, importing("better-auth/plugins"))).not.toEqual([])
    expect(await refusals(seam, loading("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(seam, loading(READ))).not.toEqual([])
    expect(await refusals(seam, importing("next/link"))).not.toEqual([])
  })
})

describe("the server door's fence (#389)", () => {
  const ACTION = "src/app/(app)/workspace-actions.ts"
  const ACTIONS = [ACTION, "src/app/(app)/settings/members/actions.ts", "src/app/(auth)/onboarding/actions.ts", "src/app/(app)/settings/profile/account-actions.ts", "src/app/(app)/settings/workspace-actions.ts"]
  const door = `import { askAuthServer as imported } from "@/lib/auth-server"`

  it.each(ACTIONS)("lets a named Server Action import the door: %s", async (filePath) => {
    expect(await refusals(filePath, door)).toEqual([])
  })

  it.each([
    "src/app/(app)/settings/metrics/actions.ts",
    "src/app/(app)/saved-view-actions.ts",
    "src/app/(app)/layout.tsx",
    "src/app/(auth)/onboarding/page.tsx",
    "src/app/(app)/workspace-actions.test.ts",
    "src/components/shell/sidebar.tsx",
    "src/lib/auth-guard.ts",
  ])("refuses it in %s", async (filePath) => {
    expect((await refusals(filePath, door)).join("\n")).toContain("AUTH_SERVER_DOOR_FILES")
    expect((await refusals(filePath, loading("@/lib/auth-server"))).join("\n")).toContain("AUTH_SERVER_DOOR_FILES")
  })

  it("lets the route tests' browser import it too, and no other test helper", async () => {
    expect(await refusals("src/test/auth-route-browser.ts", door)).toEqual([])
    expect(await refusals("src/test/member-fixtures.ts", door)).not.toEqual([])
  })

  it("lets that action import nothing else that was refused", async () => {
    expect(await refusals(ACTION, `import { handleAuthRequest as imported } from "@/lib/auth-server"`)).not.toEqual([])
    expect(await refusals(ACTION, importing("@/lib/auth-server"))).not.toEqual([])
    for (const path of ["better-auth", "better-auth/plugins", "@/lib/better-auth-session", CLIENT, "next/link", "@/components/arc/dialog/dialog"])
      expect(await refusals(ACTION, importing(path)), path).not.toEqual([])
    for (const path of ["@/lib/auth-server", "better-auth/plugins", CLIENT]) expect(await refusals(ACTION, loading(path)), path).not.toEqual([])
  })
})

describe("Clerk's fence (#398)", () => {
  // One file under each block of the lint config, so no block's options drop the rule.
  it.each([
    "src/app/layout.tsx",
    "src/app/(app)/settings/profile/page.tsx",
    "src/app/(app)/workspace-actions.ts",
    "src/app/(app)/workspace-actions.test.ts",
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/signed-out-screens.test.ts",
    "src/app/api/auth/[...all]/route.ts",
    "src/components/arc/user-menu/user-menu.tsx",
    "src/components/auth/better-auth/auth-form.tsx",
    "src/components/auth/better-auth/auth-form.test.ts",
    "src/components/popup/adaptive-dialog.tsx",
    "src/components/requests/use-optimistic-action.ts",
    "src/components/shell/command-palette.tsx",
    "src/components/shell/session-keeper.ts",
    "src/components/shell/stable-router.tsx",
    "src/components/settings/account-calls.ts",
    "src/lib/auth-server.ts",
    "src/lib/better-auth-session.ts",
    "src/lib/billing.ts",
    "src/lib/session.ts",
    "src/lib/session.test.ts",
    "src/proxy.ts",
    "src/test/e2e-safety.test.ts",
  ])("refuses every Clerk package in %s", async (filePath) => {
    for (const path of ["@clerk/nextjs", "@clerk/nextjs/server", "@clerk/ui", "@clerk/testing/playwright"]) {
      expect((await refusals(filePath, importing(path))).join("\n"), path).toContain("Clerk is out of the app")
      expect((await refusals(filePath, loading(path))).join("\n"), path).toContain("Clerk is out of the app")
    }
    expect((await refusals(filePath, `import type { LocalizationResource } from "@clerk/nextjs/types"; const imported = 1 as unknown as LocalizationResource`)).join("\n")).toContain("Clerk is out of the app")
    expect((await refusals(filePath, `export { auth } from "@clerk/nextjs/server"; const imported = 1`)).join("\n")).toContain("Clerk is out of the app")
  })
})

describe("testUtils' fence (#399)", () => {
  // One file under each block of the lint config that sets the rule, so no block's options drop it.
  it.each([
    "src/app/layout.tsx",
    "src/app/(app)/workspace-actions.ts",
    "src/app/api/auth/[...all]/route.ts",
    "src/app/api/auth/[...all]/auth-route.test.ts",
    "src/components/auth/better-auth/auth-form.tsx",
    "src/components/requests/use-optimistic-action.ts",
    "src/components/shell/stable-router.tsx",
    "src/lib/auth-server.ts",
    "src/lib/better-auth-session.ts",
    "src/lib/session.ts",
    "src/test/auth-route-browser.ts",
    "src/test/e2e-fixtures.test.ts",
  ])("refuses Better Auth's testUtils however %s reaches it", async (filePath) => {
    for (const source of [
      `import { testUtils as imported } from "better-auth/plugins"`,
      `import * as plugins from "better-auth/plugins"; const imported = plugins.testUtils()`,
      `const imported = (await import("better-auth/plugins")).testUtils()`,
      `const { testUtils: imported } = await import("better-auth/plugins")`,
      `export { testUtils } from "better-auth/plugins"; const imported = 1`,
      `import * as plugins from "better-auth/plugins"; const imported = plugins["testUtils"]`,
    ]) expect((await refusals(filePath, source)).join("\n"), source).toContain("test powers")
  })

  it("leaves the server module's own plugins alone", async () => {
    expect(await refusals("src/lib/auth-server.ts", `import { organization as imported } from "better-auth/plugins"`)).toEqual([])
  })
})

describe("the auth screens' mount (#388)", () => {
  it.each([
    ["src/app/(auth)/login/page.tsx", SCREEN],
    ["src/app/(auth)/forgot-password/page.tsx", "@/components/auth/better-auth/password-reset-form"],
    ["src/app/(auth)/onboarding/page.tsx", "@/components/auth/better-auth/onboarding-view"],
    ["src/app/(auth)/invite/[id]/invitation-screen.tsx", "@/components/auth/better-auth/invitation-view"],
    ["src/app/(auth)/signed-out-screens.test.ts", SCREEN],
  ])("lets %s import %s", async (filePath, screen) => {
    expect(await refusals(filePath, importing(screen))).toEqual([])
    expect(await refusals(filePath, loading(screen))).toEqual([])
  })

  it("keeps the app's other fences: Next's Link, Arc's dialog, Better Auth's server", async () => {
    const page = "src/app/(auth)/login/page.tsx"
    expect(await refusals(page, importing("next/link"))).not.toEqual([])
    expect(await refusals(page, importing("@/components/arc/dialog/dialog"))).not.toEqual([])
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

  it("imports, loads and mocks nothing of Clerk's, tests included", () => {
    const naming = sources().filter((path) => /(from|import|import\(|require\(|[mM]ock\(|importActual\(|typeof import\()\s*["'`]@clerk\//.test(readFileSync(path, "utf8")))
    expect(naming.filter((path) => !path.endsWith("auth-fences.test.ts"))).toEqual([])
  })

  // #399: e2e's powers, the test-only Better Auth instance among them, stay out of the app. Tests may use its helpers.
  it("loads nothing from e2e", () => {
    const shipped = sources().filter((path) => !/\.test\.tsx?$/.test(path) && !path.startsWith("src/test/"))
    expect(shipped.filter((path) => /["'`](\.\.\/)+e2e\//.test(readFileSync(path, "utf8")))).toEqual([])
  })

  // #398: people show as initials. `profiles.avatar_url` stays, unread and unwritten, until increment 7.
  it("gives no Arc Avatar a person's picture, and reads and writes no avatar_url", () => {
    const schema = ["src/db/better-auth-schema.test.ts", "src/db/schema/users.ts"]
    const reading = sources().filter((path) => /avatar_?url/i.test(readFileSync(path, "utf8")))
    expect(reading.filter((path) => path !== "src/test/auth-fences.test.ts").sort()).toEqual(schema)
    const product = sources().filter((path) => !path.startsWith("src/components/arc/"))
    expect(product.filter((path) => /<Avatar\b[^>]*\ssrc=|avatarSrc/.test(readFileSync(path, "utf8"))).filter((path) => path !== "src/test/auth-fences.test.ts")).toEqual([])
  })

  // #389: the frame asks for the session, and Log out loads the sign-out; each on demand, never in the first load.
  it("loads the sign-out and the session request on demand", () => {
    expect(readFileSync("src/components/shell/sidebar.tsx", "utf8")).not.toMatch(/from ["'][^"']*(auth-client|better-auth)/)
    expect(readFileSync("src/components/shell/workspace-frame.tsx", "utf8")).toContain("useEffect(requestSessionOnceUsable, [])")
    expect(readFileSync("src/components/shell/session-request.ts", "utf8")).not.toMatch(/from ["'][^"']*session-keeper/)
  })

  it("imports the client only from the auth screens and the files that mount them, the frame's session request and Profile's account calls", () => {
    const shipped = sources().filter((path) => !/^src\/(components\/auth\/better-auth|app\/\(auth\))\//.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith("src/test/") && !["src/components/shell/session-keeper.ts", "src/components/settings/account-calls.ts"].includes(path))
    const offenders = shipped.filter((path) => /from ["'][^"']*auth-client["']|import\(["'][^"']*auth-client["']/.test(readFileSync(path, "utf8")))
    expect(offenders).toEqual([])
  })

  it("names Turnstile's script only in the widget", () => {
    const naming = sources().filter((path) => !/\.test\.tsx?$/.test(path) && readFileSync(path, "utf8").includes("challenges.cloudflare.com/turnstile/v0/api.js"))
    expect(naming).toEqual(["src/components/auth/better-auth/turnstile-widget.tsx"])
  })
})
