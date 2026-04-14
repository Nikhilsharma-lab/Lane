// lib/ai/context-brief.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const contextBriefSchema = z.object({
  plainSummary: z
    .string()
    .describe(
      "2-3 sentences in plain language. Restate what the PM is asking for, stripping jargon. State the real user problem the design needs to solve."
    ),
  relatedRequests: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        reason: z
          .string()
          .describe("One sentence on why this past request is similar or relevant"),
      })
    )
    .describe(
      "Up to 3 past requests from the same org that solved a similar problem. Only include if genuinely similar — not just same product area."
    ),
  keyConstraints: z
    .array(z.string())
    .describe(
      "2-5 factual constraints the designer must work within. Extract from business context, deadline, and shaping notes. Examples: 'Must ship within 2 weeks', 'Cannot change the payment API', 'iOS only — no Android in this cycle'."
    ),
  questionsToAsk: z
    .array(z.string())
    .describe(
      "3-5 specific, actionable questions the designer should clarify with the PM before opening Figma. Generate from actual gaps in the request — not generic checklist questions."
    ),
  explorationDirections: z
    .array(z.string())
    .describe(
      "2-3 directional angles for the designer to explore. Not prescriptive — starting points for thinking, not final answers."
    ),
});

export type ContextBriefResult = z.infer<typeof contextBriefSchema>;

export async function generateContextBrief(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  deadlineAt?: string | null;
  requestType?: string | null;
  pastRequests: Array<{ id: string; title: string; description: string }>;
}): Promise<ContextBriefResult> {
  const pastBlock =
    input.pastRequests.length > 0
      ? `\nPAST REQUESTS IN THIS ORG (for related work detection):\n${input.pastRequests
          .map((r, i) => `${i + 1}. [${r.id}] "${r.title}" — ${r.description.slice(0, 120)}`)
          .join("\n")}\n`
      : "";

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: contextBriefSchema,
    prompt: `You are a senior design strategist preparing a context brief for a designer who is about to start working on a request. Your job is to translate the PM's language into what the designer actually needs to know.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.deadlineAt ? `DEADLINE: ${input.deadlineAt}\n` : ""}
${input.requestType ? `REQUEST TYPE: ${input.requestType}\n` : ""}
---
${pastBlock}
Produce a context brief that helps the designer start with confidence, not confusion. For relatedRequests, only include IDs from the provided list — never fabricate IDs.`,
  });

  return object;
}
