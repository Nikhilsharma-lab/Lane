import type { z } from "zod"
import { DESCRIPTION_MAX, problemFramingSchema } from "./request-schema"

/** The Intake gate's judgement of a Request's wording. */
export type Classification = "problem" | "solution" | "hybrid"

/** Which framing a Request carries beside its own words. */
export type FramingShape = { problem: boolean; solution: boolean }

export type Framing = { reframedProblem: string | null; extractedSolution: string | null }

/**
 * The one rule for problem framing. A problem keeps the submitter's words
 * alone; a solution gains a problem to solve; a hybrid gains one and keeps the
 * submitter's suggested change. The AI result, a restored draft and every save
 * follow it.
 */
export function framingShape(classification: Classification): FramingShape {
  return { problem: classification !== "problem", solution: classification === "hybrid" }
}

const SHAPE_ISSUES: Record<Classification, string> = {
  problem: "A problem keeps its own wording, without a reframed problem or suggested change.",
  solution: "A solution needs a problem to solve and no suggested change.",
  hybrid: "A hybrid needs a problem to solve and its suggested change.",
}

/** Why `value`'s framing doesn't fit its classification, or null. */
export function framingIssue(value: Framing & { classification: Classification }): string | null {
  const shape = framingShape(value.classification)
  const fits = (value.reframedProblem !== null) === shape.problem && (value.extractedSolution !== null) === shape.solution
  return fits ? null : SHAPE_ISSUES[value.classification]
}

/** `framingIssue` as a zod refinement, for parsers of a classified result. */
export function refineFraming(value: Framing & { classification: Classification }, context: z.RefinementCtx) {
  const issue = framingIssue(value)
  if (issue) context.addIssue({ code: "custom", message: issue })
}

export const KEEP_PROBLEM = "Keep the problem to solve, or change the title or description and review again."
export const KEEP_SOLUTION = "Keep the suggested change, or change the title or description and review again."

export type SavedFraming =
  | { ok: true; framing: Framing }
  | { ok: false; field: "reframedProblem" | "extractedSolution"; message: string }

/**
 * The framing a save writes: exactly what `shape` carries, trimmed and
 * bounded, so a save can neither drop a required part nor add one the
 * judgement doesn't have. Fields the shape doesn't carry are written null.
 */
export function savedFraming(shape: FramingShape, input: Framing, missingProblem = KEEP_PROBLEM): SavedFraming {
  let reframedProblem: string | null = null
  let extractedSolution: string | null = null
  if (shape.problem) {
    if (!input.reframedProblem?.trim()) return { ok: false, field: "reframedProblem", message: missingProblem }
    const parsed = problemFramingSchema.safeParse(input.reframedProblem)
    if (!parsed.success) return { ok: false, field: "reframedProblem", message: parsed.error.issues[0].message }
    reframedProblem = parsed.data
  }
  if (shape.solution) {
    const solution = input.extractedSolution?.trim()
    if (!solution) return { ok: false, field: "extractedSolution", message: KEEP_SOLUTION }
    if (solution.length > DESCRIPTION_MAX) return { ok: false, field: "extractedSolution", message: `Keep the suggested change under ${DESCRIPTION_MAX} characters.` }
    extractedSolution = solution
  }
  return { ok: true, framing: { reframedProblem, extractedSolution } }
}

/**
 * The shape an edit keeps when its title and description are unchanged: its
 * classification's, or for an older unclassified Request, the parts it
 * already has.
 */
export function storedShape(stored: Framing & { classification: Classification | null }): FramingShape {
  return stored.classification
    ? framingShape(stored.classification)
    : { problem: stored.reframedProblem !== null, solution: stored.extractedSolution !== null }
}
