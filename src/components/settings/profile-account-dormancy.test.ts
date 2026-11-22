import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

/**
 * #380 (#376): Settings → Profile's account section stays dormant until increment 5 mounts it. Lint refuses a static or
 * dynamic import of its views from any route, page or layout under src/app, while Lane's other import rules still apply there.
 */
const eslint = new ESLint({ cwd: process.cwd() })
async function refusals(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.filter(message => message.ruleId === "no-restricted-imports" || message.ruleId === "no-restricted-syntax").map(message => message.message)
}

const VIEWS = ["profile-account-view", "profile-account-password", "profile-account-devices"]

describe("Settings → Profile's account section is dormant (#380)", () => {
  it.each([
    ["src/app/(app)/settings/profile/page.tsx", "@/components/settings/profile-account-view"],
    ["src/app/(app)/settings/layout.tsx", "@/components/settings/profile-account-password"],
    ["src/app/(app)/settings/profile/devices.tsx", "../../../../components/settings/profile-account-devices"],
    ["src/app/api/auth/[...all]/route.ts", "@/components/settings/profile-account-view"],
  ])("refuses %s importing %s, statically or dynamically", async (filePath, from) => {
    for (const source of [`import { thing } from "${from}"\nexport default thing\n`, `export const later = () => import("${from}")\n`])
      expect([source, await refusals(source, filePath)]).toEqual([source, [expect.stringMatching(/dormant until increment 5/)]])
  })

  it("keeps Lane's other import rules on the app's pages", async () => {
    const refused = await refusals(`import { Dialog } from "@/components/arc/dialog/dialog"\nexport default Dialog\n`, "src/app/(app)/settings/profile/page.tsx")
    expect(refused.join("\n")).toContain("adaptive-dialog")
  })

  it("lets Settings' own components and the views' tests import them", async () => {
    for (const filePath of ["src/components/settings/settings-command-adapter.tsx", "src/components/settings/profile-account-view.test.ts"])
      expect(await refusals(`import { thing } from "./profile-account-view"\nexport default thing\n`, filePath)).toEqual([])
  })

  it("never has a view call Better Auth or the browser auth client itself", () => {
    const folder = path.join(process.cwd(), "src/components/settings")
    const modules = readdirSync(folder).filter(file => /^(profile-account|signed-in-device).*\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
    expect(modules.map(file => file.replace(/\.tsx?$/, ""))).toEqual(expect.arrayContaining(VIEWS))
    for (const file of modules) expect([file, readFileSync(path.join(folder, file), "utf8")]).not.toEqual([file, expect.stringMatching(/from "[^"]*(better-auth|auth-client)[^"]*"/)])
  })
})
