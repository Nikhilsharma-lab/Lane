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
      })
    )
    .describe(
      "2-4 key design decisions made during this project. Extract from the description and comment thread. What approach was chosen, what alternatives exist, and why this direction was taken."
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      "2-4 things that are NOT fully resolved that the dev should flag back to the designer. Examples: placeholder copy that needs content team, edge case behavior not fully specified, responsive behavior unclear."
    ),
  buildSequence: z
    .array(z.string())
    .describe(
      "2-3 suggested implementation steps in order. Start with the highest-risk or most foundational component. Short imperative statements."
    ),
  figmaNotes: z
    .string()
    .describe(
      "One paragraph of practical Figma guidance. Which frames are the main screens, what's annotated, what components exist, what the dev should look for when they first open the file."
    ),
  edgeCases: z
    .array(z.string())
    .describe(
      "2-4 design edge cases the dev MUST handle. Be specific to this request: empty states, error states, loading states, mobile breakpoints, truncated text, missing or null data scenarios."
    ),
});

export type HandoffBriefResult = z.infer<typeof handoffBriefSchema>;

export async function generateHandoffBrief(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  figmaUrl?: string | null;
  comments: Array<{ body: string; authorName: string }>;
}): Promise<HandoffBriefResult> {
  const commentsBlock =
    input.comments.length > 0
      ? `\nCOMMENT THREAD (${input.comments.length} comments):\n${input.comments
          .map((c, i) => `${i + 1}. ${c.authorName}: ${c.body.slice(0, 300)}`)
          .join("\n")}\n`
      : "\nCOMMENT THREAD: None\n";

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: handoffBriefSchema,
    prompt: `You are a senior designer writing a handoff brief for a developer who is about to build this feature. Your job is to translate everything known about this design into a brief that helps the dev build it correctly the first time — reducing back-and-forth questions.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.figmaUrl ? `FIGMA: ${input.figmaUrl}\n` : ""}
---
${commentsBlock}

Write a handoff brief that surfaces decisions already made, flags unresolved details, and helps the dev start in the right place. Be specific — avoid generic advice. Base everything on the content above.`,
  });

  return object;
}
