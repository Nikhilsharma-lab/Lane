import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const FORM = source("src/app/(app)/requests/[id]/comment-form.tsx")
const ACTIONS = source("src/app/(app)/requests/[id]/actions.ts")

describe("Reliable comment posting contract", () => {
  it("renders pending state immediately outside a React form action", () => {
    expect(FORM).toContain("onSubmit={handleSubmit}")
    expect(FORM).not.toContain("action={handleSubmit}")
    expect(FORM).toContain('setSubmissionState("posting")')
    expect(FORM).toContain('aria-busy={pending || undefined}')
    expect(FORM).toContain("Posting…")
    expect(FORM).toContain("LoaderCircle")
  })

  it("locks duplicate button and keyboard submissions", () => {
    expect(FORM).toContain("submissionLock.current")
    expect(FORM).toContain("if (submissionLock.current || empty) return")
    expect(FORM).toContain("!submissionLock.current")
    expect(FORM).toContain("disabled={pending || empty}")
  })

  it("preserves the draft and exposes an explicit retry after failure", () => {
    expect(FORM).toContain("value={body}")
    expect(FORM).toContain("readOnly={pending}")
    expect(FORM).toContain("try {")
    expect(FORM).toContain("} catch {")
    expect(FORM).toContain("} finally {")
    expect(FORM).toContain("Your draft is still here.")
    expect(FORM).toContain('"Try again"')
  })

  it("announces progress and constrains comment input accessibly", () => {
    expect(FORM).toContain('role="status"')
    expect(FORM).toContain('aria-live="polite"')
    expect(FORM).toContain('aria-atomic="true"')
    expect(FORM).toContain("Posting comment.")
    expect(FORM).toContain("Comment posted.")
    expect(FORM).toContain("maxLength={5000}")
  })

  it("trims and validates the same limits on the server", () => {
    expect(ACTIONS).toContain(".trim()")
    expect(ACTIONS).toContain("Comment cannot be empty")
    expect(ACTIONS).toContain("Comment must be 5,000 characters or fewer")
  })
})
