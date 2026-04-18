// lib/ai/handoff-brief.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const handoffBriefSchema = z.object({
  designDecisions: z
    .array(
      z.object({
        decision: z.string().describe("The specific design choice made"),
        rationale: z.string().describe("Why this choice was made"),
      }),
    )
    .describe(
      "2-4 key design decisions. Prioritize entries from the decision log if provided — those are authoritative. Otherwise extract from the design journey or comments.",
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      "2-4 things that are NOT fully resolved that the engineer should flag back to the designer. Examples: placeholder copy, unspecified edge case behavior, unclear responsive behavior. Incorporate any constraints raised in engineering feasibility notes.",
    ),
  buildSequence: z
    .array(z.string())
    .describe(
      "2-3 suggested implementation steps in order. Start with the highest-risk or most foundational component. Short imperative statements. If engineering feasibility notes exist, respect those constraints.",
    ),
  figmaNotes: z
    .string()
    .describe(
      "One paragraph of practical Figma guidance. Which frames are main screens, what's annotated, what components exist, what the dev should look for when they first open the file.",
    ),
  edgeCases: z
    .array(z.string())
    .describe(
      "2-4 design edge cases the engineer MUST handle. Be specific to this request: empty states, error states, loading states, mobile breakpoints, truncated text, missing or null data scenarios.",
    ),
  accessibilityGaps: z
    .array(z.string())
    .describe(
      "2-4 accessibility concerns: screen reader support, keyboard navigation, color contrast, motion sensitivity, touch targets, focus management, ARIA labels, or other WCAG considerations relevant to this design.",
    ),
});

export type HandoffBriefResult = z.infer<typeof handoffBriefSchema>;

export async function generateHandoffBrief(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  figmaUrl?: string | null;
  comments?: Array<{ body: string; authorName: string }>;
  sensingSummary?: string | null;
  designFrame?: {
    problem: string | null;
    successCriteria: string | null;
    constraints: string | null;
    divergence: string | null;
  } | null;
  iterations?: Array<{
    title: string;
    description: string | null;
    rationale: string | null;
  }>;
  decisionLog?: Array<{
    title: string;
    entryType: string;
    rationale: string | null;
  }>;
  engineeringFeasibility?: string | null;
}): Promise<HandoffBriefResult> {
  const designJourney = [
    input.sensingSummary ? `SENSING SUMMARY:\n${input.sensingSummary}` : null,
    input.designFrame?.problem
      ? `DESIGN FRAME:\nProblem: ${input.designFrame.problem}${
          input.designFrame.successCriteria
            ? `\nSuccess criteria: ${input.designFrame.successCriteria}`
            : ""
        }${
          input.designFrame.constraints
            ? `\nConstraints: ${input.designFrame.constraints}`
            : ""
        }${
          input.designFrame.divergence
            ? `\nDivergence from brief: ${input.designFrame.divergence}`
            : ""
        }`
      : null,
    input.iterations && input.iterations.length > 0
      ? `ITERATIONS EXPLORED:\n${input.iterations
          .map(
            (it, i) =>
              `${i + 1}. "${it.title}"${it.description ? ` — ${it.description}` : ""}${it.rationale ? ` (Rationale: ${it.rationale})` : ""}`,
          )
          .join("\n")}`
      : null,
    input.decisionLog && input.decisionLog.length > 0
      ? `DECISIONS MADE:\n${input.decisionLog
          .map(
            (d) =>
              `${d.entryType.toUpperCase()}: "${d.title}"${d.rationale ? ` — ${d.rationale}` : ""}`,
          )
          .join("\n")}`
      : null,
    input.engineeringFeasibility
      ? `ENGINEERING FEASIBILITY NOTES:\n${input.engineeringFeasibility}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const commentsBlock =
    input.comments && input.comments.length > 0
      ? `\nDISCUSSION:\n${input.comments
          .map((c) => `${c.authorName}: ${c.body.slice(0, 300)}`)
          .join("\n")}\n`
      : "";

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: handoffBriefSchema,
    prompt: `You are generating a handoff document for engineers who will build this design.

REQUEST: "${input.title}"
DESCRIPTION: ${input.description}
${input.businessContext ? `BUSINESS CONTEXT: ${input.businessContext}` : ""}
${input.successMetrics ? `SUCCESS METRICS: ${input.successMetrics}` : ""}
${input.figmaUrl ? `FIGMA: ${input.figmaUrl}` : ""}

${designJourney ? `--- DESIGN JOURNEY ---\n${designJourney}\n--- END DESIGN JOURNEY ---` : ""}
${commentsBlock}

Generate a comprehensive handoff document. Include:
1. Key design decisions with rationale (reference the decision log if available)
2. Open questions the engineer should clarify before building
3. Recommended build sequence (what to implement first)
4. Figma-specific notes (interactions, states, responsive behavior)
5. Edge cases to handle (error states, empty states, loading, boundary conditions)
6. Accessibility gaps to address (screen reader, keyboard navigation, color contrast, motion, touch targets, WCAG)

If a design journey is provided above, use it — the designer's own sensing, framing, iterations, and decisions are more authoritative than the PM's initial description.
If engineering feasibility notes exist, incorporate those constraints into the build sequence and open questions.
Be specific — avoid generic advice. Base everything on the content above.`,
  });

  return object;
}
