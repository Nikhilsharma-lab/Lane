import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const intakeClassifierSchema = z.object({
  classification: z
    .enum(["problem_framed", "solution_specific", "hybrid"])
    .describe(
      "Classification: problem_framed (describes user behavior/pain/data without prescribing solution), solution_specific (proposes UI/implementation without problem context), or hybrid (contains both a problem and a proposed solution)."
    ),
  extractedProblem: z
    .string()
    .nullable()
    .describe(
      "For hybrid classifications: rewrite the underlying user problem as a clean problem statement (1-2 sentences, no solution language). For solution_specific classifications: infer what user problem the requester likely meant and rewrite it as a problem statement. For problem_framed: null."
    ),
  extractedSolution: z
    .string()
    .nullable()
    .describe(
      "For hybrid classifications: preserve the solution the requester proposed, verbatim or lightly cleaned. For problem_framed and solution_specific: null."
    ),
  suggestedReframing: z
    .string()
    .nullable()
    .describe(
      "For solution_specific classifications: one sentence that the requester could use as-is to reframe their request as problem-first. Write it in first-person, so it can be inserted directly into a description field. For problem_framed and hybrid: null."
    ),
});

export type IntakeClassifierResult = z.infer<typeof intakeClassifierSchema>;

export async function classifyIntake(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
}): Promise<IntakeClassifierResult> {
  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: intakeClassifierSchema,
      prompt: `You are the Intake Gate for Lane, a design operations tool. Evaluate the following Request and classify it.

The three classifications are:

**problem_framed**: describes user behavior, a business gap, or a pain point without prescribing a solution. References data, metrics, research, or asks "why" something is happening.
Examples: "Users abandon at step 3 of onboarding" / "40% of merchants can't find the refund button"

**solution_specific**: proposes a UI element, implementation, or fix without problem context. Contains phrases like "add a button," "make it like Stripe," "change the color." No user problem or business metric mentioned.
Examples: "Build a date picker" / "Add a toggle to settings"

**hybrid**: contains both a problem AND a proposed solution. The problem should be extracted, the solution flagged for reframing.
Examples: "Users can't pick dates easily, so build a date picker"

Rules for the other fields:

- If classification is **problem_framed**: extractedProblem, extractedSolution, and suggestedReframing are all null.
- If classification is **solution_specific**: extractedProblem is a problem statement you infer the requester likely meant. extractedSolution is null (because no real problem was described, there's nothing to set aside). suggestedReframing is a one-sentence rewrite the requester could use directly as a replacement description.
- If classification is **hybrid**: extractedProblem is the cleaned problem from the request. extractedSolution is the proposed solution preserved. suggestedReframing is null (the hybrid panel uses extractedProblem as the "Submit with extracted problem" option).

Be decisive. One classification word. If a request has even a hint of solution-language without a real user problem or data, classify it solution_specific.

---

REQUEST TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}`,
    });
    return object;
  } catch (err) {
    console.error("[intake-classifier] AI error:", err);
    throw err;
  }
}
