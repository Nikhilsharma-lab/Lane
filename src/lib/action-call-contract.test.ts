import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(process.cwd(), "src")

/** Callers that hand the action to a component which sends it through callAction or the optimistic runner. */
const PASSED_ON: Record<string, string> = {
  "app/(app)/settings/profile/profile-form.tsx": "ProfileRoleForm saves through callAction or useOptimisticAction",
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__mocks__" || name === "stories" ? [] : sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Every call of an imported server action, with its line. */
function actionCalls(source: string) {
  const names = [...source.matchAll(/import\s+\{([^}]*)\}\s+from\s+"[^"]*actions"/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith("type "))
    .map((name) => name.split(" as ").at(-1)!.trim())
  const namespaces = [...source.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+"[^"]*actions"/g)].map((match) => `${match[1]}\\.\\w+`)
  const lines = source.split("\n")
  return [...names, ...namespaces].flatMap((name) =>
    lines.flatMap((line, index) => new RegExp(`(?<![\\w.])${name}\\(`).test(line) && !/^\s*import\b/.test(line) ? [{ line: index + 1, text: line.trim() }] : []))
}

describe("server action calls", () => {
  it("go through callAction or the optimistic runner, so a lapsed session is refreshed first", () => {
    const direct = sources(ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      const file = relative(ROOT, path)
      if (source.trimStart().startsWith('"use server"') || PASSED_ON[file]) return []
      return actionCalls(source)
        .filter(({ text }) => !text.includes("callAction(() =>") && !text.includes("run: () =>"))
        .map(({ line, text }) => `${file}:${line}: ${text}`)
    })
    expect(direct).toEqual([])
  })
})
