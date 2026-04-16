import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const triageSchema = z.object({
  priority: z.enum(["p0", "p1", "p2", "p3"]).describe(
    "p0=critical/blocking, p1=high/this week, p2=medium/this sprint, p3=low/backlog"
  ),
  complexity: z.number().describe(
    "Integer from 1 to 5. 1=trivial (<2h), 2=small (2-8h), 3=medium (1-3d), 4=large (3-7d), 5=XL (1w+)"
  ),
  requestType: z.enum(["feature", "bug", "research", "content", "infra", "process", "other"]),
  qualityScore: z.number().describe(
    "Integer from 0 to 100. How well-specified is this request? 0=unusable, 50=needs work, 80+=good to assign"
  ),
  qualityFlags: z.array(z.string()).describe(
    "Specific issues with the request quality, e.g. 'Missing success metrics', 'No deadline specified'"
  ),
  summary: z.string().describe("1-2 sentence summary of what is being requested and why"),
  reasoning: z.string().describe(
    "Brief explanation of why this priority and complexity were assigned"
  ),
  suggestions: z.array(z.string()).describe(
    "Concrete suggestions to improve the request before assigning"
  ),
  potentialDuplicates: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      reason: z.string().describe("One sentence on why this is a potential overlap"),
    })
  ).describe(
    "Existing requests that appear semantically similar or overlapping. Only include if genuinely similar — not just same topic area."
  ),
  classification: z.enum(["problem_framed", "solution_specific", "hybrid"]).describe(
    "problem_framed=describes user problem/business gap without prescribing UI, solution_specific=prescribes UI/implementation without problem context, hybrid=has both problem and proposed solution"
  ),
  reframedProblem: z.string().nullable().describe(
    "If solution_specific or hybrid, extract and rephrase the underlying problem as a clear problem statement. Null if already problem_framed."
  ),
  extractedSolution: z
    .string()
    .nullable()
    .describe(
      "If classification is hybrid, preserve the solution the requester proposed, verbatim or lightly cleaned. For problem_framed and solution_specific: null."
    ),
});

export type TriageResult = z.infer<typeof triageSchema>;

export async function triageRequest(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  deadline?: string | null;
  impactMetric?: string | null;
  impactPrediction?: string | null;
  existingRequests?: Array<{ id: string; title: string; description: string }>;
}): Promise<TriageResult> {
  const existingBlock = input.existingRequests?.length
    ? `\nEXISTING REQUESTS IN THIS WORKSPACE (for duplicate detection):\n${
        input.existingRequests
          .map((r, i) => `${i + 1}. [${r.id}] "${r.title}" — ${r.description.slice(0, 120)}`)
          .join("\n")
      }\n`
    : "";

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: triageSchema,
    prompt: `You are a senior design operations lead triaging a design request.

Analyze this request and return structured triage data.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.deadline ? `DEADLINE: ${input.deadline}\n` : ""}
${input.impactMetric || input.impactPrediction ? `IMPACT PREDICTION:\n${input.impactMetric ? `Metric: ${input.impactMetric}\n` : ""}${input.impactPrediction ? `Prediction: ${input.impactPrediction}\n` : ""}` : ""}
---
${existingBlock}
Assess priority based on business impact and urgency. Assess complexity based on design effort required. Score quality based on how complete and actionable the request is for a designer to pick up without clarification. For potentialDuplicates, only flag requests that genuinely overlap in scope or goal — not just requests that touch the same product area.

CLASSIFICATION — This is critical. Classify the request as:
- "problem_framed": Describes a user problem, business gap, or pain point WITHOUT prescribing specific UI elements or implementation. Signals: user behavior, data/metrics, asks "why", identifies a pain point.
- "solution_specific": Prescribes UI changes or implementation details WITHOUT explaining the underlying problem. Signals: UI element names without problem context ("add a button", "change the color"), describes implementation ("make it like Stripe"), no user problem mentioned, starts with "Can we..." + UI change.
- "hybrid": Contains BOTH a clear problem AND a proposed solution.

If solution_specific or hybrid, extract and rephrase the underlying problem as a clear problem statement in reframedProblem. Null if already problem_framed.

For hybrid classifications only, also preserve the solution the requester proposed in extractedSolution (verbatim or lightly cleaned). For problem_framed and solution_specific, set extractedSolution to null.`,
  });

  // Runtime validation — Anthropic structured output doesn't enforce numeric
  // ranges in Zod 4 (vercel/ai#13355). Schema is z.number() instead of
  // z.number().int().min().max(), so we clamp and round here.

  const rawComplexity = object.complexity;
  const rawQualityScore = object.qualityScore;

  const complexity = Math.max(1, Math.min(5, Math.round(rawComplexity)));
  const qualityScore = Math.max(0, Math.min(100, Math.round(rawQualityScore)));

  if (Math.abs(rawComplexity - complexity) > 0.5) {
    console.warn(
      "[triage] complexity out of range",
      { rawValue: rawComplexity, clampedTo: complexity }
    );
  }
  if (Math.abs(rawQualityScore - qualityScore) > 0.5) {
    console.warn(
      "[triage] qualityScore out of range",
      { rawValue: rawQualityScore, clampedTo: qualityScore }
    );
  }

  return {
    ...object,
    complexity,
    qualityScore,
  };
}
