import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(process.cwd(), "src")

/** Callers that hand the action to a component which sends it through callAction or the optimistic runner. */
const PASSED_ON: Record<string, string> = {
  "app/(app)/settings/profile/profile-form.tsx": "ProfileRoleForm saves through callAction or useOptimisticAction",
  "app/(app)/settings/profile/delivery-form.tsx": "InboxDeliveryForm saves through callAction",
  "app/(app)/settings/profile/slack-form.tsx": "SlackConnectionCard connects and disconnects through callAction",
  "app/(app)/settings/profile/billing-form.tsx": "BillingPlanCard starts checkout through callAction",
  "components/settings/workspace-members.tsx": "WorkspaceMembersView sends each invite, role change and revoke through callAction",
  "components/requests/request-moves.ts": "createRequestMoves (request-moves-controller.ts) runs each action through the optimistic runner",
  "components/requests/request-timeline-forms.tsx": "Each journey form saves through useJourneyChange (use-journey-change.ts), which runs it through the optimistic runner",
}

/** Whether `specifier`, imported from `file`, names a server action module ("use server"). An unresolved one counts as one. */
function isServerModule(file: string, specifier: string): boolean {
  const base = specifier.startsWith("@/") ? join(ROOT, specifier.slice(2)) : specifier.startsWith(".") ? join(dirname(file), specifier) : null
  const path = base && [".ts", ".tsx"].map((extension) => base + extension).find((candidate) => existsSync(candidate))
  return !path || /^['"]use server['"]/.test(readFileSync(path, "utf8").trimStart())
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__mocks__" || name === "stories" ? [] : sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Every call of an imported server action, with its line. */
function actionCalls(file: string, source: string) {
  const names = [...source.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']([^"']*actions)["']/g)]
    .filter((match) => isServerModule(file, match[2]))
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith("type "))
    .map((name) => name.split(" as ").at(-1)!.trim())
  const namespaces = [...source.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']*actions)["']/g)].filter((match) => isServerModule(file, match[2])).map((match) => `${match[1]}\\.\\w+`)
  const lines = source.split("\n")
  return [...names, ...namespaces].flatMap((name) =>
    lines.flatMap((line, index) => new RegExp(`(?<![\\w.])${name}\\(`).test(line) && !/^\s*import\b/.test(line) ? [{ line: index + 1, text: line.trim() }] : []))
}

describe("server action calls", () => {
  it("go through callAction or the optimistic runner, so a lapsed session is refreshed first", () => {
    const direct = sources(ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      const file = relative(ROOT, path)
      if (/^['"]use server['"]/.test(source.trimStart()) || PASSED_ON[file]) return []
      return actionCalls(path, source)
        .filter(({ text }) => !text.includes("callAction(() =>") && !text.includes("run: () =>") && !(source.includes("useJourneyChange(") && text.includes("context =>")))
        .map(({ line, text }) => `${file}:${line}: ${text}`)
    })
    expect(direct).toEqual([])
  })
})
