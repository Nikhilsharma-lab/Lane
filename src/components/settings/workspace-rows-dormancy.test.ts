import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

/**
 * #381 (#376 story 99): no route, page or layout imports the dormant workspace rows, statically or through a dynamic
 * import, until increment 5 mounts them. The lint rule in eslint.config.mjs says so; these cases prove it.
 */
const eslint = new ESLint({ cwd: process.cwd() })
const refusals = async (source: string, filePath: string) => {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.filter(message => message.ruleId === "no-restricted-imports" || message.ruleId === "no-restricted-syntax").map(message => message.message)
}

const ROWS = ["@/components/settings/workspace-name-row", "@/components/settings/leave-workspace-row"]
const APP_FILES = ["src/app/(app)/settings/profile/page.tsx", "src/app/(app)/layout.tsx", "src/app/(app)/settings/members/members-panel.tsx", "src/app/(auth)/onboarding/page.tsx"]

describe("The dormant workspace rows (#381)", () => {
  it("can't be imported by anything under the app directory, statically or dynamically", async () => {
    for (const filePath of APP_FILES) for (const row of ROWS) {
      for (const source of [`import * as row from "${row}"\nexport const kept = row\n`, `export const later = () => import("${row}")\n`]) {
        const found = await refusals(source, filePath)
        expect([filePath, source, found]).toEqual([filePath, source, [expect.stringContaining("dormant")]])
      }
    }
  }, 60_000)

  it("can be imported by Settings' own components and tests", async () => {
    for (const filePath of ["src/components/settings/settings-command-adapter.tsx", "src/components/settings/workspace-name-row.test.ts"])
      for (const row of ROWS) expect(await refusals(`import * as row from "${row}"\nexport const kept = row\n`, filePath)).toEqual([])
  }, 60_000)

  it("keeps the app directory's other import rules, and the auth route's own allowance", async () => {
    const page = "src/app/(app)/settings/profile/page.tsx"
    for (const source of [
      `import Link from "next/link"\nexport const kept = Link\n`,
      `import { Dialog } from "@/components/arc/dialog/dialog"\nexport const kept = Dialog\n`,
      `import { auth } from "@clerk/nextjs/server"\nexport const kept = auth\n`,
      `import { betterAuthServer } from "@/lib/auth-server"\nexport const kept = betterAuthServer\n`,
    ]) expect([source, (await refusals(source, page)).length]).toEqual([source, 1])
    expect(await refusals(`export const later = () => import("@clerk/nextjs/server")\n`, page)).toEqual([expect.stringContaining("#356")])
    expect(await refusals(`import { betterAuthServer } from "@/lib/auth-server"\nexport const kept = betterAuthServer\n`, "src/app/api/auth/[...all]/route.ts")).toEqual([])
  }, 60_000)
})
