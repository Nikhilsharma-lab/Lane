import { describe, expect, it } from "vitest"
import { copyProblems, laneCopyProblems } from "./copy-check"

// A component as a builder might write it: two broken strings people would read, and the same words in places
// nobody reads (a comment, a log line, an import), which the check leaves alone.
const FIXTURE = `import { toast } from "@/components/arc/toast"
// Could not — this comment is for the next builder, not for people.
export function SaveButton() {
  const failed = () => toast({ type: "error", title: "Could not save" })
  console.error("Could not reach the server — retrying")
  return <button onClick={failed}>Save — now</button>
}
`

describe("the copy check", () => {
  it("fails a component with \"Could not\" and an em dash in what people read", () => {
    expect(copyProblems("save-button.tsx", FIXTURE)).toEqual([
      { file: "save-button.tsx", line: 4, text: "Could not save", rule: "Write \"Couldn't\", not \"Could not\"" },
      { file: "save-button.tsx", line: 6, text: "Save — now", rule: "No em dashes" },
    ])
  })

  it("fails the other words the polish bar rules out", () => {
    const source = `export const a = "Released on 3 Mar (UTC)"\nexport const b = \`Actual exposure date\`\nexport const c = "we could not load it"\nexport const d = "Recording ends Undo Done"\n`
    expect(copyProblems("words.ts", source).map(problem => [problem.line, problem.rule])).toEqual([
      [1, "No \"(UTC)\""],
      [2, "No \"exposure\""],
      [3, "Write \"Couldn't\", not \"Could not\""],
      [4, "No \"Undo Done\""],
    ])
  })

  it("passes every user-facing string in Lane", () => {
    const problems = laneCopyProblems()
    expect(problems.map(problem => `${problem.file}:${problem.line} ${problem.rule}: ${problem.text}`)).toEqual([])
  })
})
