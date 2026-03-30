import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const triageSchema = z.object({
  priority: z.enum(["p0", "p1", "p2", "p3"]).describe(
    "p0=critical/blocking, p1=high/this week, p2=medium/this sprint, p3=low/backlog"
  ),
  complexity: z.number().int().min(1).max(5).describe(
    "1=trivial (<2h), 2=small (2-8h), 3=medium (1-3d), 4=large (3-7d), 5=XL (1w+)"
  ),
  requestType: z.enum(["feature", "bug", "research", "content", "infra", "process", "other"]),
  qualityScore: z.number().int().min(0).max(100).describe(
    "How well-specified is this request? 0=unusable, 50=needs work, 80+=good to assign"
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
});

export type TriageResult = z.infer<typeof triageSchema>;

export async function triageRequest(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  deadline?: string | null;
}): Promise<TriageResult> {
  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
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
---

Assess priority based on business impact and urgency. Assess complexity based on design effort required. Score quality based on how complete and actionable the request is for a designer to pick up without clarification.`,
  });

  return object;
}
