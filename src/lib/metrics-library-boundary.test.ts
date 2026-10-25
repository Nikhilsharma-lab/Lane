import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// #196: every part of Lane reads Metric definitions only through the metrics library module.
const ROOT = join(process.cwd(), "src")
const TABLES = /\b(metricDefinitions|metricDefinitionHistory|metric_definitions|metric_definition_history)\b/

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "migrations" ? [] : sources(path)
    return /\.(tsx?|sql)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe("The Metrics library boundary", () => {
  it("leaves the definition tables to the metrics library module and their schema", () => {
    const naming = sources(ROOT).filter((file) => TABLES.test(readFileSync(file, "utf8"))).map((file) => relative(ROOT, file)).sort()
    expect(naming).toEqual(["db/schema/metric-definitions.ts", "lib/metrics-library.ts"])
  })
})
