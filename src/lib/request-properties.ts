import { z } from "zod";

// Client-safe shared values; project permissions stay in guarded server code.
export const REQUEST_TYPES = ["bug", "improvement", "new_feature"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  bug: "Bug",
  improvement: "Improvement",
  new_feature: "New feature",
};
export const REQUEST_TYPE_DESCRIPTIONS: Record<RequestType, string> = {
  bug: "Something fails to behave as expected.",
  improvement: "An existing capability or experience needs to work better.",
  new_feature: "A capability that does not currently exist.",
};
export const REQUEST_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];
export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  none: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const requestPrioritySchema = z.enum(REQUEST_PRIORITIES, "Choose a valid priority");
export type ProjectOption = { id: string; name: string; description: string | null };
export const projectIdSchema = z.string().uuid("Choose a valid Project").nullable().default(null);
export const requestTypeSchema = z.enum(REQUEST_TYPES, "Choose a valid Request type").nullable().default(null);
export const projectInputSchema = z.object({
  name: z.string().transform((name) => name.trim().replace(/\s+/g, " ")).pipe(z.string().min(1, "Project name is required").max(80, "Use at most 80 characters for the Project name")),
  description: z.string().trim().max(300, "Use at most 300 characters for the Project description").nullish().transform((description) => description || null),
});
