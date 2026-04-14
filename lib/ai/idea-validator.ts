import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const ideaValidationSchema = z.object({
  impactScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("1=negligible impact, 10=transformative impact on users/business"),
  effortEstimate: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("1=trivial (<1 day), 10=very large (6+ months of design+dev)"),
  feasibilityScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("1=very risky/unclear, 10=clear path and team is capable"),
  roiScore: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Impact-to-effort ratio: 1=poor ROI, 10=excellent ROI"),
  reasoning: z
    .string()
    .describe("2-3 sentences explaining the scores and recommendation"),
});

export type IdeaValidationResult = z.infer<typeof ideaValidationSchema>;

export async function validateIdea(idea: {
  title: string;
  problem: string;
  proposedSolution: string;
  category: string;
  impactEstimate?: string | null;
  effortEstimateWeeks?: number | null;
  upvotes: number;
  downvotes: number;
}): Promise<IdeaValidationResult> {
  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: ideaValidationSchema,
    prompt: `You are a senior product manager evaluating a design team idea.

IDEA:
Title: ${idea.title}
Category: ${idea.category}
Problem: ${idea.problem}
Proposed Solution: ${idea.proposedSolution}
${idea.impactEstimate ? `User's Impact Estimate: ${idea.impactEstimate}` : ""}
${idea.effortEstimateWeeks ? `User's Effort Estimate: ${idea.effortEstimateWeeks} weeks` : ""}

COMMUNITY SIGNAL:
Upvotes: ${idea.upvotes} | Downvotes: ${idea.downvotes} | Net score: ${idea.upvotes - idea.downvotes}

Score each dimension 1-10 and provide brief reasoning (2-3 sentences).`,
  });

  return object;
}
