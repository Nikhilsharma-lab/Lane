import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const ideaValidationSchema = z.object({
  impactScore: z
    .number()
    .describe("Integer from 1 to 10. 1=negligible impact, 10=transformative impact on users/business"),
  effortEstimate: z
    .number()
    .describe("Integer from 1 to 10. 1=trivial (<1 day), 10=very large (6+ months of design+dev)"),
  feasibilityScore: z
    .number()
    .describe("Integer from 1 to 10. 1=very risky/unclear, 10=clear path and team is capable"),
  roiScore: z
    .number()
    .describe("Integer from 1 to 10. Impact-to-effort ratio: 1=poor ROI, 10=excellent ROI"),
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
  try {
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

    // Runtime validation — Anthropic structured output doesn't enforce numeric
    // ranges in Zod 4 (vercel/ai#13355). Schemas use z.number() instead of
    // z.number().int().min().max(), so we clamp and round here.

    const rawImpactScore = object.impactScore;
    const rawEffortEstimate = object.effortEstimate;
    const rawFeasibilityScore = object.feasibilityScore;
    const rawRoiScore = object.roiScore;

    const impactScore = Math.max(1, Math.min(10, Math.round(rawImpactScore)));
    const effortEstimate = Math.max(1, Math.min(10, Math.round(rawEffortEstimate)));
    const feasibilityScore = Math.max(1, Math.min(10, Math.round(rawFeasibilityScore)));
    const roiScore = Math.max(1, Math.min(10, Math.round(rawRoiScore)));

    if (Math.abs(rawImpactScore - impactScore) > 0.5) {
      console.warn("[idea-validator] impactScore out of range", { rawValue: rawImpactScore, clampedTo: impactScore });
    }
    if (Math.abs(rawEffortEstimate - effortEstimate) > 0.5) {
      console.warn("[idea-validator] effortEstimate out of range", { rawValue: rawEffortEstimate, clampedTo: effortEstimate });
    }
    if (Math.abs(rawFeasibilityScore - feasibilityScore) > 0.5) {
      console.warn("[idea-validator] feasibilityScore out of range", { rawValue: rawFeasibilityScore, clampedTo: feasibilityScore });
    }
    if (Math.abs(rawRoiScore - roiScore) > 0.5) {
      console.warn("[idea-validator] roiScore out of range", { rawValue: rawRoiScore, clampedTo: roiScore });
    }

    return { ...object, impactScore, effortEstimate, feasibilityScore, roiScore };
  } catch (err) {
    console.error("[idea-validator] AI error:", err);
    throw err;
  }
}
