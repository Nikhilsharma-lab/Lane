// lib/ai/proactive-alerts.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const alertSchema = z.object({
  title: z
    .string()
    .describe(
      "Short alert title, max 6 words. Use specific names and numbers — not generic. E.g. 'Checkout flow stalled 6 days' not 'Request stalled'."
    ),
  body: z
    .string()
    .describe(
      "1-2 sentences with specific context. Name the designer. State exact days. Explain why this matters now."
    ),
  ctaLabel: z
    .string()
    .describe("2-4 word action label. E.g. 'Open request', 'Review sign-offs', 'Check Figma changes'."),
  urgency: z
    .enum(["low", "medium", "high"])
    .describe(
      "high: needs attention today — blocking dev or approaching deadline. medium: needs attention this week. low: FYI, not urgent."
    ),
});

export type AlertCopy = z.infer<typeof alertSchema>;

export interface AlertInput {
  type: "stall_nudge" | "stall_escalation" | "signoff_overdue" | "figma_drift";
  requestTitle: string;
  requestId: string;
  designerName?: string;
  daysSinceActivity?: number;
  lastActivityDescription?: string;
  pendingSignoffRoles?: string[];
  daysSinceValidationRequested?: number;
  figmaChangeDescription?: string;
  hoursSinceFigmaChange?: number;
}

const TYPE_CONTEXT: Record<AlertInput["type"], string> = {
  stall_nudge:
    "A designer's request has had no activity (no stage change, reflection, or comment) for several days. Write a private, supportive nudge — not an accusation. The designer should feel supported, not watched.",
  stall_escalation:
    "A designer was nudged privately but the request still hasn't moved. The Design Head needs to know. Frame it as a team health signal, not a performance issue.",
  signoff_overdue:
    "A request has been sitting in validation (Prove stage) waiting for sign-offs for several days. The people who haven't signed off need a reminder.",
  figma_drift:
    "A designer updated the Figma file after the design was handed off to dev. The developer needs to review the changes before continuing to build.",
};

export async function generateAlertCopy(input: AlertInput): Promise<AlertCopy | null> {
  try {
    const contextLines: string[] = [
      `ALERT TYPE: ${input.type}`,
      `REQUEST: ${input.requestTitle}`,
    ];

    if (input.designerName) contextLines.push(`DESIGNER: ${input.designerName}`);
    if (input.daysSinceActivity !== undefined)
      contextLines.push(`DAYS SINCE LAST ACTIVITY: ${input.daysSinceActivity}`);
    if (input.lastActivityDescription)
      contextLines.push(`LAST ACTIVITY: ${input.lastActivityDescription}`);
    if (input.pendingSignoffRoles?.length)
      contextLines.push(`STILL NEEDS SIGN-OFF FROM: ${input.pendingSignoffRoles.join(", ")}`);
    if (input.daysSinceValidationRequested !== undefined)
      contextLines.push(`DAYS WAITING FOR SIGN-OFFS: ${input.daysSinceValidationRequested}`);
    if (input.figmaChangeDescription)
      contextLines.push(`FIGMA CHANGE: ${input.figmaChangeDescription}`);
    if (input.hoursSinceFigmaChange !== undefined)
      contextLines.push(`HOURS SINCE FIGMA CHANGE: ${input.hoursSinceFigmaChange}`);

    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: alertSchema,
      prompt: `You are Lane's AI operations monitor for a design team. Your job is to write a clear, specific, human alert.

SITUATION: ${TYPE_CONTEXT[input.type]}

CONTEXT:
${contextLines.join("\n")}

Write the alert. Be specific — use names and numbers. Be supportive — this tool is on the team's side, not watching them.`,
    });

    return object;
  } catch (err) {
    console.error("[proactive-alerts] Claude call failed:", err);
    return null; // silent fail — cron skips this alert and retries next hour
  }
}
