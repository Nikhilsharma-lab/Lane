/**
 * #377, #388: lint refuses Lane's browser auth client outside the auth screens, their tests and the files that mount
 * them. Each case lints a one-line file at a path, with the repo's own ESLint config.
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

  it("lets the seam import nothing else that was refused: Better Auth's server, Clerk's session", async () => {
    const seam = "src/lib/session.ts"
    expect(await refusals(seam, importing("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(seam, importing("better-auth/plugins"))).not.toEqual([])
    expect(await refusals(seam, loading("@/lib/auth-server"))).not.toEqual([])
    expect(await refusals(seam, loading(READ))).not.toEqual([])
    expect(await refusals(seam, `import { auth as imported } from "@clerk/nextjs/server"`)).not.toEqual([])
    expect(await refusals(seam, loading("@clerk/nextjs/server"))).not.toEqual([])
    expect(await refusals(seam, importing("next/link"))).not.toEqual([])
  })
})

describe("the server door's fence (#389)", () => {
  const ACTION = "src/app/(app)/workspace-actions.ts"
  const ACTIONS = [ACTION, "src/app/(auth)/onboarding/actions.ts", "src/app/(app)/settings/profile/account-actions.ts"]
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

  it("lets that action import nothing else that was refused", async () => {
    expect(await refusals(ACTION, `import { handleAuthRequest as imported } from "@/lib/auth-server"`)).not.toEqual([])
    expect(await refusals(ACTION, importing("@/lib/auth-server"))).not.toEqual([])
    for (const path of ["better-auth", "better-auth/plugins", "@/lib/better-auth-session", CLIENT, "next/link", "@/components/arc/dialog/dialog"])
      expect(await refusals(ACTION, importing(path)), path).not.toEqual([])
    for (const path of ["@/lib/auth-server", "better-auth/plugins", CLIENT]) expect(await refusals(ACTION, loading(path)), path).not.toEqual([])
    expect(await refusals(ACTION, `import { auth as imported } from "@clerk/nextjs/server"`)).not.toEqual([])
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
  it("has a session seam that imports nothing of Clerk's", () => {
    expect(readFileSync("src/lib/session.ts", "utf8")).not.toMatch(/clerk/i)
    expect(readFileSync("src/lib/better-auth-session.ts", "utf8")).not.toMatch(/clerk/i)
  })

  /** Every source file under src, as a path from the repo root. */
  function sources(dir = "src"): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    })
  }

  it("has a shell that imports nothing of Clerk's", () => {
    const shell = sources("src/components/shell").filter((path) => /["']@clerk\//.test(readFileSync(path, "utf8")))
    expect(shell).toEqual([])
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
