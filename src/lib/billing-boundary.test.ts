import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// #213: one billing module owns the Free Requests count and the plan state.
const ROOT = join(process.cwd(), "src")
const TABLES = /\b(workspaceBilling|freeRequestAllowances|workspace_billing|free_request_allowances)\b/

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "migrations" ? [] : sources(path)
    return /\.(tsx?|sql)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe("The billing boundary", () => {
  it("leaves the billing tables to the billing module and their schema", () => {
    const naming = sources(ROOT).filter((file) => TABLES.test(readFileSync(file, "utf8"))).map((file) => relative(ROOT, file)).sort()
    expect(naming).toEqual(["db/schema/billing.ts", "lib/billing.ts"])
  })
})
