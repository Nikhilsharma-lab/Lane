// lib/ai/impact-retrospective.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const retrospectiveSchema = z.object({
  headline: z
    .string()
    .describe(
      "3-5 words summarising the outcome. Examples: 'Delivered as predicted', 'Significantly over-delivered', 'Missed target — 40% off', 'Impact unmeasured'. Be direct."
    ),
  whatHappened: z
    .string()
    .describe(
      "2-3 sentences: what was predicted, what actually happened, and the magnitude of the gap. Use the numbers. Do not editorialize — just state the facts clearly."
    ),
  likelyReasons: z
    .array(z.string())
    .describe(
      "2-3 plausible hypotheses for why the prediction was accurate, too high, or too low. Ground these in the request context — avoid generic explanations. Each should be a complete sentence."
    ),
  nextTimeSuggestion: z
    .string()
    .describe(
      "One concrete, actionable sentence: what the team should do differently next time (or keep doing if it worked). Make it specific to this type of feature, not generic advice."
    ),
  celebrate: z
    .string()
    .nullable()
    .describe(
      "If the request over-delivered (positive variance > 10%), write a one-sentence recognition line naming what went well. Otherwise return null — do not force celebration on a miss or neutral outcome."
    ),
});

export type ImpactRetrospectiveResult = z.infer<typeof retrospectiveSchema>;

export async function generateImpactRetrospective(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  impactMetric: string;
  impactPrediction: string;
  impactActual: string;
  variancePercent: number | null;
  comments: Array<{ body: string; authorName: string }>;
}): Promise<ImpactRetrospectiveResult> {
  const commentsBlock =
    input.comments.length > 0
      ? `\nCOMMENT THREAD (${input.comments.length} comments):\n${input.comments
          .map((c, i) => `${i + 1}. ${c.authorName}: ${c.body.slice(0, 300)}`)
          .join("\n")}\n`
      : "\nCOMMENT THREAD: None\n";

  const varianceLine =
    input.variancePercent !== null
      ? `VARIANCE: ${input.variancePercent > 0 ? "+" : ""}${input.variancePercent.toFixed(1)}% (${input.variancePercent > 0 ? "over-delivered" : "under-delivered"})`
      : "VARIANCE: Not calculable";

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: retrospectiveSchema,
    prompt: `You are a senior product strategist writing a post-launch retrospective for a design request. The PM has logged the actual impact. Your job is to produce a concise, honest retrospective that helps the team learn — not a celebration or a post-mortem, just a clear-eyed look at what happened.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}

IMPACT METRIC: ${input.impactMetric}
PREDICTED: ${input.impactPrediction}
ACTUAL: ${input.impactActual}
${varianceLine}
---
${commentsBlock}

Write the retrospective honestly. If the prediction was accurate, say so. If it missed, explain why without assigning blame. The likelyReasons should be plausible given the request context — not generic filler like "scope changed" unless there's evidence of that in the comments.`,
  });

  return object;
}
