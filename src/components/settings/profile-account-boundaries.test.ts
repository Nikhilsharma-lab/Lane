import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/** #380, #394: what Settings → Profile's account files load, and when. */
const folder = path.join(process.cwd(), "src/components/settings")
const source = (file: string) => readFileSync(path.join(folder, file), "utf8")
const shipped = readdirSync(folder).filter(file => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))

describe("Settings → Profile's account files", () => {
  it("import nothing of Clerk's", () => {
    const account = shipped.filter(file => /^(profile-account|signed-in-device|account-|ai-data-use)/.test(file)).map(file => path.join(folder, file))
    const page = ["account-panels.tsx", "account-actions.ts", "actions.ts", "shared-panels.ts"].map(file => path.join(process.cwd(), "src/app/(app)/settings/profile", file))
    expect(account.length).toBeGreaterThan(10)
    for (const file of [...account, ...page]) expect([file, readFileSync(file, "utf8")]).not.toEqual([file, expect.stringMatching(/["']@clerk\//)])
  })

  it("never have a view call Better Auth or the browser auth client itself", () => {
    const views = shipped.filter(file => /^(profile-account|signed-in-device)/.test(file))
    expect(views).toEqual(expect.arrayContaining(["profile-account-view.tsx", "profile-account-password.tsx", "profile-account-devices.tsx"]))
    for (const file of views) expect([file, source(file)]).not.toEqual([file, expect.stringMatching(/from "[^"]*(better-auth|auth-client)[^"]*"/)])
  })

  it("load after the page, and the browser auth client only when something is changed", () => {
    expect(source("profile-account-loader.tsx")).not.toMatch(/from "\.\//)
    expect(source("account-callbacks.ts")).not.toMatch(/from "[^"]*account-calls"/)
  })
})
