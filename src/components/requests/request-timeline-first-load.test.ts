import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

// Build 3: the Request page's journey module is in its first load, and its forms check nothing in the browser, so it
// names the outcome's choices and reads the release without the modules that carry zod's change schemas.
const TIMELINE = ["request-timeline.tsx", "journey-step-actions.tsx", "journey-step-form.tsx", "journey-step-details.tsx", "request-timeline-model.ts", "request-timeline-forms.tsx"]
const SCHEMA_MODULES = /^import (?!type\b)[^\n]*from "@\/lib\/(request-outcome|request-release|request-measurement)"/m

describe("the Request page's timeline", () => {
  it.each(TIMELINE)("%s imports only types from the outcome, release and measurement schemas", file => {
    expect(read(`src/components/requests/${file}`)).not.toMatch(SCHEMA_MODULES)
  })

  // #277: the Journey's forms, their checks and the date picker arrive with the popup that opens them.
  it.each(TIMELINE.filter(file => file !== "request-timeline-forms.tsx"))("%s loads the Journey's forms only with their popup", file => {
    expect(read(`src/components/requests/${file}`)).not.toMatch(/^import (?!type\b)[^\n]*from "\.\/(request-timeline-forms|release-form|journey-popup-forms)"/m)
  })

  it("keeps the outcome's plain choices free of zod", () => {
    expect(read("src/lib/request-outcome-options.ts")).not.toMatch(/^import /m)
  })
})
