import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const anthropic = createAnthropic({
  baseURL: "https://api.anthropic.com/v1",
});

/**
 * MVP triage schema — trimmed from the archive version per SALVAGE.md.
 * Keeps: classification, reframedProblem, extractedSolution, qualityScore,
 * qualityFlags, suggestions. Drops: priority, complexity, requestType,
 * potentialDuplicates (add back later if anyone asks).
 */
const triageSchema = z.object({
  classification: z
    .enum(["problem", "solution", "hybrid"])
    .describe(
      "problem = describes a user problem or business gap without prescribing UI. " +
        "solution = prescribes UI/implementation without explaining the underlying problem. " +
        "hybrid = contains both a clear problem AND a proposed solution."
    ),
  reframedProblem: z
    .string()
    .nullable()
    .describe(
      "If solution or hybrid, extract and rephrase the underlying problem as a clear " +
        "problem statement the team can rally around. Null if already problem-framed."
    ),
  extractedSolution: z
    .string()
    .nullable()
    .describe(
      "If hybrid, preserve the solution the requester proposed (verbatim or lightly cleaned). " +
        "Null for problem and solution classifications."
    ),
  qualityScore: z
    .number()
    .describe("Integer 0-100. How well-specified is this request? 0=unusable, 50=needs work, 80+=good"),
  qualityFlags: z
    .array(z.string())
    .describe("Specific issues, e.g. 'No success criteria', 'Missing user context'"),
  suggestions: z
    .array(z.string())
    .describe("Concrete suggestions to improve the request before it's picked up"),
});

export type TriageResult = z.infer<typeof triageSchema>;

export async function triageRequest(input: {
  title: string;
  description: string;
}): Promise<TriageResult> {
  const { output } = await generateText({
    model: anthropic("claude-haiku-4-5"),
    output: Output.object({
      schema: triageSchema,
    }),
    prompt: `You are a senior design operations lead at a product company. A teammate just submitted a design request. Analyze it and return structured triage data.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}
---

CLASSIFICATION — This is the most important part. Classify the request as:

- "problem": Describes a user problem, business gap, or pain point WITHOUT prescribing specific UI elements or implementation details.
  Signals: mentions user behavior, references data or metrics, asks "why", identifies a pain point or unmet need.

- "solution": Prescribes UI changes or implementation details WITHOUT explaining the underlying problem.
  Signals: names specific UI elements without problem context ("add a dropdown", "change the color to blue"), describes implementation ("make it like Stripe"), starts with "Can we add..." + UI change.

- "hybrid": Contains BOTH a clear problem AND a proposed solution.

If "solution" or "hybrid": extract and rephrase the underlying problem as a clear, empathetic problem statement in reframedProblem. Write it as if you're helping the team understand what user need is really being addressed.

If "hybrid": also preserve the requester's proposed solution in extractedSolution (lightly cleaned up).

For "problem": reframedProblem and extractedSolution should both be null.

Be generous with your quality assessment — a short but clear request can score well.`,
  });

  if (!output) {
    throw new Error("AI triage returned no structured output");
  }

  // Clamp numeric values (AI may exceed ranges)
  const qualityScore = Math.max(0, Math.min(100, Math.round(output.qualityScore)));

  return { ...output, qualityScore };
}
