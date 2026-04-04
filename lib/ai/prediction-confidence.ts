// lib/ai/prediction-confidence.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const predictionConfidenceSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "0-100 confidence that this prediction will be measurable and approximately correct. 70+ = realistic, 40-69 = optimistic, 20-39 = vague, 0-19 = unmeasurable."
    ),
  label: z
    .enum(["realistic", "optimistic", "vague", "unmeasurable"])
    .describe(
      "realistic: specific, grounded, achievable. optimistic: directionally right but overstated. vague: metric or value too fuzzy to measure. unmeasurable: no clear metric that could be measured post-ship."
    ),
  rationale: z
    .string()
    .describe(
      "2-3 sentences explaining the score. Reference specific words or numbers from the prediction. Be direct — this is a coaching note for the PM, not a generic disclaimer."
    ),
  redFlags: z
    .array(z.string())
    .describe(
      "0-3 specific problems with this prediction. Each item should name the concrete issue (e.g. 'No baseline provided — +5% of what?', 'Retention is not directly measurable from this feature'). Empty array if the prediction is solid."
    ),
  suggestion: z
    .string()
    .describe(
      "One actionable sentence: what the PM should change to make this prediction more credible. Skip if the prediction is already realistic."
    ),
});

export type PredictionConfidenceResult = z.infer<typeof predictionConfidenceSchema>;

export async function generatePredictionConfidence(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  impactMetric: string;
  impactPrediction: string;
  requestType?: string | null;
  priority?: string | null;
}): Promise<PredictionConfidenceResult> {
  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: predictionConfidenceSchema,
    prompt: `You are a senior product strategist reviewing a PM's impact prediction before the Design Head places a bet. Your job is to rate how realistic the prediction is — not whether the feature is good, but whether the impact claim is credible and measurable.

---
REQUEST TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.requestType ? `REQUEST TYPE: ${input.requestType}\n` : ""}
${input.priority ? `PRIORITY: ${input.priority}\n` : ""}

IMPACT METRIC: ${input.impactMetric}
IMPACT PREDICTION: ${input.impactPrediction}
---

Common failure modes to check:
- Prediction is directionally correct but the magnitude is unsupported ("10% improvement" with no baseline)
- Metric cannot be attributed to this specific feature (e.g. "increase revenue" for a UI polish task)
- Metric is not measurable post-ship (e.g. "improve team morale")
- Vague language that makes the claim unfalsifiable ("better user experience")
- Overconfident number on a research-stage feature

Rate the prediction honestly. A realistic prediction is specific, grounded, and provably achievable.`,
  });

  return object;
}
