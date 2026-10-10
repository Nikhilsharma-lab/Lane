import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Storybook swaps every sb.mock(import("…")) module for its __mocks__/<basename> sibling.
// A production export missing from that sibling only fails when a story first calls it
// (9ac2684 shipped setRequestPriority and undoMarkDone without their mocks). The real
// modules are "use server" and open the database, so exports are read from source text
// and nothing here imports them.

const root = path.resolve(__dirname, "../..")
const previewPath = path.join(root, ".storybook/preview.tsx")
const relative = (file: string) => path.relative(root, file)

function mockedModules(): string[] {
  const source = readFileSync(previewPath, "utf8")
  const calls = [...source.matchAll(/sb\.mock\(\s*import\(\s*["']([^"']+)["']\s*\)/g)]
  return calls.map(call => path.resolve(path.dirname(previewPath), call[1]))
}

// Runtime exports only: "export type" and "export interface" never reach the mock.
function valueExports(file: string): string[] {
  const source = readFileSync(file, "utf8")
  const names = new Set<string>()
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1])
  for (const match of source.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1])
  for (const match of source.matchAll(/^export\s+\{([^}]*)\}/gm)) {
    for (const raw of match[1].split(",")) {
      const entry = raw.trim()
      if (!entry || entry.startsWith("type ")) continue
      names.add(entry.split(/\s+as\s+/).pop()!)
    }
  }
  return [...names].sort()
}

const modules = mockedModules()

describe("Storybook mock parity", () => {
  it("finds the sb.mock calls in .storybook/preview.tsx", () => {
    expect(modules.length, "no sb.mock(import(\"…\")) calls matched; update the regex if preview.tsx changed shape").toBeGreaterThan(0)
  })

  it.each(modules.map(file => [relative(file), file]))("%s has a mock with every production export", (label, file) => {
    const mock = path.join(path.dirname(file), "__mocks__", path.basename(file))
    expect(existsSync(mock), `${label} is mocked in preview.tsx but ${relative(mock)} does not exist`).toBe(true)
    const real = valueExports(file)
    expect(real.length, `${label} has no runtime exports; the export regex may be out of date`).toBeGreaterThan(0)
    const provided = valueExports(mock)
    const missing = real.filter(name => !provided.includes(name))
    expect(missing, `${relative(mock)} is missing: ${missing.join(", ")}. Stories that call these will throw at runtime.`).toEqual([])
  })
})
